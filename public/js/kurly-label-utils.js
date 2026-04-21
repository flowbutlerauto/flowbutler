function safeString(value) {
    return String(value ?? "").trim();
}

function parseNumber(value) {
    const normalized = safeString(value).replace(/,/g, "");
    if (!normalized) return Number.NaN;
    return Number(normalized);
}

export function validateKurlyRows(rows) {
    const validatedRows = (rows ?? []).map((row, index) => {
        const normalizedRow = {
            ...row,
            rowId: row?.rowId ?? index + 2,
        };

        const errors = [];

        if (!safeString(normalizedRow.orderCode)) errors.push("발주코드 값이 비어 있습니다.");
        if (!safeString(normalizedRow.productName)) errors.push("상품명 값이 비어 있습니다.");
        if (!safeString(normalizedRow.masterCode)) errors.push("마스터코드 값이 비어 있습니다.");
        if (!safeString(normalizedRow.expiry)) errors.push("유통기한 값이 비어 있습니다.");

        const boxPerUnit = parseNumber(normalizedRow.boxPerUnit);
        const totalEa = parseNumber(normalizedRow.totalEa);
        const totalBoxes = parseNumber(normalizedRow.totalBoxes);

        if (Number.isNaN(boxPerUnit)) errors.push("박스당입수는 숫자 형식이어야 합니다.");
        if (Number.isNaN(totalEa)) errors.push("총입고수량(낱개)은 숫자 형식이어야 합니다.");
        if (Number.isNaN(totalBoxes)) {
            errors.push("전체박스수는 숫자 형식이어야 합니다.");
        } else {
            if (!Number.isInteger(totalBoxes)) errors.push("전체박스수는 정수여야 합니다.");
            if (totalBoxes <= 0) errors.push("전체박스수는 양의 정수여야 합니다.");
        }

        return {
            ...normalizedRow,
            isValid: errors.length === 0,
            errors,
        };
    });

    const invalidRows = validatedRows.filter((row) => !row.isValid);

    return {
        rows: validatedRows,
        summary: {
            total: validatedRows.length,
            valid: validatedRows.length - invalidRows.length,
            invalid: invalidRows.length,
        },
    };
}

export function buildKurlyLabelItems(validRows, options = {}) {
    const supplierName = safeString(options.supplierName) || "(주)라온글로벌(VD6054)";

    return (validRows ?? []).flatMap((row) => {
        const totalBoxes = Number(safeString(row.totalBoxes).replace(/,/g, ""));
        const boxPerUnit = Number(safeString(row.boxPerUnit).replace(/,/g, "")) || 0;
        const totalEa = Number(safeString(row.totalEa).replace(/,/g, "")) || 0;

        const labels = [];
        for (let boxNo = 1; boxNo <= totalBoxes; boxNo += 1) {
            labels.push({
                orderCode: safeString(row.orderCode),
                supplierName,
                productName: safeString(row.productName),
                productCode: safeString(row.masterCode),
                expiry: safeString(row.expiry),
                boxPerUnit,
                totalEa,
                totalBoxes,
                boxNo,
            });
        }

        return labels;
    });
}
