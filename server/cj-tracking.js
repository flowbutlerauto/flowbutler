const axios = require("axios");
const cheerio = require("cheerio");

const CJ_TRACKING_PAGE_URL =
    "https://www.cjlogistics.com/ko/tool/parcel/tracking";
const CJ_TRACKING_DETAIL_URL =
    "https://www.cjlogistics.com/ko/tool/parcel/tracking-detail";

function extractCsrfToken(html) {
    const $ = cheerio.load(html);
    const csrf =
        $('input[name="_csrf"]').attr("value") ||
        $('meta[name="_csrf"]').attr("content") ||
        "";

    if (!csrf) {
        throw new Error("CJ 페이지에서 CSRF 토큰을 찾지 못했습니다.");
    }

    return csrf;
}

function parseDateTime(value) {
    if (!value) return 0;

    const normalized = String(value).trim().replace(/\./g, "-");
    const timestamp = Date.parse(normalized);

    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function pickBestTrackingItem(resultList) {
    if (!Array.isArray(resultList) || resultList.length === 0) {
        return null;
    }

    const delivered = resultList.find((item) => String(item.crgSt) === "91");
    if (delivered) {
        return delivered;
    }

    const sorted = [...resultList].sort((a, b) => {
        return parseDateTime(b.dTime) - parseDateTime(a.dTime);
    });

    return sorted[0] || null;
}

function mapStatus(item) {
    const rawStatusCode = item?.crgSt ? String(item.crgSt) : "";
    const statusText =
        item?.crgStNm ||
        item?.statusNm ||
        item?.statNm ||
        item?.crgNm ||
        item?.progNm ||
        "상태확인";

    if (rawStatusCode === "91") {
        return {
            status: "배송완료",
            message: "배송완료",
            rawStatusCode,
        };
    }

    return {
        status: statusText,
        message: statusText,
        rawStatusCode,
    };
}

async function fetchCsrfAndCookies() {
    const response = await axios.get(CJ_TRACKING_PAGE_URL, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            Referer: "https://www.cjlogistics.com/",
        },
        timeout: 15000,
    });

    const csrf = extractCsrfToken(response.data);

    const setCookie = response.headers["set-cookie"] || [];
    const cookieHeader = setCookie
        .map((cookie) => cookie.split(";")[0])
        .join("; ");

    return {
        csrf,
        cookieHeader,
    };
}

async function fetchSingleTracking(trackingNumber) {
    try {
        const { csrf, cookieHeader } = await fetchCsrfAndCookies();

        const formData = new URLSearchParams();
        formData.append("_csrf", csrf);
        formData.append("paramInvcNo", trackingNumber);

        const response = await axios.post(CJ_TRACKING_DETAIL_URL, formData.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                Accept: "application/json, text/plain, */*",
                Origin: "https://www.cjlogistics.com",
                Referer: CJ_TRACKING_PAGE_URL,
                Cookie: cookieHeader,
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout: 15000,
        });

        const data = response.data || {};
        const resultList =
            data?.parcelDetailResultMap?.resultList ||
            data?.resultList ||
            [];

        if (!Array.isArray(resultList) || resultList.length === 0) {
            return {
                status: "조회불가",
                time: "",
                message: "조회 결과가 없습니다.",
                rawStatusCode: "",
            };
        }

        const bestItem = pickBestTrackingItem(resultList);

        if (!bestItem) {
            return {
                status: "조회불가",
                time: "",
                message: "유효한 상태 데이터를 찾지 못했습니다.",
                rawStatusCode: "",
            };
        }

        const statusInfo = mapStatus(bestItem);

        return {
            status: statusInfo.status,
            time: bestItem.dTime || "",
            message: statusInfo.message,
            rawStatusCode: statusInfo.rawStatusCode,
        };
    } catch (error) {
        console.error(`[CJ tracking error] ${trackingNumber}:`, error.message);

        return {
            status: "오류",
            time: "",
            message: error.message || "조회 중 오류가 발생했습니다.",
            rawStatusCode: "",
        };
    }
}

async function getCjTrackingResults(trackingNumbers) {
    const entries = await Promise.all(
        trackingNumbers.map(async (trackingNumber) => {
            const result = await fetchSingleTracking(trackingNumber);
            return [trackingNumber, result];
        })
    );

    return Object.fromEntries(entries);
}

module.exports = {
    getCjTrackingResults,
};