const HEADER_ALIASES = Object.freeze({
    receiptNumber: ["입고번호", "입고 번호", "inboundnumber", "receiptnumber"],
    supplier: ["공급처", "공급처명", "supplier", "vendor"],
    expectedDate: ["입고예정일", "입고 예정일", "expecteddate", "inbounddate"],
    adminProductCode: ["어드민 상품코드", "어드민상품코드", "상품코드", "관리상품코드", "adminproductcode"],
    barcode: ["바코드", "barcode"],
    quantity: ["예정수량", "입고예정수량", "수량", "quantity", "plannedquantity"],
    productName: ["상품명", "제품명", "productname"],
    memo: ["메모", "비고", "memo", "note"],
});

const REQUIRED_HEADERS = Object.freeze({
    supplier: "공급처",
    expectedDate: "입고예정일",
    adminProductCode: "어드민 상품코드",
    barcode: "바코드",
    quantity: "예정수량",
});

function safeText(value) {
    return String(value ?? "").trim();
}

function normalizeHeader(value) {
    return safeText(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeLookup(value) {
    return safeText(value).toLocaleLowerCase("ko-KR");
}

function normalizeCode(value) {
    const raw = safeText(value).replace(/\s+/g, "");
    const match = raw.match(/^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (!match) return raw.replace(/\.0+$/, "");
    const sign = match[1] === "-" ? "-" : "";
    const [integerPart, decimalPart = ""] = match[2].split(".");
    const digits = integerPart + decimalPart;
    const movedIndex = integerPart.length + Number(match[3]);
    let plain = "";
    if (movedIndex <= 0) plain = "0." + "0".repeat(Math.abs(movedIndex)) + digits;
    else if (movedIndex >= digits.length) plain = digits + "0".repeat(movedIndex - digits.length);
    else plain = digits.slice(0, movedIndex) + "." + digits.slice(movedIndex);
    return sign + (plain.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "0");
}

function formatInboundPlanDateParts(year, month, day) {
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
    return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function normalizeInboundPlanDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatInboundPlanDateParts(
            value.getFullYear(),
            value.getMonth() + 1,
            value.getDate(),
        );
    }

    const text = safeText(value);
    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const serial = Number(text);
        if (Number.isFinite(serial) && serial >= 1 && serial < 2958466) {
            const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86400000);
            return formatInboundPlanDateParts(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
            );
        }
    }

    const digits = text.match(/\d+/g) || [];
    if (digits.length < 3) return "";
    let year = Number(digits[0]);
    let month = Number(digits[1]);
    let day = Number(digits[2]);
    if (digits[0].length < 4) {
        month = Number(digits[0]);
        day = Number(digits[1]);
        year = Number(digits[2]);
        if (year >= 0 && year < 100) year += 2000;
    }
    return formatInboundPlanDateParts(year, month, day);
}
function mapInboundPlanSheetMatrix(matrix = []) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((value) => safeText(value)));
    if (headerIndex < 0) return { rows: [], headers: [], headerErrors: ["엑셀 파일에서 헤더 행을 찾을 수 없습니다."] };
    const headers = rows[headerIndex].map(safeText);
    const normalizedHeaders = headers.map(normalizeHeader);
    const indexes = {};
    Object.entries(HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        indexes[fieldKey] = normalizedHeaders.findIndex((header) => aliases.some((alias) => normalizeHeader(alias) === header));
    });
    const headerErrors = Object.entries(REQUIRED_HEADERS)
        .filter(([fieldKey]) => indexes[fieldKey] < 0)
        .map(([, label]) => label + " 헤더가 없습니다.");
    const mappedRows = rows.slice(headerIndex + 1).map((row, index) => {
        const cells = Array.isArray(row) ? row : [];
        const getCell = (fieldKey) => indexes[fieldKey] >= 0 ? cells[indexes[fieldKey]] : "";
        return {
            rowNumber: headerIndex + index + 2,
            receiptNumber: safeText(getCell("receiptNumber")),
            supplier: safeText(getCell("supplier")),
            expectedDateRaw: getCell("expectedDate"),
            adminProductCode: normalizeCode(getCell("adminProductCode")),
            barcode: normalizeCode(getCell("barcode")),
            quantityRaw: safeText(getCell("quantity")),
            productName: safeText(getCell("productName")),
            memo: safeText(getCell("memo")),
        };
    }).filter((row) => Object.entries(row).some(([key, value]) => key !== "rowNumber" && safeText(value)));
    return { rows: mappedRows, headers, headerErrors };
}

function buildLookupMap(rows, fieldKey) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const rawValue = fieldKey === "barcode" ? safeText(row?.[fieldKey]).replace(/\s+/g, "") : row?.[fieldKey];
        const value = normalizeLookup(rawValue);
        if (!value) return;
        map.set(value, [...(map.get(value) || []), row]);
    });
    return map;
}

function getSkuIdentity(row) {
    if (safeText(row?.skuKey)) return safeText(row.skuKey);
    if (safeText(row?.adminProductCode)) return "code:" + normalizeLookup(row.adminProductCode);
    return Number(row?.rowId) > 0 ? "row:" + Math.trunc(Number(row.rowId)) : "";
}

function findSingleSku(map, rawValue, label, rowNumber, errors) {
    if (!rawValue) return null;
    const matches = map.get(normalizeLookup(rawValue)) || [];
    if (!matches.length) errors.push(rowNumber + "행: " + label + " '" + rawValue + "'에 해당하는 SKU가 없습니다.");
    else if (matches.length > 1) errors.push(rowNumber + "행: " + label + " '" + rawValue + "'가 여러 SKU에 중복되어 있습니다.");
    return matches.length === 1 ? matches[0] : null;
}

function buildInboundPlanImportPreview(parsed = {}, skuRows = [], existingReceipts = []) {
    const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const errors = [...(Array.isArray(parsed?.headerErrors) ? parsed.headerErrors : [])];
    const warnings = [];
    const codeMap = buildLookupMap(skuRows, "adminProductCode");
    const barcodeMap = buildLookupMap(skuRows, "barcode");
    const existingCodes = new Set((existingReceipts || []).map((receipt) => normalizeLookup(receipt?.receiptCode)).filter(Boolean));
    const groupsByKey = new Map();
    if (!sourceRows.length && !errors.length) errors.push("업로드할 입고 예정 데이터가 없습니다.");
    if (sourceRows.length > 2000) errors.push("한 번에 최대 2,000행까지 업로드할 수 있습니다.");

    sourceRows.slice(0, 2000).forEach((row) => {
        const rowErrors = [];
        const receiptNumber = safeText(row.receiptNumber);
        const supplier = safeText(row.supplier);
        const expectedDate = normalizeInboundPlanDate(row.expectedDateRaw);
        const adminProductCode = normalizeCode(row.adminProductCode);
        const barcode = normalizeCode(row.barcode);
        const numericQuantity = Number(safeText(row.quantityRaw).replace(/,/g, ""));
        const quantity = Number.isFinite(numericQuantity) ? Math.trunc(numericQuantity) : 0;
        if (!supplier) rowErrors.push(row.rowNumber + "행: 공급처를 입력해주세요.");
        if (!expectedDate) rowErrors.push(row.rowNumber + "행: 입고예정일을 올바른 날짜로 입력해주세요. (예: 2026-08-03)");
        if (!adminProductCode && !barcode) rowErrors.push(row.rowNumber + "행: 어드민 상품코드 또는 바코드 중 하나를 입력해주세요.");
        if (!Number.isInteger(numericQuantity) || quantity <= 0) rowErrors.push(row.rowNumber + "행: 예정수량을 1 이상의 정수로 입력해주세요.");
        if (receiptNumber.length > 80) rowErrors.push(row.rowNumber + "행: 입고번호는 80자 이하로 입력해주세요.");
        const codeSku = findSingleSku(codeMap, adminProductCode, "어드민 상품코드", row.rowNumber, rowErrors);
        const barcodeSku = findSingleSku(barcodeMap, barcode, "바코드", row.rowNumber, rowErrors);
        if (codeSku && barcodeSku && getSkuIdentity(codeSku) !== getSkuIdentity(barcodeSku)) {
            rowErrors.push(row.rowNumber + "행: 어드민 상품코드와 바코드가 서로 다른 SKU를 가리킵니다.");
        }
        const sku = codeSku || barcodeSku;
        if (sku && safeText(sku.category) === "단종") rowErrors.push(row.rowNumber + "행: 단종 SKU는 입고 예정에 등록할 수 없습니다.");
        if (rowErrors.length) {
            errors.push(...rowErrors);
            return;
        }
        if (row.productName && normalizeLookup(row.productName) !== normalizeLookup(sku?.productName)) {
            warnings.push(row.rowNumber + "행: 상품명이 SKU 관리와 달라 '" + (safeText(sku?.productName) || "상품명 없음") + "'으로 등록됩니다.");
        }
        const groupKey = receiptNumber ? "number:" + normalizeLookup(receiptNumber) : "__auto_receipt__";
        let group = groupsByKey.get(groupKey);
        if (!group) {
            if (receiptNumber && existingCodes.has(normalizeLookup(receiptNumber))) {
                errors.push(row.rowNumber + "행: 입고번호 '" + receiptNumber + "'가 이미 등록되어 있습니다.");
                return;
            }
            group = { groupKey, receiptNumber, supplier, expectedDate, memo: safeText(row.memo), items: [], rowNumbers: [], totalQuantity: 0 };
            groupsByKey.set(groupKey, group);
        } else {
            if (group.supplier !== supplier) {
                errors.push(row.rowNumber + "행: 같은 입고번호 그룹의 공급처가 일치하지 않습니다.");
                return;
            }
            if (group.expectedDate !== expectedDate) {
                errors.push(row.rowNumber + "행: 같은 입고번호 그룹의 입고예정일이 일치하지 않습니다.");
                return;
            }
            if (group.memo && row.memo && group.memo !== safeText(row.memo)) {
                errors.push(row.rowNumber + "행: 같은 입고번호 그룹의 메모가 일치하지 않습니다.");
                return;
            }
            if (!group.memo && row.memo) group.memo = safeText(row.memo);
        }
        const skuKey = getSkuIdentity(sku);
        if (group.items.some((item) => item.skuKey === skuKey)) {
            errors.push(row.rowNumber + "행: 같은 입고번호 그룹에 동일한 SKU가 중복되어 있습니다.");
            return;
        }
        group.items.push({
            lineId: "import-line-" + row.rowNumber,
            skuKey,
            skuRowId: Math.max(0, Math.trunc(Number(sku?.rowId) || 0)),
            adminProductCode: safeText(sku?.adminProductCode),
            barcode: safeText(sku?.barcode),
            productName: safeText(sku?.productName),
            brand: safeText(sku?.brand),
            skuType: safeText(sku?.skuType),
            category: safeText(sku?.category),
            quantity,
        });
        group.rowNumbers.push(row.rowNumber);
        group.totalQuantity += quantity;
    });
    const groups = [...groupsByKey.values()];
    if (groups.length > 200) errors.push("한 번에 최대 200개 입고 예정 건까지 등록할 수 있습니다.");
    return {
        rows: sourceRows,
        groups,
        errors,
        warnings,
        rowCount: sourceRows.length,
        groupCount: groups.length,
        itemCount: groups.reduce((sum, group) => sum + group.items.length, 0),
        totalQuantity: groups.reduce((sum, group) => sum + group.totalQuantity, 0),
        isValid: errors.length === 0 && groups.length > 0,
    };
}

async function parseInboundPlanFile(file) {
    if (!file) throw new Error("업로드할 엑셀 파일을 선택해주세요.");
    const lowerName = safeText(file.name).toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) throw new Error("xlsx 또는 xls 형식의 엑셀 파일만 업로드할 수 있습니다.");
    if (typeof window === "undefined" || typeof window.XLSX === "undefined") throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    if (!workbook.SheetNames.length) throw new Error("엑셀 파일에 시트가 없습니다.");
    const sheetName = workbook.SheetNames[0];
    const matrix = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, dateNF: "yyyy-mm-dd" });
    return { ...mapInboundPlanSheetMatrix(matrix), fileName: safeText(file.name), sheetName };
}

export { buildInboundPlanImportPreview, mapInboundPlanSheetMatrix, normalizeInboundPlanDate, parseInboundPlanFile };