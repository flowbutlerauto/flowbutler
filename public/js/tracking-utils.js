const SUPPORTED_COURIER = "CJ대한통운";
const API_COURIER = "CJ";
const MAX_TRACKING_REQUEST_COUNT = 200;

function safeString(value) {
    return String(value ?? "").trim();
}

export function normalizeCourier(value) {
    const raw = safeString(value)
        .toLowerCase()
        .replace(/\s+/g, "");

    if (!raw) return "";

    const cjAliases = new Set([
        "cj",
        "cj대한통운",
        "대한통운",
        "cjlogistics",
        "cjlog",
        "씨제이대한통운",
        "씨제이",
    ]);

    if (cjAliases.has(raw)) {
        return SUPPORTED_COURIER;
    }

    return "UNSUPPORTED";
}

export function normalizeTrackingNumber(value) {
    return safeString(value)
        .replace(/\s+/g, "")
        .replace(/-/g, "");
}

export function normalizeRow(row) {
    return {
        ...row,
        courier: safeString(row?.courier),
        trackingNumber: safeString(row?.trackingNumber),
        normalizedCourier: normalizeCourier(row?.courier),
        normalizedTrackingNumber: normalizeTrackingNumber(row?.trackingNumber),
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
            message: "현재는 CJ대한통운만 지원합니다.",
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

export function buildTrackingRequest(validatedRows) {
    const validRows = (validatedRows ?? []).filter(
        (row) =>
            row?.isValid === true &&
            row?.normalizedCourier === SUPPORTED_COURIER &&
            row?.normalizedTrackingNumber
    );

    const uniqueTrackingNumbers = [...new Set(
        validRows.map((row) => row.normalizedTrackingNumber)
    )];

    if (uniqueTrackingNumbers.length === 0) {
        return {
            ok: false,
            reason: "NO_VALID_ROWS",
            payload: null,
            trackingNumbers: [],
        };
    }

    if (uniqueTrackingNumbers.length > MAX_TRACKING_REQUEST_COUNT) {
        return {
            ok: false,
            reason: "TOO_MANY_ROWS",
            payload: null,
            trackingNumbers: uniqueTrackingNumbers,
        };
    }

    return {
        ok: true,
        reason: "",
        payload: {
            courier: API_COURIER,
            trackingNumbers: uniqueTrackingNumbers,
        },
        trackingNumbers: uniqueTrackingNumbers,
    };
}

export function applyTrackingResults(validatedRows, apiResponse) {
    const resultsMap = apiResponse?.results ?? {};

    return (validatedRows ?? []).map((row) => {
        if (!row?.isValid) {
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

    const completedRows = safeRows.filter(
        (row) => safeString(row?.status) === "배송완료"
    ).length;

    const failedRows = safeRows.filter((row) =>
        ["조회 실패", "조회 결과 없음"].includes(safeString(row?.status))
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
            !["조회 실패", "조회 결과 없음", ""].includes(safeString(row?.status))
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

export function markValidRowsAsFailed(validatedRows, message = "서버 통신 중 오류가 발생했습니다.") {
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

export function getSupportedCourier() {
    return SUPPORTED_COURIER;
}

export function getMaxTrackingRequestCount() {
    return MAX_TRACKING_REQUEST_COUNT;
}