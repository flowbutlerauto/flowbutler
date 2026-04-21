import { SKU_FIELDS, SKU_NUMERIC_KEYS, SKU_REQUIRED_KEYS } from "./sku-schema.js";

function safeString(value) {
    return String(value ?? "").trim();
}

function isNumericValue(value) {
    if (value === "") return true;
    return !Number.isNaN(Number(value));
}

export function validateSkuRows(rows) {
    const labelByKey = SKU_FIELDS.reduce((acc, field) => {
        acc[field.key] = field.label;
        return acc;
    }, {});

    const seenAdminCodes = new Map();

    const validatedRows = (rows ?? []).map((row, index) => {
        const normalizedRow = {
            ...row,
            rowId: row?.rowId ?? index + 1,
        };

        const errors = [];

        SKU_REQUIRED_KEYS.forEach((key) => {
            if (!safeString(normalizedRow[key])) {
                errors.push(`${labelByKey[key] ?? key} 값이 비어 있습니다.`);
            }
        });

        const adminCode = safeString(normalizedRow.adminProductCode);
        if (adminCode) {
            if (seenAdminCodes.has(adminCode)) {
                const firstRowId = seenAdminCodes.get(adminCode);
                errors.push(`어드민 상품코드 중복 (첫 등장 행: ${firstRowId})`);
            } else {
                seenAdminCodes.set(adminCode, normalizedRow.rowId);
            }
        }

        SKU_NUMERIC_KEYS.forEach((key) => {
            const value = safeString(normalizedRow[key]);
            if (!isNumericValue(value)) {
                errors.push(`${labelByKey[key] ?? key}는 숫자 형식이어야 합니다.`);
            }
        });

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
