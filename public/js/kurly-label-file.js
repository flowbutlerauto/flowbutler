const REQUIRED_KURLY_HEADERS = [
    "발주코드",
    "상품명",
    "마스터코드",
    "유통기한",
    "박스당입수",
    "총입고수량(낱개)",
    "전체박스수",
];

function safeString(value) {
    return String(value ?? "").trim();
}

function buildHeaderIndexMap(headerRow) {
    const map = new Map();
    (headerRow ?? []).forEach((header, index) => {
        map.set(safeString(header), index);
    });
    return map;
}

function assertRequiredHeaders(headerRow) {
    const normalizedHeaders = (headerRow ?? []).map((header) => safeString(header)).filter(Boolean);
    const headerSet = new Set(normalizedHeaders);

    const missingHeaders = REQUIRED_KURLY_HEADERS.filter((header) => !headerSet.has(header));
    if (missingHeaders.length) {
        throw new Error(`필수 헤더 누락: ${missingHeaders.join(", ")}`);
    }

    if (headerSet.has("상품코드")) {
        throw new Error("허용되지 않은 헤더명: 상품코드 (마스터코드만 허용)");
    }
}

function mapSheetRowsToKurlyRows(sheetRows) {
    if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
        return [];
    }

    const [headerRow, ...dataRows] = sheetRows;
    assertRequiredHeaders(headerRow);

    const headerIndexMap = buildHeaderIndexMap(headerRow);

    return dataRows
        .map((row, index) => {
            const rowId = index + 2;

            const getValue = (header) => {
                const colIndex = headerIndexMap.get(header);
                if (typeof colIndex !== "number") return "";
                return safeString(row?.[colIndex]);
            };

            return {
                rowId,
                orderCode: getValue("발주코드"),
                productName: getValue("상품명"),
                masterCode: getValue("마스터코드"),
                expiry: getValue("유통기한"),
                boxPerUnit: getValue("박스당입수"),
                totalEa: getValue("총입고수량(낱개)"),
                totalBoxes: getValue("전체박스수"),
            };
        })
        .filter((row) =>
            [row.orderCode, row.productName, row.masterCode, row.expiry, row.boxPerUnit, row.totalEa, row.totalBoxes]
                .some((value) => value !== "")
        );
}

async function readExcelFileWithSheetJs(file) {
    if (typeof window.XLSX === "undefined") {
        throw new Error("엑셀 라이브러리 로드 실패: dashboard.html의 script 태그를 확인해주세요.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: "array" });

    if (!workbook.SheetNames.length) {
        return [];
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const sheetRows = window.XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
    });

    return mapSheetRowsToKurlyRows(sheetRows);
}

export async function parseKurlyLabelFile(file) {
    if (!file) return [];

    const lowerName = safeString(file.name).toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
        throw new Error("지원하지 않는 파일 형식입니다. xlsx, xls 파일만 업로드할 수 있습니다.");
    }

    return readExcelFileWithSheetJs(file);
}
