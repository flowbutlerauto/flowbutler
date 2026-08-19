const COUPANG_REQUIRED_FIELDS = ["orderCode", "dueDate", "center", "productCode", "productName", "quantity"];
const GENERIC_ORDER_REQUIRED_FIELDS = ["orderCode", "orderDate", "productName", "quantity", "recipientName", "recipientAddress", "recipientPhone"];

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

const GENERIC_ORDER_HEADER_ALIASES = {
    managementId: ["관리번호", "상품관리번호"],
    channelName: ["판매처", "판매처명", "판매 채널", "판매채널", "채널", "채널명", "몰", "몰명", "쇼핑몰"],
    orderCode: ["주문번호", "주문 번호", "상품주문번호", "주문상세번호", "주문번호+주문상세번호"],
    marketplaceProductCode: ["판매처상품코드", "판매처 상품코드", "판매자상품코드", "판매처코드", "연동코드", "신연동코드"],
    productName: ["상품명", "제품명", "상품명+옵션", "판매처상품명+판매처옵션", "판매처 상품명", "공급처 상품명"],
    quantity: ["수량", "주문수량", "구매수량", "구매 수량", "상품수량", "입고요청수량"],
    salePrice: ["판매가", "상품판매가", "상품별판매금액"],
    paymentAmount: ["결제금액", "상품판매가*수량", "상품별정산금액"],
    orderDateTime: ["주문일+주문시간", "주문일시", "주문 일시", "주문일자+주문시간", "결제일시", "결제 일시"],
    orderDate: ["주문일", "주문일_날짜", "주문일자"],
    orderTime: ["주문시간", "주문 시간", "주문일_시간", "주문시각"],
    issuedDateTime: ["발주일+발주시간", "발주일시", "발주 일시", "발주일자+발주시간"],
    issuedDate: ["발주일", "발주일_날짜", "발주일자"],
    issuedTime: ["발주시간", "발주 시간", "발주일_시간", "발주시각"],
    invoiceNo: ["송장번호", "운송장번호", "추가송장번호"],
    courierName: ["택배사", "택배사명"],
    ordererName: ["주문자", "주문자이름", "주문자 이름", "구매자", "구매자명", "구매자 이름", "주문고객", "주문 고객"],
    ordererPhone: ["주문자전화번호", "주문자 전화번호", "주문자전화", "주문자 전화", "주문자휴대폰", "주문자 휴대폰", "구매자전화번호", "구매자 전화번호", "구매자전화", "구매자 전화", "구매자휴대폰", "구매자 휴대폰"],
    recipientName: ["수령자이름", "수령자 이름", "수취인", "수취인명", "받는분", "받는 분", "받는사람", "받는 사람", "수령인"],
    recipientPhone: ["수령자전화번호", "수령자 전화번호", "수령자전화", "수령자휴대폰", "수령자 휴대폰", "수취인전화", "수취인 전화번호", "수취인연락처", "수취인연락처1", "수취인연락처2", "받는분전화번호", "연락처", "전화번호"],
    recipientZip: ["수령자우편번호", "수령자 우편번호", "우편번호", "수취인우편번호"],
    recipientAddress: ["수령자주소", "수령자 주소", "주소", "수취인주소", "배송지", "배송주소", "배송지주소", "통합배송지"],
    deliveryMemo: ["배송메모", "배송 메모", "배송요청사항", "배송 요청사항"],
    location: ["로케이션", "적치로케이션"],
    expiry: ["유통기한"],
    status: ["상태", "주문상태"],
    cs: ["CS", "CS이력", "취소교환사유"],
};

function safeString(value) {
    return String(value ?? "").trim();
}

function normalizeHeader(value) {
    return stripHtmlTags(value)
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()_\-./]/g, "");
}

function parseNumber(value) {
    const normalized = safeString(value).replace(/,/g, "");
    if (!normalized) return Number.NaN;
    return Number(normalized);
}

function parseOrderAmount(value) {
    const normalized = safeString(value)
        .replace(/,/g, "")
        .replace(/[₩￦]/g, "")
        .replace(/\s+/g, "")
        .replace(/원$/g, "");
    if (!normalized) return Number.NaN;
    return Number(normalized);
}

function parsePositiveNumber(value) {
    const numericValue = parseNumber(value);
    return !Number.isNaN(numericValue) && numericValue > 0 ? numericValue : Number.NaN;
}

function normalizePositiveNumber(value, fallback = 1) {
    const numericValue = parseNumber(value);
    return !Number.isNaN(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function getComponentPcsPerBox(component) {
    const pcsPerBox = parsePositiveNumber(component?.pcsPerBox);
    if (!Number.isNaN(pcsPerBox)) return pcsPerBox;

    const boxesPerPlt = parsePositiveNumber(component?.boxesPerPlt);
    const pcsPerPlt = parsePositiveNumber(component?.pcsPerPlt);
    if (Number.isNaN(boxesPerPlt) || Number.isNaN(pcsPerPlt)) return Number.NaN;

    return pcsPerPlt / boxesPerPlt;
}

function calculateMilkrunWeightKg(eaQty, component) {
    const pcsPerBox = getComponentPcsPerBox(component);
    const outboxGrossWeightG = parsePositiveNumber(component?.outboxGrossWeightG);
    const skuGrossWeightG = parsePositiveNumber(component?.skuGrossWeightG);

    if (Number.isNaN(pcsPerBox) || Number.isNaN(outboxGrossWeightG)) return Number.NaN;

    const fullBoxCount = Math.floor(eaQty / pcsPerBox);
    const partialQty = eaQty - (fullBoxCount * pcsPerBox);
    let totalWeightG = fullBoxCount * outboxGrossWeightG;

    if (partialQty > 0) {
        if (Number.isNaN(skuGrossWeightG)) return Number.NaN;
        const missingQty = pcsPerBox - partialQty;
        const partialBoxWeightG = outboxGrossWeightG - (missingQty * skuGrossWeightG);
        totalWeightG += Math.max(0, partialBoxWeightG);
    }

    return totalWeightG / 1000;
}

function getMilkrunComponentLabel(component) {
    return safeString(component?.skuName) || safeString(component?.skuKey) || "SKU";
}

function formatIsoDate(yearValue, monthValue, dayValue) {
    const rawYear = String(yearValue ?? "").trim();
    const year = rawYear.length === 2
        ? (Number(rawYear) <= 69 ? 2000 + Number(rawYear) : 1900 + Number(rawYear))
        : Number(rawYear);
    const month = Number(monthValue);
    const day = Number(dayValue);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (year < 1900 || year > 2100
        || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day) {
        return "";
    }

    return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function formatDateLikeText(value) {
    const raw = safeString(value);
    if (!raw) return "";

    const datePatterns = [
        /^(\d{4})\s*(?:[-./년])\s*(\d{1,2})\s*(?:[-./월])\s*(\d{1,2})\s*일?(?=$|[\sT])/, // YYYY-MM-DD
        /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2}|\d{4})(?=$|[\sT])/, // M/D/YY or M/D/YYYY
        /^(\d{4})(\d{2})(\d{2})(?=$|[\sT])/, // YYYYMMDD
    ];
    const matchingPattern = datePatterns.find((pattern) => pattern.test(raw));
    if (matchingPattern) {
        const match = raw.match(matchingPattern);
        if (match) {
            const [fullMatch, first, second, third] = match;
            const normalizedDate = matchingPattern === datePatterns[1]
                ? formatIsoDate(third, first, second)
                : formatIsoDate(first, second, third);
            if (normalizedDate) return `${normalizedDate}${raw.slice(fullMatch.length)}`;
        }
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 8) {
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }

    return raw;
}

function formatDateTimeLikeText(combinedValue, dateValue, timeValue) {
    const combined = safeString(combinedValue);
    if (combined) return formatDateLikeText(combined);

    const dateText = formatDateLikeText(dateValue);
    const timeText = safeString(timeValue);
    return [dateText, timeText].filter(Boolean).join(" ");
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

function buildHeaderAliasLookup(headerAliases) {
    const lookup = new Map();

    Object.entries(headerAliases).forEach(([fieldKey, aliases]) => {
        aliases.forEach((alias) => {
            lookup.set(normalizeHeader(alias), fieldKey);
        });
    });

    return lookup;
}

const GENERIC_ORDER_ALIAS_LOOKUP = buildHeaderAliasLookup(GENERIC_ORDER_HEADER_ALIASES);

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

function decodeWorkbookText(arrayBuffer, encoding = "utf-8") {
    try {
        return new TextDecoder(encoding).decode(arrayBuffer);
    } catch (error) {
        return "";
    }
}

function looksLikeHtmlWorkbook(text) {
    const normalizedText = safeString(text).slice(0, 4000).toLowerCase();
    return normalizedText.includes("<html")
        || normalizedText.includes("<table")
        || normalizedText.includes("schemas-microsoft-com:office:excel")
        || normalizedText.includes("<meta");
}

function expandHtmlCellValue(cells, cell) {
    const value = safeString(cell.textContent).replace(/\s+/g, " ");
    const colSpan = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
    cells.push(value);

    for (let index = 1; index < colSpan; index += 1) {
        cells.push("");
    }
}

function readHtmlTableRowsWithDomParser(text) {
    if (typeof DOMParser === "undefined") return [];

    const document = new DOMParser().parseFromString(text, "text/html");
    const tables = [...document.querySelectorAll("table")];
    if (!tables.length) return [];

    const tableRows = tables
        .map((table) => [...table.querySelectorAll("tr")]
            .map((row) => {
                const cells = [];
                row.querySelectorAll("th, td").forEach((cell) => expandHtmlCellValue(cells, cell));
                return cells;
            })
            .filter((row) => row.some((cell) => safeString(cell))))
        .filter((rows) => rows.length);

    if (!tableRows.length) return [];

    return tableRows.sort((a, b) => b.length - a.length)[0];
}

function decodeHtmlEntity(value) {
    return safeString(value)
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'");
}

function stripHtmlTags(value) {
    return decodeHtmlEntity(safeString(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function readHtmlTableRowsWithRegex(text) {
    const tableMatches = safeString(text).match(/<table[\s\S]*?<\/table>/gi) ?? [];
    const sources = tableMatches.length ? tableMatches : [safeString(text)];

    const tableRows = sources
        .map((source) => {
            const rowMatches = source.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
            return rowMatches
                .map((rowHtml) => {
                    const cellMatches = rowHtml.match(/<t[dh][^>]*[\s\S]*?<\/t[dh]>/gi) ?? [];
                    return cellMatches.map(stripHtmlTags).map(safeString);
                })
                .filter((row) => row.some(Boolean));
        })
        .filter((rows) => rows.length);

    if (!tableRows.length) return [];

    return tableRows.sort((a, b) => b.length - a.length)[0];
}

function readHtmlWorkbookRows(arrayBuffer) {
    const decodedTexts = [
        decodeWorkbookText(arrayBuffer, "utf-8"),
        decodeWorkbookText(arrayBuffer, "euc-kr"),
    ].filter(Boolean);

    const htmlText = decodedTexts.find(looksLikeHtmlWorkbook);
    if (!htmlText) return [];

    const domRows = readHtmlTableRowsWithDomParser(htmlText);
    return domRows.length ? domRows : readHtmlTableRowsWithRegex(htmlText);
}

async function readWorkbookRows(file) {
    const arrayBuffer = await file.arrayBuffer();
    const htmlRows = readHtmlWorkbookRows(arrayBuffer);
    if (htmlRows.length) return htmlRows;

    if (typeof window === "undefined" || typeof window.XLSX === "undefined") {
        throw new Error("엑셀 라이브러리 로드 실패: dashboard.html의 script 태그를 확인해주세요.");
    }

    const workbook = window.XLSX.read(arrayBuffer, { type: "array" });

    if (!workbook.SheetNames.length) return [];

    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
    });
}

export async function readTabularRows(file) {
    const lowerName = safeString(file?.name).toLowerCase();

    if (lowerName.endsWith(".csv")) return readCsvRows(file);
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) return readWorkbookRows(file);

    throw new Error("지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 업로드할 수 있습니다.");
}

function isHtmlBoilerplateRow(row) {
    const filledCells = (row ?? []).map(safeString).filter(Boolean);
    if (!filledCells.length) return false;

    return filledCells.every((cell) => /<(meta|html|head|body|style|!doctype)\b|charset=|schemas-microsoft-com/i.test(cell));
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

function findGenericOrderHeaderRowIndex(sheetRows) {
    const maxScanCount = Math.min(sheetRows.length, 80);
    let best = { index: -1, count: 0 };

    for (let rowIndex = 0; rowIndex < maxScanCount; rowIndex += 1) {
        const row = sheetRows[rowIndex] ?? [];
        if (isHtmlBoilerplateRow(row)) continue;

        const matchedFields = new Set();

        row.forEach((cell) => {
            const fieldKey = GENERIC_ORDER_ALIAS_LOOKUP.get(normalizeHeader(cell));
            if (fieldKey) matchedFields.add(fieldKey);
        });

        if (matchedFields.size > best.count) {
            best = { index: rowIndex, count: matchedFields.size };
        }
    }

    return best.count >= 3 ? best.index : -1;
}

function resolveGenericOrderColumnIndexes(headerRow) {
    const columnIndexes = {};
    const normalizedHeaderIndexMap = new Map();

    (headerRow ?? []).forEach((header, index) => {
        const normalizedHeader = normalizeHeader(header);
        if (normalizedHeader && !normalizedHeaderIndexMap.has(normalizedHeader)) {
            normalizedHeaderIndexMap.set(normalizedHeader, index);
        }
    });

    Object.entries(GENERIC_ORDER_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        const matchedAlias = aliases
            .map((alias) => normalizeHeader(alias))
            .find((normalizedAlias) => normalizedHeaderIndexMap.has(normalizedAlias));

        if (matchedAlias) {
            columnIndexes[fieldKey] = normalizedHeaderIndexMap.get(matchedAlias);
        }
    });

    return columnIndexes;
}

function getHeaderMapFields(headerMap) {
    const fields = headerMap?.fields && typeof headerMap.fields === "object" ? headerMap.fields : {};
    return Object.entries(fields)
        .map(([fieldKey, mapping]) => ({
            fieldKey,
            sourceHeader: safeString(mapping?.sourceHeader),
            columnIndex: Number(mapping?.columnIndex),
        }))
        .filter((mapping) => mapping.fieldKey && mapping.sourceHeader);
}

function findGenericOrderHeaderRowIndexFromMap(sheetRows, headerMap) {
    const mappedFields = getHeaderMapFields(headerMap);
    if (!mappedFields.length) return -1;

    const sourceHeaders = mappedFields.map((field) => field.sourceHeader);
    const maxScanCount = Math.min(sheetRows.length, 80);
    let best = { index: -1, count: 0 };

    for (let rowIndex = 0; rowIndex < maxScanCount; rowIndex += 1) {
        const rowValues = new Set((sheetRows[rowIndex] ?? []).map(safeString).filter(Boolean));
        const matchCount = sourceHeaders.filter((sourceHeader) => rowValues.has(sourceHeader)).length;

        if (matchCount > best.count) {
            best = { index: rowIndex, count: matchCount };
        }
        if (matchCount === sourceHeaders.length) return rowIndex;
    }

    return best.count > 0 ? best.index : -1;
}

function resolveGenericOrderColumnIndexesFromMap(headerRow, headerMap) {
    const mappedFields = getHeaderMapFields(headerMap);
    const headerIndexMap = new Map();

    (headerRow ?? []).forEach((header, index) => {
        const headerText = safeString(header);
        if (headerText && !headerIndexMap.has(headerText)) {
            headerIndexMap.set(headerText, index);
        }
    });

    const columnIndexes = {};
    const missingSourceHeaders = [];

    mappedFields.forEach((mapping) => {
        if (!headerIndexMap.has(mapping.sourceHeader)) {
            missingSourceHeaders.push(mapping.sourceHeader);
            return;
        }

        columnIndexes[mapping.fieldKey] = headerIndexMap.get(mapping.sourceHeader);
    });

    if (missingSourceHeaders.length) {
        throw new Error(`저장된 엑셀 양식과 업로드 파일의 헤더가 다릅니다. 엑셀 양식 설정을 다시 확인해주세요. 누락 헤더: ${missingSourceHeaders.join(", ")}`);
    }

    return columnIndexes;
}

function findOrderHeaderPreviewRowIndex(sheetRows) {
    const matchedHeaderRowIndex = findGenericOrderHeaderRowIndex(sheetRows);
    if (matchedHeaderRowIndex >= 0) return matchedHeaderRowIndex;

    const maxScanCount = Math.min(sheetRows.length, 80);
    let best = { index: -1, count: 0 };

    for (let rowIndex = 0; rowIndex < maxScanCount; rowIndex += 1) {
        if (isHtmlBoilerplateRow(sheetRows[rowIndex])) continue;

        const filledCellCount = (sheetRows[rowIndex] ?? []).filter((cell) => safeString(cell)).length;
        if (filledCellCount > best.count) {
            best = { index: rowIndex, count: filledCellCount };
        }
    }

    return best.count >= 2 ? best.index : -1;
}

export async function readOrderHeaderPreview(file) {
    if (!file) return null;

    const sheetRows = await readTabularRows(file);
    if (!sheetRows.length) return null;

    const headerRowIndex = findOrderHeaderPreviewRowIndex(sheetRows);
    if (headerRowIndex < 0) {
        throw new Error("엑셀 헤더 행을 찾지 못했습니다. 헤더가 포함된 파일인지 확인해주세요.");
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const lastHeaderIndex = headerRow.reduce((lastIndex, cell, index) => (
        safeString(cell) ? index : lastIndex
    ), -1);

    if (lastHeaderIndex < 0) {
        throw new Error("엑셀 헤더 값이 비어 있습니다.");
    }

    const headers = headerRow.slice(0, lastHeaderIndex + 1).map((cell, index) => {
        const header = safeString(cell);
        return {
            columnIndex: index,
            header,
            label: header || `빈 헤더 ${index + 1}`,
        };
    });

    const sampleRows = sheetRows
        .slice(headerRowIndex + 1, headerRowIndex + 4)
        .map((row, index) => ({
            rowNumber: headerRowIndex + index + 2,
            values: headers.map((header) => safeString(row?.[header.columnIndex])),
        }))
        .filter((row) => row.values.some(Boolean));

    return {
        fileName: safeString(file?.name),
        headerRowIndex,
        headers,
        sampleRows,
        rowCount: Math.max(0, sheetRows.length - headerRowIndex - 1),
    };
}

function formatUploadDateTime(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    ].join(" ");
}

function buildGeneratedManagementId(channelName, uploadedAt, rowId) {
    const channelPart = safeString(channelName).replace(/\s+/g, "");
    const timePart = safeString(uploadedAt).replace(/[^\d]/g, "");
    return [channelPart || "ORDER", timePart || Date.now(), rowId].filter(Boolean).join("-");
}

function countDigits(value) {
    return (safeString(value).match(/\d/g) ?? []).length;
}

function validatePhoneText(value) {
    const raw = safeString(value);
    if (!raw) return "수령자전화번호가 비어 있습니다.";
    if (/[A-Za-z가-힣]/.test(raw)) return "수령자전화번호에는 문자나 한글이 들어갈 수 없습니다.";
    if (/[^0-9+\-\s().]/.test(raw)) return "수령자전화번호는 숫자, +, -, 괄호, 공백만 사용할 수 있습니다.";
    if (countDigits(raw) < 6) return "수령자전화번호는 숫자가 6자리 이상이어야 합니다.";
    return "";
}

function validateOptionalPhoneText(value, label) {
    const raw = safeString(value);
    if (!raw) return "";
    if (/[A-Za-z가-힣]/.test(raw)) return `${label}에는 문자나 한글이 들어갈 수 없습니다.`;
    if (/[^0-9+\-\s().]/.test(raw)) return `${label}는 숫자, +, -, 괄호, 공백만 사용할 수 있습니다.`;
    if (countDigits(raw) < 6) return `${label}는 숫자가 6자리 이상이어야 합니다.`;
    return "";
}

function validateAddressText(value) {
    const raw = safeString(value);
    if (!raw) return "수령자주소가 비어 있습니다.";
    if (raw.length < 5) return "수령자주소가 너무 짧습니다.";
    if (/^[0-9+\-\s().]+$/.test(raw) && countDigits(raw) >= 6) {
        return "수령자주소가 전화번호처럼 보입니다.";
    }
    return "";
}

function isValidDateParts(year, month, day) {
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
}

function isValidDateLikeText(value) {
    const raw = formatDateLikeText(value);
    if (!raw) return true;

    const separatedDateMatch = raw.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    if (separatedDateMatch) {
        return isValidDateParts(
            Number(separatedDateMatch[1]),
            Number(separatedDateMatch[2]),
            Number(separatedDateMatch[3]),
        );
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length >= 8) {
        return isValidDateParts(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    }

    const parsedTime = Date.parse(raw);
    return !Number.isNaN(parsedTime);
}

function validateOptionalAmount(value, label) {
    const raw = safeString(value);
    if (!raw) return "";
    const amount = parseOrderAmount(raw);
    if (Number.isNaN(amount)) return `${label} 값은 숫자 형식이어야 합니다.`;
    if (amount < 0) return `${label} 값은 0 이상이어야 합니다.`;
    return "";
}

function pushErrorIfPresent(errors, errorMessage) {
    if (errorMessage) errors.push(errorMessage);
}

function getGenericOrderRequiredFields(options = {}) {
    return Array.isArray(options.requiredFields) && options.requiredFields.length
        ? options.requiredFields
        : GENERIC_ORDER_REQUIRED_FIELDS;
}

function validateGenericOrderRow(row, options = {}) {
    const errors = [];
    const requiredFields = getGenericOrderRequiredFields(options);

    if (requiredFields.includes("channelName") && !row.channelName) errors.push("판매처가 비어 있습니다.");
    if (requiredFields.includes("orderCode") && !row.orderCode) errors.push("주문번호가 비어 있습니다.");
    if (requiredFields.includes("orderDate") && !row.orderDate) errors.push("주문일이 비어 있습니다.");
    if (!row.productName) errors.push("상품명이 비어 있습니다.");
    if (!row.recipientName) errors.push("수령자이름이 비어 있습니다.");
    pushErrorIfPresent(errors, validateAddressText(row.recipientAddress));
    pushErrorIfPresent(errors, validatePhoneText(row.recipientPhone));
    pushErrorIfPresent(errors, validateOptionalPhoneText(row.ordererPhone, "주문자전화번호"));

    const quantity = parseNumber(row.quantity);
    if (Number.isNaN(quantity)) {
        errors.push("수량은 숫자 형식이어야 합니다.");
    } else if (quantity <= 0) {
        errors.push("수량은 0보다 커야 합니다.");
    } else if (!Number.isInteger(quantity)) {
        errors.push("수량은 정수여야 합니다.");
    }

    pushErrorIfPresent(errors, validateOptionalAmount(row.salePrice, "판매가"));
    pushErrorIfPresent(errors, validateOptionalAmount(row.paymentAmount, "결제금액"));

    if (row.orderDate && !isValidDateLikeText(row.orderDate)) {
        errors.push("주문일은 날짜 형식이어야 합니다.");
    }
    if (row.expiry && !isValidDateLikeText(row.expiry)) {
        errors.push("유통기한은 날짜 형식이어야 합니다.");
    }

    return errors;
}

function mapGenericOrderRows(sheetRows, columnIndexes, headerRowIndex, options = {}) {
    const channel = safeString(options.channel) || "custom-order";
    const channelName = safeString(options.channelName) || channel;
    const sourceFileName = safeString(options.sourceFileName);
    const uploadedAt = formatUploadDateTime();

    return sheetRows
        .slice(headerRowIndex + 1)
        .map((row, index) => {
            const rowId = headerRowIndex + index + 2;
            const managementId = getCell(row, columnIndexes, "managementId");
            const orderDateTime = formatDateTimeLikeText(
                getCell(row, columnIndexes, "orderDateTime"),
                getCell(row, columnIndexes, "orderDate"),
                getCell(row, columnIndexes, "orderTime"),
            );
            const issuedDateTime = formatDateTimeLikeText(
                getCell(row, columnIndexes, "issuedDateTime"),
                getCell(row, columnIndexes, "issuedDate"),
                getCell(row, columnIndexes, "issuedTime"),
            );
            const requiredFields = getGenericOrderRequiredFields(options);
            const mappedChannelName = getCell(row, columnIndexes, "channelName");
            const channelNameValue = requiredFields.includes("channelName")
                ? mappedChannelName
                : channelName;
            const mappedRow = {
                rowId,
                channel,
                channelName: channelNameValue,
                managementId: managementId || buildGeneratedManagementId(channelNameValue || channelName, uploadedAt, rowId),
                orderCode: getCell(row, columnIndexes, "orderCode"),
                productCode: getCell(row, columnIndexes, "marketplaceProductCode"),
                marketplaceProductCode: getCell(row, columnIndexes, "marketplaceProductCode"),
                productName: getCell(row, columnIndexes, "productName"),
                barcode: "",
                quantity: getCell(row, columnIndexes, "quantity"),
                salePrice: getCell(row, columnIndexes, "salePrice"),
                paymentAmount: getCell(row, columnIndexes, "paymentAmount"),
                orderDate: orderDateTime,
                orderDateTime,
                issuedAt: issuedDateTime || uploadedAt,
                issuedDateTime: issuedDateTime || uploadedAt,
                invoiceNo: getCell(row, columnIndexes, "invoiceNo"),
                courierName: getCell(row, columnIndexes, "courierName"),
                ordererName: getCell(row, columnIndexes, "ordererName"),
                ordererPhone: getCell(row, columnIndexes, "ordererPhone"),
                ordererKey: "",
                recipientName: getCell(row, columnIndexes, "recipientName"),
                recipientPhone: getCell(row, columnIndexes, "recipientPhone"),
                recipientKey: "",
                recipientZip: getCell(row, columnIndexes, "recipientZip"),
                recipientAddress: getCell(row, columnIndexes, "recipientAddress"),
                deliveryMemo: getCell(row, columnIndexes, "deliveryMemo"),
                location: getCell(row, columnIndexes, "location"),
                expiry: formatDateLikeText(getCell(row, columnIndexes, "expiry")),
                status: getCell(row, columnIndexes, "status") || "수집됨",
                cs: getCell(row, columnIndexes, "cs"),
                sourceFileName,
                destination: getCell(row, columnIndexes, "recipientAddress"),
                errors: [],
                isValid: false,
            };

            const errors = validateGenericOrderRow(mappedRow, options);
            return {
                ...mappedRow,
                errors,
                isValid: errors.length === 0,
                status: errors.length ? "확인 필요" : mappedRow.status,
            };
        })
        .filter((row) => (
            [
                row.orderCode,
                row.marketplaceProductCode,
                row.productName,
                row.quantity,
                row.recipientName,
                row.recipientPhone,
                row.recipientAddress,
                row.invoiceNo,
            ].some(Boolean)
        ));
}

export async function parseGenericOrderFile(file, options = {}) {
    if (!file) return [];

    const sheetRows = await readTabularRows(file);
    if (!sheetRows.length) return [];

    const hasHeaderMap = getHeaderMapFields(options.headerMap).length > 0;
    const headerRowIndex = hasHeaderMap
        ? findGenericOrderHeaderRowIndexFromMap(sheetRows, options.headerMap)
        : findGenericOrderHeaderRowIndex(sheetRows);
    if (headerRowIndex < 0) {
        throw new Error(hasHeaderMap
            ? "저장된 엑셀 양식에 맞는 헤더 행을 찾지 못했습니다. 엑셀 양식 설정을 다시 확인해주세요."
            : "주문서 헤더를 찾지 못했습니다. 상품명, 수량, 수령자이름, 수령자주소, 수령자전화번호 헤더를 확인해주세요.");
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const columnIndexes = hasHeaderMap
        ? resolveGenericOrderColumnIndexesFromMap(headerRow, options.headerMap)
        : resolveGenericOrderColumnIndexes(headerRow);
    const requiredFields = getGenericOrderRequiredFields(options);
    const missingFields = requiredFields.filter((fieldKey) => {
        if (fieldKey === "orderDate") {
            return typeof columnIndexes.orderDate !== "number"
                && typeof columnIndexes.orderDateTime !== "number";
        }
        return typeof columnIndexes[fieldKey] !== "number";
    });

    if (missingFields.length) {
        const labelMap = {
            channelName: "판매처",
            orderCode: "주문번호",
            orderDate: "주문일",
            productName: "상품명",
            quantity: "수량",
            recipientName: "수령자이름",
            recipientAddress: "수령자주소",
            recipientPhone: "수령자전화번호",
        };
        throw new Error(`주문서 필수 헤더 누락: ${missingFields.map((fieldKey) => labelMap[fieldKey]).join(", ")}`);
    }

    return mapGenericOrderRows(sheetRows, columnIndexes, headerRowIndex, {
        ...options,
        sourceFileName: safeString(file?.name),
    });
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

function buildMilkrunMetrics(row, options = {}) {
    const fallbackSkuKey = safeString(row.productCode) || safeString(row.productName);
    const fallbackBoxCount = parseNumber(row.boxCount) || 0;
    const fallbackPtCount = parseNumber(row.ptCount) || 0;
    const fallbackWeight = parseNumber(row.weight) || 0;
    const resolveSkuComponents = typeof options.resolveSkuComponents === "function"
        ? options.resolveSkuComponents
        : null;
    const components = resolveSkuComponents ? resolveSkuComponents(row) : [];

    if (!Array.isArray(components) || !components.length) {
        const hasFallbackBoxCount = fallbackBoxCount > 0;
        const hasFallbackPtCount = fallbackPtCount > 0;
        const hasFallbackWeight = fallbackWeight > 0;
        return {
            skuKeys: fallbackSkuKey ? [fallbackSkuKey] : [],
            boxCount: fallbackBoxCount,
            ptCount: fallbackPtCount,
            weight: fallbackWeight,
            boxCountCalculated: hasFallbackBoxCount,
            ptCountCalculated: hasFallbackPtCount,
            weightCalculated: hasFallbackWeight,
            warnings: ["SKU 매칭 없음: SKU 기준 박스/PLT/중량 계산을 할 수 없습니다."],
        };
    }

    const orderQuantity = parseNumber(row.quantity) || 0;
    const componentMetrics = components.map((component) => {
        const componentQuantity = normalizePositiveNumber(component?.quantity, 1);
        const eaQty = orderQuantity * componentQuantity;
        const pcsPerBox = getComponentPcsPerBox(component);
        const boxesPerPlt = parsePositiveNumber(component?.boxesPerPlt);
        const pcsPerPlt = parsePositiveNumber(component?.pcsPerPlt);
        const boxCount = !Number.isNaN(pcsPerBox) ? eaQty / pcsPerBox : Number.NaN;
        const ptCount = !Number.isNaN(pcsPerPlt)
            ? eaQty / pcsPerPlt
            : (!Number.isNaN(boxCount) && !Number.isNaN(boxesPerPlt) ? boxCount / boxesPerPlt : Number.NaN);
        const weight = calculateMilkrunWeightKg(eaQty, component);
        const skuLabel = getMilkrunComponentLabel(component);
        const warnings = [];

        if (Number.isNaN(boxCount)) {
            warnings.push(`${skuLabel}: 박스당 입수 또는 plt당 box수/pcs수 정보가 없어 박스 수를 계산할 수 없습니다.`);
        }
        if (Number.isNaN(ptCount)) {
            warnings.push(`${skuLabel}: plt당 pcs수 또는 plt당 box수 정보가 없어 PT 수를 계산할 수 없습니다.`);
        }
        if (Number.isNaN(weight)) {
            const outboxGrossWeightG = parsePositiveNumber(component?.outboxGrossWeightG);
            const skuGrossWeightG = parsePositiveNumber(component?.skuGrossWeightG);
            if (Number.isNaN(pcsPerBox)) {
                warnings.push(`${skuLabel}: 박스당 입수 기준이 없어 중량을 계산할 수 없습니다.`);
            } else if (Number.isNaN(outboxGrossWeightG)) {
                warnings.push(`${skuLabel}: 아웃박스 총중량(g)이 없어 중량을 계산할 수 없습니다.`);
            } else if (Number.isNaN(skuGrossWeightG)) {
                warnings.push(`${skuLabel}: SKU 총중량(g)이 없어 부분박스 중량을 계산할 수 없습니다.`);
            } else {
                warnings.push(`${skuLabel}: 중량 계산에 필요한 SKU 정보가 부족합니다.`);
            }
        }

        return {
            skuKey: safeString(component?.skuKey) || safeString(component?.skuName),
            boxCount,
            ptCount,
            weight,
            warnings,
        };
    });

    const canUseSkuBoxCount = componentMetrics.every((item) => !Number.isNaN(item.boxCount));
    const canUseSkuPtCount = componentMetrics.every((item) => !Number.isNaN(item.ptCount));
    const canUseSkuWeight = componentMetrics.every((item) => !Number.isNaN(item.weight));

    return {
        skuKeys: componentMetrics.map((item) => item.skuKey).filter(Boolean),
        boxCount: canUseSkuBoxCount
            ? componentMetrics.reduce((sum, item) => sum + item.boxCount, 0)
            : fallbackBoxCount,
        ptCount: canUseSkuPtCount
            ? componentMetrics.reduce((sum, item) => sum + item.ptCount, 0)
            : fallbackPtCount,
        weight: canUseSkuWeight
            ? componentMetrics.reduce((sum, item) => sum + item.weight, 0)
            : fallbackWeight,
        boxCountCalculated: canUseSkuBoxCount || fallbackBoxCount > 0,
        ptCountCalculated: canUseSkuPtCount || fallbackPtCount > 0,
        weightCalculated: canUseSkuWeight || fallbackWeight > 0,
        warnings: componentMetrics.flatMap((item) => item.warnings),
    };
}

export function buildMilkrunRowsFromOrderRows(orderRows, options = {}) {
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
                    boxCountCalculated: true,
                    ptCountCalculated: true,
                    weightCalculated: true,
                    calculationWarnings: new Set(),
                    destination: safeString(row.destination),
                });
            }

            const target = grouped.get(orderCode);
            const metrics = buildMilkrunMetrics(row, options);
            metrics.skuKeys.forEach((skuKey) => target.skuKeys.add(skuKey));
            target.qty += parseNumber(row.quantity) || 0;
            target.boxCount += metrics.boxCount;
            target.ptCount += metrics.ptCount;
            target.weight += metrics.weight;
            target.boxCountCalculated = target.boxCountCalculated && metrics.boxCountCalculated;
            target.ptCountCalculated = target.ptCountCalculated && metrics.ptCountCalculated;
            target.weightCalculated = target.weightCalculated && metrics.weightCalculated;
            (metrics.warnings ?? []).forEach((warning) => target.calculationWarnings.add(warning));
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
        boxCountCalculated: row.boxCountCalculated,
        ptCountCalculated: row.ptCountCalculated,
        weightCalculated: row.weightCalculated,
        calculationWarnings: [...row.calculationWarnings],
        destination: row.destination,
    }));
}

export function buildMilkrunDetailRowsFromOrderRows(orderRows, options = {}) {
    return (orderRows ?? [])
        .filter((row) => row.channel === "coupang" && row.isValid)
        .map((row, index) => {
            const metrics = buildMilkrunMetrics(row, options);
            const orderId = safeString(row.orderCode);

            return {
                rowKey: `${orderId || "order"}-${row.rowId ?? index + 1}-${index}`,
                rowId: row.rowId ?? index + 1,
                orderId,
                dueDate: safeString(row.dueDate),
                originalCenter: safeString(row.center),
                assignedCenter: safeString(row.center),
                productCode: safeString(row.productCode),
                productName: safeString(row.productName),
                skuKeys: metrics.skuKeys,
                skuCount: metrics.skuKeys.length,
                qty: parseNumber(row.quantity) || 0,
                boxCount: metrics.boxCount,
                ptCount: metrics.ptCount,
                weight: metrics.weight,
                boxCountCalculated: metrics.boxCountCalculated,
                ptCountCalculated: metrics.ptCountCalculated,
                weightCalculated: metrics.weightCalculated,
                calculationWarnings: metrics.warnings,
                destination: safeString(row.destination),
            };
        });
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
