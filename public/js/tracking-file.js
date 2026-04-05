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

function findHeaderKey(rowObject, candidates) {
    const keys = Object.keys(rowObject ?? {});

    for (const key of keys) {
        const normalizedKey = normalizeHeader(key);
        if (candidates.includes(normalizedKey)) {
            return key;
        }
    }

    return null;
}

function mapSheetRowsToTrackingRows(jsonRows) {
    return (jsonRows ?? [])
        .map((row, index) => {
            const courierKey = findHeaderKey(row, [
                "택배사",
                "courier",
                "carrier",
                "deliverycompany",
                "shipper",
            ]);

            const trackingKey = findHeaderKey(row, [
                "송장번호",
                "운송장번호",
                "trackingnumber",
                "trackingno",
                "invoiceno",
                "invoice",
                "waybill",
                "송장",
            ]);

            const courier = courierKey ? safeString(row[courierKey]) : "";
            const trackingNumber = trackingKey ? safeString(row[trackingKey]) : "";

            return {
                rowId: index + 1,
                courier,
                trackingNumber,
                status: "",
                time: "",
                message: "",
                isValid: false,
                excludedReason: "",
            };
        })
        .filter((row) => row.courier || row.trackingNumber);
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

    return mapSheetRowsToTrackingRows(jsonRows);
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

    return mapSheetRowsToTrackingRows(jsonRows);
}

export async function parseTrackingFile(file) {
    if (!file) {
        return [];
    }

    const lowerName = safeString(file.name).toLowerCase();

    if (lowerName.endsWith(".csv")) {
        return readCsvFile(file);
    }

    if (
        lowerName.endsWith(".xlsx") ||
        lowerName.endsWith(".xls")
    ) {
        return readExcelFileWithSheetJs(file);
    }

    throw new Error("지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 업로드할 수 있습니다.");
}