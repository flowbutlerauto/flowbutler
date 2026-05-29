const COUPANG_REQUIRED_FIELDS = ["orderCode", "dueDate", "center", "productCode", "productName", "quantity"];

const COUPANG_HEADER_ALIASES = {
    orderCode: ["발주번호", "발주 번호", "PO", "PO No", "PO번호", "주문번호"],
    dueDate: ["입고예정일", "입고 예정일", "납품일", "납품예정일", "입고일"],
    center: ["물류센터", "센터", "센터명", "입고센터", "쿠팡센터"],
    productCode: ["상품번호", "상품코드", "SKU", "SKU No", "SKU NO", "업체상품코드"],
    productName: ["상품이름", "상품명", "상품명(옵션명)", "옵션명"],
    barcode: ["바코드", "상품바코드", "Barcode", "BARCODE"],
    quantity: ["확정수량", "발주수량", "수량", "납품수량", "입고수량"],
    boxPerUnit: ["Box 입수 수량", "BOX 입수 수량", "박스입수", "박스당입수", "입수"],
    boxCount: ["박스 수", "박스수", "BOX", "Box", "박스"],
    ptCount: ["PT", "PT 수", "팔레트", "팔레트 수", "파레트", "Pallet"],
    weight: ["중량", "총중량", "Weight", "총 중량"],
    destination: ["납품지", "납품주소", "배송지", "도착지"],
};

function safeString(value) {
    return String(value ?? "").trim();
}

function normalizeHeader(value) {
    return safeString(value)
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()_\-./]/g, "");
}

function parseNumber(value) {
    const normalized = safeString(value).replace(/,/g, "");
    if (!normalized) return Number.NaN;
    return Number(normalized);
}

function formatDateLikeText(value) {
    const raw = safeString(value);
    if (!raw) return "";

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 8) {
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }

    return raw;
}

function buildAliasLookup() {
    const lookup = new Map();

    Object.entries(COUPANG_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        aliases.forEach((alias) => {
            lookup.set(normalizeHeader(alias), fieldKey);
        });
    });

    return lookup;
}

const COUPANG_ALIAS_LOOKUP = buildAliasLookup();

function parseDelimitedLine(line, delimiter = ",") {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === delimiter && !inQuotes) {
            result.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    result.push(current);
    return result.map((value) => safeString(value));
}

async function readCsvRows(file) {
    const text = await file.text();
    const normalizedText = safeString(text);
    const lines = normalizedText
        .split(/\r?\n/)
        .filter((line) => safeString(line));

    if (!lines.length) return [];

    const sample = lines.slice(0, 5).join("\n");
    const tabCount = (sample.match(/\t/g) || []).length;
    const commaCount = (sample.match(/,/g) || []).length;
    const delimiter = tabCount > commaCount ? "\t" : ",";

    return lines.map((line) => parseDelimitedLine(line, delimiter));
}

async function readWorkbookRows(file) {
    if (typeof window.XLSX === "undefined") {
        throw new Error("엑셀 라이브러리 로드 실패: dashboard.html의 script 태그를 확인해주세요.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: "array" });

    if (!workbook.SheetNames.length) return [];

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
    });
}

async function readTabularRows(file) {
    const lowerName = safeString(file?.name).toLowerCase();

    if (lowerName.endsWith(".csv")) return readCsvRows(file);
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) return readWorkbookRows(file);

    throw new Error("지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 업로드할 수 있습니다.");
}

function findHeaderRowIndex(sheetRows) {
    const maxScanCount = Math.min(sheetRows.length, 12);
    let best = { index: -1, count: 0 };

    for (let rowIndex = 0; rowIndex < maxScanCount; rowIndex += 1) {
        const row = sheetRows[rowIndex] ?? [];
        const matchedFields = new Set();

        row.forEach((cell) => {
            const fieldKey = COUPANG_ALIAS_LOOKUP.get(normalizeHeader(cell));
            if (fieldKey) matchedFields.add(fieldKey);
        });

        if (matchedFields.size > best.count) {
            best = { index: rowIndex, count: matchedFields.size };
        }
    }

    return best.count >= 3 ? best.index : -1;
}

function resolveColumnIndexes(headerRow) {
    const columnIndexes = {};
    const normalizedHeaderIndexMap = new Map();

    (headerRow ?? []).forEach((header, index) => {
        const normalizedHeader = normalizeHeader(header);
        if (normalizedHeader && !normalizedHeaderIndexMap.has(normalizedHeader)) {
            normalizedHeaderIndexMap.set(normalizedHeader, index);
        }
    });

    Object.entries(COUPANG_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        const matchedAlias = aliases
            .map((alias) => normalizeHeader(alias))
            .find((normalizedAlias) => normalizedHeaderIndexMap.has(normalizedAlias));

        if (matchedAlias) {
            columnIndexes[fieldKey] = normalizedHeaderIndexMap.get(matchedAlias);
        }
    });

    return columnIndexes;
}

function getCell(row, columnIndexes, fieldKey) {
    const index = columnIndexes[fieldKey];
    if (typeof index !== "number") return "";
    return safeString(row?.[index]);
}

function validateCoupangRow(row) {
    const errors = [];

    if (!row.orderCode) errors.push("발주번호가 비어 있습니다.");
    if (!row.dueDate) errors.push("입고예정일이 비어 있습니다.");
    if (!row.center) errors.push("물류센터가 비어 있습니다.");
    if (!row.productCode) errors.push("상품번호/SKU가 비어 있습니다.");
    if (!row.productName) errors.push("상품명이 비어 있습니다.");

    const quantity = parseNumber(row.quantity);
    if (Number.isNaN(quantity)) {
        errors.push("확정수량은 숫자 형식이어야 합니다.");
    } else if (quantity <= 0) {
        errors.push("확정수량은 0보다 커야 합니다.");
    }

    return errors;
}

function mapCoupangRows(sheetRows, columnIndexes, headerRowIndex) {
    return sheetRows
        .slice(headerRowIndex + 1)
        .map((row, index) => {
            const quantity = getCell(row, columnIndexes, "quantity");
            const boxCount = getCell(row, columnIndexes, "boxCount");
            const boxPerUnit = getCell(row, columnIndexes, "boxPerUnit");
            const quantityNumber = parseNumber(quantity);
            const boxPerUnitNumber = parseNumber(boxPerUnit);
            const inferredBoxCount = !boxCount && !Number.isNaN(quantityNumber) && !Number.isNaN(boxPerUnitNumber) && boxPerUnitNumber > 0
                ? String(quantityNumber / boxPerUnitNumber)
                : boxCount;

            const mappedRow = {
                rowId: headerRowIndex + index + 2,
                channel: "coupang",
                channelName: "쿠팡(밀크런)",
                orderCode: getCell(row, columnIndexes, "orderCode"),
                dueDate: formatDateLikeText(getCell(row, columnIndexes, "dueDate")),
                center: getCell(row, columnIndexes, "center"),
                productCode: getCell(row, columnIndexes, "productCode"),
                productName: getCell(row, columnIndexes, "productName"),
                barcode: getCell(row, columnIndexes, "barcode"),
                quantity,
                boxPerUnit,
                boxCount: inferredBoxCount,
                ptCount: getCell(row, columnIndexes, "ptCount"),
                weight: getCell(row, columnIndexes, "weight"),
                destination: getCell(row, columnIndexes, "destination"),
                status: "검증 대기",
                errors: [],
                isValid: false,
            };

            const errors = validateCoupangRow(mappedRow);
            return {
                ...mappedRow,
                errors,
                isValid: errors.length === 0,
                status: errors.length ? "확인 필요" : "정상",
            };
        })
        .filter((row) => (
            [
                row.orderCode,
                row.dueDate,
                row.center,
                row.productCode,
                row.productName,
                row.quantity,
                row.boxCount,
                row.ptCount,
                row.weight,
            ].some(Boolean)
        ))
        .filter((row) => {
            const quantityNumber = parseNumber(row.quantity);
            return Number.isNaN(quantityNumber) || quantityNumber !== 0;
        });
}

export async function parseCoupangOrderFile(file) {
    if (!file) return [];

    const sheetRows = await readTabularRows(file);
    if (!sheetRows.length) return [];

    const headerRowIndex = findHeaderRowIndex(sheetRows);
    if (headerRowIndex < 0) {
        throw new Error("쿠팡 발주서 헤더를 찾지 못했습니다. 입고예정일, 물류센터, 발주번호, 상품번호, 상품이름, 확정수량 헤더를 확인해주세요.");
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const columnIndexes = resolveColumnIndexes(headerRow);
    const missingFields = COUPANG_REQUIRED_FIELDS.filter((fieldKey) => typeof columnIndexes[fieldKey] !== "number");

    if (missingFields.length) {
        const labelMap = {
            orderCode: "발주번호",
            dueDate: "입고예정일",
            center: "물류센터",
            productCode: "상품번호",
            productName: "상품이름",
            quantity: "확정수량",
        };
        throw new Error(`쿠팡 발주서 필수 헤더 누락: ${missingFields.map((fieldKey) => labelMap[fieldKey]).join(", ")}`);
    }

    return mapCoupangRows(sheetRows, columnIndexes, headerRowIndex);
}

export function buildKurlyOrderRows(kurlyRows) {
    return (kurlyRows ?? []).map((row) => ({
        rowId: row.rowId,
        channel: "kurly",
        channelName: "컬리",
        orderCode: safeString(row.orderCode),
        dueDate: safeString(row.expiry),
        center: safeString(row.center),
        productCode: safeString(row.masterCode),
        productName: safeString(row.productName),
        barcode: "",
        quantity: safeString(row.totalEa),
        boxPerUnit: safeString(row.boxPerUnit),
        boxCount: safeString(row.totalBoxes),
        ptCount: "",
        weight: "",
        destination: safeString(row.center),
        expiry: safeString(row.expiry),
        status: row.isValid ? "정상" : "확인 필요",
        errors: Array.isArray(row.errors) ? row.errors : [],
        isValid: row.isValid !== false,
    }));
}

export function buildMilkrunRowsFromOrderRows(orderRows) {
    const grouped = new Map();

    (orderRows ?? [])
        .filter((row) => row.channel === "coupang" && row.isValid)
        .forEach((row) => {
            const orderCode = safeString(row.orderCode);
            if (!orderCode) return;

            if (!grouped.has(orderCode)) {
                grouped.set(orderCode, {
                    orderId: orderCode,
                    dueDate: safeString(row.dueDate),
                    originalCenter: safeString(row.center),
                    assignedCenter: safeString(row.center),
                    skuKeys: new Set(),
                    qty: 0,
                    boxCount: 0,
                    ptCount: 0,
                    weight: 0,
                    destination: safeString(row.destination),
                });
            }

            const target = grouped.get(orderCode);
            const skuKey = safeString(row.productCode) || safeString(row.productName);
            if (skuKey) target.skuKeys.add(skuKey);
            target.qty += parseNumber(row.quantity) || 0;
            target.boxCount += parseNumber(row.boxCount) || 0;
            target.ptCount += parseNumber(row.ptCount) || 0;
            target.weight += parseNumber(row.weight) || 0;
            if (!target.destination && row.destination) target.destination = safeString(row.destination);
        });

    return Array.from(grouped.values()).map((row) => ({
        orderId: row.orderId,
        dueDate: row.dueDate,
        originalCenter: row.originalCenter,
        assignedCenter: row.assignedCenter,
        skuCount: row.skuKeys.size,
        qty: row.qty,
        boxCount: row.boxCount,
        ptCount: row.ptCount,
        weight: row.weight,
        destination: row.destination,
    }));
}

export function summarizeOrderRows(rows) {
    const safeRows = rows ?? [];
    const validRows = safeRows.filter((row) => row.isValid);
    const invalidRows = safeRows.filter((row) => !row.isValid);
    const channels = new Set(safeRows.map((row) => row.channel).filter(Boolean));

    return {
        total: safeRows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
        channels: channels.size,
    };
}
