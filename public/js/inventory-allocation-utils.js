const INVENTORY_ALLOCATION_ACTIVE_STATUS = "allocated";
const INVENTORY_ALLOCATION_KIND_STOCK = "stock";
const INVENTORY_ALLOCATION_KIND_SHORTAGE = "shortage";
const INVENTORY_ALLOCATION_KINDS = Object.freeze([
    INVENTORY_ALLOCATION_KIND_STOCK,
    INVENTORY_ALLOCATION_KIND_SHORTAGE,
]);
const INVENTORY_ALLOCATION_STATUSES = Object.freeze([
    INVENTORY_ALLOCATION_ACTIVE_STATUS,
    "released",
    "shipped",
    "cancelled",
]);

function safeText(value) {
    return String(value ?? "").trim();
}

function safeQuantity(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue)) : 0;
}

function normalizeInventoryAllocationStatus(value) {
    const status = safeText(value).toLowerCase();
    return INVENTORY_ALLOCATION_STATUSES.includes(status)
        ? status
        : INVENTORY_ALLOCATION_ACTIVE_STATUS;
}

function normalizeInventoryAllocationKind(value) {
    const kind = safeText(value).toLowerCase();
    return INVENTORY_ALLOCATION_KINDS.includes(kind)
        ? kind
        : INVENTORY_ALLOCATION_KIND_STOCK;
}

function getInventoryAllocationLotKey(row = {}) {
    const allocationKind = normalizeInventoryAllocationKind(row.allocationKind);
    const skuKey = safeText(row.skuKey).toLocaleLowerCase("ko-KR");
    if (allocationKind === INVENTORY_ALLOCATION_KIND_SHORTAGE) {
        return [INVENTORY_ALLOCATION_KIND_SHORTAGE, skuKey].join("\u001f");
    }
    return [
        skuKey,
        safeText(row.lotNo).toLocaleLowerCase("ko-KR"),
        safeText(row.expiryDate),
        safeText(row.location).toLocaleLowerCase("ko-KR"),
        safeText(row.palletNo).toLocaleLowerCase("ko-KR"),
    ].join("\u001f");
}

function normalizeInventoryAllocation(row = {}, index = 0) {
    const status = normalizeInventoryAllocationStatus(row.status);
    const allocationKind = normalizeInventoryAllocationKind(row.allocationKind);
    const isShortage = allocationKind === INVENTORY_ALLOCATION_KIND_SHORTAGE;
    const normalizedLotRow = {
        ...row,
        allocationKind,
        lotNo: isShortage ? "" : safeText(row.lotNo),
        expiryDate: isShortage ? "" : safeText(row.expiryDate),
        location: isShortage ? "" : safeText(row.location),
        palletNo: isShortage ? "" : safeText(row.palletNo),
    };
    return {
        id: safeText(row.id) || `inventory-allocation-${index + 1}`,
        orderId: safeText(row.orderId),
        orderCode: safeText(row.orderCode),
        orderLineId: safeText(row.orderLineId),
        skuKey: safeText(row.skuKey),
        skuRowId: safeQuantity(row.skuRowId),
        adminProductCode: safeText(row.adminProductCode),
        productName: safeText(row.productName),
        quantity: safeQuantity(row.quantity),
        status,
        allocationKind,
        lotNo: normalizedLotRow.lotNo,
        expiryDate: normalizedLotRow.expiryDate,
        location: normalizedLotRow.location,
        palletNo: normalizedLotRow.palletNo,
        lotKey: isShortage
            ? getInventoryAllocationLotKey(normalizedLotRow)
            : safeText(row.lotKey) || getInventoryAllocationLotKey(normalizedLotRow),
        allocatedAt: safeText(row.allocatedAt),
        releasedAt: safeText(row.releasedAt),
        shippedAt: safeText(row.shippedAt),
        updatedAt: safeText(row.updatedAt),
        createdBy: safeText(row.createdBy),
        allocationSource: safeText(row.allocationSource) || "manual",
        allocationBatchId: safeText(row.allocationBatchId),
        releaseReason: safeText(row.releaseReason),
        policySnapshot: row.policySnapshot && typeof row.policySnapshot === "object"
            ? { ...row.policySnapshot }
            : null,
    };
}

function compareOptionalDate(leftValue, rightValue, { empty = "last" } = {}) {
    const leftText = safeText(leftValue);
    const rightText = safeText(rightValue);
    if (!leftText && !rightText) return 0;
    if (!leftText) return empty === "first" ? -1 : 1;
    if (!rightText) return empty === "first" ? 1 : -1;
    const leftTime = Date.parse(leftText);
    const rightTime = Date.parse(rightText);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    return leftText.localeCompare(rightText, "ko-KR");
}

function compareInventoryAllocationLots(left = {}, right = {}, policy = {}) {
    const priorityKeys = Array.isArray(policy?.priorityKeys) ? policy.priorityKeys : [];
    const undatedExpiryPolicy = ["first", "exclude"].includes(policy?.undatedExpiryPolicy)
        ? policy.undatedExpiryPolicy
        : "last";

    for (const key of priorityKeys) {
        let compared = 0;
        if (key === "expiry_asc") {
            compared = compareOptionalDate(left.expiryDate, right.expiryDate, {
                empty: undatedExpiryPolicy === "first" ? "first" : "last",
            });
        } else if (key === "received_asc") {
            compared = compareOptionalDate(
                left.firstReceivedAt || left.latestOccurredAt,
                right.firstReceivedAt || right.latestOccurredAt,
                { empty: "last" },
            );
        } else if (key === "unit_quantity_asc") {
            compared = safeQuantity(left.assignableQuantity ?? left.quantity)
                - safeQuantity(right.assignableQuantity ?? right.quantity);
        } else if (key === "location_asc") {
            compared = safeText(left.location).localeCompare(safeText(right.location), "ko-KR");
        }
        if (compared !== 0) return compared;
    }

    return safeText(left.lotKey || getInventoryAllocationLotKey(left))
        .localeCompare(safeText(right.lotKey || getInventoryAllocationLotKey(right)), "ko-KR");
}

function getOrderLineSkuRequirements(orderLine = {}) {
    const requirements = new Map();
    (Array.isArray(orderLine?.skuComponents) ? orderLine.skuComponents : []).forEach((component) => {
        const skuKey = safeText(component?.inventorySkuKey || component?.skuKey);
        const requiredQuantity = safeQuantity(component?.requiredQuantity);
        if (!skuKey || requiredQuantity <= 0) return;
        const current = requirements.get(skuKey) || {
            skuKey,
            skuRowId: safeQuantity(component?.skuRowId),
            adminProductCode: safeText(component?.adminProductCode),
            productName: safeText(component?.productName),
            requiredQuantity: 0,
        };
        current.requiredQuantity += requiredQuantity;
        requirements.set(skuKey, current);
    });
    return [...requirements.values()];
}

function buildInventoryAllocationCapacityRows(
    lotRows = [],
    allocationRows = [],
    { excludeOrderLineIds = [] } = {},
) {
    const excludedLineIds = new Set(
        (Array.isArray(excludeOrderLineIds) ? excludeOrderLineIds : [])
            .map(safeText)
            .filter(Boolean),
    );
    const allocatedByLotKey = new Map();
    (Array.isArray(allocationRows) ? allocationRows : [])
        .map(normalizeInventoryAllocation)
        .forEach((allocation) => {
            if (
                allocation.status !== INVENTORY_ALLOCATION_ACTIVE_STATUS
                || allocation.allocationKind !== INVENTORY_ALLOCATION_KIND_STOCK
                || allocation.quantity <= 0
                || excludedLineIds.has(allocation.orderLineId)
            ) return;
            allocatedByLotKey.set(
                allocation.lotKey,
                (allocatedByLotKey.get(allocation.lotKey) || 0) + allocation.quantity,
            );
        });

    return (Array.isArray(lotRows) ? lotRows : []).map((row) => {
        const lotKey = safeText(row?.lotKey) || getInventoryAllocationLotKey(row);
        const quantity = safeQuantity(row?.quantity);
        const otherAllocatedQuantity = safeQuantity(allocatedByLotKey.get(lotKey));
        return {
            ...row,
            lotKey,
            quantity,
            otherAllocatedQuantity,
            assignableQuantity: Math.max(0, quantity - otherAllocatedQuantity),
        };
    });
}

function isAutomaticAllocationCandidate(row = {}, policy = {}) {
    if (!row.skuKey || row.assignableQuantity <= 0) return false;
    if (policy?.excludeExpired !== false && row.expiryState === "expired") return false;
    if (policy?.undatedExpiryPolicy === "exclude" && !safeText(row.expiryDate)) return false;
    return true;
}

function buildAutomaticInventoryAllocationPlan(
    orderLines = [],
    lotRows = [],
    allocationRows = [],
    policy = {},
) {
    const eligibleLines = (Array.isArray(orderLines) ? orderLines : [])
        .filter((row) => (
            safeText(row?.orderLineId)
            && safeText(row?.matchStatus) === "matched"
            && safeText(row?.orderStatus || "active") !== "cancelled"
            && safeText(row?.shippingStatus || "waiting") !== "shipped"
        ));
    const targetLineIds = eligibleLines.map((row) => row.orderLineId);
    const capacityRows = buildInventoryAllocationCapacityRows(lotRows, allocationRows, {
        excludeOrderLineIds: targetLineIds,
    });
    const capacityByLotKey = new Map(
        capacityRows.map((row) => [row.lotKey, row.assignableQuantity]),
    );
    const candidatesBySkuKey = new Map();
    capacityRows.filter((row) => isAutomaticAllocationCandidate(row, policy)).forEach((row) => {
        const candidates = candidatesBySkuKey.get(row.skuKey) || [];
        candidates.push(row);
        candidatesBySkuKey.set(row.skuKey, candidates);
    });
    candidatesBySkuKey.forEach((rows) => rows.sort((left, right) => (
        compareInventoryAllocationLots(left, right, policy)
    )));

    const allocations = [];
    const lineResults = [];
    eligibleLines.forEach((orderLine) => {
        const componentResults = getOrderLineSkuRequirements(orderLine).map((requirement) => {
            const candidates = candidatesBySkuKey.get(requirement.skuKey) || [];
            let remainingQuantity = requirement.requiredQuantity;
            const selectedRows = [];

            if (policy?.allowLotSplit === false) {
                const selected = candidates.find((candidate) => (
                    (capacityByLotKey.get(candidate.lotKey) || 0) >= remainingQuantity
                ));
                if (selected) {
                    selectedRows.push({ row: selected, quantity: remainingQuantity });
                    capacityByLotKey.set(
                        selected.lotKey,
                        (capacityByLotKey.get(selected.lotKey) || 0) - remainingQuantity,
                    );
                    remainingQuantity = 0;
                }
            } else {
                candidates.forEach((candidate) => {
                    if (remainingQuantity <= 0) return;
                    const capacity = capacityByLotKey.get(candidate.lotKey) || 0;
                    const selectedQuantity = Math.min(capacity, remainingQuantity);
                    if (selectedQuantity <= 0) return;
                    selectedRows.push({ row: candidate, quantity: selectedQuantity });
                    capacityByLotKey.set(candidate.lotKey, capacity - selectedQuantity);
                    remainingQuantity -= selectedQuantity;
                });
            }

            selectedRows.forEach(({ row, quantity }) => {
                allocations.push({
                    orderId: safeText(orderLine.orderId || orderLine.id),
                    orderCode: safeText(orderLine.orderCode),
                    orderLineId: safeText(orderLine.orderLineId),
                    skuKey: requirement.skuKey,
                    skuRowId: requirement.skuRowId || safeQuantity(row.skuRowId),
                    adminProductCode: requirement.adminProductCode || safeText(row.adminProductCode),
                    productName: requirement.productName || safeText(row.productName),
                    quantity,
                    allocationKind: INVENTORY_ALLOCATION_KIND_STOCK,
                    lotNo: safeText(row.lotNo),
                    expiryDate: safeText(row.expiryDate),
                    location: safeText(row.location),
                    palletNo: safeText(row.palletNo),
                    lotKey: row.lotKey,
                });
            });

            if (remainingQuantity > 0) {
                allocations.push({
                    orderId: safeText(orderLine.orderId || orderLine.id),
                    orderCode: safeText(orderLine.orderCode),
                    orderLineId: safeText(orderLine.orderLineId),
                    skuKey: requirement.skuKey,
                    skuRowId: requirement.skuRowId,
                    adminProductCode: requirement.adminProductCode,
                    productName: requirement.productName,
                    quantity: remainingQuantity,
                    allocationKind: INVENTORY_ALLOCATION_KIND_SHORTAGE,
                });
            }

            return {
                ...requirement,
                allocatedQuantity: requirement.requiredQuantity - remainingQuantity,
                shortageAllocatedQuantity: remainingQuantity,
                plannedAllocatedQuantity: requirement.requiredQuantity,
                shortageQuantity: remainingQuantity,
            };
        });
        lineResults.push({
            orderId: safeText(orderLine.orderId || orderLine.id),
            orderLineId: safeText(orderLine.orderLineId),
            requiredQuantity: componentResults.reduce((sum, item) => sum + item.requiredQuantity, 0),
            allocatedQuantity: componentResults.reduce((sum, item) => sum + item.allocatedQuantity, 0),
            shortageAllocatedQuantity: componentResults.reduce(
                (sum, item) => sum + item.shortageAllocatedQuantity,
                0,
            ),
            plannedAllocatedQuantity: componentResults.reduce(
                (sum, item) => sum + item.plannedAllocatedQuantity,
                0,
            ),
            shortageQuantity: componentResults.reduce((sum, item) => sum + item.shortageQuantity, 0),
            componentResults,
        });
    });

    return {
        allocations,
        lineResults,
        requiredQuantity: lineResults.reduce((sum, item) => sum + item.requiredQuantity, 0),
        allocatedQuantity: lineResults.reduce((sum, item) => sum + item.allocatedQuantity, 0),
        shortageAllocatedQuantity: lineResults.reduce(
            (sum, item) => sum + item.shortageAllocatedQuantity,
            0,
        ),
        plannedAllocatedQuantity: lineResults.reduce(
            (sum, item) => sum + item.plannedAllocatedQuantity,
            0,
        ),
        shortageQuantity: lineResults.reduce((sum, item) => sum + item.shortageQuantity, 0),
    };
}

function buildInventoryAllocationSnapshot(rows = []) {
    const normalizedRows = (Array.isArray(rows) ? rows : [])
        .map(normalizeInventoryAllocation);
    const activeRows = normalizedRows.filter((row) => (
        row.status === INVENTORY_ALLOCATION_ACTIVE_STATUS
        && row.skuKey
        && row.quantity > 0
    ));
    const allocatedBySkuKey = new Map();
    const stockAllocatedBySkuKey = new Map();
    const shortageAllocatedBySkuKey = new Map();
    const allocatedByLotKey = new Map();
    const stockActiveRows = [];
    const shortageActiveRows = [];

    activeRows.forEach((row) => {
        allocatedBySkuKey.set(
            row.skuKey,
            (allocatedBySkuKey.get(row.skuKey) || 0) + row.quantity,
        );
        if (row.allocationKind === INVENTORY_ALLOCATION_KIND_SHORTAGE) {
            shortageActiveRows.push(row);
            shortageAllocatedBySkuKey.set(
                row.skuKey,
                (shortageAllocatedBySkuKey.get(row.skuKey) || 0) + row.quantity,
            );
        } else {
            stockActiveRows.push(row);
            stockAllocatedBySkuKey.set(
                row.skuKey,
                (stockAllocatedBySkuKey.get(row.skuKey) || 0) + row.quantity,
            );
        }
        if (row.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK && row.lotKey) {
            allocatedByLotKey.set(
                row.lotKey,
                (allocatedByLotKey.get(row.lotKey) || 0) + row.quantity,
            );
        }
    });

    return {
        rows: normalizedRows,
        activeRows,
        stockActiveRows,
        shortageActiveRows,
        allocatedBySkuKey,
        stockAllocatedBySkuKey,
        shortageAllocatedBySkuKey,
        allocatedByLotKey,
        totalAllocated: activeRows.reduce((sum, row) => sum + row.quantity, 0),
        totalStockAllocated: stockActiveRows.reduce((sum, row) => sum + row.quantity, 0),
        totalShortageAllocated: shortageActiveRows.reduce((sum, row) => sum + row.quantity, 0),
    };
}

function getInventoryAvailability(currentQuantity, allocatedQuantity) {
    const current = Number(currentQuantity) || 0;
    const allocated = Math.max(0, Number(allocatedQuantity) || 0);
    return {
        currentQuantity: current,
        allocatedQuantity: allocated,
        availableQuantity: current - allocated,
        isOverAllocated: allocated > current,
    };
}

export {
    INVENTORY_ALLOCATION_ACTIVE_STATUS,
    INVENTORY_ALLOCATION_KIND_SHORTAGE,
    INVENTORY_ALLOCATION_KIND_STOCK,
    INVENTORY_ALLOCATION_KINDS,
    INVENTORY_ALLOCATION_STATUSES,
    buildAutomaticInventoryAllocationPlan,
    buildInventoryAllocationCapacityRows,
    buildInventoryAllocationSnapshot,
    compareInventoryAllocationLots,
    getInventoryAllocationLotKey,
    getInventoryAvailability,
    getOrderLineSkuRequirements,
    normalizeInventoryAllocation,
    normalizeInventoryAllocationKind,
    normalizeInventoryAllocationStatus,
};
