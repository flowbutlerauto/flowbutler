const INVENTORY_TRANSACTION_TYPES = Object.freeze({
    opening: Object.freeze({ label: "기초재고", direction: "in", tone: "opening" }),
    receipt: Object.freeze({ label: "입고", direction: "in", tone: "in" }),
    shipment: Object.freeze({ label: "출고", direction: "out", tone: "out" }),
    adjustment_in: Object.freeze({ label: "재고조정 증가", direction: "in", tone: "in" }),
    adjustment_out: Object.freeze({ label: "재고조정 감소", direction: "out", tone: "out" }),
    reclassification_in: Object.freeze({ label: "보관정보 변경 후", direction: "in", tone: "transfer" }),
    reclassification_out: Object.freeze({ label: "보관정보 변경 전", direction: "out", tone: "transfer" }),
    set_consumption: Object.freeze({ label: "세트작업 투입", direction: "out", tone: "set" }),
    set_production: Object.freeze({ label: "세트작업 생산", direction: "in", tone: "set" }),
    reversal: Object.freeze({ label: "작업취소", direction: "neutral", tone: "reversal" }),
});

function safeText(value) {
    return String(value ?? "").trim();
}

function safeInteger(value, fallback = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.trunc(numericValue) : fallback;
}

function getInventorySkuKey(row) {
    const adminProductCode = safeText(row?.adminProductCode).toLocaleLowerCase("ko-KR");
    if (adminProductCode) return `code:${adminProductCode}`;

    const rowId = safeInteger(row?.rowId, 0);
    return rowId > 0 ? `row:${rowId}` : "";
}

function getInventoryDocumentId(skuKey) {
    return safeText(skuKey)
        .replaceAll("/", "∕")
        .slice(0, 1400);
}

function getInventoryTransactionTypeMeta(type) {
    return INVENTORY_TRANSACTION_TYPES[safeText(type)]
        ?? Object.freeze({ label: safeText(type) || "기타", direction: "neutral", tone: "other" });
}

function normalizeInventoryBalance(row = {}) {
    const quantity = Math.max(0, safeInteger(row.quantity, 0));
    return {
        skuKey: safeText(row.skuKey),
        skuRowId: safeInteger(row.skuRowId, 0),
        adminProductCode: safeText(row.adminProductCode),
        productName: safeText(row.productName),
        skuType: safeText(row.skuType),
        category: safeText(row.category),
        warehouseId: safeText(row.warehouseId) || "main",
        warehouseName: safeText(row.warehouseName) || "기본 창고",
        quantity,
        storageRevision: Math.max(0, safeInteger(row.storageRevision, 0)),
        updatedAt: safeText(row.updatedAt),
    };
}

function normalizeInventoryTransaction(row = {}, index = 0) {
    const transactionType = safeText(row.transactionType) || "adjustment_in";
    const typeMeta = getInventoryTransactionTypeMeta(transactionType);
    const quantity = Math.abs(safeInteger(row.quantity, 0));
    const fallbackDelta = typeMeta.direction === "out" ? -quantity : quantity;
    const rawDelta = Number(row.quantityDelta);
    const quantityDelta = Number.isFinite(rawDelta) ? Math.trunc(rawDelta) : fallbackDelta;
    const rawBalanceAfter = Number(row.balanceAfter);
    const balanceAfter = Number.isFinite(rawBalanceAfter) ? Math.trunc(rawBalanceAfter) : null;

    return {
        id: safeText(row.id) || `inventory-row-${index + 1}`,
        transactionCode: safeText(row.transactionCode),
        transactionType,
        skuKey: safeText(row.skuKey),
        skuRowId: safeInteger(row.skuRowId, 0),
        adminProductCode: safeText(row.adminProductCode),
        productName: safeText(row.productName),
        brand: safeText(row.brand),
        skuType: safeText(row.skuType),
        category: safeText(row.category),
        quantity,
        quantityDelta,
        balanceAfter,
        occurredAt: safeText(row.occurredAt),
        reason: safeText(row.reason),
        memo: safeText(row.memo),
        warehouseId: safeText(row.warehouseId) || "main",
        warehouseName: safeText(row.warehouseName) || "기본 창고",
        sourceType: safeText(row.sourceType),
        sourceId: safeText(row.sourceId),
        sourceCode: safeText(row.sourceCode),
        receiptLineId: safeText(row.receiptLineId),
        allocationId: safeText(row.allocationId),
        adjustmentGroupId: safeText(row.adjustmentGroupId),
        operationType: safeText(row.operationType),
        counterpartKey: safeText(row.counterpartKey),
        palletNo: safeText(row.palletNo),
        lotNo: safeText(row.lotNo),
        expiryDate: safeText(row.expiryDate),
        location: safeText(row.location),
        createdBy: safeText(row.createdBy),
    };
}

function compareInventoryTransactionsDesc(left, right) {
    const leftTime = Date.parse(left?.occurredAt || "") || 0;
    const rightTime = Date.parse(right?.occurredAt || "") || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return safeText(right?.id).localeCompare(safeText(left?.id), "ko-KR");
}

function buildInventorySnapshot(skuRows = [], balanceRows = [], transactionRows = []) {
    const normalizedTransactions = (Array.isArray(transactionRows) ? transactionRows : [])
        .map(normalizeInventoryTransaction)
        .sort(compareInventoryTransactionsDesc);
    const transactionDeltaBySku = new Map();
    const latestTransactionBySku = new Map();

    normalizedTransactions.forEach((transaction) => {
        if (!transaction.skuKey) return;
        transactionDeltaBySku.set(
            transaction.skuKey,
            (transactionDeltaBySku.get(transaction.skuKey) ?? 0) + transaction.quantityDelta,
        );
        if (!latestTransactionBySku.has(transaction.skuKey)) {
            latestTransactionBySku.set(transaction.skuKey, transaction);
        }
    });

    const balanceBySku = new Map(
        (Array.isArray(balanceRows) ? balanceRows : [])
            .map(normalizeInventoryBalance)
            .filter((row) => row.skuKey)
            .map((row) => [row.skuKey, row]),
    );

    const rows = (Array.isArray(skuRows) ? skuRows : []).map((sku) => {
        const skuKey = getInventorySkuKey(sku);
        const balanceRow = balanceBySku.get(skuKey);
        const fallbackQuantity = transactionDeltaBySku.get(skuKey) ?? 0;
        return {
            ...sku,
            skuKey,
            currentStock: balanceRow?.quantity ?? Math.max(0, fallbackQuantity),
            latestTransaction: latestTransactionBySku.get(skuKey) ?? null,
            hasTransactions: transactionDeltaBySku.has(skuKey),
        };
    });

    return {
        rows,
        transactions: normalizedTransactions,
        balanceBySku,
    };
}

function getInventoryExpiryState(expiryDate, now = new Date(), warningDays = 90) {
    const text = safeText(expiryDate);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return { state: "none", daysUntilExpiry: null };

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const expiryUtc = Date.UTC(year, month - 1, day);
    const expiry = new Date(expiryUtc);
    if (
        expiry.getUTCFullYear() !== year
        || expiry.getUTCMonth() !== month - 1
        || expiry.getUTCDate() !== day
    ) {
        return { state: "none", daysUntilExpiry: null };
    }

    const reference = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const todayUtc = Date.UTC(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate(),
    );
    const daysUntilExpiry = Math.floor((expiryUtc - todayUtc) / 86400000);
    if (daysUntilExpiry < 0) return { state: "expired", daysUntilExpiry };
    if (daysUntilExpiry <= Math.max(0, Math.trunc(Number(warningDays) || 0))) {
        return { state: "expiring", daysUntilExpiry };
    }
    return { state: "normal", daysUntilExpiry };
}

function getInventoryLotGroupKey(transaction = {}) {
    return [
        safeText(transaction.skuKey).toLocaleLowerCase("ko-KR"),
        safeText(transaction.lotNo).toLocaleLowerCase("ko-KR"),
        safeText(transaction.expiryDate),
        safeText(transaction.location).toLocaleLowerCase("ko-KR"),
        safeText(transaction.palletNo).toLocaleLowerCase("ko-KR"),
    ].join("\u001f");
}

function normalizeInventoryStorageRow(row = {}) {
    return {
        skuKey: safeText(row.skuKey),
        lotNo: safeText(row.lotNo),
        expiryDate: safeText(row.expiryDate),
        location: safeText(row.location),
        palletNo: safeText(row.palletNo),
        quantity: Math.max(0, safeInteger(row.quantity, 0)),
    };
}

function groupInventoryStorageRows(rows = []) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((sourceRow) => {
        const row = normalizeInventoryStorageRow(sourceRow);
        if (!row.skuKey || row.quantity <= 0) return;
        const key = getInventoryLotGroupKey(row);
        const current = groups.get(key) || { ...row, key, quantity: 0 };
        current.quantity += row.quantity;
        groups.set(key, current);
    });
    return groups;
}

function buildInventoryStorageAdjustmentPlan(beforeRows = [], afterRows = []) {
    const beforeGroups = groupInventoryStorageRows(beforeRows);
    const afterGroups = groupInventoryStorageRows(afterRows);
    const keys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
    const negativeDeltas = [];
    const positiveDeltas = [];

    keys.forEach((key) => {
        const beforeRow = beforeGroups.get(key);
        const afterRow = afterGroups.get(key);
        const beforeQuantity = beforeRow?.quantity || 0;
        const afterQuantity = afterRow?.quantity || 0;
        const delta = afterQuantity - beforeQuantity;
        if (delta < 0) {
            negativeDeltas.push({
                key,
                row: beforeRow,
                quantity: Math.abs(delta),
                remaining: Math.abs(delta),
            });
        } else if (delta > 0) {
            positiveDeltas.push({
                key,
                row: afterRow,
                quantity: delta,
                remaining: delta,
            });
        }
    });

    const legs = [];
    let reclassifiedQuantity = 0;
    let pairSequence = 0;
    negativeDeltas.forEach((negative) => {
        positiveDeltas.forEach((positive) => {
            if (negative.remaining <= 0 || positive.remaining <= 0) return;
            const quantity = Math.min(negative.remaining, positive.remaining);
            pairSequence += 1;
            legs.push({
                kind: "reclassification",
                pairSequence,
                transactionType: "reclassification_out",
                quantity,
                row: negative.row,
                counterpartKey: positive.key,
            });
            legs.push({
                kind: "reclassification",
                pairSequence,
                transactionType: "reclassification_in",
                quantity,
                row: positive.row,
                counterpartKey: negative.key,
            });
            negative.remaining -= quantity;
            positive.remaining -= quantity;
            reclassifiedQuantity += quantity;
        });
    });

    negativeDeltas.forEach((negative) => {
        if (negative.remaining <= 0) return;
        legs.push({
            kind: "quantity_adjustment",
            transactionType: "adjustment_out",
            quantity: negative.remaining,
            row: negative.row,
            counterpartKey: "",
        });
    });
    positiveDeltas.forEach((positive) => {
        if (positive.remaining <= 0) return;
        legs.push({
            kind: "quantity_adjustment",
            transactionType: "adjustment_in",
            quantity: positive.remaining,
            row: positive.row,
            counterpartKey: "",
        });
    });

    const beforeTotal = [...beforeGroups.values()]
        .reduce((sum, row) => sum + row.quantity, 0);
    const afterTotal = [...afterGroups.values()]
        .reduce((sum, row) => sum + row.quantity, 0);
    const difference = afterTotal - beforeTotal;
    const adjustmentQuantity = legs
        .filter((leg) => leg.kind === "quantity_adjustment")
        .reduce((sum, leg) => sum + leg.quantity, 0);
    const operationType = reclassifiedQuantity > 0 && adjustmentQuantity > 0
        ? "mixed_adjustment"
        : (adjustmentQuantity > 0 ? "quantity_adjustment" : "storage_reclassification");

    return {
        beforeRows: [...beforeGroups.values()],
        afterRows: [...afterGroups.values()],
        beforeTotal,
        afterTotal,
        difference,
        reclassifiedQuantity,
        adjustmentQuantity,
        operationType,
        legs,
        hasChanges: legs.length > 0,
    };
}

function buildInventoryLotSnapshot(
    skuRows = [],
    transactionRows = [],
    { now = new Date(), expiryWarningDays = 90 } = {},
) {
    const skuByKey = new Map(
        (Array.isArray(skuRows) ? skuRows : []).map((sku) => [getInventorySkuKey(sku), sku]),
    );
    const groups = new Map();
    const transactions = (Array.isArray(transactionRows) ? transactionRows : [])
        .map(normalizeInventoryTransaction)
        .filter((transaction) => transaction.skuKey && transaction.quantityDelta !== 0);

    transactions.forEach((transaction) => {
        const lotKey = getInventoryLotGroupKey(transaction);
        const current = groups.get(lotKey) || {
            lotKey,
            skuKey: transaction.skuKey,
            skuRowId: transaction.skuRowId,
            adminProductCode: transaction.adminProductCode,
            productName: transaction.productName,
            brand: transaction.brand,
            skuType: transaction.skuType,
            category: transaction.category,
            lotNo: transaction.lotNo,
            expiryDate: transaction.expiryDate,
            location: transaction.location,
            palletNo: transaction.palletNo,
            quantity: 0,
            latestTransaction: null,
            firstReceivedAt: "",
        };
        current.quantity += transaction.quantityDelta;
        const currentTime = Date.parse(current.latestTransaction?.occurredAt || "") || 0;
        const transactionTime = Date.parse(transaction.occurredAt || "") || 0;
        if (!current.latestTransaction || transactionTime >= currentTime) {
            current.latestTransaction = transaction;
        }
        if (transaction.quantityDelta > 0) {
            const firstReceivedTime = Date.parse(current.firstReceivedAt || "") || Number.POSITIVE_INFINITY;
            if (transactionTime < firstReceivedTime) {
                current.firstReceivedAt = transaction.occurredAt;
            }
        }
        groups.set(lotKey, current);
    });

    const groupedQuantityBySku = new Map();
    groups.forEach((group) => {
        groupedQuantityBySku.set(
            group.skuKey,
            (groupedQuantityBySku.get(group.skuKey) || 0) + group.quantity,
        );
    });
    skuByKey.forEach((sku, skuKey) => {
        const rawCurrentStock = Number(sku.currentStock);
        if (!Number.isFinite(rawCurrentStock)) return;
        const currentStock = Math.trunc(rawCurrentStock);
        const groupedQuantity = groupedQuantityBySku.get(skuKey) || 0;
        const difference = currentStock - groupedQuantity;
        if (!difference) return;

        const lotKey = getInventoryLotGroupKey({ skuKey });
        const current = groups.get(lotKey) || {
            lotKey,
            skuKey,
            skuRowId: sku.rowId || 0,
            adminProductCode: safeText(sku.adminProductCode),
            productName: safeText(sku.productName),
            brand: safeText(sku.brand),
            skuType: safeText(sku.skuType),
            category: safeText(sku.category),
            lotNo: "",
            expiryDate: "",
            location: "",
            palletNo: "",
            quantity: 0,
            latestTransaction: null,
            firstReceivedAt: "",
        };
        current.quantity += difference;
        current.isBalanceReconciled = true;
        groups.set(lotKey, current);
    });
    const expiryRank = { expired: 0, expiring: 1, normal: 2, none: 3 };
    const rows = [...groups.values()].map((group) => {
        const sku = skuByKey.get(group.skuKey) || {};
        const expiryMeta = getInventoryExpiryState(group.expiryDate, now, expiryWarningDays);
        const latest = group.latestTransaction || {};
        const isUnassigned = !group.lotNo
            && !group.expiryDate
            && !group.location
            && !group.palletNo;
        return {
            ...group,
            skuRowId: group.skuRowId || sku.rowId || 0,
            adminProductCode: group.adminProductCode || safeText(sku.adminProductCode),
            productName: group.productName || safeText(sku.productName),
            brand: group.brand || safeText(sku.brand),
            skuType: group.skuType || safeText(sku.skuType),
            category: group.category || safeText(sku.category),
            quantity: Math.trunc(group.quantity),
            expiryState: expiryMeta.state,
            daysUntilExpiry: expiryMeta.daysUntilExpiry,
            isUnassigned,
            isLocationUnassigned: !group.location,
            latestOccurredAt: safeText(latest.occurredAt),
            latestTransactionType: safeText(latest.transactionType),
        };
    }).sort((left, right) => (
        (expiryRank[left.expiryState] ?? 9) - (expiryRank[right.expiryState] ?? 9)
        || String(left.expiryDate || "9999-12-31").localeCompare(String(right.expiryDate || "9999-12-31"))
        || String(left.productName || "").localeCompare(String(right.productName || ""), "ko-KR")
        || String(left.location || "").localeCompare(String(right.location || ""), "ko-KR")
        || String(left.palletNo || "").localeCompare(String(right.palletNo || ""), "ko-KR")
    ));

    return {
        rows,
        totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
        availableQuantity: rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
        unassignedQuantity: rows
            .filter((row) => row.isUnassigned)
            .reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
        unassignedLocationQuantity: rows
            .filter((row) => row.isLocationUnassigned)
            .reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
    };
}
function buildInventoryTransactionCode(now = new Date()) {
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
    return `STK-${datePart}-${timePart}-${suffix}`;
}

function buildInventoryTransactionDraft({
    id = "",
    transactionType,
    sku,
    quantity,
    balanceAfter,
    occurredAt,
    reason = "",
    memo = "",
    createdBy = "",
    sourceType = "",
    sourceId = "",
    sourceCode = "",
    receiptLineId = "",
    allocationId = "",
    adjustmentGroupId = "",
    operationType = "",
    counterpartKey = "",
    palletNo = "",
    lotNo = "",
    expiryDate = "",
    location = "",
} = {}) {
    const typeMeta = getInventoryTransactionTypeMeta(transactionType);
    const normalizedQuantity = Math.abs(safeInteger(quantity, 0));
    const quantityDelta = typeMeta.direction === "out"
        ? -normalizedQuantity
        : normalizedQuantity;
    const now = new Date();

    return normalizeInventoryTransaction({
        id,
        transactionCode: buildInventoryTransactionCode(now),
        transactionType,
        skuKey: getInventorySkuKey(sku),
        skuRowId: sku?.skuRowId ?? sku?.rowId,
        adminProductCode: sku?.adminProductCode,
        productName: sku?.productName,
        brand: sku?.brand,
        skuType: sku?.skuType,
        category: sku?.category,
        quantity: normalizedQuantity,
        quantityDelta,
        balanceAfter,
        occurredAt: safeText(occurredAt) || now.toISOString(),
        reason,
        memo,
        warehouseId: "main",
        warehouseName: "기본 창고",
        sourceType,
        sourceId,
        sourceCode,
        receiptLineId,
        allocationId,
        adjustmentGroupId,
        operationType,
        counterpartKey,
        palletNo,
        lotNo,
        expiryDate,
        location,
        createdBy,
    });
}

export {
    INVENTORY_TRANSACTION_TYPES,
    buildInventoryLotSnapshot,
    buildInventorySnapshot,
    buildInventoryStorageAdjustmentPlan,
    buildInventoryTransactionDraft,
    compareInventoryTransactionsDesc,
    getInventoryDocumentId,
    getInventoryLotGroupKey,
    getInventorySkuKey,
    getInventoryTransactionTypeMeta,
    normalizeInventoryBalance,
    normalizeInventoryStorageRow,
    normalizeInventoryTransaction,
};
