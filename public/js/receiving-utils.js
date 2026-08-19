const INVENTORY_RECEIPT_STATUSES = Object.freeze({
    planned: Object.freeze({ label: "입고 예정", tone: "planned" }),
    partial: Object.freeze({ label: "부분 입고", tone: "partial" }),
    completed: Object.freeze({ label: "입고 완료", tone: "completed" }),
    reopened: Object.freeze({ label: "재작업 중", tone: "reopened" }),
    cancelled: Object.freeze({ label: "취소", tone: "cancelled" }),
});

const INVENTORY_RECEIPT_ITEM_STATUSES = Object.freeze({
    pending: Object.freeze({ label: "미입고", tone: "pending" }),
    matched: Object.freeze({ label: "수량 일치", tone: "matched" }),
    shortage: Object.freeze({ label: "부족", tone: "shortage" }),
    excess: Object.freeze({ label: "초과", tone: "excess" }),
});

const RECEIVING_SKU_SEARCH_KEYS = Object.freeze([
    "productName",
    "englishName",
    "adminProductCode",
    "selfProductCode",
    "manufacturerProductCode",
    "barcode",
    "brand",
    "skuType",
    "category",
    "category1",
    "category2",
    "category3",
    "supplier",
    "countryOfOrigin",
    "hsCode",
]);

function safeText(value) {
    return String(value ?? "").trim();
}

function normalizeReceivingSkuSearchToken(value) {
    return safeText(value)
        .toLowerCase()
        .replace(/,/g, "")
        .replace(/\s+/g, "");
}

function normalizeReceivingBarcode(value) {
    return safeText(value).replace(/\s+/g, "");
}

function formatReceivingExpiryDateInput(value) {
    const digits = safeText(value).replace(/\D/g, "").slice(0, 8);
    if (!digits) return "";
    if (digits.length < 4) return digits;
    if (digits.length === 4) return `${digits}-`;
    if (digits.length < 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    if (digits.length === 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function isValidReceivingExpiryDate(value) {
    const text = safeText(value);
    if (!text) return true;
    const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return false;

    const [, yearText, monthText, dayText] = matched;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return false;

    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function getReceivingBarcodeCandidates(value) {
    return safeText(value)
        .split(/[\n,;|]+/g)
        .map(normalizeReceivingBarcode)
        .filter(Boolean);
}

function filterReceivingSkuRowsBySearch(rows = [], query = "") {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const queryTokens = safeText(query)
        .split(/\s+/g)
        .map(normalizeReceivingSkuSearchToken)
        .filter(Boolean);

    if (!queryTokens.length) return [...sourceRows];

    return sourceRows.filter((row) => queryTokens.every((queryToken) => (
        RECEIVING_SKU_SEARCH_KEYS.some((key) => (
            normalizeReceivingSkuSearchToken(row?.[key]).includes(queryToken)
        ))
    )));
}

function safePositiveInteger(value) {
    const numericValue = Math.trunc(Number(value));
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function normalizeInventoryReceiptAllocation(allocation = {}, index = 0) {
    return {
        allocationId: safeText(allocation.allocationId) || `allocation-${index + 1}`,
        palletNo: safeText(allocation.palletNo),
        lotNo: safeText(allocation.lotNo),
        expiryDate: safeText(allocation.expiryDate),
        location: safeText(allocation.location),
        quantity: safePositiveInteger(allocation.quantity),
        postedQuantity: safePositiveInteger(allocation.postedQuantity),
        postedAt: safeText(allocation.postedAt),
    };
}

function isSameReceivingAllocationGroup(left = {}, right = {}) {
    return ["palletNo", "lotNo", "expiryDate", "location"].every((key) => (
        safeText(left?.[key]).toLocaleLowerCase("ko-KR")
        === safeText(right?.[key]).toLocaleLowerCase("ko-KR")
    ));
}

function mergeInventoryReceiptAllocation(item = {}, allocation = {}) {
    const normalizedItem = normalizeInventoryReceiptItem(item);
    const incomingAllocation = normalizeInventoryReceiptAllocation(allocation);
    if (incomingAllocation.quantity <= 0) return normalizedItem;

    const allocations = [...normalizedItem.allocations];
    const matchingIndex = allocations.findIndex((row) => (
        row.postedQuantity <= 0
        && row.quantity > 0
        && isSameReceivingAllocationGroup(row, incomingAllocation)
    ));

    if (matchingIndex >= 0) {
        allocations[matchingIndex] = normalizeInventoryReceiptAllocation({
            ...allocations[matchingIndex],
            quantity: allocations[matchingIndex].quantity + incomingAllocation.quantity,
        }, matchingIndex);
    } else {
        const blankIndex = allocations.findIndex((row) => (
            row.postedQuantity <= 0
            && row.quantity <= 0
            && !row.palletNo
            && !row.lotNo
            && !row.expiryDate
            && !row.location
        ));
        const nextAllocation = normalizeInventoryReceiptAllocation({
            ...incomingAllocation,
            allocationId: incomingAllocation.allocationId
                || allocations[blankIndex]?.allocationId,
        }, blankIndex >= 0 ? blankIndex : allocations.length);
        if (blankIndex >= 0) {
            allocations[blankIndex] = nextAllocation;
        } else {
            allocations.push(nextAllocation);
        }
    }

    return normalizeInventoryReceiptItem({
        ...normalizedItem,
        allocations,
    });
}

function findInventoryReceiptItemsByBarcode(items = [], skuRows = [], barcode = "") {
    const normalizedBarcode = normalizeReceivingBarcode(barcode);
    if (!normalizedBarcode) return [];

    const skuByKey = new Map(
        (Array.isArray(skuRows) ? skuRows : [])
            .filter((row) => safeText(row?.skuKey))
            .map((row) => [safeText(row.skuKey), row]),
    );

    return (Array.isArray(items) ? items : []).filter((item) => {
        const skuRow = skuByKey.get(safeText(item?.skuKey));
        const barcodeCandidates = new Set([
            ...getReceivingBarcodeCandidates(item?.barcode),
            ...getReceivingBarcodeCandidates(skuRow?.barcode),
        ]);
        return barcodeCandidates.has(normalizedBarcode);
    });
}

function getInventoryReceiptItemStatusMeta(status) {
    return INVENTORY_RECEIPT_ITEM_STATUSES[safeText(status)]
        ?? INVENTORY_RECEIPT_ITEM_STATUSES.pending;
}

function isInventoryReceiptEditableStatus(status) {
    return ["planned", "partial", "reopened"].includes(safeText(status));
}

function getInventoryReceiptItemProgress(item = {}) {
    const plannedQuantity = safePositiveInteger(item.quantity);
    const allocations = (Array.isArray(item.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation);
    const allocationQuantity = allocations.reduce((sum, row) => sum + row.quantity, 0);
    const postedQuantity = allocations.reduce(
        (sum, row) => sum + Math.min(row.quantity, row.postedQuantity),
        0,
    );
    const receivedQuantity = allocations.length
        ? allocationQuantity
        : safePositiveInteger(item.receivedQuantity);
    const varianceQuantity = receivedQuantity - plannedQuantity;
    const status = receivedQuantity <= 0
        ? "pending"
        : (varianceQuantity === 0 ? "matched" : (varianceQuantity < 0 ? "shortage" : "excess"));
    const palletNumbers = new Set(
        allocations
            .filter((row) => row.quantity > 0 && row.palletNo)
            .map((row) => row.palletNo.toLocaleLowerCase("ko-KR")),
    );

    return {
        plannedQuantity,
        receivedQuantity,
        postedQuantity,
        unpostedQuantity: Math.max(0, receivedQuantity - postedQuantity),
        varianceQuantity,
        status,
        allocationCount: allocations.filter((row) => row.quantity > 0).length,
        palletCount: palletNumbers.size,
        isClosed: Boolean(item.receivingClosed),
    };
}

function buildReopenedInventoryReceiptItems(items = []) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
        const normalizedItem = normalizeInventoryReceiptItem(item, index, {
            receiptStatus: "completed",
        });
        const progress = getInventoryReceiptItemProgress(normalizedItem);
        const sourceAllocations = normalizedItem.allocations.length
            ? normalizedItem.allocations
            : (progress.receivedQuantity > 0
                ? [normalizeInventoryReceiptAllocation({
                    allocationId: `${normalizedItem.lineId}-rework-legacy`,
                    quantity: progress.receivedQuantity,
                })]
                : []);
        const allocations = sourceAllocations.map((allocation, allocationIndex) => (
            normalizeInventoryReceiptAllocation({
                ...allocation,
                postedQuantity: 0,
                postedAt: "",
            }, allocationIndex)
        ));
        return normalizeInventoryReceiptItem({
            ...normalizedItem,
            allocations,
            receivingClosed: false,
        }, index, { receiptStatus: "reopened" });
    });
}

function getInventoryReceiptProgress(items = []) {
    const progressRows = (Array.isArray(items) ? items : [])
        .filter((item) => safeText(item?.skuKey) && safePositiveInteger(item?.quantity) > 0)
        .map((item) => getInventoryReceiptItemProgress(item));
    const plannedTotalQuantity = progressRows.reduce((sum, row) => sum + row.plannedQuantity, 0);
    const receivedTotalQuantity = progressRows.reduce((sum, row) => sum + row.receivedQuantity, 0);
    const postedTotalQuantity = progressRows.reduce((sum, row) => sum + row.postedQuantity, 0);

    return {
        itemCount: progressRows.length,
        plannedTotalQuantity,
        receivedTotalQuantity,
        postedTotalQuantity,
        varianceQuantity: receivedTotalQuantity - plannedTotalQuantity,
        receivedItemCount: progressRows.filter((row) => row.receivedQuantity > 0).length,
        matchedItemCount: progressRows.filter((row) => row.status === "matched").length,
        shortageItemCount: progressRows.filter((row) => row.status === "shortage").length,
        excessItemCount: progressRows.filter((row) => row.status === "excess").length,
        pendingItemCount: progressRows.filter((row) => row.status === "pending").length,
        mismatchItemCount: progressRows.filter((row) => row.status !== "matched").length,
    };
}

function buildPostedInventoryReceiptItems(items = [], {
    finalize = false,
    postedAt = "",
} = {}) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
        const normalizedItem = normalizeInventoryReceiptItem(item, index, {
            receiptStatus: "partial",
        });
        const allocations = normalizedItem.allocations.map((allocation) => {
            if (allocation.quantity <= allocation.postedQuantity) return allocation;
            return normalizeInventoryReceiptAllocation({
                ...allocation,
                postedQuantity: allocation.quantity,
                postedAt: allocation.postedAt || postedAt,
            });
        });
        const postedItem = normalizeInventoryReceiptItem({
            ...normalizedItem,
            allocations,
        }, index, { receiptStatus: "partial" });
        const progress = getInventoryReceiptItemProgress(postedItem);
        return normalizeInventoryReceiptItem({
            ...postedItem,
            receivingClosed: finalize
                || postedItem.receivingClosed
                || progress.status === "matched"
                || progress.status === "excess",
        }, index, { receiptStatus: "partial" });
    });
}

function getInventoryReceiptStatusMeta(status) {
    return INVENTORY_RECEIPT_STATUSES[safeText(status)]
        ?? Object.freeze({ label: safeText(status) || "입고 예정", tone: "planned" });
}

function normalizeInventoryReceiptItem(item = {}, index = 0, { receiptStatus = "" } = {}) {
    const quantity = safePositiveInteger(item.quantity);
    const allocations = (Array.isArray(item.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation);
    const hasExplicitReceivedQuantity = Object.prototype.hasOwnProperty.call(item, "receivedQuantity");
    const legacyReceivedQuantity = !allocations.length && receiptStatus === "completed" && !hasExplicitReceivedQuantity
        ? quantity
        : safePositiveInteger(item.receivedQuantity);
    const normalizedItem = {
        lineId: safeText(item.lineId) || `receipt-line-${index + 1}`,
        skuKey: safeText(item.skuKey),
        skuRowId: Math.max(0, Math.trunc(Number(item.skuRowId) || 0)),
        adminProductCode: safeText(item.adminProductCode),
        barcode: safeText(item.barcode),
        productName: safeText(item.productName),
        brand: safeText(item.brand),
        skuType: safeText(item.skuType),
        category: safeText(item.category),
        quantity,
        allocations,
        receivedQuantity: legacyReceivedQuantity,
        discrepancyReason: safeText(item.discrepancyReason),
        receivingClosed: Boolean(item.receivingClosed),
    };
    const progress = getInventoryReceiptItemProgress(normalizedItem);
    return {
        ...normalizedItem,
        receivedQuantity: progress.receivedQuantity,
        varianceQuantity: progress.varianceQuantity,
        receivingStatus: progress.status,
        palletCount: progress.palletCount,
    };
}

function getInventoryReceiptTotals(items = []) {
    const normalizedItems = (Array.isArray(items) ? items : [])
        .map(normalizeInventoryReceiptItem)
        .filter((item) => item.skuKey && item.quantity > 0);
    return {
        itemCount: normalizedItems.length,
        totalQuantity: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
    };
}

function normalizeInventoryReceipt(row = {}, index = 0) {
    const status = safeText(row.status) || "planned";
    const items = (Array.isArray(row.items) ? row.items : [])
        .map((item, itemIndex) => normalizeInventoryReceiptItem(item, itemIndex, { receiptStatus: status }))
        .filter((item) => item.skuKey && item.quantity > 0);
    const totals = getInventoryReceiptTotals(items);
    const progress = getInventoryReceiptProgress(items);

    return {
        id: safeText(row.id) || `receipt-${index + 1}`,
        receiptCode: safeText(row.receiptCode),
        status,
        supplier: safeText(row.supplier),
        expectedDate: safeText(row.expectedDate),
        receivedDate: safeText(row.receivedDate),
        warehouseId: safeText(row.warehouseId) || "main",
        warehouseName: safeText(row.warehouseName) || "기본 창고",
        items,
        itemCount: totals.itemCount,
        totalQuantity: totals.totalQuantity,
        receivedTotalQuantity: progress.receivedTotalQuantity,
        postedTotalQuantity: progress.postedTotalQuantity,
        varianceQuantity: progress.varianceQuantity,
        matchedItemCount: progress.matchedItemCount,
        mismatchItemCount: progress.mismatchItemCount,
        memo: safeText(row.memo),
        createdBy: safeText(row.createdBy),
        createdAtText: safeText(row.createdAtText),
        completedAt: safeText(row.completedAt),
        lastCompletedAt: safeText(row.lastCompletedAt),
        reopenedAt: safeText(row.reopenedAt),
        reopenedBy: safeText(row.reopenedBy),
        reopenCount: Math.max(0, Math.trunc(Number(row.reopenCount) || 0)),
        reworkReversed: Boolean(row.reworkReversed),
        cancelledAt: safeText(row.cancelledAt),
        cancelledBy: safeText(row.cancelledBy),
        cancellationReversed: Boolean(row.cancellationReversed),
    };
}

function compareInventoryReceiptsDesc(left, right) {
    const leftTime = Date.parse(left?.createdAtText || left?.expectedDate || "") || 0;
    const rightTime = Date.parse(right?.createdAtText || right?.expectedDate || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return safeText(right?.id).localeCompare(safeText(left?.id), "ko-KR");
}

function buildInventoryReceiptCode(now = new Date()) {
    const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("");
    const timePart = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "0");
    return `RCV-${datePart}-${timePart}-${suffix}`;
}

function buildInventoryReceiptDraft({
    id = "",
    receiptCode = "",
    supplier = "",
    expectedDate = "",
    items = [],
    memo = "",
    createdBy = "",
    now = new Date(),
} = {}) {
    return normalizeInventoryReceipt({
        id,
        receiptCode: safeText(receiptCode) || buildInventoryReceiptCode(now),
        status: "planned",
        supplier,
        expectedDate,
        warehouseId: "main",
        warehouseName: "기본 창고",
        items,
        memo,
        createdBy,
        createdAtText: now.toISOString(),
    });
}

function buildUpdatedInventoryReceiptPlan(receipt = {}, {
    supplier = "",
    expectedDate = "",
    items = [],
    memo = "",
} = {}) {
    const normalizedReceipt = normalizeInventoryReceipt(receipt);
    if (normalizedReceipt.status !== "planned") {
        throw new Error("입고 예정 상태에서만 예정 정보를 수정할 수 있습니다.");
    }
    return normalizeInventoryReceipt({
        ...normalizedReceipt,
        supplier,
        expectedDate,
        items,
        memo,
    });
}

export {
    INVENTORY_RECEIPT_ITEM_STATUSES,
    INVENTORY_RECEIPT_STATUSES,
    buildReopenedInventoryReceiptItems,
    buildPostedInventoryReceiptItems,
    buildInventoryReceiptDraft,
    buildUpdatedInventoryReceiptPlan,
    compareInventoryReceiptsDesc,
    filterReceivingSkuRowsBySearch,
    findInventoryReceiptItemsByBarcode,
    formatReceivingExpiryDateInput,
    getInventoryReceiptItemProgress,
    getInventoryReceiptItemStatusMeta,
    getInventoryReceiptProgress,
    getInventoryReceiptStatusMeta,
    getInventoryReceiptTotals,
    isValidReceivingExpiryDate,
    isInventoryReceiptEditableStatus,
    mergeInventoryReceiptAllocation,
    normalizeReceivingBarcode,
    normalizeInventoryReceipt,
    normalizeInventoryReceiptAllocation,
    normalizeInventoryReceiptItem,
};
