const axios = require("axios");
const cheerio = require("cheerio");
const {
    isRetryableTrackingResult,
    mapWithConcurrency,
    runWithRetry,
} = require("./tracking-request-utils");

function safeString(value) {
    return String(value ?? "").trim();
}

function parseDateTime(value) {
    if (!value) return 0;

    const normalized = safeString(value).replace(/\u00a0/g, " ");
    const timestamp = Date.parse(normalized.replace(/\./g, "-"));

    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function buildTrackingUrl(trackingNumber) {
    const encoded = encodeURIComponent(safeString(trackingNumber));
    return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${encoded}`;
}

function extractHistoryRows(html) {
    const $ = cheerio.load(html);
    const tables = $("table.tblH");

    if (!tables.length) {
        return [];
    }

    const historyTable = tables.eq(1);
    const rows = [];

    historyTable.find("tbody tr").each((_, tr) => {
        const cells = $(tr).find("td");

        const status = safeString(cells.eq(0).text());
        const time = safeString(cells.eq(1).text()).replace(/\s+/g, " ");
        const location = safeString(cells.eq(2).text());
        const message = safeString(cells.eq(3).text()).replace(/\s+/g, " ");

        if (!status && !time && !location && !message) {
            return;
        }

        rows.push({
            status,
            time,
            location,
            message,
        });
    });

    return rows;
}

function pickBestHistoryRow(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return null;
    }

    const sorted = rows.slice().sort((a, b) => {
        return parseDateTime(b.time) - parseDateTime(a.time);
    });

    return sorted[0] || null;
}

async function fetchSingleTracking(trackingNumber) {
    try {
        const url = buildTrackingUrl(trackingNumber);

        const response = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                Referer: "https://www.lotteglogis.com/home/reservation/tracking/index",
            },
            timeout: 15000,
        });

        const rows = extractHistoryRows(response.data);
        const best = pickBestHistoryRow(rows);

        if (!best) {
            return {
                status: "조회불가",
                time: "",
                message: "조회 결과가 없습니다.",
                rawStatusCode: "",
            };
        }

        return {
            status: best.status || "상태확인",
            time: best.time || "",
            message: best.message || "상태확인",
            rawStatusCode: "",
        };
    } catch (error) {
        console.error(`[LOTTE tracking error] ${trackingNumber}:`, error.message);

        return {
            status: "오류",
            time: "",
            message: error.message || "조회 중 오류가 발생했습니다.",
            rawStatusCode: "",
        };
    }
}

async function getLotteTrackingResults(trackingNumbers) {
  const entries = await mapWithConcurrency(
    trackingNumbers,
    async function (trackingNumber) {
      const result = await runWithRetry(
        async function () {
          return fetchSingleTracking(trackingNumber);
        },
        {
          maxAttempts: 3,
          baseDelayMs: 300,
          shouldRetryResult: isRetryableTrackingResult,
        },
      );

      return [trackingNumber, result];
    },
    6,
  );

  return Object.fromEntries(entries);
}

module.exports = {
    getLotteTrackingResults,
};