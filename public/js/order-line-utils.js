const ORDER_LINE_SCHEMA_VERSION = 2;

const ORDER_LINE_MATCH_STATUSES = Object.freeze([
    "unmatched",
    "suggested",
    "matched",
]);

function safeText(value) {
    return String(value ?? "").trim();
}

function normalizeIdentityPart(value) {
    return safeText(value)
        .toLocaleLowerCase("ko-KR")
        .replace(/\s+/g, "-")
        .replace(/[\\/#?\[\]]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function normalizeOrderLineQuantity(value, fallback = 0) {
    const normalizedText = safeText(value).replace(/,/g, "");
    const numericValue = Number(normalizedText);
    if (!Number.isFinite(numericValue)) return Math.max(0, Math.trunc(Number(fallback) || 0));
    return Math.max(0, Math.trunc(numericValue));
}

function normalizeOrderLineMatchStatus(value) {
    const status = safeText(value).toLowerCase();
    return ORDER_LINE_MATCH_STATUSES.includes(status) ? status : "unmatched";
}

function buildStandardOrderId(row = {}, index = 0) {
    const existingId = safeText(row.orderId);
    if (existingId) return existingId;

    const channel = normalizeIdentityPart(row.channel || row.channelName || "order");
    const orderCode = normalizeIdentityPart(row.orderCode || row.managementId);
    if (orderCode) return `${channel || "order"}:${orderCode}`;

    const sourceFile = normalizeIdentityPart(row.sourceFileName);
    const sourceLine = normalizeIdentityPart(row.sourceRowId || row.rowId || index + 1);
    return [channel || "order", sourceFile || "manual", sourceLine || index + 1].join(":");
}

function buildStandardOrderLineId(row = {}, index = 0) {
    const existingLineId = safeText(row.orderLineId);
    if (existingLineId) return existingLineId;

    const existingRowId = safeText(row.id);
    if (existingRowId) return existingRowId;

    const orderId = buildStandardOrderId(row, index);
    const sourceLine = normalizeIdentityPart(row.sourceLineNo || row.sourceRowId || row.rowId || index + 1);
    const productCode = normalizeIdentityPart(
        row.marketplaceProductCode || row.productCode || row.barcode || row.productName,
    );
    return [orderId, "line", sourceLine || index + 1, productCode].filter(Boolean).join(":");
}

function normalizeOrderLineSkuComponents(components = [], orderedQuantity = 0) {
    return (Array.isArray(components) ? components : [])
        .map((component) => {
            const skuKey = safeText(component?.skuKey);
            const unitsPerOrder = Math.max(
                1,
                normalizeOrderLineQuantity(
                    component?.unitsPerOrder ?? component?.quantity,
                    1,
                ),
            );
            if (!skuKey) return null;

            return {
                skuKey,
                inventorySkuKey: safeText(component?.inventorySkuKey) || skuKey,
                skuRowId: normalizeOrderLineQuantity(component?.skuRowId, 0),
                adminProductCode: safeText(component?.adminProductCode),
                productName: safeText(component?.productName || component?.skuName),
                unitsPerOrder,
                requiredQuantity: orderedQuantity * unitsPerOrder,
            };
        })
        .filter(Boolean);
}

function normalizeOrderLine(row = {}, options = {}) {
    const orderedQuantity = normalizeOrderLineQuantity(
        row.orderedQuantity ?? row.quantity ?? row.qty ?? row.totalEa,
        0,
    );
    const isCancelled = options.isCancelled === true;
    const rawCancelledQuantity = options.cancelledQuantity
        ?? row.cancelledQuantity
        ?? (isCancelled ? orderedQuantity : 0);
    const cancelledQuantity = Math.min(
        orderedQuantity,
        normalizeOrderLineQuantity(rawCancelledQuantity, 0),
    );
    const allocatableQuantity = Math.max(0, orderedQuantity - cancelledQuantity);
    const resolution = options.matchResolution && typeof options.matchResolution === "object"
        ? options.matchResolution
        : {};
    const matchStatus = normalizeOrderLineMatchStatus(
        resolution.status ?? row.matchStatus,
    );
    const rawComponents = resolution.components ?? row.skuComponents ?? [];
    const skuComponents = normalizeOrderLineSkuComponents(rawComponents, allocatableQuantity);
    const inventoryLinkReady = matchStatus === "matched"
        && allocatableQuantity > 0
        && skuComponents.length > 0;

    return {
        ...row,
        orderLineSchemaVersion: ORDER_LINE_SCHEMA_VERSION,
        orderId: buildStandardOrderId(row, options.index || 0),
        orderLineId: buildStandardOrderLineId(row, options.index || 0),
        sourceLineNo: safeText(row.sourceLineNo || row.sourceRowId || row.rowId),
        orderedQuantity,
        cancelledQuantity,
        allocatableQuantity,
        matchKey: safeText(resolution.matchKey ?? row.matchKey),
        matchStatus,
        matchSource: safeText(resolution.source ?? row.matchSource) || "none",
        matchedAt: safeText(resolution.matchedAt ?? row.matchedAt),
        skuComponents,
        inventoryLinkReady,
    };
}

function getOrderLineRequiredQuantity(row = {}) {
    return (Array.isArray(row.skuComponents) ? row.skuComponents : [])
        .reduce((sum, component) => (
            sum + normalizeOrderLineQuantity(component?.requiredQuantity, 0)
        ), 0);
}

export {
    ORDER_LINE_MATCH_STATUSES,
    ORDER_LINE_SCHEMA_VERSION,
    buildStandardOrderId,
    buildStandardOrderLineId,
    getOrderLineRequiredQuantity,
    normalizeOrderLine,
    normalizeOrderLineMatchStatus,
    normalizeOrderLineQuantity,
    normalizeOrderLineSkuComponents,
};
