import { readTabularRows } from "./order-upload-file.js?v=20260707-crm1";

const CRM_REQUIRED_FIELDS = ["orderDate", "orderCode", "channelName", "productName", "quantity", "recipientKey"];

const CRM_HEADER_ALIASES = {
    orderDate: ["주문일", "주문 날짜", "주문일자"],
    orderTime: ["주문시간", "주문 시간", "주문시각"],
    orderCode: ["주문번호", "주문 번호"],
    productCode: ["상품코드", "상품 코드"],
    barcode: ["바코드", "상품바코드"],
    channelName: ["판매처", "판매처명", "판매 채널", "채널"],
    marketplaceProductName: ["판매처 상품명", "판매처상품명"],
    marketplaceOption: ["판매처 옵션", "판매처옵션"],
    productName: ["상품명", "제품명"],
    quantity: ["상품수량", "상품 수량", "수량", "주문수량"],
    salePrice: ["판매가", "상품판매가"],
    paymentAmount: ["결제금액", "결제 금액"],
    ordererId: ["주문자 id", "주문자ID", "주문자 아이디"],
    ordererKey: ["주문자 키", "주문자키"],
    recipientKey: ["수령자 키", "수령자키"],
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

function buildHeaderAliasLookup() {
    const lookup = new Map();

    Object.entries(CRM_HEADER_ALIASES).forEach(([fieldKey, aliases]) => {
        aliases.forEach((alias) => {
            lookup.set(normalizeHeader(alias), fieldKey);
        });
    });

    return lookup;
}

const CRM_HEADER_ALIAS_LOOKUP = buildHeaderAliasLookup();

function parseNumber(value) {
    const normalized = safeString(value)
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");

    if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
        return Number.NaN;
    }

    return Number(normalized);
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function formatDateObject(value) {
    const year = value.getFullYear();
    const month = padNumber(value.getMonth() + 1);
    const date = padNumber(value.getDate());
    return `${year}-${month}-${date}`;
}

function formatTimeObject(value) {
    return `${padNumber(value.getHours())}:${padNumber(value.getMinutes())}:${padNumber(value.getSeconds())}`;
}

function excelSerialDateToDate(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return null;

    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (Number.isNaN(dateInfo.getTime())) return null;

    return dateInfo;
}

function formatDateLikeText(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatDateObject(value);
    }

    const numericValue = typeof value === "number" ? value : Number.NaN;
    const serialDate = excelSerialDateToDate(numericValue);
    if (serialDate) return formatDateObject(serialDate);

    const raw = safeString(value);
    if (!raw) return "";

    const shortYearDateMatch = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\D|$)/);
    if (shortYearDateMatch) {
        const first = Number(shortYearDateMatch[1]);
        const second = Number(shortYearDateMatch[2]);
        const yearText = shortYearDateMatch[3];
        const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
        const month = first > 12 && second <= 12 ? second : first;
        const date = first > 12 && second <= 12 ? first : second;
        return `${year}-${padNumber(month)}-${padNumber(date)}`;
    }

    const dateMatch = raw.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
    if (dateMatch) {
        return `${dateMatch[1]}-${padNumber(dateMatch[2])}-${padNumber(dateMatch[3])}`;
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 8) {
        return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }

    return raw;
}

function formatTimeLikeText(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatTimeObject(value);
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1) {
        const totalSeconds = Math.round(value * 86400);
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)}`;
    }

    const raw = safeString(value);
    if (!raw) return "";

    const timeMatch = raw.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (timeMatch) {
        return `${padNumber(timeMatch[1])}:${padNumber(timeMatch[2])}${timeMatch[3] ? `:${padNumber(timeMatch[3])}` : ""}`;
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length === 6) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
    if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;

    return raw;
}

function isIsoDateText(value) {
    const dateText = safeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;

    const date = new Date(`${dateText}T00:00:00`);
    return !Number.isNaN(date.getTime()) && formatDateObject(date) === dateText;
}

function getDateTimeText(dateText, timeText) {
    return [safeString(dateText), safeString(timeText)].filter(Boolean).join(" ");
}

function getNormalizedHeaderMap(headerRow) {
    const normalizedHeaderMap = new Map();

    (headerRow ?? []).forEach((header, index) => {
        const normalizedHeader = normalizeHeader(header);
        if (normalizedHeader && !normalizedHeaderMap.has(normalizedHeader)) {
            normalizedHeaderMap.set(normalizedHeader, index);
        }
    });

    return normalizedHeaderMap;
}

function resolveColumnIndexes(headerRow) {
    const normalizedHeaderMap = getNormalizedHeaderMap(headerRow);
    const columnIndexes = {};

    normalizedHeaderMap.forEach((index, normalizedHeader) => {
        const fieldKey = CRM_HEADER_ALIAS_LOOKUP.get(normalizedHeader);
        if (fieldKey && typeof columnIndexes[fieldKey] !== "number") {
            columnIndexes[fieldKey] = index;
        }
    });

    return columnIndexes;
}

function countRequiredHeaderMatches(row) {
    const columnIndexes = resolveColumnIndexes(row);
    return CRM_REQUIRED_FIELDS.filter((fieldKey) => typeof columnIndexes[fieldKey] === "number").length;
}

function findHeaderRowIndex(sheetRows) {
    const maxScanCount = Math.min(sheetRows.length, 20);
    let best = { index: -1, count: 0 };

    for (let rowIndex = 0; rowIndex < maxScanCount; rowIndex += 1) {
        const count = countRequiredHeaderMatches(sheetRows[rowIndex] ?? []);
        if (count > best.count) {
            best = { index: rowIndex, count };
        }
    }

    return best.count >= CRM_REQUIRED_FIELDS.length ? best.index : -1;
}

function getMissingHeaderLabels(columnIndexes) {
    const labelByKey = {
        orderDate: "주문일",
        orderCode: "주문번호",
        channelName: "판매처",
        productName: "상품명",
        quantity: "상품수량",
        recipientKey: "수령자 키",
    };

    return CRM_REQUIRED_FIELDS
        .filter((fieldKey) => typeof columnIndexes[fieldKey] !== "number")
        .map((fieldKey) => labelByKey[fieldKey] || fieldKey);
}

function getCell(row, columnIndexes, fieldKey) {
    const columnIndex = columnIndexes[fieldKey];
    if (typeof columnIndex !== "number") return "";
    return safeString(row?.[columnIndex]);
}

function rowHasMappedValue(row, columnIndexes) {
    return Object.values(columnIndexes).some((index) => safeString(row?.[index]));
}

function validateCrmRow(row) {
    const errors = [];

    if (!row.orderDate) errors.push("주문일이 비어 있습니다.");
    if (row.orderDate && !isIsoDateText(row.orderDate)) errors.push("주문일 형식이 올바르지 않습니다.");
    if (!row.orderCode) errors.push("주문번호가 비어 있습니다.");
    if (!row.channelName) errors.push("판매처가 비어 있습니다.");
    if (!row.productName) errors.push("상품명이 비어 있습니다.");
    if (!row.recipientKey) errors.push("수령자 키가 비어 있습니다.");

    if (Number.isNaN(row.quantityNumber)) {
        errors.push("상품수량은 숫자여야 합니다.");
    } else if (row.quantityNumber <= 0) {
        errors.push("상품수량은 0보다 커야 합니다.");
    }

    if (row.salePrice && Number.isNaN(row.salePriceNumber)) {
        errors.push("판매가는 숫자여야 합니다.");
    }

    if (row.paymentAmount && Number.isNaN(row.paymentAmountNumber)) {
        errors.push("결제금액은 숫자여야 합니다.");
    }

    return errors;
}

function mapCrmRows(sheetRows, columnIndexes, headerRowIndex, fileName) {
    return sheetRows
        .slice(headerRowIndex + 1)
        .filter((row) => rowHasMappedValue(row, columnIndexes))
        .map((row, index) => {
            const quantity = getCell(row, columnIndexes, "quantity");
            const salePrice = getCell(row, columnIndexes, "salePrice");
            const paymentAmount = getCell(row, columnIndexes, "paymentAmount");
            const orderDate = formatDateLikeText(getCell(row, columnIndexes, "orderDate"));
            const orderTime = formatTimeLikeText(getCell(row, columnIndexes, "orderTime"));

            const mappedRow = {
                rowId: index + 1,
                orderDate,
                orderTime,
                orderDateTime: getDateTimeText(orderDate, orderTime),
                orderCode: getCell(row, columnIndexes, "orderCode"),
                productCode: getCell(row, columnIndexes, "productCode"),
                barcode: getCell(row, columnIndexes, "barcode"),
                channelName: getCell(row, columnIndexes, "channelName"),
                marketplaceProductName: getCell(row, columnIndexes, "marketplaceProductName"),
                marketplaceOption: getCell(row, columnIndexes, "marketplaceOption"),
                productName: getCell(row, columnIndexes, "productName"),
                quantity,
                quantityNumber: parseNumber(quantity),
                salePrice,
                salePriceNumber: parseNumber(salePrice),
                paymentAmount,
                paymentAmountNumber: parseNumber(paymentAmount),
                ordererId: getCell(row, columnIndexes, "ordererId"),
                ordererKey: getCell(row, columnIndexes, "ordererKey"),
                recipientKey: getCell(row, columnIndexes, "recipientKey"),
                sourceFileName: safeString(fileName),
            };

            const errors = validateCrmRow(mappedRow);

            return {
                ...mappedRow,
                errors,
                isValid: errors.length === 0,
            };
        });
}

function uniqueSortedDates(values) {
    return [...new Set(values.filter(Boolean))]
        .map((dateText) => ({ dateText, time: new Date(`${dateText}T00:00:00`).getTime() }))
        .filter((item) => !Number.isNaN(item.time))
        .sort((left, right) => left.time - right.time);
}

function getDaysBetween(leftTime, rightTime) {
    return Math.round((rightTime - leftTime) / 86400000);
}

function getMedian(values) {
    const sortedValues = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sortedValues.length) return 0;

    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 1) return sortedValues[middle];

    return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

export async function parseCrmHistoricalOrderFile(file) {
    const sheetRows = await readTabularRows(file);
    if (!sheetRows.length) {
        throw new Error("CRM에 반영할 주문 데이터가 없습니다.");
    }

    const headerRowIndex = findHeaderRowIndex(sheetRows);
    if (headerRowIndex < 0) {
        throw new Error("필수 헤더를 찾지 못했습니다. 주문일, 주문번호, 판매처, 상품명, 상품수량, 수령자 키가 필요합니다.");
    }

    const headerRow = sheetRows[headerRowIndex] ?? [];
    const columnIndexes = resolveColumnIndexes(headerRow);
    const missingHeaders = getMissingHeaderLabels(columnIndexes);
    if (missingHeaders.length) {
        throw new Error(`필수 헤더가 없습니다: ${missingHeaders.join(", ")}`);
    }

    return mapCrmRows(sheetRows, columnIndexes, headerRowIndex, file?.name);
}

export function buildCrmAnalytics(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const validRows = safeRows.filter((row) => row?.isValid);
    const invalidRows = safeRows.filter((row) => !row?.isValid);
    const uniqueOrders = new Set();
    const customerOrders = new Map();
    const channelCounts = new Map();

    let totalQuantity = 0;
    let totalPaymentAmount = 0;

    validRows.forEach((row) => {
        const orderCode = safeString(row.orderCode);
        const customerKey = safeString(row.recipientKey);
        const orderDate = safeString(row.orderDate);
        const channelName = safeString(row.channelName) || "미지정";

        if (orderCode) uniqueOrders.add(orderCode);
        channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);

        if (customerKey && orderDate) {
            if (!customerOrders.has(customerKey)) customerOrders.set(customerKey, new Map());
            const customerOrderMap = customerOrders.get(customerKey);
            customerOrderMap.set(orderCode || `${orderDate}-${row.rowId}`, orderDate);
        }

        if (Number.isFinite(row.quantityNumber)) totalQuantity += row.quantityNumber;
        if (Number.isFinite(row.paymentAmountNumber)) totalPaymentAmount += row.paymentAmountNumber;
    });

    const dateTexts = uniqueSortedDates(validRows.map((row) => row.orderDate));
    const firstRepeatGaps = [];
    let repeatCustomers = 0;
    let repeatWithin30Days = 0;

    customerOrders.forEach((ordersByCode) => {
        const orderDates = uniqueSortedDates([...ordersByCode.values()]);
        if (orderDates.length < 2) return;

        repeatCustomers += 1;
        const gap = getDaysBetween(orderDates[0].time, orderDates[1].time);
        firstRepeatGaps.push(gap);
        if (gap <= 30) repeatWithin30Days += 1;
    });

    const uniqueCustomers = customerOrders.size;
    const averageFirstRepeatDays = firstRepeatGaps.length
        ? firstRepeatGaps.reduce((sum, value) => sum + value, 0) / firstRepeatGaps.length
        : 0;

    return {
        totalRows: safeRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        uniqueOrders: uniqueOrders.size,
        uniqueCustomers,
        repeatCustomers,
        repeatRate: uniqueCustomers ? repeatCustomers / uniqueCustomers : 0,
        repeatWithin30Days,
        repeatWithin30Rate: repeatCustomers ? repeatWithin30Days / repeatCustomers : 0,
        averageFirstRepeatDays,
        medianFirstRepeatDays: getMedian(firstRepeatGaps),
        totalQuantity,
        totalPaymentAmount,
        dateMin: dateTexts[0]?.dateText || "",
        dateMax: dateTexts[dateTexts.length - 1]?.dateText || "",
        channelCounts: [...channelCounts.entries()]
            .map(([channelName, count]) => ({ channelName, count }))
            .sort((left, right) => right.count - left.count || left.channelName.localeCompare(right.channelName, "ko-KR")),
    };
}
