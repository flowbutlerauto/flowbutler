const MAX_TRACKING_REQUEST_COUNT = 2000;
const MAX_TRACKING_API_BATCH_SIZE = 500;

const COURIER_CONFIG = {
    CJ: {
        code: "CJ",
        displayName: "CJ대한통운",
        aliases: [
            "cj",
            "cj대한통운",
            "대한통운",
            "cjlogistics",
            "cjlog",
            "씨제이대한통운",
            "씨제이",
        ],
    },
    LOTTE: {
        code: "LOTTE",
        displayName: "롯데택배",
        aliases: [
            "롯데",
            "롯데택배",
            "롯데글로벌로지스",
            "lotte",
            "lotteglogis",
            "lotteglobal",
            "lottegloballogistics",
        ],
    },

    DOOBALHERO: {
        code: "DOOBALHERO",
        displayName: "두발히어로",
        aliases: [
            "두발히어로",
            "두발 히어로",
            "doobalhero",
            "체인로지스",
        ],
    },

    EPOST: {
        code: "EPOST",
        displayName: "우체국택배",
        aliases: [
            "우체국",
            "우체국택배",
            "우편",
            "epost",
            "post",
        ],
    },
};

function safeString(value) {
    return String(value ?? "").trim();
}

function normalizeText(value) {
    return safeString(value)
        .toLowerCase()
        .replace(/\s+/g, "");
}

function getCourierEntries() {
    return Object.values(COURIER_CONFIG);
}

export function normalizeCourier(value) {
    const raw = normalizeText(value);

    if (!raw) return "";

    for (const courier of getCourierEntries()) {
        const aliasMatched = courier.aliases.some(
            (alias) => normalizeText(alias) === raw
        );

        if (aliasMatched) {
            return courier.displayName;
        }
    }

    return "UNSUPPORTED";
}

export function getApiCourierCode(normalizedCourier) {
    const matched = getCourierEntries().find(
        (courier) => courier.displayName === safeString(normalizedCourier)
    );

    return matched ? matched.code : "";
}

export function normalizeTrackingNumber(value) {
    return safeString(value)
        .replace(/\s+/g, "")
        .replace(/-/g, "");
}

export function normalizeRow(row) {
    const normalizedCourier = normalizeCourier(row?.courier);
    const normalizedTrackingNumber = normalizeTrackingNumber(row?.trackingNumber);

    return {
        ...row,
        courier: safeString(row?.courier),
        trackingNumber: safeString(row?.trackingNumber),
        normalizedCourier,
        normalizedTrackingNumber,
        apiCourierCode: getApiCourierCode(normalizedCourier),
    };
}

export function validateRow(row) {
    const normalizedRow = normalizeRow(row);

    const {
        normalizedCourier,
        normalizedTrackingNumber,
    } = normalizedRow;

    if (!normalizedCourier && !normalizedTrackingNumber) {
        return {
            ...normalizedRow,
            isValid: false,
            status: "입력 필요",
            time: "",
            message: "택배사와 송장번호를 입력해주세요.",
            excludedReason: "EMPTY_BOTH",
        };
    }

    if (!normalizedCourier) {
        return {
            ...normalizedRow,
            isValid: false,
            status: "입력 필요",
            time: "",
            message: "택배사를 입력해주세요.",
            excludedReason: "EMPTY_COURIER",
        };
    }

    if (!normalizedTrackingNumber) {
        return {
            ...normalizedRow,
            isValid: false,
            status: "입력 필요",
            time: "",
            message: "송장번호를 입력해주세요.",
            excludedReason: "EMPTY_TRACKING_NUMBER",
        };
    }

    if (normalizedCourier === "UNSUPPORTED") {
        return {
            ...normalizedRow,
            isValid: false,
            status: "지원하지 않는 택배사",
            time: "",
            message: "현재는 CJ대한통운, 롯데택배, 두발히어로, 우체국택배만 지원합니다.",
            excludedReason: "UNSUPPORTED_COURIER",
        };
    }

    return {
        ...normalizedRow,
        isValid: true,
        status: "",
        time: "",
        message: "",
        excludedReason: "",
    };
}

export function buildValidatedRows(rows) {
    return (rows ?? []).map((row, index) =>
        validateRow({
            rowId: row?.rowId ?? index + 1,
            courier: row?.courier ?? "",
            trackingNumber: row?.trackingNumber ?? "",
            status: row?.status ?? "",
            time: row?.time ?? "",
            message: row?.message ?? "",
            isValid: false,
            excludedReason: "",
        })
    );
}

export function buildTrackingRequests(validatedRows) {
    const validRows = (validatedRows ?? []).filter(
        (row) =>
            row?.isValid === true &&
            row?.normalizedCourier &&
            row?.normalizedCourier !== "UNSUPPORTED" &&
            row?.normalizedTrackingNumber &&
            row?.apiCourierCode
    );

    if (validRows.length === 0) {
        return {
            ok: false,
            reason: "NO_VALID_ROWS",
            requests: [],
            trackingNumbers: [],
        };
    }

    const groupedMap = new Map();

    for (const row of validRows) {
        const apiCourierCode = row.apiCourierCode;

        if (!groupedMap.has(apiCourierCode)) {
            groupedMap.set(apiCourierCode, new Set());
        }

        groupedMap.get(apiCourierCode).add(row.normalizedTrackingNumber);
    }

    const requests = [];

    [...groupedMap.entries()].forEach(([courier, trackingNumberSet]) => {
        const numbers = [...trackingNumberSet];

        for (let startIndex = 0; startIndex < numbers.length; startIndex += MAX_TRACKING_API_BATCH_SIZE) {
            const chunk = numbers.slice(
                startIndex,
                startIndex + MAX_TRACKING_API_BATCH_SIZE
            );

            requests.push({
                courier,
                trackingNumbers: chunk,
            });
        }
    });

    const totalTrackingNumbers = requests.flatMap(
        (request) => request.trackingNumbers
    );

    if (totalTrackingNumbers.length > MAX_TRACKING_REQUEST_COUNT) {
        return {
            ok: false,
            reason: "TOO_MANY_ROWS",
            requests: [],
            trackingNumbers: totalTrackingNumbers,
        };
    }

    return {
        ok: true,
        reason: "",
        requests,
        trackingNumbers: totalTrackingNumbers,
    };
}

export function buildTrackingRequest(validatedRows) {
    const multiRequestResult = buildTrackingRequests(validatedRows);

    if (!multiRequestResult.ok) {
        return {
            ok: false,
            reason: multiRequestResult.reason,
            payload: null,
            trackingNumbers: multiRequestResult.trackingNumbers,
        };
    }

    if (multiRequestResult.requests.length !== 1) {
        return {
            ok: false,
            reason: "MULTI_COURIER_NOT_SUPPORTED",
            payload: null,
            trackingNumbers: multiRequestResult.trackingNumbers,
        };
    }

    const request = multiRequestResult.requests[0];

    return {
        ok: true,
        reason: "",
        payload: {
            courier: request.courier,
            trackingNumbers: request.trackingNumbers,
        },
        trackingNumbers: request.trackingNumbers,
    };
}

export function applyTrackingResults(validatedRows, apiResponse, options = {}) {
    const resultsMap = apiResponse?.results ?? {};
    const responseCourier = safeString(apiResponse?.courier);
    const targetTrackingNumbers = new Set(
        (options.trackingNumbers ?? []).map((value) =>
            safeString(value).replaceAll("-", "").replaceAll(" ", "")
        )
    );
    const hasTargetFilter = targetTrackingNumbers.size > 0;

    return (validatedRows ?? []).map((row) => {
        if (!row?.isValid) {
            return row;
        }

        const rowCourier = safeString(row?.normalizedCourier);

        // 현재 API 응답 택배사와 다른 row는 그대로 둠
        if (responseCourier && rowCourier && responseCourier !== rowCourier) {
            return row;
        }

        // 배치 호출 시 현재 요청에 포함되지 않은 송장번호는 유지
        if (
            hasTargetFilter &&
            !targetTrackingNumbers.has(safeString(row?.normalizedTrackingNumber))
        ) {
            return row;
        }

        const result = resultsMap[row.normalizedTrackingNumber];

        if (!result) {
            return {
                ...row,
                status: "조회 실패",
                time: "",
                message: "응답 결과를 찾을 수 없습니다.",
            };
        }

        return {
            ...row,
            status: safeString(result.status) || "조회 실패",
            time: safeString(result.time),
            message: safeString(result.message),
            rawStatusCode: safeString(result.rawStatusCode),
        };
    });
}

export function buildTrackingSummary(rows) {
    const safeRows = rows ?? [];

    const totalRows = safeRows.length;
    const validRows = safeRows.filter((row) => row?.isValid === true).length;
    const excludedRows = safeRows.filter((row) => row?.isValid !== true).length;

    const completedRows = safeRows.filter((row) =>
        ["배송완료", "배달 완료", "배달완료"].includes(safeString(row?.status))
    ).length;

    const failedRows = safeRows.filter((row) =>
        ["조회 실패", "조회 결과 없음", "조회불가", "오류"].includes(
            safeString(row?.status)
        )
    ).length;

    const needInputRows = safeRows.filter(
        (row) => safeString(row?.status) === "입력 필요"
    ).length;

    const unsupportedCourierRows = safeRows.filter(
        (row) => safeString(row?.status) === "지원하지 않는 택배사"
    ).length;

    const successRows = safeRows.filter(
        (row) =>
            row?.isValid === true &&
            !["", "조회 실패", "조회 결과 없음", "조회불가", "오류"].includes(
                safeString(row?.status)
            )
    ).length;

    return {
        totalRows,
        validRows,
        excludedRows,
        completedRows,
        failedRows,
        needInputRows,
        unsupportedCourierRows,
        successRows,
    };
}

export function markValidRowsAsFailed(
    validatedRows,
    message = "서버 통신 중 오류가 발생했습니다."
) {
    return (validatedRows ?? []).map((row) => {
        if (!row?.isValid) {
            return row;
        }

        return {
            ...row,
            status: "조회 실패",
            time: "",
            message,
        };
    });
}

export function getSupportedCouriers() {
    return getCourierEntries().map((courier) => courier.displayName);
}

export function getSupportedCourierOptions() {
    return getCourierEntries().map((courier) => ({
        code: courier.code,
        displayName: courier.displayName,
    }));
}

export function getMaxTrackingRequestCount() {
    return MAX_TRACKING_REQUEST_COUNT;
}
