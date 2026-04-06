const DEFAULT_API_URL = "/api/tracking/cj";

function safeString(value) {
    return String(value ?? "").trim();
}

async function parseJsonSafely(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

function buildErrorResult(errorCode, message) {
    return {
        ok: false,
        errorCode,
        message,
    };
}

export async function callTrackingApi(payload, options = {}) {
    const apiUrl = options.apiUrl || DEFAULT_API_URL;

    if (!payload || !Array.isArray(payload.trackingNumbers)) {
        return buildErrorResult(
            "INVALID_PAYLOAD",
            "trackingNumbers 배열이 필요합니다."
        );
    }

    if (payload.trackingNumbers.length === 0) {
        return buildErrorResult(
            "EMPTY_TRACKING_NUMBERS",
            "조회할 송장번호가 없습니다."
        );
    }

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const responseJson = await parseJsonSafely(response);

        if (!response.ok) {
            return buildErrorResult(
                safeString(responseJson?.code) || `HTTP_${response.status}`,
                safeString(responseJson?.message) ||
                safeString(responseJson?.error) ||
                "조회 요청에 실패했습니다."
            );
        }

        if (!responseJson || typeof responseJson !== "object") {
            return buildErrorResult(
                "INVALID_RESPONSE",
                "서버 응답 형식이 올바르지 않습니다."
            );
        }

        if (!responseJson.results || typeof responseJson.results !== "object") {
            return buildErrorResult(
                "INVALID_RESULTS",
                "조회 결과 데이터가 올바르지 않습니다."
            );
        }

        return {
            ok: true,
            data: {
                courier: safeString(responseJson.courier) || "CJ대한통운",
                requestedCount: Number(responseJson.requestedCount ?? 0),
                resultCount: Number(responseJson.resultCount ?? 0),
                results: responseJson.results,
            },
        };
    } catch (error) {
        console.error(error);

        return buildErrorResult(
            "NETWORK_ERROR",
            "서버 통신 중 오류가 발생했습니다."
        );
    }
}

export function getTrackingApiUrl() {
    return DEFAULT_API_URL;
}