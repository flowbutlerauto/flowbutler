export const INVENTORY_ALLOCATION_POLICY_SCHEMA_VERSION = 1;

export const INVENTORY_ALLOCATION_PRIORITY_OPTIONS = Object.freeze([
    Object.freeze({ key: "expiry_asc", label: "유통기한 빠른 순", shortLabel: "유통기한" }),
    Object.freeze({ key: "received_asc", label: "입고일 빠른 순", shortLabel: "입고일" }),
    Object.freeze({ key: "unit_quantity_asc", label: "잔량 적은 보관단위 순", shortLabel: "잔량" }),
    Object.freeze({ key: "location_asc", label: "로케이션 코드 빠른 순", shortLabel: "로케이션" }),
]);

const DEFAULT_PRIORITY_KEYS = Object.freeze([
    "expiry_asc",
    "received_asc",
    "unit_quantity_asc",
]);

export const INVENTORY_ALLOCATION_POLICY_DEFAULTS = Object.freeze({
    priorityKeys: DEFAULT_PRIORITY_KEYS,
    undatedExpiryPolicy: "last",
    allowLotSplit: true,
    excludeExpired: true,
});

const ALLOWED_PRIORITY_KEYS = new Set(
    INVENTORY_ALLOCATION_PRIORITY_OPTIONS.map((option) => option.key),
);

export function normalizeInventoryAllocationPolicy(policy = {}) {
    const source = policy && typeof policy === "object" ? policy : {};
    const priorityKeys = [];
    const appendPriority = (value) => {
        const key = String(value || "").trim();
        if (!ALLOWED_PRIORITY_KEYS.has(key) || priorityKeys.includes(key)) return;
        priorityKeys.push(key);
    };

    (Array.isArray(source.priorityKeys) ? source.priorityKeys : []).forEach(appendPriority);
    DEFAULT_PRIORITY_KEYS.forEach(appendPriority);
    INVENTORY_ALLOCATION_PRIORITY_OPTIONS.forEach((option) => appendPriority(option.key));

    return {
        priorityKeys: priorityKeys.slice(0, 3),
        undatedExpiryPolicy: ["first", "exclude"].includes(source.undatedExpiryPolicy)
            ? source.undatedExpiryPolicy
            : "last",
        allowLotSplit: source.allowLotSplit !== false,
        excludeExpired: true,
    };
}

export function validateInventoryAllocationPriorityKeys(priorityKeys = []) {
    const keys = Array.isArray(priorityKeys)
        ? priorityKeys.map((value) => String(value || "").trim())
        : [];
    if (keys.length !== 3 || keys.some((key) => !ALLOWED_PRIORITY_KEYS.has(key))) {
        return { isValid: false, message: "1·2·3순위의 할당 기준을 모두 선택해주세요." };
    }
    if (new Set(keys).size !== keys.length) {
        return { isValid: false, message: "같은 할당 기준을 두 번 선택할 수 없습니다." };
    }
    return { isValid: true, message: "" };
}

export function getInventoryAllocationPriorityLabel(key) {
    return INVENTORY_ALLOCATION_PRIORITY_OPTIONS
        .find((option) => option.key === key)?.label || "미지정";
}
