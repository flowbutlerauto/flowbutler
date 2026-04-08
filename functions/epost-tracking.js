const axios = require("axios");
const cheerio = require("cheerio");

function safeString(value) {
    return String(value ?? "").trim();
}

function parseDateTime(value) {
    if (!value) return 0;

    const normalized = safeString(value)
        .replace(/\./g, "-")
        .replace(/\s+/g, " ");

    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDateText(value) {
    return safeString(value).replace(/\s+/g, " ");
}

function buildTrackingUrl(trackingNumber) {
    const encoded = encodeURIComponent(safeString(trackingNumber));
    return `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?ems_gubun=E&sid1=${encoded}`;
}

function extractHistoryRows(html) {
    const $ = cheerio.load(html);
    const rows = [];

    $("#processTable tbody tr").each((_, tr) => {
        const cells = $(tr).find("td");
        if (cells.length < 4) return;

        const time = formatDateText(cells.eq(0).text());
        const postOffice = formatDateText(cells.eq(1).text());
        const statusCell = cells.eq(2);
        const status = formatDateText(statusCell.find(".evtnm").first().text()) || formatDateText(statusCell.text());
        const extra = formatDateText(statusCell.text())
            .replace(status, "")
            .replace(/\s+/g, " ")
            .trim();

        if (!time && !status && !postOffice) return;

        rows.push({
            time,
            postOffice,
            status,
            extra,
        });
    });

    return rows;
}

function pickBestHistoryRow(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const delivered = rows.find((row) =>
        ["배달완료", "수취함투함"].includes(safeString(row.status))
    );
    if (delivered) return delivered;

    const sorted = rows.slice().sort((a, b) => parseDateTime(b.time) - parseDateTime(a.time));
    return sorted[0] || null;
}

function extractDeliveryVal(html) {
    const $ = cheerio.load(html);
    return safeString($("#deliveryVal").val());
}

function extractEtcRegino(html) {
    const match = html.match(/'regino':\s*"([^"]+)"/);
    return match ? safeString(match[1]) : "";
}

async function fetchDeliveryEtc(regino) {
    if (!regino) {
        return { delivetc: "", filenm: "", etcGbn: "" };
    }

    const body = new URLSearchParams();
    body.append("regino", regino);

    const response = await axios.post(
        "https://m.epost.go.kr/postal/mobile/mobile.RetrieveDelivEtcImage.postal",
        body.toString(),
        {
            headers: {
                Accept: "application/xml, text/xml, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                Origin: "https://service.epost.go.kr",
                Referer: "https://service.epost.go.kr/",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
            },
            timeout: 15000,
        }
    );

    const xml = response.data || "";
    const delivetcMatch = xml.match(/<delivetc><!\[CDATA\[(.*?)\]\]><\/delivetc>/);
    const filenmMatch = xml.match(/<filenm><!\[CDATA\[(.*?)\]\]><\/filenm>/);
    const etcGbnMatch = xml.match(/<etcGbn><!\[CDATA\[(.*?)\]\]><\/etcGbn>/);

    return {
        delivetc: delivetcMatch ? safeString(delivetcMatch[1]) : "",
        filenm: filenmMatch ? safeString(filenmMatch[1]) : "",
        etcGbn: etcGbnMatch ? safeString(etcGbnMatch[1]) : "",
    };
}

async function fetchSingleTracking(trackingNumber) {
    try {
        const url = buildTrackingUrl(trackingNumber);

        const response = await axios.get(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                Referer: "https://service.epost.go.kr/",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
            },
            timeout: 15000,
        });

        const html = response.data || "";
        const rows = extractHistoryRows(html);
        const best = pickBestHistoryRow(rows);
        const deliveryVal = extractDeliveryVal(html);
        const etcRegino = extractEtcRegino(html);

        if (!best) {
            return {
                status: "조회불가",
                time: "",
                message: "조회 결과가 없습니다.",
                rawStatusCode: "",
            };
        }

        let message = best.extra || deliveryVal || best.postOffice || "상태확인";

        if (["배달완료", "수취함투함"].includes(safeString(best.status))) {
            try {
                const etcInfo = await fetchDeliveryEtc(etcRegino);
                if (etcInfo.etcGbn === "Y" && etcInfo.delivetc) {
                    message = `${etcInfo.delivetc} 배달완료`;
                }
            } catch (xmlError) {
                // XML 보강 실패해도 HTML 기준 결과는 유지
            }
        }

        return {
            status: safeString(best.status) || safeString(deliveryVal) || "상태확인",
            time: safeString(best.time),
            message,
            rawStatusCode: "",
        };
    } catch (error) {
        console.error(`[EPOST tracking error] ${trackingNumber}:`, error.message);

        return {
            status: "오류",
            time: "",
            message: error.message || "조회 중 오류가 발생했습니다.",
            rawStatusCode: "",
        };
    }
}

async function getEpostTrackingResults(trackingNumbers) {
    const entries = await Promise.all(
        trackingNumbers.map(async (trackingNumber) => {
            const result = await fetchSingleTracking(trackingNumber);
            return [trackingNumber, result];
        })
    );

    return Object.fromEntries(entries);
}

module.exports = {
    getEpostTrackingResults,
};