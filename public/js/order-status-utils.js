const ORDER_STATUS_OPTIONS = Object.freeze(["active", "cancelled"]);
const SHIPPING_STATUS_OPTIONS = Object.freeze(["waiting", "picking", "shipped"]);
const ALLOCATION_STATUS_OPTIONS = Object.freeze([
    "unallocated",
    "partial",
    "allocated",
    "shortage",
]);
const ORDER_STATUS_SCHEMA_VERSION = 1;

const ORDER_STATUS_META = Object.freeze({
    active: Object.freeze({ label: "정상", tone: "active" }),
    cancelled: Object.freeze({ label: "취소", tone: "cancelled" }),
});

const SHIPPING_STATUS_META = Object.freeze({
    waiting: Object.freeze({ label: "출고대기", tone: "waiting" }),
    picking: Object.freeze({ label: "피킹중", tone: "picking" }),
    shipped: Object.freeze({ label: "출고완료", tone: "shipped" }),
});

const ALLOCATION_STATUS_META = Object.freeze({
    unallocated: Object.freeze({ label: "미할당", tone: "unallocated" }),
    partial: Object.freeze({ label: "일부할당", tone: "partial" }),
    allocated: Object.freeze({ label: "할당완료", tone: "allocated" }),
    shortage: Object.freeze({ label: "재고부족", tone: "shortage" }),
    pending_match: Object.freeze({ label: "SKU 매칭 필요", tone: "pending" }),
    excluded: Object.freeze({ label: "할당 제외", tone: "excluded" }),
});

function safeText(value) {
    return String(value ?? "").trim();
}

function safeQuantity(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, Math.trunc(numericValue)) : 0;
}

function normalizeOrderStatus(value, legacyStatus = "") {
    const status = safeText(value).toLowerCase();
    if (ORDER_STATUS_OPTIONS.includes(status)) return status;

    const legacy = `${safeText(value)} ${safeText(legacyStatus)}`;
    return legacy.includes("취소") ? "cancelled" : "active";
}

function normalizeShippingStatus(value, legacyStatus = "") {
    const status = safeText(value).toLowerCase();
    if (SHIPPING_STATUS_OPTIONS.includes(status)) return status;

    const legacy = `${safeText(value)} ${safeText(legacyStatus)}`;
    if (legacy.includes("출고") || legacy.includes("배송완료")) return "shipped";
    if (legacy.includes("피킹") || legacy.includes("패킹") || legacy.includes("포장")) return "picking";
    return "waiting";
}

function getLegacyOrderStatus(orderStatus, shippingStatus) {
    if (normalizeOrderStatus(orderStatus) === "cancelled") return "취소";
    const normalizedShipping = normalizeShippingStatus(shippingStatus);
    if (normalizedShipping === "shipped") return "출고";
    if (normalizedShipping === "picking") return "피킹";
    return "접수";
}

function normalizeOrderOperationalStatuses(row = {}) {
    const legacyStatus = safeText(row.status);
    const orderStatus = normalizeOrderStatus(row.orderStatus, legacyStatus);
    const normalizedShippingStatus = normalizeShippingStatus(row.shippingStatus, legacyStatus);
    const shippingStatus = orderStatus === "cancelled" ? "waiting" : normalizedShippingStatus;

    return {
        orderStatusSchemaVersion: ORDER_STATUS_SCHEMA_VERSION,
        legacyStatus: safeText(row.legacyStatus) || legacyStatus,
        orderStatus,
        shippingStatus,
        status: getLegacyOrderStatus(orderStatus, shippingStatus),
    };
}

function getOrderStatusMeta(value) {
    return ORDER_STATUS_META[normalizeOrderStatus(value)] || ORDER_STATUS_META.active;
}

function getShippingStatusMeta(value) {
    return SHIPPING_STATUS_META[normalizeShippingStatus(value)] || SHIPPING_STATUS_META.waiting;
}

function getAllocationStatusMeta(value) {
    return ALLOCATION_STATUS_META[safeText(value)] || ALLOCATION_STATUS_META.unallocated;
}

function getOrderLineAllocationKey(orderLineId, skuKey) {
    return `${safeText(orderLineId)}\u001f${safeText(skuKey)}`;
}

function buildOrderAllocationLookup(allocationRows = []) {
    const allocatedByOrderLineSkuKey = new Map();
    const stockAllocatedByOrderLineSkuKey = new Map();
    const shortageAllocatedByOrderLineSkuKey = new Map();

    (Array.isArray(allocationRows) ? allocationRows : []).forEach((row) => {
        if (safeText(row?.status).toLowerCase() !== "allocated") return;
        const orderLineId = safeText(row?.orderLineId);
        const skuKey = safeText(row?.skuKey);
        const quantity = safeQuantity(row?.quantity);
        if (!orderLineId || !skuKey || quantity <= 0) return;
        const key = getOrderLineAllocationKey(orderLineId, skuKey);
        allocatedByOrderLineSkuKey.set(
            key,
            (allocatedByOrderLineSkuKey.get(key) || 0) + quantity,
        );
        const allocationKind = safeText(row?.allocationKind).toLowerCase() === "shortage"
            ? "shortage"
            : "stock";
        const targetMap = allocationKind === "shortage"
            ? shortageAllocatedByOrderLineSkuKey
            : stockAllocatedByOrderLineSkuKey;
        targetMap.set(key, (targetMap.get(key) || 0) + quantity);
    });

    return {
        allocatedByOrderLineSkuKey,
        stockAllocatedByOrderLineSkuKey,
        shortageAllocatedByOrderLineSkuKey,
    };
}

function getOrderLineAllocationState(
    row = {},
    { allocationLookup, availableBySkuKey, inventoryReady = true } = {},
) {
    const orderStatus = normalizeOrderStatus(row.orderStatus, row.status);
    const components = Array.isArray(row.skuComponents) ? row.skuComponents : [];
    const allocatableQuantity = safeQuantity(row.allocatableQuantity);

    if (orderStatus === "cancelled" || allocatableQuantity <= 0) {
        return {
            status: "excluded",
            requiredQuantity: 0,
            allocatedQuantity: 0,
            shortageAllocatedQuantity: 0,
            plannedAllocatedQuantity: 0,
            remainingQuantity: 0,
            shortageQuantity: 0,
            progressPercent: 0,
            componentStates: [],
        };
    }

    if (row.matchStatus !== "matched" || !components.length) {
        return {
            status: "pending_match",
            requiredQuantity: 0,
            allocatedQuantity: 0,
            shortageAllocatedQuantity: 0,
            plannedAllocatedQuantity: 0,
            remainingQuantity: 0,
            shortageQuantity: 0,
            progressPercent: 0,
            componentStates: [],
        };
    }

    const stockAllocatedMap = allocationLookup?.stockAllocatedByOrderLineSkuKey
        || allocationLookup?.allocatedByOrderLineSkuKey
        || new Map();
    const shortageAllocatedMap = allocationLookup?.shortageAllocatedByOrderLineSkuKey || new Map();
    const requiredBySkuKey = new Map();
    components.forEach((component) => {
        const skuKey = safeText(component?.inventorySkuKey || component?.skuKey);
        if (!skuKey) return;
        requiredBySkuKey.set(
            skuKey,
            (requiredBySkuKey.get(skuKey) || 0) + safeQuantity(component?.requiredQuantity),
        );
    });

    const componentStates = [...requiredBySkuKey.entries()].map(([skuKey, requiredQuantity]) => {
        const allocationKey = getOrderLineAllocationKey(row.orderLineId, skuKey);
        const allocatedQuantity = Math.min(
            requiredQuantity,
            safeQuantity(stockAllocatedMap.get(allocationKey)),
        );
        const remainingQuantity = Math.max(0, requiredQuantity - allocatedQuantity);
        const shortageAllocatedQuantity = Math.min(
            remainingQuantity,
            safeQuantity(shortageAllocatedMap.get(allocationKey)),
        );
        const availableQuantity = availableBySkuKey instanceof Map
            ? Math.max(0, Number(availableBySkuKey.get(skuKey)) || 0)
            : 0;
        const shortageQuantity = shortageAllocatedQuantity;
        return {
            skuKey,
            requiredQuantity,
            allocatedQuantity,
            shortageAllocatedQuantity,
            plannedAllocatedQuantity: allocatedQuantity + shortageAllocatedQuantity,
            remainingQuantity,
            availableQuantity,
            shortageQuantity,
        };
    });

    const requiredQuantity = componentStates.reduce((sum, item) => sum + item.requiredQuantity, 0);
    const allocatedQuantity = componentStates.reduce((sum, item) => sum + item.allocatedQuantity, 0);
    const shortageAllocatedQuantity = componentStates.reduce(
        (sum, item) => sum + item.shortageAllocatedQuantity,
        0,
    );
    const plannedAllocatedQuantity = allocatedQuantity + shortageAllocatedQuantity;
    const remainingQuantity = Math.max(0, requiredQuantity - allocatedQuantity);
    const shortageQuantity = componentStates.reduce((sum, item) => sum + item.shortageQuantity, 0);
    let status = "unallocated";
    if (requiredQuantity > 0 && allocatedQuantity >= requiredQuantity) {
        status = "allocated";
    } else if (shortageQuantity > 0) {
        status = "shortage";
    } else if (allocatedQuantity > 0) {
        status = "partial";
    }

    return {
        status,
        requiredQuantity,
        allocatedQuantity,
        shortageAllocatedQuantity,
        plannedAllocatedQuantity,
        remainingQuantity,
        shortageQuantity,
        progressPercent: requiredQuantity > 0
            ? Math.min(100, Math.round((allocatedQuantity / requiredQuantity) * 100))
            : 0,
        componentStates,
    };
}

export {
    ALLOCATION_STATUS_OPTIONS,
    ORDER_STATUS_SCHEMA_VERSION,
    ORDER_STATUS_OPTIONS,
    SHIPPING_STATUS_OPTIONS,
    buildOrderAllocationLookup,
    getAllocationStatusMeta,
    getLegacyOrderStatus,
    getOrderLineAllocationKey,
    getOrderLineAllocationState,
    getOrderStatusMeta,
    getShippingStatusMeta,
    normalizeOrderOperationalStatuses,
    normalizeOrderStatus,
    normalizeShippingStatus,
};
