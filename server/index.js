const express = require("express");
const cors = require("cors");
const { getCjTrackingResults } = require("./cj-tracking");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        message: "Flowbutler tracking server is running",
    });
});

app.post("/api/tracking/cj", async (req, res) => {
    console.log("[tracking request body]", req.body);
    try {
        const { courier, trackingNumbers } = req.body || {};
        const normalizedCourier = String(courier || "").trim();

        if (!["CJ대한통운", "CJ", "cj", "cj대한통운"].includes(normalizedCourier)) {
            return res.status(400).json({
                error: "지원하지 않는 택배사입니다. 현재는 CJ대한통운만 지원합니다.",
                receivedCourier: courier,
                normalizedCourier,
            });
        }

        if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
            return res.status(400).json({
                error: "trackingNumbers는 1개 이상의 송장번호 배열이어야 합니다.",
            });
        }

        if (trackingNumbers.length > 200) {
            return res.status(400).json({
                error: "한 번에 최대 200건까지만 조회할 수 있습니다.",
            });
        }

        const normalizedNumbers = [...new Set(
            trackingNumbers
                .map((v) => String(v).replace(/\D/g, "").trim())
                .filter(Boolean)
        )];

        const results = await getCjTrackingResults(normalizedNumbers);

        return res.json({
            courier: "CJ대한통운",
            requestedCount: normalizedNumbers.length,
            resultCount: Object.keys(results).length,
            results,
        });
    } catch (error) {
        console.error("[/api/tracking/cj] error:", error);

        return res.status(500).json({
            error: "송장 조회 중 서버 오류가 발생했습니다.",
            detail: error.message || "unknown error",
        });
    }
});

app.listen(PORT, () => {
    console.log(`Flowbutler tracking server listening on port ${PORT}`);
});