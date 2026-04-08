const axios = require("axios");

function safeString(value) {
    return String(value ?? "").trim();
}

function formatDateTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return safeString(value);
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function buildTrackingUrl(trackingNumber) {
    const encoded = encodeURIComponent(safeString(trackingNumber));
    return `https://noritake-external.prod.doobalhero.kr/public/deliveries/${encoded}?`;
}

function mapDoobalHeroStatus(data) {
    const statusCode = Number(data?.status);

    if (statusCode === 5 || data?.deliveryCompletedDate) {
        return "배송완료";
    }

    if (data?.releasedAt) {
        return "배송중";
    }

    if (data?.pickupDateCompleted || data?.warehousedAt) {
        return "집하완료";
    }

    if (data?.receiptDate || data?.pickupDateScheduled) {
        return "접수완료";
    }

    return "상태확인";
}

function buildDoobalHeroMessage(data, mappedStatus) {
    const delayedReason =
        Array.isArray(data?.delayedDeliveries) && data.delayedDeliveries.length > 0
            ? safeString(data.delayedDeliveries[0]?.reason)
            : "";

    const completedLocation = safeString(data?.completedLocation);

    if (mappedStatus === "배송완료") {
        if (completedLocation) {
            return `${completedLocation} 배송완료`;
        }
        return "배송이 완료되었습니다.";
    }

    if (delayedReason) {
        return `지연 이력: ${delayedReason}`;
    }

    if (mappedStatus === "배송중") {
        return "배송이 진행 중입니다.";
    }

    if (mappedStatus === "집하완료") {
        return "집하가 완료되었습니다.";
    }

    if (mappedStatus === "접수완료") {
        return "배송 접수가 완료되었습니다.";
    }

    return "상태를 확인해주세요.";
}

function buildDoobalHeroTime(data) {
    return (
        formatDateTime(data?.deliveryCompletedDate) ||
        formatDateTime(data?.releasedAt) ||
        formatDateTime(data?.pickupDateCompleted) ||
        formatDateTime(data?.warehousedAt) ||
        formatDateTime(data?.pickupDateScheduled) ||
        formatDateTime(data?.receiptDate) ||
        formatDateTime(data?.postponedDate) ||
        ""
    );
}

async function fetchSingleTracking(trackingNumber) {
    try {
        const url = buildTrackingUrl(trackingNumber);

        const response = await axios.get(url, {
            headers: {
                Accept: "*/*",
                Origin: "https://check.doobalhero.kr",
                Referer: "https://check.doobalhero.kr/",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
            },
            timeout: 15000,
        });

        const data = response.data || {};

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return {
                status: "조회불가",
                time: "",
                message: "조회 결과가 없습니다.",
                rawStatusCode: "",
            };
        }

        const mappedStatus = mapDoobalHeroStatus(data);
        const mappedTime = buildDoobalHeroTime(data);
        const mappedMessage = buildDoobalHeroMessage(data, mappedStatus);

        return {
            status: mappedStatus,
            time: mappedTime,
            message: mappedMessage,
            rawStatusCode: safeString(data?.status),
        };
    } catch (error) {
        console.error(`[DOOBALHERO tracking error] ${trackingNumber}:`, error.message);

        return {
            status: "오류",
            time: "",
            message: error.message || "조회 중 오류가 발생했습니다.",
            rawStatusCode: "",
        };
    }
}

async function getDoobalHeroTrackingResults(trackingNumbers) {
    const entries = await Promise.all(
        trackingNumbers.map(async (trackingNumber) => {
            const result = await fetchSingleTracking(trackingNumber);
            return [trackingNumber, result];
        })
    );

    return Object.fromEntries(entries);
}

module.exports = {
    getDoobalHeroTrackingResults,
};