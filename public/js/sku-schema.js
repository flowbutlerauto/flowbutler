const SKU_FIELDS = [
    { key: "brand", label: "브랜드" },
    { key: "category", label: "카테고리" },
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
};
