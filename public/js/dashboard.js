import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { parseTrackingFile } from "./tracking-file.js";
import { initializeLabelEditor } from "./label-editor.js";

import {
    applyTrackingResults,
    buildTrackingRequests,
    buildTrackingSummary,
    buildValidatedRows,
    markValidRowsAsFailed,
} from "./tracking-utils.js";

import {
    renderTrackingTable,
    setEmptyTrackingTable,
    syncRowsFromTable,
    updateSelectedFileName,
} from "./tracking-table.js";

import { callTrackingApi } from "./tracking-api.js";

const manualTrackingResultEl = document.getElementById("manual-tracking-result");
const manualTrackingTableBody = document.getElementById("manual-tracking-table-body");
const manualCountInfoEl = document.getElementById("manual-count-info");
const manualClearBtn = document.getElementById("tracking-manual-clear-btn");

const manualSummaryTotalEl = document.getElementById("manual-summary-total");
const manualSummarySuccessEl = document.getElementById("manual-summary-success");
const manualSummaryCompleteEl = document.getElementById("manual-summary-complete");
const manualSummaryFailedEl = document.getElementById("manual-summary-failed");

const dashboardUserInfoEl = document.getElementById("dashboard-user-info");
const dashboardPlanInfoEl = document.getElementById("dashboard-plan-info");
const dashboardRoleInfoEl = document.getElementById("dashboard-role-info");

const settingsUserEmailEl = document.getElementById("settings-user-email");
const settingsUserPlanEl = document.getElementById("settings-user-plan");
const settingsUserRoleEl = document.getElementById("settings-user-role");

const logoutBtn = document.getElementById("logout-btn");
const navButtons = document.querySelectorAll(".sidebar-nav-item, .sidebar-subnav-item");
const topLevelNavButtons = document.querySelectorAll(".sidebar-nav-item");
const subNavButtons = document.querySelectorAll(".sidebar-subnav-item");
const views = document.querySelectorAll(".workspace-view");

const toolGroupEl = document.querySelector('[data-nav-group="tools"]');
const toolGroupToggleEl = document.querySelector(".sidebar-nav-group-toggle");
const toolSubnavEl = document.getElementById("sidebar-tools-menu");

const viewTitleEl = document.getElementById("view-title");
const viewSubtitleEl = document.getElementById("view-subtitle");

const trackingModeButtons = document.querySelectorAll(".tracking-mode-btn");
const trackingModePanels = document.querySelectorAll(".tracking-mode-panel");

const trackingSearchBtn = document.getElementById("tracking-search-btn");
const trackingResultEl = document.getElementById("tracking-result");
const trackingResultTextEl = document.getElementById("tracking-result-text");
const trackingProgressMessageEl = document.getElementById("tracking-progress-message");
const trackingProgressDetailEl = document.getElementById("tracking-progress-detail");
const trackingProgressPercentEl = document.getElementById("tracking-progress-percent");
const trackingProgressWrapEl = document.getElementById("tracking-progress-wrap");
const trackingProgressBarEl = document.getElementById("tracking-progress-bar");
const trackingNumberInput = document.getElementById("tracking-number");
const courierNameInput = document.getElementById("courier-name");

const trackingFileInput = document.getElementById("tracking-file");
const trackingFileNameEl = document.getElementById("tracking-file-name");
const trackingRunBtn = document.getElementById("tracking-run-btn");
const trackingDownloadBtn = document.getElementById("tracking-download-btn");
const trackingTableBody = document.getElementById("tracking-table-body");

const viewMeta = {
    home: {
        title: "홈",
        subtitle: "FlowButler 작업 공간에 오신 것을 환영합니다.",
    },
    tracking: {
        title: "송장번호 Tracking",
        subtitle: "엑셀 업로드와 수기입력 방식으로 Tracking 업무를 처리할 수 있습니다.",
    },
    label: {
        title: "라벨 양식 설정",
        subtitle: "텍스트 박스를 배치하고 엑셀 헤더와 연결할 수 있는 라벨 편집 화면입니다.",
    },
    settings: {
        title: "설정",
        subtitle: "계정, 플랜, 권한과 같은 기본 정보를 확인할 수 있습니다.",
    },
};

let trackingRows = [];
let trackingExecuted = false;
let lastTrackingSummary = null;

function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function setTrackingResult(message) {
    const safeMessage = message ?? "";

    if (trackingResultTextEl) {
        trackingResultTextEl.textContent = safeMessage;
        return;
    }

    if (trackingResultEl) {
        trackingResultEl.textContent = safeMessage;
    }
}

function setTrackingProgress({
    message = "",
    detail = "",
    value = 0,
    active = false,
    visible = true,
} = {}) {
    const percent = clampProgress(value);

    if (trackingProgressMessageEl) {
        trackingProgressMessageEl.textContent = message;
    }

    if (trackingProgressDetailEl) {
        trackingProgressDetailEl.textContent = detail;
    }

    if (trackingProgressPercentEl) {
        trackingProgressPercentEl.textContent = `${percent}%`;
    }

    if (trackingProgressBarEl) {
        trackingProgressBarEl.style.width = `${percent}%`;
    }

    if (trackingProgressWrapEl) {
        trackingProgressWrapEl.classList.toggle("is-hidden", !visible);
        trackingProgressWrapEl.classList.toggle("is-active", visible && active);
        trackingProgressWrapEl.setAttribute("aria-hidden", visible ? "false" : "true");
    }
}

function resetTrackingProgress() {
    setTrackingProgress({
        message: "준비됨",
        detail: "엑셀 파일을 업로드하고 Tracking 실행을 눌러주세요.",
        value: 0,
        active: false,
        visible: false,
    });
}

function setManualTrackingResult(message) {
    if (!manualTrackingResultEl) return;
    manualTrackingResultEl.textContent = message ?? "";
}


function setToolGroupOpenState(isOpen) {
    if (!toolGroupEl || !toolGroupToggleEl || !toolSubnavEl) return;

    toolGroupEl.classList.toggle("is-open", isOpen);
    toolGroupToggleEl.setAttribute("aria-expanded", String(isOpen));
    toolSubnavEl.hidden = !isOpen;
}

function isToolView(viewName) {
    return viewName === "tracking" || viewName === "label";
}


function showView(viewName) {
    topLevelNavButtons.forEach((button) => {
        const isHome = viewName === "home" && button.dataset.view === "home";
        const isSettings = viewName === "settings" && button.dataset.view === "settings";
        button.classList.toggle("is-active", isHome || isSettings);
    });

    subNavButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === viewName);
    });

    views.forEach((view) => {
        view.classList.toggle("is-visible", view.id === `view-${viewName}`);
    });

    if (isToolView(viewName)) {
        setToolGroupOpenState(true);
    }

    const meta = viewMeta[viewName];
    if (meta) {
        viewTitleEl.textContent = meta.title;
        viewSubtitleEl.textContent = meta.subtitle;
    }
}

function showTrackingMode(modeName) {
    trackingModeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.trackingMode === modeName);
    });

    trackingModePanels.forEach((panel) => {
        panel.classList.toggle("is-visible", panel.id === `tracking-mode-${modeName}`);
    });
}

function updateDownloadButtonState() {
    if (!trackingDownloadBtn) return;
    trackingDownloadBtn.disabled = !trackingExecuted || trackingRows.length === 0;
}

function getNowForFileName() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

function downloadCsv(rows) {
    const headers = ["택배사", "송장번호", "단계", "배송 진행 상태", "시간"];
    const lines = [
        headers.join(","),
        ...rows.map((row) =>
            [
                `"${String(row.courier ?? "").replaceAll('"', '""')}"`,
                `"${String(row.trackingNumber ?? "").replaceAll('"', '""')}"`,
                `"${String(row.status ?? "").replaceAll('"', '""')}"`,
                `"${String(row.message ?? "").replaceAll('"', '""')}"`,
                `"${String(row.time ?? "").replaceAll('"', '""')}"`,
            ].join(",")
        ),
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tracking-result-${getNowForFileName()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function applyRowsToScreen(rows) {
    trackingRows = rows ?? [];
    renderTrackingTable(trackingRows, trackingTableBody);
}

function applyRowsToManualScreen(rows) {
    renderTrackingTable(rows ?? [], manualTrackingTableBody);
}

function setManualSummary(summary = null) {
    if (manualSummaryTotalEl) {
        manualSummaryTotalEl.textContent = String(summary?.totalRows ?? 0);
    }
    if (manualSummarySuccessEl) {
        manualSummarySuccessEl.textContent = String(summary?.successRows ?? 0);
    }
    if (manualSummaryCompleteEl) {
        manualSummaryCompleteEl.textContent = String(summary?.completedRows ?? 0);
    }
    if (manualSummaryFailedEl) {
        manualSummaryFailedEl.textContent = String(summary?.failedRows ?? 0);
    }
}

function updateManualCountInfo() {
    if (!manualCountInfoEl || !trackingNumberInput) return;

    const count = trackingNumberInput.value
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean).length;

    manualCountInfoEl.textContent = `입력 ${count}건`;
}

function clearManualResultScreen() {
    setEmptyTrackingTable(manualTrackingTableBody);
    setManualSummary(null);
    setManualTrackingResult("아직 수기입력 조회를 실행하지 않았습니다.");
}

function buildTrackingSummaryText(summary) {
    return (
        `총 ${summary.totalRows}건 처리\n` +
        `조회 성공: ${summary.successRows}건\n` +
        `배송완료: ${summary.completedRows}건\n` +
        `조회 실패/결과 없음: ${summary.failedRows}건\n` +
        `입력 필요: ${summary.needInputRows}건\n` +
        `지원하지 않는 택배사: ${summary.unsupportedCourierRows}건`
    );
}

function buildManualTrackingSummaryText(summary) {
    return (
        `총 ${summary.totalRows}건 처리\n` +
        `조회 성공: ${summary.successRows}건\n` +
        `배송완료: ${summary.completedRows}건\n` +
        `조회 실패/결과 없음: ${summary.failedRows}건`
    );
}

async function executeTrackingRequests(validatedRows, onProgress = () => { }) {
    const requestBuildResult = buildTrackingRequests(validatedRows);

    if (!requestBuildResult.ok) {
        return {
            ok: false,
            reason: requestBuildResult.reason,
            rows: validatedRows,
        };
    }

    const requests = requestBuildResult.requests;
    const totalRequests = requests.length;

    let mergedRows = [...validatedRows];

    onProgress({
        message: "조회 요청을 준비하는 중입니다...",
        detail: `택배사 기준 ${totalRequests}개 요청을 생성했습니다.`,
        value: 12,
        active: true,
        visible: true,
    });

    for (let index = 0; index < totalRequests; index += 1) {
        const payload = requests[index];
        const startValue = 18 + Math.round((index / totalRequests) * 62);

        onProgress({
            message: `${payload.courier} 조회 중...`,
            detail: `요청 ${index + 1} / ${totalRequests}`,
            value: startValue,
            active: true,
            visible: true,
        });

        const apiResult = await callTrackingApi(payload);

        if (!apiResult.ok) {
            mergedRows = markValidRowsAsFailed(
                mergedRows,
                apiResult.message || "서버 통신 중 오류가 발생했습니다."
            );

            onProgress({
                message: "조회 중 오류가 발생했습니다.",
                detail: apiResult.message || "서버 통신 중 오류가 발생했습니다.",
                value: 100,
                active: false,
                visible: true,
            });

            return {
                ok: false,
                reason: "API_ERROR",
                message: apiResult.message || "서버 통신 중 오류가 발생했습니다.",
                rows: mergedRows,
            };
        }

        mergedRows = applyTrackingResults(mergedRows, apiResult.data);

        const endValue = 18 + Math.round(((index + 1) / totalRequests) * 62);

        onProgress({
            message: `${payload.courier} 조회 완료`,
            detail: `요청 ${index + 1} / ${totalRequests}`,
            value: endValue,
            active: true,
            visible: true,
        });
    }

    onProgress({
        message: "결과를 정리하는 중입니다...",
        detail: "요약 정보를 생성하고 있습니다.",
        value: 92,
        active: true,
        visible: true,
    });

    return {
        ok: true,
        reason: "",
        rows: mergedRows,
    };
}

async function setFileSelectedState(file) {
    updateSelectedFileName(file, trackingFileNameEl);

    if (!file) {
        trackingRows = [];
        trackingExecuted = false;
        lastTrackingSummary = null;
        setEmptyTrackingTable(trackingTableBody);
        updateDownloadButtonState();
        resetTrackingProgress();
        setTrackingResult("업로드된 파일이 없습니다.");
        return;
    }

    try {
        trackingExecuted = false;
        lastTrackingSummary = null;
        updateDownloadButtonState();

        setTrackingResult("엑셀 파일을 읽는 중입니다...");

        setTrackingProgress({
            message: "파일을 읽는 중입니다...",
            detail: "업로드한 엑셀 파일을 분석하고 있습니다.",
            value: 20,
            active: true,
            visible: true,
        });

        const parsedRows = await parseTrackingFile(file);

        if (!parsedRows.length) {
            trackingRows = [];
            setEmptyTrackingTable(trackingTableBody);
            setTrackingResult(
                "파일은 읽었지만 표시할 데이터가 없습니다.\n\n헤더명 예시: 택배사, 송장번호"
            );
            return;
        }

        applyRowsToScreen(parsedRows);

        setTrackingProgress({
            message: "파일 준비 완료",
            detail: `총 ${parsedRows.length}건을 불러왔습니다.`,
            value: 100,
            active: false,
            visible: true,
        });

        setTrackingResult(
            `파일을 불러왔습니다.\n\n파일명: ${file.name}\n총 ${parsedRows.length}건을 읽었습니다.\n이제 Tracking 실행을 눌러 조회를 진행해주세요.`
        );
    } catch (error) {
        console.error(error);

        trackingRows = [];
        trackingExecuted = false;
        lastTrackingSummary = null;
        setEmptyTrackingTable(trackingTableBody);
        updateDownloadButtonState();

        setTrackingProgress({
            message: "파일 읽기 실패",
            detail: error.message || "파일을 읽는 중 오류가 발생했습니다.",
            value: 100,
            active: false,
            visible: true,
        });

        setTrackingResult(`파일을 읽는 중 오류가 발생했습니다.\n${error.message}`);
    }
}

async function handleTrackingRun() {
    trackingExecuted = false;
    updateDownloadButtonState();

    const syncedRows = syncRowsFromTable(trackingTableBody);
    const validatedRows = buildValidatedRows(syncedRows);

    applyRowsToScreen(validatedRows);

    setTrackingProgress({
        message: "입력값을 확인하는 중입니다...",
        detail: `총 ${validatedRows.length}건을 검증하고 있습니다.`,
        value: 8,
        active: true,
        visible: true,
    });

    const requestBuildResult = buildTrackingRequests(validatedRows);

    if (!requestBuildResult.ok) {
        if (requestBuildResult.reason === "NO_VALID_ROWS") {
            setTrackingResult("조회 가능한 송장번호가 없습니다.");
        } else if (requestBuildResult.reason === "TOO_MANY_ROWS") {
            setTrackingResult("한 번에 최대 500건까지 조회할 수 있습니다.");
        } else {
            setTrackingResult("조회 요청을 생성할 수 없습니다.");
        }

        setTrackingProgress({
            message: "조회 준비 실패",
            detail: "입력값을 확인한 뒤 다시 시도해주세요.",
            value: 100,
            active: false,
            visible: true,
        });
        return;
    }

    setTrackingResult("외부 택배사 시스템 응답을 기다리는 중입니다.");

    const executionResult = await executeTrackingRequests(
        validatedRows,
        setTrackingProgress
    );

    applyRowsToScreen(executionResult.rows);

    if (!executionResult.ok) {
        trackingExecuted = false;
        updateDownloadButtonState();

        setTrackingResult(
            executionResult.message || "서버 통신 중 오류가 발생했습니다."
        );
        return;
    }

    const summary = buildTrackingSummary(executionResult.rows);
    lastTrackingSummary = summary;

    setTrackingProgress({
        message: "조회 완료",
        detail: `총 ${summary.totalRows}건 처리를 마쳤습니다.`,
        value: 100,
        active: false,
        visible: true,
    });

    setTrackingResult(buildTrackingSummaryText(summary));

    trackingExecuted = true;
    updateDownloadButtonState();
}

function handleTrackingDownload() {
    if (!trackingExecuted) {
        setTrackingResult("먼저 Tracking 실행을 진행해주세요.");
        return;
    }

    if (!trackingRows.length) {
        setTrackingResult("다운로드할 데이터가 없습니다.");
        return;
    }

    downloadCsv(trackingRows);
    setTrackingResult("결과 파일 다운로드를 시작했습니다.");
}

async function handleManualTrackingSearch() {
    const courierName = courierNameInput?.value.trim() ?? "";
    const rawValue = trackingNumberInput?.value.trim() ?? "";

    if (!rawValue) {
        clearManualResultScreen();
        setManualTrackingResult("송장번호를 입력해주세요.");
        return;
    }

    const manualRows = rawValue
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((trackingNumber, index) => ({
            rowId: index + 1,
            courier: courierName,
            trackingNumber,
            status: "",
            time: "",
            message: "",
            isValid: false,
            excludedReason: "",
        }));

    const validatedRows = buildValidatedRows(manualRows);
    applyRowsToManualScreen(validatedRows);

    const requestBuildResult = buildTrackingRequests(validatedRows);

    if (!requestBuildResult.ok) {
        if (requestBuildResult.reason === "NO_VALID_ROWS") {
            setManualTrackingResult("조회 가능한 송장번호가 없습니다.");
        } else if (requestBuildResult.reason === "TOO_MANY_ROWS") {
            setManualTrackingResult("한 번에 최대 500건까지 조회할 수 있습니다.");
        } else {
            setManualTrackingResult("조회 요청을 생성할 수 없습니다.");
        }

        const summary = buildTrackingSummary(validatedRows);
        setManualSummary(summary);
        return;
    }

    setManualTrackingResult("수기입력 Tracking 조회 중입니다...");

    const executionResult = await executeTrackingRequests(validatedRows);

    applyRowsToManualScreen(executionResult.rows);

    const summary = buildTrackingSummary(executionResult.rows);
    setManualSummary(summary);

    if (!executionResult.ok) {
        setManualTrackingResult(
            executionResult.message || "서버 통신 중 오류가 발생했습니다."
        );
        return;
    }

    setManualTrackingResult(buildManualTrackingSummaryText(summary));
}

async function loadApprovedUser(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        window.location.href = "./login.html";
        return;
    }

    const userData = userSnap.data();

    if (userData.approved !== true) {
        window.location.href = "./pending.html";
        return;
    }

    const plan = userData.plan ?? "free";
    const role = userData.role ?? "user";

    const planLabel = plan === "paid" ? "유료" : "무료";
    const roleLabel = role === "admin" ? "관리자" : "일반 사용자";

    dashboardUserInfoEl.textContent = `계정: ${user.email}`;
    dashboardPlanInfoEl.textContent = `플랜: ${planLabel}`;
    dashboardRoleInfoEl.textContent = `권한: ${roleLabel}`;

    if (settingsUserEmailEl) settingsUserEmailEl.textContent = user.email;
    if (settingsUserPlanEl) settingsUserPlanEl.textContent = planLabel;
    if (settingsUserRoleEl) settingsUserRoleEl.textContent = roleLabel;
}

function bindEvents() {
    trackingNumberInput?.addEventListener("input", updateManualCountInfo);

    manualClearBtn?.addEventListener("click", () => {
        if (trackingNumberInput) trackingNumberInput.value = "";
        updateManualCountInfo();
        clearManualResultScreen();
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "./login.html";
        } catch (error) {
            console.error(error);
            dashboardUserInfoEl.textContent = "로그아웃 중 오류가 발생했습니다.";
        }
    });

    toolGroupToggleEl?.addEventListener("click", () => {
        const isOpen = toolGroupEl?.classList.contains("is-open");
        setToolGroupOpenState(!isOpen);
    });

    navButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const viewName = button.dataset.view;
            if (!viewName) return;
            showView(viewName);
        });
    });

    trackingModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            showTrackingMode(button.dataset.trackingMode);
        });
    });

    trackingFileInput?.addEventListener("change", async () => {
        const file = trackingFileInput.files?.[0];
        await setFileSelectedState(file);
    });

    trackingTableBody?.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.matches('td[contenteditable="true"]')) {
            trackingRows = syncRowsFromTable(trackingTableBody);
            trackingExecuted = false;
            updateDownloadButtonState();
        }
    });

    trackingRunBtn?.addEventListener("click", handleTrackingRun);
    trackingDownloadBtn?.addEventListener("click", handleTrackingDownload);
    trackingSearchBtn?.addEventListener("click", handleManualTrackingSearch);
}

function initializeTrackingUi() {
    setEmptyTrackingTable(trackingTableBody);
    updateSelectedFileName(null, trackingFileNameEl);
    updateDownloadButtonState();
    resetTrackingProgress();
    setTrackingResult("");

    clearManualResultScreen();
    updateManualCountInfo();
}

function initializeDashboard() {
    setToolGroupOpenState(false);
    showView("home");
    showTrackingMode("excel");
    initializeTrackingUi();
    bindEvents();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "./login.html";
        return;
    }

    try {
        await loadApprovedUser(user);
        initializeLabelEditor({ userId: user.uid });
    } catch (error) {
        console.error(error);
        dashboardUserInfoEl.textContent = "사용자 상태 확인 중 오류가 발생했습니다.";
    }
});

initializeDashboard();
