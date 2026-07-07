import { SKU_FIELDS, SKU_NUMERIC_KEYS, SKU_REQUIRED_KEYS } from "./sku-schema.js";

function safeString(value) {
    return String(value ?? "").trim();
}

function isNumericValue(value) {
    if (value === "") return true;
    return !Number.isNaN(Number(safeString(value).replace(/,/g, "")));
}

function parsePositiveNumber(value) {
    const text = safeString(value).replace(/,/g, "");
    if (!text) return Number.NaN;
    const numericValue = Number(text);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : Number.NaN;
}

function formatSkuNumber(value) {
    if (!Number.isFinite(value)) return "";
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function getSkuPackagingWarnings(row) {
    const warnings = [];
    const pcsPerBox = parsePositiveNumber(row.pcsPerBox);
    const boxesPerPlt = parsePositiveNumber(row.boxesPerPlt);
    const pcsPerPlt = parsePositiveNumber(row.pcsPerPlt);
    const outboxGrossWeightG = parsePositiveNumber(row.outboxGrossWeightG);
    const skuGrossWeightG = parsePositiveNumber(row.skuGrossWeightG);
    const hasPcsPerBox = !Number.isNaN(pcsPerBox);
    const hasPltBasis = !Number.isNaN(boxesPerPlt) && !Number.isNaN(pcsPerPlt);
    const canCalculatePcsPerBox = hasPcsPerBox || hasPltBasis;

    if (hasPcsPerBox && hasPltBasis) {
        const inferredPcsPerBox = pcsPerPlt / boxesPerPlt;
        const tolerance = Math.max(0.01, Math.abs(inferredPcsPerBox) * 0.005);
        if (Math.abs(pcsPerBox - inferredPcsPerBox) > tolerance) {
            warnings.push(
                `박스당 입수(${formatSkuNumber(pcsPerBox)})와 plt 기준 역산값(${formatSkuNumber(inferredPcsPerBox)})이 다릅니다.`
            );
        }
    } else if (!hasPcsPerBox && !hasPltBasis) {
        warnings.push("쿠팡 밀크런 박스/중량 계산 불가: 박스당 입수 또는 plt당 box수와 plt당 pcs수가 필요합니다.");
    }

    if (canCalculatePcsPerBox && Number.isNaN(outboxGrossWeightG)) {
        warnings.push("쿠팡 밀크런 중량 계산 불가: 아웃박스 총중량(g)이 필요합니다.");
    } else if (canCalculatePcsPerBox && !Number.isNaN(outboxGrossWeightG) && Number.isNaN(skuGrossWeightG)) {
        warnings.push("쿠팡 밀크런 부분박스 중량 보정 불가: SKU 총중량(g)이 필요합니다.");
    }

    return warnings;
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
        const warnings = [];

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

        if (!errors.length) {
            warnings.push(...getSkuPackagingWarnings(normalizedRow));
        }

        return {
            ...normalizedRow,
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    });

    const invalidRows = validatedRows.filter((row) => !row.isValid);
    const warningRows = validatedRows.filter((row) => row.isValid && (row.warnings ?? []).length > 0);
    const cleanRows = validatedRows.filter((row) => row.isValid && !(row.warnings ?? []).length);

    return {
        rows: validatedRows,
        summary: {
            total: validatedRows.length,
            valid: validatedRows.length - invalidRows.length,
            invalid: invalidRows.length,
            warning: warningRows.length,
            clean: cleanRows.length,
        },
    };
}
