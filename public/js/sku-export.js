const SKU_EXPORT_TEXT_FIELD_KEYS = new Set([
    "barcode",
    "adminProductCode",
    "selfProductCode",
    "hsCode",
    "manufacturerProductCode",
]);

function safeText(value) {
    return String(value ?? "").trim();
}

function toExportCellValue(row, field) {
    const rawValue = row?.[field.key];
    if (rawValue === null || rawValue === undefined || rawValue === "") return "";
    if (SKU_EXPORT_TEXT_FIELD_KEYS.has(field.key)) return String(rawValue);
    if (!field.numeric) return String(rawValue);

    const normalizedNumber = String(rawValue).trim().replace(/,/g, "");
    if (!normalizedNumber) return "";
    const numericValue = Number(normalizedNumber);
    return Number.isFinite(numericValue) ? numericValue : String(rawValue);
}

function getSkuExportColumnWidth(field, headerLabel, rows) {
    const preferredWidths = {
        productImageUrl: 42,
        productName: 36,
        englishName: 30,
        contentVolumeOrWeight: 24,
        supplier: 22,
        barcode: 20,
        adminProductCode: 20,
        selfProductCode: 20,
        manufacturerProductCode: 20,
    };
    if (preferredWidths[field.key]) return preferredWidths[field.key];

    const longestValue = rows.slice(0, 500).reduce((longest, row) => (
        Math.max(longest, safeText(row?.[field.key]).length)
    ), safeText(headerLabel).length);
    return Math.min(Math.max(longestValue + 2, field.numeric ? 12 : 14), field.numeric ? 16 : 24);
}

function styleSkuExportWorksheet(worksheet, fields, rows, XLSX) {
    const lastColumnIndex = Math.max(0, fields.length - 1);
    const lastRowIndex = Math.max(0, rows.length);
    worksheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: lastRowIndex, c: lastColumnIndex },
        }),
    };
    worksheet["!cols"] = fields.map((field) => ({
        wch: getSkuExportColumnWidth(field, field.exportLabel || field.label, rows),
    }));
    worksheet["!rows"] = [{ hpt: 24 }];

    fields.forEach((field, columnIndex) => {
        const headerAddress = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
        if (worksheet[headerAddress]) {
            worksheet[headerAddress].s = {
                fill: { patternType: "solid", fgColor: { rgb: "E8EFFF" } },
                font: { bold: true, color: { rgb: "2446A8" } },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                    bottom: { style: "thin", color: { rgb: "B9C9FF" } },
                },
            };
        }

        for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
            const cell = worksheet[address];
            if (!cell) continue;
            if (SKU_EXPORT_TEXT_FIELD_KEYS.has(field.key)) {
                cell.t = "s";
                cell.z = "@";
            } else if (field.numeric && typeof cell.v === "number") {
                cell.z = "#,##0.###";
            }
        }
    });
}

function buildSkuExportMatrix(rows, fields, getFieldLabel = (field) => field.label) {
    const exportFields = (Array.isArray(fields) ? fields : []).map((field) => ({
        ...field,
        exportLabel: safeText(getFieldLabel(field)) || field.label || field.key,
    }));
    return {
        exportFields,
        matrix: [
            exportFields.map((field) => field.exportLabel),
            ...(Array.isArray(rows) ? rows : []).map((row) => (
                exportFields.map((field) => toExportCellValue(row, field))
            )),
        ],
    };
}

function buildSkuExportWorkbook(rows, fields, XLSX, options = {}) {
    if (!XLSX?.utils?.book_new || !XLSX?.utils?.aoa_to_sheet) {
        throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    }
    const sourceRows = Array.isArray(rows) ? rows : [];
    if (!sourceRows.length) throw new Error("다운로드할 SKU가 없습니다.");

    const { exportFields, matrix } = buildSkuExportMatrix(
        sourceRows,
        fields,
        options.getFieldLabel,
    );
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(matrix, { cellStyles: true });
    styleSkuExportWorksheet(worksheet, exportFields, sourceRows, XLSX);
    XLSX.utils.book_append_sheet(workbook, worksheet, "SKU");
    workbook.Props = {
        Title: options.filtered ? "FlowButler SKU Search Result" : "FlowButler SKU Export",
        Subject: "SKU master data",
        Author: "FlowButler",
        CreatedDate: options.createdAt instanceof Date ? options.createdAt : new Date(),
    };
    return workbook;
}

function buildSkuExportFilename({ filtered = false, createdAt = new Date() } = {}) {
    const year = createdAt.getFullYear();
    const month = String(createdAt.getMonth() + 1).padStart(2, "0");
    const day = String(createdAt.getDate()).padStart(2, "0");
    const hour = String(createdAt.getHours()).padStart(2, "0");
    const minute = String(createdAt.getMinutes()).padStart(2, "0");
    const suffix = filtered ? "Filtered" : "All";
    return `SKU_Export_${suffix}_${year}${month}${day}_${hour}${minute}.xlsx`;
}

function downloadSkuExportWorkbook(rows, fields, XLSX, options = {}) {
    const createdAt = options.createdAt instanceof Date ? options.createdAt : new Date();
    const workbook = buildSkuExportWorkbook(rows, fields, XLSX, {
        ...options,
        createdAt,
    });
    const filename = buildSkuExportFilename({
        filtered: Boolean(options.filtered),
        createdAt,
    });
    XLSX.writeFile(workbook, filename, { cellStyles: true, compression: true });
    return filename;
}

export {
    buildSkuExportFilename,
    buildSkuExportMatrix,
    buildSkuExportWorkbook,
    downloadSkuExportWorkbook,
};
