import {
    getInventoryReceiptItemProgress,
    isValidReceivingExpiryDate,
    normalizeInventoryReceiptAllocation,
    normalizeInventoryReceiptItem,
} from "./receiving-utils.js?v=20260803-inbound-upload1";

const COMPLETION_HEADER_ALIASES = Object.freeze({
    adminProductCode: ["어드민 상품코드", "어드민상품코드", "상품코드", "관리상품코드", "adminproductcode"],
    barcode: ["바코드", "barcode"],
    productName: ["상품명", "제품명", "productname"],
    quantity: ["실입고수량", "실입고 수량", "입고수량", "실제입고수량", "수량", "receivedquantity", "quantity"],
    palletNo: ["PLT번호", "PLT 번호", "팔레트번호", "파렛트번호", "palletno", "palletnumber"],
    lotNo: ["LOT번호", "LOT 번호", "로트번호", "lotno", "lotnumber"],
    expiryDate: ["유통기한", "소비기한", "expirydate", "expirationdate"],
    location: ["보관로케이션", "보관 로케이션", "로케이션", "보관위치", "location"],
    discrepancyReason: ["수량차이사유", "수량 차이 사유", "차이사유", "discrepancyreason", "variancereason"],
});

const RECEIVING_COMPLETION_HEADERS = Object.freeze([
    "어드민 상품코드",
    "바코드",
    "상품명",
    "실입고수량",
    "PLT번호",
    "LOT번호",
    "유통기한",
    "보관로케이션",
    "수량차이사유",
]);

function safeText(value) {
    return String(value ?? "").trim();
}

function normalizeHeader(value) {
    return safeText(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeLookup(value) {
    return safeText(value).toLocaleLowerCase("ko-KR");
}

function normalizeCompletionCode(value) {
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

function formatCompletionDateParts(year, month, day) {
    if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeCompletionDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatCompletionDateParts(
            value.getFullYear(),
            value.getMonth() + 1,
            value.getDate(),
        );
    }
    const text = safeText(value);
    if (!text) return "";
    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const serial = Number(text);
        if (Number.isFinite(serial) && serial >= 1 && serial < 2958466) {
            const date = new Date(Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86400000);
            return formatCompletionDateParts(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
            );
        }
    }
    const parts = text.match(/\d+/g) || [];
    if (parts.length < 3) return "";
    return formatCompletionDateParts(Number(parts[0]), Number(parts[1]), Number(parts[2]));
}

function mapReceivingCompletionSheetMatrix(matrix = []) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const headerIndex = rows.findIndex((row) => (
        Array.isArray(row) && row.some((value) => safeText(value))
    ));
    if (headerIndex < 0) {
        return {
            rows: [],
            headers: [],
            headerErrors: ["엑셀 파일에서 헤더 행을 찾을 수 없습니다."],
        };
    }

    const headers = rows[headerIndex].map(safeText);
    const normalizedHeaders = headers.map(normalizeHeader);
    const indexes = {};
    Object.entries(COMPLETION_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        indexes[fieldKey] = normalizedHeaders.findIndex((header) => (
            aliases.some((alias) => normalizeHeader(alias) === header)
        ));
    });
    const headerErrors = [];
    if (indexes.quantity < 0) headerErrors.push("실입고수량 헤더가 없습니다.");
    if (indexes.adminProductCode < 0 && indexes.barcode < 0) {
        headerErrors.push("어드민 상품코드 또는 바코드 헤더가 필요합니다.");
    }

    const mappedRows = rows.slice(headerIndex + 1).map((row, index) => {
        const cells = Array.isArray(row) ? row : [];
        const getCell = (fieldKey) => indexes[fieldKey] >= 0 ? cells[indexes[fieldKey]] : "";
        return {
            rowNumber: headerIndex + index + 2,
            adminProductCode: normalizeCompletionCode(getCell("adminProductCode")),
            barcode: normalizeCompletionCode(getCell("barcode")),
            productName: safeText(getCell("productName")),
            quantityRaw: safeText(getCell("quantity")),
            palletNo: safeText(getCell("palletNo")),
            lotNo: safeText(getCell("lotNo")),
            expiryDateRaw: getCell("expiryDate"),
            location: safeText(getCell("location")),
            discrepancyReason: safeText(getCell("discrepancyReason")),
        };
    }).filter((row) => Object.entries(row).some(([key, value]) => (
        key !== "rowNumber" && safeText(value)
    )));

    return { rows: mappedRows, headers, headerErrors };
}

function getProductCodeLookupKeys(value) {
    const normalized = normalizeLookup(normalizeCompletionCode(value));
    if (!normalized) return [];
    if (!/^\d+$/.test(normalized)) return [normalized];
    return [...new Set([normalized, normalized.replace(/^0+(?=\d)/, "")])];
}

function buildReceiptItemLookup(items, fieldKey) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const lookupKeys = fieldKey === "adminProductCode"
            ? getProductCodeLookupKeys(item?.[fieldKey])
            : [normalizeLookup(normalizeCompletionCode(item?.[fieldKey]))].filter(Boolean);
        lookupKeys.forEach((key) => {
            map.set(key, [...(map.get(key) || []), item]);
        });
    });
    return map;
}

function findSingleReceiptItem(map, rawValue, label, rowNumber, errors, { productCode = false } = {}) {
    if (!rawValue) return null;
    const lookupKeys = productCode
        ? getProductCodeLookupKeys(rawValue)
        : [normalizeLookup(normalizeCompletionCode(rawValue))];
    const matches = [...new Map(
        lookupKeys.flatMap((key) => map.get(key) || []).map((item) => [item.lineId, item]),
    ).values()];
    if (!matches.length) {
        errors.push(`${rowNumber}행: ${label} '${rawValue}'은(는) 현재 입고 예정에 없는 SKU입니다.`);
    } else if (matches.length > 1) {
        errors.push(`${rowNumber}행: ${label} '${rawValue}'이(가) 현재 입고 예정에서 중복됩니다.`);
    }
    return matches.length === 1 ? matches[0] : null;
}

function getAllocationGroupKey(row) {
    return [row.palletNo, row.lotNo, row.expiryDate, row.location]
        .map((value) => normalizeLookup(value))
        .join("\u001f");
}

function buildReceivingCompletionImportPreview(parsed = {}, receipt = {}, currentItems = []) {
    const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    const receiptItems = (Array.isArray(currentItems) ? currentItems : [])
        .map((item, index) => normalizeInventoryReceiptItem(item, index, {
            receiptStatus: receipt?.status,
        }));
    const editableItems = receiptItems.filter((item) => !item.receivingClosed);
    const errors = [...(Array.isArray(parsed?.headerErrors) ? parsed.headerErrors : [])];
    const warnings = [];
    const codeMap = buildReceiptItemLookup(receiptItems, "adminProductCode");
    const barcodeMap = buildReceiptItemLookup(receiptItems, "barcode");
    const groupsByLineId = new Map();

    if (!sourceRows.length && !errors.length) errors.push("업로드할 입고 완료 데이터가 없습니다.");
    if (sourceRows.length > 2000) errors.push("한 번에 최대 2,000행까지 업로드할 수 있습니다.");

    sourceRows.slice(0, 2000).forEach((row) => {
        const rowErrors = [];
        const adminProductCode = normalizeCompletionCode(row.adminProductCode);
        const barcode = normalizeCompletionCode(row.barcode);
        const numericQuantity = Number(safeText(row.quantityRaw).replace(/,/g, ""));
        const quantity = Number.isFinite(numericQuantity) ? Math.trunc(numericQuantity) : -1;
        const expiryDate = normalizeCompletionDate(row.expiryDateRaw);

        if (!adminProductCode && !barcode) {
            rowErrors.push(`${row.rowNumber}행: 어드민 상품코드 또는 바코드 중 하나를 입력해주세요.`);
        }
        if (!Number.isInteger(numericQuantity) || quantity < 0) {
            rowErrors.push(`${row.rowNumber}행: 실입고수량을 0 이상의 정수로 입력해주세요.`);
        }
        if (safeText(row.expiryDateRaw) && (!expiryDate || !isValidReceivingExpiryDate(expiryDate))) {
            rowErrors.push(`${row.rowNumber}행: 유통기한을 YYYY-MM-DD 형식의 실제 날짜로 입력해주세요.`);
        }
        [
            [row.palletNo, "PLT번호"],
            [row.lotNo, "LOT번호"],
            [row.location, "보관로케이션"],
            [row.discrepancyReason, "수량차이사유"],
        ].forEach(([value, label]) => {
            if (safeText(value).length > 120) {
                rowErrors.push(`${row.rowNumber}행: ${label}는 120자 이하로 입력해주세요.`);
            }
        });

        const codeItem = findSingleReceiptItem(
            codeMap,
            adminProductCode,
            "어드민 상품코드",
            row.rowNumber,
            rowErrors,
            { productCode: true },
        );
        const barcodeItem = findSingleReceiptItem(
            barcodeMap,
            barcode,
            "바코드",
            row.rowNumber,
            rowErrors,
        );
        if (codeItem && barcodeItem && codeItem.lineId !== barcodeItem.lineId) {
            rowErrors.push(`${row.rowNumber}행: 어드민 상품코드와 바코드가 서로 다른 SKU를 가리킵니다.`);
        }
        const item = codeItem || barcodeItem;
        if (item?.receivingClosed) {
            rowErrors.push(`${row.rowNumber}행: ${item.productName || item.adminProductCode}은(는) 이미 입고가 종료된 SKU입니다.`);
        }
        if (rowErrors.length) {
            errors.push(...rowErrors);
            return;
        }
        if (row.productName && normalizeLookup(row.productName) !== normalizeLookup(item?.productName)) {
            warnings.push(`${row.rowNumber}행: 상품명이 입고 예정과 다르지만 SKU 코드 기준으로 매칭했습니다.`);
        }
        if (quantity === 0 && (row.palletNo || row.lotNo || expiryDate || row.location)) {
            warnings.push(`${row.rowNumber}행: 실입고수량이 0개이므로 PLT·LOT·유통기한·로케이션은 적용하지 않습니다.`);
        }

        let group = groupsByLineId.get(item.lineId);
        if (!group) {
            group = {
                lineId: item.lineId,
                item,
                rows: [],
                discrepancyReason: "",
            };
            groupsByLineId.set(item.lineId, group);
        }
        if (
            group.discrepancyReason
            && row.discrepancyReason
            && group.discrepancyReason !== row.discrepancyReason
        ) {
            errors.push(`${row.rowNumber}행: 같은 SKU의 수량차이사유가 서로 다릅니다.`);
            return;
        }
        if (!group.discrepancyReason && row.discrepancyReason) {
            group.discrepancyReason = row.discrepancyReason;
        }
        group.rows.push({
            rowNumber: row.rowNumber,
            quantity,
            palletNo: safeText(row.palletNo),
            lotNo: safeText(row.lotNo),
            expiryDate,
            location: safeText(row.location),
        });
    });

    editableItems.forEach((item) => {
        if (!groupsByLineId.has(item.lineId)) {
            errors.push(`${item.productName || item.adminProductCode}: 엑셀에 품목이 없습니다. 미입고라면 실입고수량 0개 행을 추가해주세요.`);
        }
    });

    const groups = [...groupsByLineId.values()].map((group) => {
        const allocationsByKey = new Map();
        let duplicateAllocationCount = 0;
        group.rows.filter((row) => row.quantity > 0).forEach((row) => {
            const allocationKey = getAllocationGroupKey(row);
            const existing = allocationsByKey.get(allocationKey);
            if (existing) {
                existing.quantity += row.quantity;
                duplicateAllocationCount += 1;
            } else {
                allocationsByKey.set(allocationKey, {
                    palletNo: row.palletNo,
                    lotNo: row.lotNo,
                    expiryDate: row.expiryDate,
                    location: row.location,
                    quantity: row.quantity,
                });
            }
        });
        if (duplicateAllocationCount > 0) {
            warnings.push(`${group.item.productName || group.item.adminProductCode}: 동일한 PLT·LOT·유통기한·로케이션 ${duplicateAllocationCount}개 행의 수량을 합산합니다.`);
        }

        const progress = getInventoryReceiptItemProgress(group.item);
        const importedQuantity = group.rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
        const resultingQuantity = progress.postedQuantity + importedQuantity;
        const varianceQuantity = resultingQuantity - progress.plannedQuantity;
        const discrepancyReason = group.discrepancyReason || safeText(group.item.discrepancyReason);
        if (varianceQuantity !== 0 && !discrepancyReason) {
            errors.push(`${group.item.productName || group.item.adminProductCode}: 예정수량과 ${Math.abs(varianceQuantity)}개 차이가 있어 수량차이사유가 필요합니다.`);
        }

        return {
            lineId: group.lineId,
            adminProductCode: group.item.adminProductCode,
            barcode: group.item.barcode,
            productName: group.item.productName,
            plannedQuantity: progress.plannedQuantity,
            postedQuantity: progress.postedQuantity,
            importedQuantity,
            resultingQuantity,
            varianceQuantity,
            discrepancyReason: varianceQuantity === 0 ? "" : discrepancyReason,
            allocations: [...allocationsByKey.values()],
            sourceRowCount: group.rows.length,
        };
    });

    const replacedUnpostedQuantity = editableItems.reduce(
        (sum, item) => sum + getInventoryReceiptItemProgress(item).unpostedQuantity,
        0,
    );
    if (replacedUnpostedQuantity > 0) {
        warnings.push(`현재 재고에 미반영된 수기 입력 ${replacedUnpostedQuantity}개는 엑셀 내용으로 교체됩니다.`);
    }
    const importedTotalQuantity = groups.reduce((sum, group) => sum + group.importedQuantity, 0);
    const resultingTotalQuantity = receiptItems.reduce((sum, item) => {
        const importedGroup = groupsByLineId.has(item.lineId)
            ? groups.find((group) => group.lineId === item.lineId)
            : null;
        return sum + (importedGroup
            ? importedGroup.resultingQuantity
            : getInventoryReceiptItemProgress(item).receivedQuantity);
    }, 0);
    if (resultingTotalQuantity <= 0) {
        errors.unshift("입고 완료 후 실입고수량 합계가 1개 이상이어야 합니다.");
    }

    return {
        rows: sourceRows,
        groups,
        errors,
        warnings,
        rowCount: sourceRows.length,
        itemCount: groups.length,
        importedTotalQuantity,
        resultingTotalQuantity,
        plannedTotalQuantity: receiptItems.reduce(
            (sum, item) => sum + getInventoryReceiptItemProgress(item).plannedQuantity,
            0,
        ),
        matchedItemCount: groups.filter((group) => group.varianceQuantity === 0).length,
        mismatchItemCount: groups.filter((group) => group.varianceQuantity !== 0).length,
        replacedUnpostedQuantity,
        isValid: errors.length === 0 && groups.length > 0,
    };
}

function applyReceivingCompletionImport(items = [], preview = {}, { idPrefix = "excel" } = {}) {
    const groupsByLineId = new Map(
        (Array.isArray(preview?.groups) ? preview.groups : []).map((group) => [group.lineId, group]),
    );
    let allocationSequence = 0;
    return (Array.isArray(items) ? items : []).map((item, itemIndex) => {
        const normalizedItem = normalizeInventoryReceiptItem(item, itemIndex, {
            receiptStatus: "partial",
        });
        const group = groupsByLineId.get(normalizedItem.lineId);
        if (!group) return normalizedItem;

        const postedAllocations = normalizedItem.allocations
            .map(normalizeInventoryReceiptAllocation)
            .filter((allocation) => allocation.postedQuantity > 0)
            .map((allocation, index) => normalizeInventoryReceiptAllocation({
                ...allocation,
                quantity: Math.min(allocation.quantity, allocation.postedQuantity),
                postedQuantity: Math.min(allocation.quantity, allocation.postedQuantity),
            }, index));
        const importedAllocations = (Array.isArray(group.allocations) ? group.allocations : [])
            .filter((allocation) => Number(allocation.quantity) > 0)
            .map((allocation, index) => {
                allocationSequence += 1;
                return normalizeInventoryReceiptAllocation({
                    ...allocation,
                    allocationId: `${idPrefix}-${normalizedItem.lineId}-${allocationSequence}`,
                    postedQuantity: 0,
                    postedAt: "",
                }, postedAllocations.length + index);
            });

        return normalizeInventoryReceiptItem({
            ...normalizedItem,
            allocations: [...postedAllocations, ...importedAllocations],
            discrepancyReason: safeText(group.discrepancyReason),
            receivingClosed: false,
        }, itemIndex, { receiptStatus: "partial" });
    });
}

function buildReceivingCompletionTemplateMatrix(items = []) {
    const rows = (Array.isArray(items) ? items : [])
        .map((item, index) => normalizeInventoryReceiptItem(item, index, {
            receiptStatus: "partial",
        }))
        .filter((item) => !item.receivingClosed)
        .map((item) => {
            const progress = getInventoryReceiptItemProgress(item);
            return [
                safeText(item.adminProductCode),
                safeText(item.barcode),
                safeText(item.productName),
                Math.max(0, progress.plannedQuantity - progress.postedQuantity),
                "",
                "",
                "",
                "",
                "",
            ];
        });
    return [RECEIVING_COMPLETION_HEADERS, ...rows];
}

async function parseReceivingCompletionFile(file) {
    if (!file) throw new Error("업로드할 엑셀 파일을 선택해주세요.");
    const lowerName = safeText(file.name).toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
        throw new Error("xlsx 또는 xls 형식의 엑셀 파일만 업로드할 수 있습니다.");
    }
    if (typeof window === "undefined" || typeof window.XLSX === "undefined") {
        throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    }
    const workbook = window.XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
    });
    if (!workbook.SheetNames.length) throw new Error("엑셀 파일에 시트가 없습니다.");
    const sheetName = workbook.SheetNames[0];
    const matrix = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
    });
    return {
        ...mapReceivingCompletionSheetMatrix(matrix),
        fileName: safeText(file.name),
        sheetName,
    };
}

export {
    RECEIVING_COMPLETION_HEADERS,
    applyReceivingCompletionImport,
    buildReceivingCompletionImportPreview,
    buildReceivingCompletionTemplateMatrix,
    mapReceivingCompletionSheetMatrix,
    parseReceivingCompletionFile,
};
