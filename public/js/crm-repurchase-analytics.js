const DAY_MS = 24 * 60 * 60 * 1000;
const CRM_CATEGORY_KEYS = Object.freeze(["category1", "category2", "category3"]);

function safeText(value) {
    return String(value ?? "").trim();
}

function uniqueTextValues(values = []) {
    return [...new Set((values ?? []).map(safeText).filter(Boolean))];
}

function getDateText(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return [
            value.getFullYear(),
            String(value.getMonth() + 1).padStart(2, "0"),
            String(value.getDate()).padStart(2, "0"),
        ].join("-");
    }

    const raw = safeText(value);
    const match = raw.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
    if (!match) return "";

    const year = Number(match[1]);
    const month = Number(match[2]);
    const date = Number(match[3]);
    const stamp = Date.UTC(year, month - 1, date);
    const parsed = new Date(stamp);

    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) {
        return "";
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
}

function getDateStamp(dateText) {
    const normalized = getDateText(dateText);
    if (!normalized) return Number.NaN;
    const [year, month, date] = normalized.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
}

function formatDateStamp(stamp) {
    if (!Number.isFinite(stamp)) return "";
    const date = new Date(stamp);
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

function getRowDateText(row) {
    return getDateText(row?.orderDate || row?.orderDateTime);
}

function getRowHour(row) {
    const source = [row?.orderTime, row?.orderDateTime].map(safeText).find(Boolean) || "";
    const match = source.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return null;

    const hour = Number(match[1]);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function getCustomerKey(row) {
    return safeText(row?.customerKey || row?.ordererKey || row?.recipientKey);
}

function getChannelName(row) {
    return safeText(row?.channelName) || "판매처 미지정";
}

function getCategoryValues(row, categoryKey) {
    const categorySource = row?.crmCategories?.[categoryKey] ?? row?.[categoryKey] ?? [];
    return uniqueTextValues(Array.isArray(categorySource) ? categorySource : [categorySource]);
}

function hasAnyCategory(row) {
    return CRM_CATEGORY_KEYS.some((key) => getCategoryValues(row, key).length > 0);
}

function isExcludedStatus(value) {
    const status = safeText(value).toLowerCase();
    return Boolean(status && /(취소|반품|환불)/.test(status));
}

function normalizeOrderKeyPart(value) {
    return safeText(value).toLowerCase().replace(/\s+/g, "");
}

function createOrderKey(row, index) {
    const channel = normalizeOrderKeyPart(getChannelName(row));
    const orderCode = normalizeOrderKeyPart(row?.orderCode);
    if (orderCode) return `${channel}|${orderCode}`;
    return `${channel}|row:${safeText(row?.rowId) || index + 1}`;
}

function addValuesToSet(target, values) {
    (values ?? []).forEach((value) => {
        const text = safeText(value);
        if (text) target.add(text);
    });
}

function createCategorySetMap() {
    return CRM_CATEGORY_KEYS.reduce((result, key) => {
        result[key] = new Set();
        return result;
    }, {});
}

function toSortedCategoryArrays(categorySets) {
    return CRM_CATEGORY_KEYS.reduce((result, key) => {
        result[key] = [...(categorySets?.[key] ?? [])].sort((left, right) => left.localeCompare(right, "ko"));
        return result;
    }, {});
}

function isWithinRange(dateText, startDate, endDate) {
    const stamp = getDateStamp(dateText);
    if (!Number.isFinite(stamp)) return false;

    const startStamp = getDateStamp(startDate);
    const endStamp = getDateStamp(endDate);
    if (Number.isFinite(startStamp) && stamp < startStamp) return false;
    if (Number.isFinite(endStamp) && stamp > endStamp) return false;
    return true;
}

function getMonthStartStamp(stamp) {
    const date = new Date(stamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function getMonthEndStamp(stamp) {
    const date = new Date(stamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
}

function shiftMonthStamp(stamp, amount) {
    const date = new Date(stamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1);
}

export function resolveCrmPeriodRange(rows = [], preset = "all", customStart = "", customEnd = "") {
    const stamps = (rows ?? [])
        .filter((row) => row?.isValid !== false && !isExcludedStatus(row?.status))
        .map((row) => getDateStamp(getRowDateText(row)))
        .filter(Number.isFinite)
        .sort((left, right) => left - right);

    const dataStartStamp = stamps[0];
    const dataEndStamp = stamps[stamps.length - 1];
    if (!Number.isFinite(dataStartStamp) || !Number.isFinite(dataEndStamp)) {
        return { startDate: "", endDate: "", dataStartDate: "", dataEndDate: "" };
    }

    let startStamp = dataStartStamp;
    let endStamp = dataEndStamp;

    if (preset === "latest-month") {
        startStamp = getMonthStartStamp(dataEndStamp);
        endStamp = getMonthEndStamp(dataEndStamp);
    } else if (preset === "previous-month") {
        const previousMonthStamp = shiftMonthStamp(dataEndStamp, -1);
        startStamp = getMonthStartStamp(previousMonthStamp);
        endStamp = getMonthEndStamp(previousMonthStamp);
    } else if (["90", "180", "365"].includes(preset)) {
        startStamp = Math.max(dataStartStamp, dataEndStamp - ((Number(preset) - 1) * DAY_MS));
    } else if (preset === "custom") {
        const customStartStamp = getDateStamp(customStart);
        const customEndStamp = getDateStamp(customEnd);
        startStamp = Number.isFinite(customStartStamp) ? customStartStamp : dataStartStamp;
        endStamp = Number.isFinite(customEndStamp) ? customEndStamp : dataEndStamp;
        if (startStamp > endStamp) [startStamp, endStamp] = [endStamp, startStamp];
    }

    return {
        startDate: formatDateStamp(startStamp),
        endDate: formatDateStamp(endStamp),
        dataStartDate: formatDateStamp(dataStartStamp),
        dataEndDate: formatDateStamp(dataEndStamp),
    };
}

function buildOrders(rows, startDate, endDate) {
    const orderMap = new Map();
    let filteredRows = 0;
    let invalidRows = 0;
    let excludedStatusRows = 0;
    let unmatchedProductRows = 0;
    let uncategorizedProductRows = 0;

    (rows ?? []).forEach((row, index) => {
        const dateText = getRowDateText(row);
        if (!dateText || !isWithinRange(dateText, startDate, endDate)) return;
        if (row?.isValid === false) {
            invalidRows += 1;
            return;
        }
        if (isExcludedStatus(row?.status)) {
            excludedStatusRows += 1;
            return;
        }

        filteredRows += 1;
        if (row?.isSkuMatched === false) unmatchedProductRows += 1;
        if (row?.isSkuMatched === true && !hasAnyCategory(row)) uncategorizedProductRows += 1;

        const orderKey = createOrderKey(row, index);
        if (!orderMap.has(orderKey)) {
            orderMap.set(orderKey, {
                orderKey,
                orderCode: safeText(row?.orderCode),
                dateText,
                dateStamp: getDateStamp(dateText),
                hour: getRowHour(row),
                customerKey: getCustomerKey(row),
                channelName: getChannelName(row),
                rowCount: 0,
                categorySets: createCategorySetMap(),
            });
        }

        const order = orderMap.get(orderKey);
        order.rowCount += 1;
        if (!order.customerKey) order.customerKey = getCustomerKey(row);

        const rowHour = getRowHour(row);
        if (order.hour === null || (rowHour !== null && rowHour < order.hour)) order.hour = rowHour;

        CRM_CATEGORY_KEYS.forEach((key) => {
            addValuesToSet(order.categorySets[key], getCategoryValues(row, key));
        });
    });

    const orders = [...orderMap.values()]
        .map((order) => ({
            ...order,
            categories: toSortedCategoryArrays(order.categorySets),
        }))
        .sort((left, right) => left.dateStamp - right.dateStamp || (left.hour ?? 0) - (right.hour ?? 0));

    return {
        orders,
        filteredRows,
        invalidRows,
        excludedStatusRows,
        unmatchedProductRows,
        uncategorizedProductRows,
    };
}

function buildDailyPurchaseEvents(orders) {
    const eventMap = new Map();

    (orders ?? []).forEach((order) => {
        if (!order.customerKey) return;
        const eventKey = `${order.customerKey}|${order.dateText}`;

        if (!eventMap.has(eventKey)) {
            eventMap.set(eventKey, {
                eventKey,
                customerKey: order.customerKey,
                dateText: order.dateText,
                dateStamp: order.dateStamp,
                channels: new Set(),
                categorySets: createCategorySetMap(),
                orderCount: 0,
            });
        }

        const event = eventMap.get(eventKey);
        event.orderCount += 1;
        event.channels.add(order.channelName);
        CRM_CATEGORY_KEYS.forEach((key) => addValuesToSet(event.categorySets[key], order.categories[key]));
    });

    return [...eventMap.values()]
        .map((event) => ({
            ...event,
            channels: [...event.channels].sort((left, right) => left.localeCompare(right, "ko")),
            categories: toSortedCategoryArrays(event.categorySets),
        }))
        .sort((left, right) => left.dateStamp - right.dateStamp || left.eventKey.localeCompare(right.eventKey));
}

function groupEventsByCustomer(events) {
    const customerMap = new Map();
    (events ?? []).forEach((event) => {
        if (!customerMap.has(event.customerKey)) customerMap.set(event.customerKey, []);
        customerMap.get(event.customerKey).push(event);
    });
    customerMap.forEach((items) => items.sort((left, right) => left.dateStamp - right.dateStamp));
    return customerMap;
}

function incrementRetentionBucket(bucketMap, value, customerKey, didRepeat) {
    const label = safeText(value);
    if (!label) return;
    if (!bucketMap.has(label)) {
        bucketMap.set(label, { label, baseCustomers: new Set(), repeatCustomers: new Set() });
    }

    const bucket = bucketMap.get(label);
    bucket.baseCustomers.add(customerKey);
    if (didRepeat) bucket.repeatCustomers.add(customerKey);
}

function finalizeRetentionBuckets(bucketMap) {
    return [...bucketMap.values()]
        .map((bucket) => {
            const baseCustomers = bucket.baseCustomers.size;
            const repeatCustomers = bucket.repeatCustomers.size;
            return {
                label: bucket.label,
                baseCustomers,
                repeatCustomers,
                rate: baseCustomers ? repeatCustomers / baseCustomers : 0,
                isSmallSample: baseCustomers < 10,
            };
        })
        .sort((left, right) => right.baseCustomers - left.baseCustomers || right.rate - left.rate || left.label.localeCompare(right.label, "ko"));
}

function buildChannelRetention(customerMap) {
    const bucketMap = new Map();

    customerMap.forEach((events, customerKey) => {
        const firstEvent = events[0];
        if (!firstEvent) return;

        const laterChannels = new Set();
        events.slice(1).forEach((event) => addValuesToSet(laterChannels, event.channels));
        firstEvent.channels.forEach((channel) => {
            incrementRetentionBucket(bucketMap, channel, customerKey, laterChannels.has(channel));
        });
    });

    return finalizeRetentionBuckets(bucketMap);
}

function buildCategoryRetention(customerMap, categoryKey) {
    const bucketMap = new Map();

    customerMap.forEach((events, customerKey) => {
        const firstEvent = events[0];
        if (!firstEvent) return;

        const laterValues = new Set();
        events.slice(1).forEach((event) => addValuesToSet(laterValues, event.categories[categoryKey]));
        firstEvent.categories[categoryKey].forEach((value) => {
            incrementRetentionBucket(bucketMap, value, customerKey, laterValues.has(value));
        });
    });

    return finalizeRetentionBuckets(bucketMap);
}

function buildOrderTimeDistribution(orders) {
    const monthMap = new Map();
    let ordersWithTime = 0;

    (orders ?? []).forEach((order) => {
        if (order.hour === null) return;
        ordersWithTime += 1;
        const month = order.dateText.slice(0, 7);
        if (!monthMap.has(month)) monthMap.set(month, { month, totalOrders: 0, counts: Array(12).fill(0) });

        const monthData = monthMap.get(month);
        const slot = Math.min(11, Math.floor(order.hour / 2));
        monthData.counts[slot] += 1;
        monthData.totalOrders += 1;
    });

    const months = [...monthMap.values()]
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((monthData) => ({
            ...monthData,
            rates: monthData.counts.map((count) => monthData.totalOrders ? count / monthData.totalOrders : 0),
        }));

    return { months, ordersWithTime };
}

export function buildCrmRepurchaseAnalytics(rows = [], options = {}) {
    const period = resolveCrmPeriodRange(rows, options.preset, options.startDate, options.endDate);
    const startDate = period.startDate;
    const endDate = period.endDate;
    const orderResult = buildOrders(rows, startDate, endDate);
    const purchaseEvents = buildDailyPurchaseEvents(orderResult.orders);
    const customerMap = groupEventsByCustomer(purchaseEvents);
    const repeatCustomers = [...customerMap.values()].filter((events) => events.length >= 2).length;
    const customers = customerMap.size;
    const ordersWithoutCustomer = orderResult.orders.filter((order) => !order.customerKey).length;
    const timeDistribution = buildOrderTimeDistribution(orderResult.orders);

    const categories = CRM_CATEGORY_KEYS.reduce((result, key) => {
        result[key] = buildCategoryRetention(customerMap, key);
        return result;
    }, {});

    return {
        period: {
            ...period,
            startDate,
            endDate,
        },
        summary: {
            customers,
            orders: orderResult.orders.length,
            purchaseEvents: purchaseEvents.length,
            repeatCustomers,
            repeatRate: customers ? repeatCustomers / customers : 0,
        },
        channelRetention: buildChannelRetention(customerMap),
        categories,
        timeDistribution,
        quality: {
            sourceRows: (rows ?? []).length,
            filteredRows: orderResult.filteredRows,
            invalidRows: orderResult.invalidRows,
            excludedStatusRows: orderResult.excludedStatusRows,
            ordersWithoutCustomer,
            unmatchedProductRows: orderResult.unmatchedProductRows,
            uncategorizedProductRows: orderResult.uncategorizedProductRows,
        },
    };
}

export { CRM_CATEGORY_KEYS };
