import { SKU_FIELDS, SKU_HEADER_ALIASES } from "./sku-schema.js";

function safeString(value) {
    return String(value ?? "").trim();
}

function normalizeHeader(value) {
    return safeString(value)
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/_/g, "")
        .replace(/-/g, "");
}

function buildHeaderMap(rowObject) {
    const keys = Object.keys(rowObject ?? {});
    const keyByNormalized = new Map();

    keys.forEach((key) => {
        keyByNormalized.set(normalizeHeader(key), key);
    });

    return keyByNormalized;
}

function mapSheetRowsToSkuRows(jsonRows) {
    return (jsonRows ?? []).map((row, index) => {
        const headerMap = buildHeaderMap(row);
        const mappedRow = { rowId: index + 1 };

        SKU_FIELDS.forEach((field) => {
            const aliasCandidates = (SKU_HEADER_ALIASES[field.key] ?? [])
                .map((alias) => normalizeHeader(alias));

            const matchedHeader = aliasCandidates.find((normalizedAlias) => headerMap.has(normalizedAlias));
            const originalHeaderKey = matchedHeader ? headerMap.get(matchedHeader) : null;
            mappedRow[field.key] = originalHeaderKey ? safeString(row[originalHeaderKey]) : "";
        });

        return mappedRow;
    });
}

function parseCsvLine(line) {
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

        if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    result.push(current);
    return result.map((value) => safeString(value));
}

function parseCsvTextToRows(text) {
    const lines = safeString(text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        return [];
    }

    const headers = parseCsvLine(lines[0]);
    const bodyLines = lines.slice(1);

    const jsonRows = bodyLines.map((line) => {
        const values = parseCsvLine(line);
        const rowObject = {};

        headers.forEach((header, index) => {
            rowObject[header] = values[index] ?? "";
        });

        return rowObject;
    });

    return mapSheetRowsToSkuRows(jsonRows);
}

async function readCsvFile(file) {
    const text = await file.text();
    return parseCsvTextToRows(text);
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

    const jsonRows = window.XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
    });

    return mapSheetRowsToSkuRows(jsonRows);
}

export async function parseSkuFile(file) {
    if (!file) return [];

    const lowerName = safeString(file.name).toLowerCase();

    if (lowerName.endsWith(".csv")) {
        return readCsvFile(file);
    }

    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        return readExcelFileWithSheetJs(file);
    }

    throw new Error("지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 업로드할 수 있습니다.");
}
