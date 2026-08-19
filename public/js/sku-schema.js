const SKU_TYPE_DEFAULT = "본품";
const SKU_TYPE_OPTIONS = Object.freeze(["본품", "부자재", "사은품", "세트상품", "기타"]);
const SKU_CATEGORY_TYPE_MAP = Object.freeze({
    본품: "본품",
    기획상품: "본품",
    사은품: "사은품",
    부자재: "부자재",
    세트상품: "세트상품",
    기타: "기타",
});
const SKU_TYPE_ALIAS_MAP = Object.freeze({
    상품: "본품",
    제품: "본품",
    판매상품: "본품",
    완제품: "본품",
    포장재: "부자재",
    포장부자재: "부자재",
    자재: "부자재",
    증정품: "사은품",
    증정: "사은품",
    샘플: "사은품",
    세트: "세트상품",
    세트상품: "세트상품",
    세트제품: "세트상품",
    묶음상품: "세트상품",
    번들: "세트상품",
    bundle: "세트상품",
    other: "기타",
});

function normalizeSkuTypeValue(value, options = {}) {
    const fallback = options.fallback ?? SKU_TYPE_DEFAULT;
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    if (SKU_TYPE_OPTIONS.includes(text)) return text;

    const normalizedAlias = text.toLowerCase().replace(/[\s_-]+/g, "");
    return SKU_TYPE_ALIAS_MAP[normalizedAlias] ?? (options.preserveUnknown ? text : fallback);
}

function getSkuTypeFromCategory(value) {
    const category = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!category) return "";

    const mappedType = SKU_CATEGORY_TYPE_MAP[category]
        ?? normalizeSkuTypeValue(category, { fallback: "", preserveUnknown: true });
    return SKU_TYPE_OPTIONS.includes(mappedType) ? mappedType : "";
}

const SKU_FIELDS = [
    {
        key: "skuType",
        label: "SKU 유형",
        required: true,
        aliases: ["SKU유형", "SKU 구분", "SKU구분", "품목 유형", "품목유형", "품목 구분", "품목구분"],
        options: SKU_TYPE_OPTIONS,
    },
    { key: "brand", label: "브랜드" },
    { key: "category", label: "카테고리" },
    { key: "category1", label: "분류1", aliases: ["분류 1", "대분류", "카테고리1", "카테고리 1"] },
    { key: "category2", label: "분류2", aliases: ["분류 2", "중분류", "카테고리2", "카테고리 2"] },
    { key: "category3", label: "분류3", aliases: ["분류 3", "소분류", "카테고리3", "카테고리 3"] },
    { key: "productImageUrl", label: "제품 사진 URL", aliases: ["제품 사진", "제품이미지", "이미지 URL"] },
    { key: "barcode", label: "바코드" },
    { key: "adminProductCode", label: "어드민 상품코드", required: true, aliases: ["SKU No", "SKU NO", "상품번호", "상품코드", "업체상품코드"] },
    { key: "selfProductCode", label: "자체상품코드" },
    { key: "productName", label: "상품명", required: true },
    { key: "englishName", label: "영문명" },
    { key: "hsCode", label: "HS코드" },
    { key: "moq", label: "MOQ", numeric: true },
    { key: "shelfLifeDays", label: "유통가능일수", numeric: true },
    { key: "pcsPerBox", label: "박스당 입수", numeric: true, aliases: ["Box 입수 수량", "BOX 입수 수량", "박스입수", "박스당입수", "입수"] },
    { key: "pcsPerInnerBox", label: "인박스 입수", numeric: true },
    { key: "boxesPerPlt", label: "plt당 box수", numeric: true, aliases: ["박스/파레트", "박스/팔레트", "박스/PLT", "PLT당 BOX수", "파레트당 박스수"] },
    { key: "pcsPerPlt", label: "plt당 pcs수", numeric: true, aliases: ["Pallet 입수 수량", "팔레트 입수 수량", "PLT당 PCS수", "파레트당 입수"] },
    { key: "skuGirthMm", label: "SKU 세변합(mm)", numeric: true },
    { key: "skuNetWeightG", label: "SKU 순중량(g)", numeric: true },
    { key: "skuGrossWeightG", label: "SKU 총중량(g)", numeric: true, aliases: ["SKU 총 중량(g)", "SKU총중량", "SKU 총중량", "상품 총중량(g)", "상품 중량(g)", "상품중량(g)"] },
    { key: "skuWidthMm", label: "SKU 가로(mm)", numeric: true },
    { key: "skuLengthMm", label: "SKU 세로(mm)", numeric: true },
    { key: "skuHeightMm", label: "SKU 높이(mm)", numeric: true },
    { key: "outboxGirthMm", label: "아웃박스 세변합(mm)", numeric: true },
    { key: "outboxNetWeightG", label: "아웃박스 순중량(g)", numeric: true },
    { key: "outboxGrossWeightG", label: "아웃박스 총중량(g)", numeric: true, aliases: ["아웃박스 총 중량(g)", "아웃박스총중량", "아웃박스 총중량", "박스 총중량(g)", "박스 중량(g)", "박스중량(g)"] },
    { key: "outboxWidthMm", label: "아웃박스 가로(mm)", numeric: true },
    { key: "outboxLengthMm", label: "아웃박스 세로(mm)", numeric: true },
    { key: "outboxHeightMm", label: "아웃박스 높이(mm)", numeric: true },
    { key: "outboxCbm", label: "아웃박스(cbm)", numeric: true },
    { key: "contentVolumeOrWeight", label: "내용물의 용량 또는 중량" },
    { key: "supplier", label: "공급처" },
    { key: "countryOfOrigin", label: "제조국" },
    { key: "manufacturerProductCode", label: "제조사 상품코드" },
];

const SKU_HEADER_ALIASES = SKU_FIELDS.reduce((accumulator, field) => {
    accumulator[field.key] = [field.label, ...(field.aliases ?? [])];
    return accumulator;
}, {});

const SKU_REQUIRED_KEYS = SKU_FIELDS
    .filter((field) => field.required)
    .map((field) => field.key);

const SKU_NUMERIC_KEYS = SKU_FIELDS
    .filter((field) => field.numeric)
    .map((field) => field.key);

export {
    SKU_FIELDS,
    SKU_HEADER_ALIASES,
    SKU_REQUIRED_KEYS,
    SKU_NUMERIC_KEYS,
    SKU_TYPE_DEFAULT,
    SKU_TYPE_OPTIONS,
    getSkuTypeFromCategory,
    normalizeSkuTypeValue,
};
