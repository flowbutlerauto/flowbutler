import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { parseTrackingFile } from "./tracking-file.js";
import { initializeLabelEditor } from "./label-editor.js";
import { parseSkuFile } from "./sku-file.js";
import { validateSkuRows } from "./sku-utils.js";
import { SKU_FIELDS, SKU_REQUIRED_KEYS } from "./sku-schema.js";
import { parseKurlyLabelFile } from "./kurly-label-file.js";
import { buildKurlyLabelItems, validateKurlyRows } from "./kurly-label-utils.js";
import {
    buildKurlyOrderRows,
    buildMilkrunRowsFromOrderRows,
    parseCoupangOrderFile,
} from "./order-upload-file.js";
import { tossConfig } from "./toss-config.js";

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

const paymentBtn = document.getElementById("payment-btn");
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
const headerActionsEl = document.getElementById("header-actions");
const headerQuickViewButtons = document.querySelectorAll("[data-quick-view]");
const paidFeatureButtons = document.querySelectorAll('[data-paid-feature="true"]');

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

const skuFileInput = document.getElementById("sku-file");
const skuFileNameEl = document.getElementById("sku-file-name");
const skuHeaderConfigBtn = document.getElementById("sku-header-config-btn");
const skuDeleteSelectedBtn = document.getElementById("sku-delete-selected-btn");
const skuResultEl = document.getElementById("sku-result");
const skuTableHead = document.getElementById("sku-table-head");
const skuTableBody = document.getElementById("sku-table-body");
const skuHeaderModal = document.getElementById("sku-header-modal");
const skuHeaderCheckboxList = document.getElementById("sku-header-checkbox-list");
const skuHeaderApplyBtn = document.getElementById("sku-header-apply-btn");
const skuHeaderCancelBtn = document.getElementById("sku-header-cancel-btn");
const skuHeaderSelectAllBtn = document.getElementById("sku-header-select-all-btn");
const skuHeaderRequiredBtn = document.getElementById("sku-header-required-btn");
const skuHeaderResetBtn = document.getElementById("sku-header-reset-btn");
const skuEditModal = document.getElementById("sku-edit-modal");
const skuEditForm = document.getElementById("sku-edit-form");
const skuEditCancelBtn = document.getElementById("sku-edit-cancel-btn");
const skuEditSaveBtn = document.getElementById("sku-edit-save-btn");
const skuLabelPrintModal = document.getElementById("sku-label-print-modal");
const skuLabelTemplateSelect = document.getElementById("sku-label-template-select");
const skuLabelPrintStatus = document.getElementById("sku-label-print-status");
const skuLabelPrintCancelBtn = document.getElementById("sku-label-print-cancel-btn");
const skuLabelPrintRunBtn = document.getElementById("sku-label-print-run-btn");
const kurlyLabelFileInput = document.getElementById("kurly-label-file");
const kurlyLabelFileNameEl = document.getElementById("kurly-label-file-name");
const kurlyLabelGenerateBtn = document.getElementById("kurly-label-generate-btn");
const kurlyLabelResultEl = document.getElementById("kurly-label-result");
const kurlyProgressCardEl = document.getElementById("kurly-progress-card");
const kurlyProgressMessageEl = document.getElementById("kurly-progress-message");
const kurlyProgressDetailEl = document.getElementById("kurly-progress-detail");
const kurlyProgressBarEl = document.getElementById("kurly-progress-bar");
const kurlyProgressPercentEl = document.getElementById("kurly-progress-percent");
const orderUploadCoupangFileInput = document.getElementById("order-upload-coupang-file");
const orderUploadKurlyFileInput = document.getElementById("order-upload-kurly-file");
const orderUploadCoupangStatusEl = document.getElementById("order-upload-coupang-status");
const orderUploadKurlyStatusEl = document.getElementById("order-upload-kurly-status");
const orderMatchStatusEl = document.getElementById("order-match-status");
const orderMatchListEl = document.getElementById("order-match-list");
const orderMatchConfirmBtn = document.getElementById("order-match-confirm-btn");
const orderMatchDeleteOpenBtn = document.getElementById("order-match-delete-open-btn");
const orderMatchDeleteModal = document.getElementById("order-match-delete-modal");
const orderMatchDeleteCloseBtn = document.getElementById("order-match-delete-close-btn");
const orderMatchDeleteSearchInput = document.getElementById("order-match-delete-search-input");
const orderMatchDeleteListEl = document.getElementById("order-match-delete-list");
const milkrunCenterCountEl = document.getElementById("milkrun-center-count");
const milkrunTotalPltEl = document.getElementById("milkrun-total-plt");
const milkrunTotalSkuEl = document.getElementById("milkrun-total-sku");
const milkrunTotalWeightEl = document.getElementById("milkrun-total-weight");
const milkrunCenterSummaryBody = document.getElementById("milkrun-center-summary-body");
const milkrunOrderBody = document.getElementById("milkrun-order-body");
const milkrunCenterCountLabelEl = document.getElementById("milkrun-center-count-label");
const milkrunCenterToggleBtn = document.getElementById("milkrun-center-toggle-btn");
const milkrunCenterModal = document.getElementById("milkrun-center-modal");
const milkrunCenterCloseBtn = document.getElementById("milkrun-center-close-btn");
const milkrunCenterAddInput = document.getElementById("milkrun-center-add-input");
const milkrunCenterAddBtn = document.getElementById("milkrun-center-add-btn");
const milkrunCenterSortBtn = document.getElementById("milkrun-center-sort-btn");
const milkrunCenterResetBtn = document.getElementById("milkrun-center-reset-btn");
const milkrunCenterStatusEl = document.getElementById("milkrun-center-status");
const milkrunCenterListEl = document.getElementById("milkrun-center-list");
const milkrunLoadSampleBtn = document.getElementById("milkrun-load-sample-btn");
const milkrunSortCenterBtn = document.getElementById("milkrun-sort-center-btn");

const viewMeta = {
    home: {
        title: "홈",
        subtitle: "지금 필요한 물류 자동화 작업을 빠르게 시작하세요.",
    },
    tracking: {
        title: "송장번호 Tracking",
        subtitle: "",
    },
    label: {
        title: "라벨 양식 설정",
        subtitle: "",
    },
    sku: {
        title: "SKU 관리",
        subtitle: "",
    },
    "order-upload": {
        title: "발주서 업로드",
        subtitle: "쿠팡(밀크런)과 컬리 발주서를 판매처별 양식으로 업로드합니다.",
    },
    "kurly-label": {
        title: "컬리 라벨 생성",
        subtitle: "",
    },
    "coupang-milkrun": {
        title: "쿠팡 밀크런 도우미",
        subtitle: "발주번호 단위 센터 변경과 센터별 PLT 요약을 확인합니다.",
    },
    settings: {
        title: "설정",
        subtitle: "계정, 플랜, 권한과 같은 기본 정보를 확인할 수 있습니다.",
    },
};

let trackingRows = [];
let trackingExecuted = false;
let lastTrackingSummary = null;
let skuRows = [];
let selectedSkuHeaderKeys = [];
let selectedSkuRowIds = new Set();
let editingSkuRowId = null;
let skuWorkspaceUserId = null;
let skuLabelTemplates = [];
let printingSkuRowId = null;
let orderUploadRows = [];
let orderProductMatches = {};
let orderMatchDraftComponents = {};
let confirmedOrderMatchKeys = new Set();
let kurlyRows = [];
let kurlyParsedFileName = "";
let milkrunRows = [];
let activeOrderSkuPicker = null;
let activeMilkrunCenterPicker = null;
const MILKRUN_CENTER_PICKER_POPOVER_ID = "milkrun-center-picker-popover";
const ORDER_SKU_PICKER_POPOVER_ID = "order-sku-picker-popover";
const DEFAULT_COUPANG_CENTER_OPTIONS = Array.isArray(window.__FLOWBUTLER_DEFAULT_COUPANG_CENTERS)
    ? [...window.__FLOWBUTLER_DEFAULT_COUPANG_CENTERS]
    : [];
const COUPANG_CENTER_DEFAULT_VERSION = window.__FLOWBUTLER_COUPANG_CENTER_DEFAULT_VERSION || "20260518-coupang-centers-v1";
const COUPANG_CENTER_DEFAULT_SET = new Set(DEFAULT_COUPANG_CENTER_OPTIONS);
const COUPANG_CENTER_STORAGE_KEY = "flowbutler:coupang-center-options";
const COUPANG_CENTER_DEFAULT_VERSION_STORAGE_KEY = `${COUPANG_CENTER_STORAGE_KEY}:default-version`;
let coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
const DEFAULT_MILKRUN_DESTINATION = "남양주시_1-1";

function createMilkrunSampleRow(row) {
    return {
        destination: DEFAULT_MILKRUN_DESTINATION,
        ...row,
    };
}
const MILKRUN_SAMPLE_ROWS = [
    {
        orderId: "129596226",
        dueDate: "20260512",
        originalCenter: "서울",
        assignedCenter: "서울",
        skuCount: 1,
        qty: 36,
        boxCount: 3,
        ptCount: 0.06,
        weight: 18,
    },
    {
        orderId: "130312561",
        dueDate: "20260512",
        originalCenter: "고양1",
        assignedCenter: "고양1",
        skuCount: 1,
        qty: 320,
        boxCount: 32,
        ptCount: 1,
        weight: 438.4,
    },
    {
        orderId: "130312651",
        dueDate: "20260512",
        originalCenter: "동탄1",
        assignedCenter: "동탄1",
        skuCount: 1,
        qty: 320,
        boxCount: 32,
        ptCount: 1,
        weight: 438.4,
    },
    {
        orderId: "130312746",
        dueDate: "20260512",
        originalCenter: "대구7",
        assignedCenter: "대구7",
        skuCount: 1,
        qty: 320,
        boxCount: 32,
        ptCount: 1,
        weight: 438.4,
    },
    {
        orderId: "130313951",
        dueDate: "20260512",
        originalCenter: "인천4",
        assignedCenter: "인천4",
        skuCount: 1,
        qty: 320,
        boxCount: 32,
        ptCount: 1,
        weight: 438.4,
    },
    {
        orderId: "130349486",
        dueDate: "20260512",
        originalCenter: "경기광주3",
        assignedCenter: "경기광주3",
        skuCount: 1,
        qty: 6,
        boxCount: 0.25,
        ptCount: 0.01,
        weight: 2.52,
    },
    {
        orderId: "130349661",
        dueDate: "20260512",
        originalCenter: "대구3",
        assignedCenter: "대구3",
        skuCount: 2,
        qty: 438,
        boxCount: 18.25,
        ptCount: 0.45,
        weight: 192.06,
    },
    {
        orderId: "130350194",
        dueDate: "20260512",
        originalCenter: "이천2",
        assignedCenter: "이천2",
        skuCount: 4,
        qty: 194,
        boxCount: 31.75,
        ptCount: 1.34,
        weight: 418.94,
    },
    {
        orderId: "130351175",
        dueDate: "20260512",
        originalCenter: "전라광주2",
        assignedCenter: "전라광주2",
        skuCount: 1,
        qty: 24,
        boxCount: 1,
        ptCount: 0.03,
        weight: 14.4,
    },
    {
        orderId: "130351402",
        dueDate: "20260512",
        originalCenter: "고양1",
        assignedCenter: "고양1",
        skuCount: 5,
        qty: 670,
        boxCount: 56.83,
        ptCount: 1.66,
        weight: 717.64,
    },
    {
        orderId: "130351787",
        dueDate: "20260512",
        originalCenter: "창원4",
        assignedCenter: "창원4",
        skuCount: 1,
        qty: 12,
        boxCount: 1,
        ptCount: 0.03,
        weight: 10.44,
    },
]
    .map(createMilkrunSampleRow);
const SKU_IMAGE_FIELD_KEY = "productImageUrl";
const SKU_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
let draggingSkuHeaderKey = "";
let draggingSkuHeaderOptionKey = "";
let currentUserPlan = "free";
let currentUserEmail = "";
let navigationEventsBound = false;

function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function hasPaidFeatureAccess() {
    return (currentUserPlan ?? "free") !== "free";
}

function showPaidAccessRequiredMessage(featureName) {
    const message = `${featureName} 기능은 유료 플랜에서만 사용할 수 있습니다.`;
    setTrackingResult(message);
    setManualTrackingResult(message);
    setKurlyLabelResult(message);
    window.alert(message);
}

function updatePaidFeatureLockUi() {
    const locked = !hasPaidFeatureAccess();
    paidFeatureButtons.forEach((button) => {
        button.classList.toggle("is-locked", locked);
    });
    updatePaymentButtonUi();
}

function updatePaymentButtonUi() {
    if (!paymentBtn) return;

    const hasPaidPlan = hasPaidFeatureAccess();
    paymentBtn.disabled = false;
    paymentBtn.textContent = hasPaidPlan ? "기간 연장 결제" : "결제하기";
}

function createTossOrderId() {
    const uidPart = auth.currentUser?.uid?.slice(0, 8) || "guest";
    return `flowbutler-${Date.now()}-${uidPart}`;
}

async function requestTossPayment() {
    if (typeof window.TossPayments !== "function") {
        window.alert("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    const clientKey = tossConfig.clientKey?.trim();
    if (!clientKey || typeof clientKey !== "string") {
        window.alert("toss-config.js 파일에 토스 클라이언트 키를 입력해주세요.");
        return;
    }

    const tossPayments = window.TossPayments(clientKey);
    const customerEmail = currentUserEmail || auth.currentUser?.email || "";
    const customerName = customerEmail ? customerEmail.split("@")[0] : "FlowButler 사용자";
    const orderName = hasPaidFeatureAccess()
        ? `${tossConfig.orderName} 기간 연장`
        : tossConfig.orderName;

    await tossPayments.requestPayment("카드", {
        amount: tossConfig.amount,
        orderId: createTossOrderId(),
        orderName,
        customerName,
        customerEmail,
        successUrl: `${window.location.origin}${tossConfig.successPath}`,
        failUrl: `${window.location.origin}${tossConfig.failPath}`,
    });
}

function handlePaymentReturnMessage() {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (!paymentStatus) return;

    if (paymentStatus === "success") {
        const successMessage = "결제가 완료되었습니다. 관리자 승인 후 유료 플랜이 반영됩니다.";
        setTrackingResult(successMessage);
        window.alert(successMessage);
        return;
    }

    if (paymentStatus === "fail") {
        const failMessage = "결제가 취소되었거나 실패했습니다. 다시 시도해주세요.";
        setTrackingResult(failMessage);
        window.alert(failMessage);
    }
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
    return ["tracking", "label", "sku", "order-upload", "kurly-label", "coupang-milkrun"].includes(viewName);
}

function setSkuResult(message) {
    if (!skuResultEl) return;
    skuResultEl.textContent = message ?? "";
}

function setSkuLabelPrintStatus(message, tone = "info") {
    if (!skuLabelPrintStatus) return;
    const colorMap = {
        info: "#475569",
        success: "#166534",
        error: "#b91c1c",
    };
    skuLabelPrintStatus.textContent = message ?? "";
    skuLabelPrintStatus.style.color = colorMap[tone] ?? colorMap.info;
}

function setKurlyLabelResult(message) {
    if (!kurlyLabelResultEl) return;
    kurlyLabelResultEl.textContent = message ?? "";
}

function setKurlyProgress({
    message = "",
    detail = "",
    value = 0,
    visible = true,
} = {}) {
    const percent = clampProgress(value);

    if (kurlyProgressMessageEl) kurlyProgressMessageEl.textContent = message;
    if (kurlyProgressDetailEl) kurlyProgressDetailEl.textContent = detail;
    if (kurlyProgressBarEl) kurlyProgressBarEl.style.width = `${percent}%`;
    if (kurlyProgressPercentEl) kurlyProgressPercentEl.textContent = `${percent}%`;
    if (kurlyProgressCardEl) {
        kurlyProgressCardEl.classList.toggle("is-hidden", !visible);
        kurlyProgressCardEl.setAttribute("aria-hidden", visible ? "false" : "true");
    }
}

function resetKurlyProgress() {
    setKurlyProgress({
        message: "준비됨",
        detail: "파일 업로드 후 컬리 라벨 PDF 다운로드를 눌러주세요.",
        value: 0,
        visible: false,
    });
}

function getOrderUploadChannelLabel(channel) {
    return channel === "coupang" ? "쿠팡(밀크런)" : "컬리";
}

function getOrderUploadChannelElements(channel) {
    if (channel === "coupang") {
        return {
            statusEl: orderUploadCoupangStatusEl,
        };
    }

    return {
        statusEl: orderUploadKurlyStatusEl,
    };
}

function setOrderUploadChannelStatus(channel, message, tone = "idle") {
    const { statusEl } = getOrderUploadChannelElements(channel);

    if (statusEl) {
        const displayMessage = tone === "error" ? "실패" : (message ?? "");
        statusEl.textContent = displayMessage;
        statusEl.title = message ?? "";
        statusEl.className = `order-upload-simple-status is-${tone}`;
    }
}

function getOrderMatchStorageKey() {
    const userKey = skuWorkspaceUserId || auth.currentUser?.uid || "local";
    return `flowbutler:order-product-matches:${userKey}`;
}

function getOrderProductMatchesDocRef() {
    const userId = skuWorkspaceUserId || auth.currentUser?.uid || "";
    if (!userId) return null;
    return doc(db, "users", userId, "preferences", "orderProductMatches");
}

function loadLocalOrderProductMatches() {
    try {
        const raw = window.localStorage.getItem(getOrderMatchStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        orderProductMatches = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.warn("상품 매칭 정보를 불러오지 못했습니다.", error);
        orderProductMatches = {};
    }
}

function saveLocalOrderProductMatches() {
    try {
        window.localStorage.setItem(getOrderMatchStorageKey(), JSON.stringify(orderProductMatches));
    } catch (error) {
        console.warn("상품 매칭 정보를 저장하지 못했습니다.", error);
    }
}

async function loadOrderProductMatches() {
    loadLocalOrderProductMatches();

    const matchDocRef = getOrderProductMatchesDocRef();
    if (!matchDocRef) {
        renderOrderMatchPanel();
        return;
    }

    try {
        const matchSnap = await getDoc(matchDocRef);
        const firestoreMatches = matchSnap.data()?.matches;
        if (firestoreMatches && typeof firestoreMatches === "object" && !Array.isArray(firestoreMatches)) {
            orderProductMatches = firestoreMatches;
            saveLocalOrderProductMatches();
        }
    } catch (error) {
        console.warn("Firestore 상품 매칭 정보를 불러오지 못했습니다. 로컬 저장값을 사용합니다.", error);
    }

    renderOrderMatchPanel();
}

async function saveOrderProductMatches() {
    saveLocalOrderProductMatches();

    const matchDocRef = getOrderProductMatchesDocRef();
    if (!matchDocRef) return false;

    try {
        await setDoc(
            matchDocRef,
            {
                matches: orderProductMatches,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        return true;
    } catch (error) {
        console.warn("Firestore 상품 매칭 정보 저장에 실패했습니다. 로컬 저장값은 유지됩니다.", error);
        return false;
    }
}

function normalizeOrderProductName(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()[\]{}_\-./]/g, "");
}

function getSkuMatchKey(row) {
    return String(row?.adminProductCode || row?.productName || row?.rowId || "").trim();
}

function getSkuDisplayLabel(row) {
    const productName = String(row?.productName ?? "").trim();
    const adminCode = String(row?.adminProductCode ?? "").trim();
    return adminCode ? `${productName} · ${adminCode}` : productName;
}

function getMatchableSkuRows() {
    return (skuRows ?? []).filter((row) => String(row?.productName ?? "").trim());
}

function getSkuByMatchKey(matchKey) {
    const safeKey = String(matchKey ?? "").trim();
    if (!safeKey) return null;
    return getMatchableSkuRows().find((row) => getSkuMatchKey(row) === safeKey) || null;
}

function getExactSkuNameMatch(productName) {
    const normalizedName = normalizeOrderProductName(productName);
    if (!normalizedName) return null;
    return getMatchableSkuRows().find((row) => normalizeOrderProductName(row.productName) === normalizedName) || null;
}

function getOrderProductNameByMatchKey(matchKey) {
    const matchKeyText = String(matchKey ?? "");
    const product = getUniqueOrderProducts().find((item) => item.matchKey === matchKeyText);
    if (product?.productName) return product.productName;
    const matchRecord = orderProductMatches[matchKeyText];
    return matchRecord?.orderProductName || matchKeyText;
}

function normalizeOrderMatchQuantity(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

function createOrderMatchComponent(skuRow, quantity = 1) {
    return {
        skuKey: getSkuMatchKey(skuRow),
        skuName: skuRow?.productName || "",
        quantity: normalizeOrderMatchQuantity(quantity),
    };
}

function normalizeOrderMatchComponents(matchRecord, { includeIncomplete = false } = {}) {
    if (!matchRecord || typeof matchRecord !== "object") return [];

    const rawComponents = Array.isArray(matchRecord.components)
        ? matchRecord.components
        : (matchRecord.skuKey ? [{
            skuKey: matchRecord.skuKey,
            skuName: matchRecord.skuName || "",
            quantity: 1,
        }] : []);

    return rawComponents
        .map((component) => {
            const skuKey = String(component?.skuKey || "").trim();
            const skuRow = getSkuByMatchKey(skuKey);
            const skuName = String(skuRow?.productName || component?.skuName || "").trim();
            const quantity = normalizeOrderMatchQuantity(component?.quantity);

            return {
                skuKey,
                skuName,
                quantity,
            };
        })
        .filter((component) => includeIncomplete || (component.skuKey && component.quantity > 0));
}

function hasCompleteOrderComponents(components) {
    return Array.isArray(components) &&
        components.length > 0 &&
        components.every((component) => (
            component?.skuKey &&
            getSkuByMatchKey(component.skuKey) &&
            Number(component.quantity) > 0
        ));
}

function getSavedOrderComponents(productName) {
    const normalizedName = normalizeOrderProductName(productName);
    return normalizeOrderMatchComponents(orderProductMatches[normalizedName]);
}

function findSkuByProductNameCandidate(productName) {
    const normalizedName = normalizeOrderProductName(productName);
    if (!normalizedName) return null;
    return getMatchableSkuRows().find((row) => normalizeOrderProductName(row.productName) === normalizedName) || null;
}

function parseOrderProductSegment(segment) {
    const rawName = String(segment ?? "").trim();
    const quantityMatch = rawName.match(/\s*(\d+)\s*(?:개입|입|개|팩|세트)\s*$/i);
    const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1]) || 1) : 1;
    const baseName = quantityMatch
        ? rawName.slice(0, quantityMatch.index).trim()
        : rawName;

    return {
        productName: baseName || rawName,
        quantity,
    };
}

function getAutoOrderComponents(productName) {
    const productNameText = String(productName ?? "").trim();
    if (!productNameText) return [];

    const bundleSegments = productNameText
        .split(/\s*\+\s*/g)
        .map((part) => part.trim())
        .filter(Boolean);

    if (bundleSegments.length > 1) {
        const components = bundleSegments.map((segment) => {
            const parsedSegment = parseOrderProductSegment(segment);
            const skuRow = findSkuByProductNameCandidate(parsedSegment.productName);
            return skuRow ? createOrderMatchComponent(skuRow, parsedSegment.quantity) : null;
        });

        return components.every(Boolean) ? components : [];
    }

    const parsedProduct = parseOrderProductSegment(productNameText);
    const quantitySkuRow = parsedProduct.quantity > 1
        ? findSkuByProductNameCandidate(parsedProduct.productName)
        : null;

    if (quantitySkuRow) {
        return [createOrderMatchComponent(quantitySkuRow, parsedProduct.quantity)];
    }

    const exactSkuRow = getExactSkuNameMatch(productNameText);
    return exactSkuRow ? [createOrderMatchComponent(exactSkuRow, 1)] : [];
}

function getEditableOrderComponents(productName) {
    const matchKey = normalizeOrderProductName(productName);
    if (Array.isArray(orderMatchDraftComponents[matchKey])) {
        return orderMatchDraftComponents[matchKey];
    }

    const matchRecord = orderProductMatches[matchKey];
    const savedComponents = normalizeOrderMatchComponents(matchRecord, { includeIncomplete: true });
    if (savedComponents.length) return savedComponents;

    const autoComponents = getAutoOrderComponents(productName);
    if (autoComponents.length) return autoComponents;

    return [{ skuKey: "", skuName: "", quantity: 1 }];
}

function getResolvedOrderComponents(productName) {
    const matchKey = normalizeOrderProductName(productName);

    if (Array.isArray(orderMatchDraftComponents[matchKey])) {
        return orderMatchDraftComponents[matchKey];
    }

    const savedComponents = getSavedOrderComponents(productName);
    if (savedComponents.length) return savedComponents;

    return getAutoOrderComponents(productName);
}

function hasSavedOrderProductMatch(productName) {
    return hasCompleteOrderComponents(getSavedOrderComponents(productName));
}

function hasCompleteOrderMatch(productName) {
    return hasCompleteOrderComponents(getResolvedOrderComponents(productName));
}

function getOrderMatchStateText(productName) {
    const components = getResolvedOrderComponents(productName);
    if (!hasCompleteOrderComponents(components)) return "매칭 필요";

    const prefix = hasSavedOrderProductMatch(productName) ? "저장된 매칭" : "자동 매칭";
    return components.length > 1 ? `${prefix} ${components.length}개 구성` : prefix;
}

function getOrderMatchComponentSummary(components) {
    return components
        .filter((component) => component?.skuKey)
        .map((component) => `${component.skuName || component.skuKey} x ${normalizeOrderMatchQuantity(component.quantity)}`)
        .join(", ");
}

function saveOrderMatchComponents(matchKey, components) {
    const orderProductName = getOrderProductNameByMatchKey(matchKey);
    const cleanComponents = (components ?? [])
        .map((component) => {
            const skuRow = getSkuByMatchKey(component?.skuKey);
            if (!skuRow) return null;
            return createOrderMatchComponent(skuRow, component.quantity);
        })
        .filter(Boolean);

    if (!cleanComponents.length) {
        delete orderProductMatches[matchKey];
        delete orderMatchDraftComponents[matchKey];
        void saveOrderProductMatches();
        return;
    }

    orderProductMatches[matchKey] = {
        orderProductName,
        components: cleanComponents,
        matchedAt: new Date().toISOString(),
    };
    orderMatchDraftComponents[matchKey] = cleanComponents;
    void saveOrderProductMatches();
}

function getSavedOrderMatchEntries() {
    return Object.entries(orderProductMatches ?? {})
        .map(([matchKey, matchRecord]) => {
            const components = normalizeOrderMatchComponents(matchRecord);
            return {
                matchKey,
                matchRecord,
                components,
            };
        })
        .filter((entry) => entry.components.length > 0)
        .map(({ matchKey, matchRecord, components }) => {
            const orderProductName = String(matchRecord.orderProductName || getOrderProductNameByMatchKey(matchKey) || matchKey).trim();

            return {
                matchKey,
                orderProductName,
                components,
                componentSummary: getOrderMatchComponentSummary(components),
                matchedAt: matchRecord.matchedAt || "",
            };
        })
        .sort((left, right) => left.orderProductName.localeCompare(right.orderProductName, "ko"));
}

function syncOrderMatchDeleteButton() {
    if (!orderMatchDeleteOpenBtn) return;
    orderMatchDeleteOpenBtn.disabled = getSavedOrderMatchEntries().length === 0;
}

function getSkuBySearchValue(value) {
    const safeValue = String(value ?? "").trim();
    if (!safeValue) return null;

    return getMatchableSkuRows().find((row) => (
        getSkuMatchKey(row) === safeValue || getSkuDisplayLabel(row) === safeValue
    )) || null;
}

function getUniqueOrderProducts() {
    const productMap = new Map();

    orderUploadRows
        .filter((row) => row.isValid && row.productName)
        .forEach((row) => {
            const productName = String(row.productName ?? "").trim();
            const matchKey = normalizeOrderProductName(productName);
            if (!matchKey) return;

            if (!productMap.has(matchKey)) {
                productMap.set(matchKey, {
                    matchKey,
                    productName,
                    rowCount: 0,
                    channels: new Set(),
                });
            }

            const item = productMap.get(matchKey);
            item.rowCount += 1;
            item.channels.add(row.channelName || getOrderUploadChannelLabel(row.channel));
        });

    return [...productMap.values()];
}

function renderOrderMatchPanel() {
    if (!orderMatchStatusEl || !orderMatchListEl) return;
    closeOrderSkuPicker({ restoreFocus: false });
    syncOrderMatchDeleteButton();

    const products = getUniqueOrderProducts();
    if (!products.length) {
        orderMatchStatusEl.textContent = "발주서를 업로드하면 매칭이 필요한 상품이 표시됩니다.";
        orderMatchListEl.innerHTML = '<div class="order-match-empty">매칭할 상품이 없습니다.</div>';
        if (orderMatchConfirmBtn) orderMatchConfirmBtn.disabled = true;
        return;
    }

    const skuOptions = getMatchableSkuRows();
    if (!skuOptions.length) {
        orderMatchStatusEl.textContent = "SKU 관리에 등록된 상품이 없습니다.";
        orderMatchListEl.innerHTML = '<div class="order-match-empty">SKU 관리에서 상품을 먼저 등록해주세요.</div>';
        if (orderMatchConfirmBtn) orderMatchConfirmBtn.disabled = true;
        return;
    }

    const openProducts = products.filter((item) => !confirmedOrderMatchKeys.has(item.matchKey));
    const matchedCount = products.filter((item) => hasCompleteOrderMatch(item.productName)).length;
    orderMatchStatusEl.textContent = `총 ${products.length}개 상품 중 ${matchedCount}개 매칭`;

    if (!openProducts.length) {
        orderMatchListEl.innerHTML = '<div class="order-match-empty is-success">상품 매칭 확인이 완료되었습니다.</div>';
        if (orderMatchConfirmBtn) orderMatchConfirmBtn.disabled = true;
        return;
    }

    orderMatchListEl.innerHTML = `
        ${openProducts.map((item) => {
        const components = getEditableOrderComponents(item.productName);
        const hasCompleteMatch = hasCompleteOrderComponents(getResolvedOrderComponents(item.productName));
        const matchStateText = getOrderMatchStateText(item.productName);
        const componentRowsHtml = components.map((component, componentIndex) => {
            const skuRow = component.skuKey ? getSkuByMatchKey(component.skuKey) : null;
            const skuLabel = skuRow ? getSkuDisplayLabel(skuRow) : "";
            return `
            <div class="order-match-component-row">
                <button
                    class="order-match-sku-trigger${skuRow ? " is-selected" : ""}"
                    data-order-match-key="${escapeHtml(item.matchKey)}"
                    data-order-match-index="${componentIndex}"
                    data-order-match-sku-trigger
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                >
                    <span class="order-match-sku-trigger-text">${escapeHtml(skuLabel || "SKU 상품 선택")}</span>
                    <span class="order-match-sku-trigger-chev" aria-hidden="true"></span>
                </button>
                <input
                    class="order-match-quantity-input"
                    data-order-match-key="${escapeHtml(item.matchKey)}"
                    data-order-match-index="${componentIndex}"
                    data-order-match-field="quantity"
                    type="number"
                    min="1"
                    step="1"
                    value="${escapeHtml(normalizeOrderMatchQuantity(component.quantity))}"
                    aria-label="구성 수량"
                />
                <button
                    class="order-match-component-remove-btn"
                    data-order-match-remove-key="${escapeHtml(item.matchKey)}"
                    data-order-match-index="${componentIndex}"
                    type="button"
                    ${components.length <= 1 ? "disabled" : ""}
                >
                    삭제
                </button>
            </div>
            `;
        }).join("");
        return `
        <div class="order-match-item${hasCompleteMatch ? " is-matched" : ""}">
            <div class="order-match-product">
                <strong>${escapeHtml(item.productName)}</strong>
                <span>${escapeHtml([...item.channels].join(", "))} · ${item.rowCount}행 · ${matchStateText}</span>
            </div>
            <div class="order-match-components">
                ${componentRowsHtml}
                <button
                    class="order-match-component-add-btn"
                    data-order-match-add-key="${escapeHtml(item.matchKey)}"
                    type="button"
                >
                    + 구성 추가
                </button>
            </div>
        </div>
        `;
    }).join("")}
    `;

    const hasUnmatched = openProducts.some((item) => !hasCompleteOrderMatch(item.productName));
    if (orderMatchConfirmBtn) orderMatchConfirmBtn.disabled = hasUnmatched;
}

function getOrderSkuPickerOptions(searchTerm = "") {
    const rawTerm = String(searchTerm ?? "").trim().toLowerCase();
    const normalizedTerm = normalizeOrderProductName(rawTerm);
    const skuOptions = getMatchableSkuRows();
    if (!rawTerm && !normalizedTerm) return skuOptions;

    return skuOptions.filter((row) => {
        const productName = String(row?.productName ?? "");
        const adminCode = String(row?.adminProductCode ?? "");
        const displayLabel = getSkuDisplayLabel(row);

        return (
            normalizeOrderProductName(productName).includes(normalizedTerm) ||
            normalizeOrderProductName(displayLabel).includes(normalizedTerm) ||
            adminCode.toLowerCase().includes(rawTerm)
        );
    });
}

function getOrderSkuPickerPopover() {
    let popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);
    if (popover) return popover;

    popover = document.createElement("div");
    popover.id = ORDER_SKU_PICKER_POPOVER_ID;
    popover.className = "order-sku-picker-popover";
    popover.setAttribute("role", "dialog");
    popover.addEventListener("input", handleOrderSkuPickerInput);
    popover.addEventListener("compositionstart", handleOrderSkuPickerCompositionStart);
    popover.addEventListener("compositionend", handleOrderSkuPickerCompositionEnd);
    popover.addEventListener("click", handleOrderSkuPickerClick);
    popover.addEventListener("keydown", handleOrderSkuPickerKeydown);
    document.body.appendChild(popover);
    return popover;
}

function closeOrderSkuPicker(options = {}) {
    const { restoreFocus = true } = options;
    const previousPicker = activeOrderSkuPicker;
    const popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);

    if (previousPicker?.anchorEl) {
        previousPicker.anchorEl.classList.remove("is-open");
        previousPicker.anchorEl.setAttribute("aria-expanded", "false");
        if (restoreFocus && previousPicker.anchorEl.isConnected) {
            previousPicker.anchorEl.focus();
        }
    }

    popover?.remove();
    activeOrderSkuPicker = null;
}

function positionOrderSkuPicker() {
    if (!activeOrderSkuPicker?.anchorEl?.isConnected) {
        closeOrderSkuPicker({ restoreFocus: false });
        return;
    }

    const popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);
    if (!popover) return;

    const anchorRect = activeOrderSkuPicker.anchorEl.getBoundingClientRect();
    if (anchorRect.width === 0 || anchorRect.height === 0) {
        closeOrderSkuPicker({ restoreFocus: false });
        return;
    }

    const margin = 10;
    const width = Math.min(520, Math.max(320, anchorRect.width + 180));
    const availableBelow = window.innerHeight - anchorRect.bottom - margin;
    const availableAbove = anchorRect.top - margin;
    const openAbove = availableBelow < 280 && availableAbove > availableBelow;
    const availableHeight = Math.max(190, Math.min(380, openAbove ? availableAbove : availableBelow));

    popover.style.width = `${Math.min(width, window.innerWidth - (margin * 2))}px`;
    popover.style.setProperty("--order-sku-picker-list-max", `${Math.max(96, availableHeight - 104)}px`);

    const adjustedLeft = Math.min(
        Math.max(anchorRect.left, margin),
        window.innerWidth - Number.parseFloat(popover.style.width) - margin
    );
    popover.style.left = `${adjustedLeft}px`;

    const popoverRect = popover.getBoundingClientRect();
    const adjustedTop = openAbove
        ? Math.max(margin, anchorRect.top - popoverRect.height - 6)
        : Math.min(anchorRect.bottom + 6, window.innerHeight - popoverRect.height - margin);

    popover.style.top = `${adjustedTop}px`;
    popover.classList.toggle("is-above", openAbove);
}

function getOrderSkuPickerOptionList(options) {
    if (!options.length) {
        return '<div class="order-sku-picker-empty">일치하는 상품이 없습니다.</div>';
    }

    const selectedSkuKey = activeOrderSkuPicker?.skuKey || "";
    return options.map((row, index) => {
        const skuKey = getSkuMatchKey(row);
        const selected = skuKey === selectedSkuKey;
        const highlighted = index === activeOrderSkuPicker.highlightedIndex;
        const adminCode = String(row?.adminProductCode ?? "").trim();

        return `
            <button
                class="order-sku-picker-option${selected ? " is-selected" : ""}${highlighted ? " is-active" : ""}"
                data-order-sku-option="${escapeHtml(skuKey)}"
                type="button"
                role="option"
                aria-selected="${selected ? "true" : "false"}"
            >
                <span class="order-sku-picker-option-main">
                    <span class="order-sku-picker-option-name">${escapeHtml(row.productName || skuKey)}</span>
                    ${adminCode ? `<span class="order-sku-picker-option-code">${escapeHtml(adminCode)}</span>` : ""}
                </span>
                ${selected ? '<span class="order-sku-picker-option-tag">선택됨</span>' : ""}
            </button>
        `;
    }).join("");
}

function updateOrderSkuPickerResults() {
    if (!activeOrderSkuPicker) return;

    const popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);
    if (!popover) return;

    const options = getOrderSkuPickerOptions(activeOrderSkuPicker.searchTerm);
    if (activeOrderSkuPicker.highlightedIndex >= options.length) {
        activeOrderSkuPicker.highlightedIndex = Math.max(0, options.length - 1);
    }

    const countEl = popover.querySelector("[data-order-sku-picker-count]");
    if (countEl) countEl.textContent = `${options.length} / ${getMatchableSkuRows().length}`;

    const listEl = popover.querySelector("[data-order-sku-picker-list]");
    if (listEl) listEl.innerHTML = getOrderSkuPickerOptionList(options);

    positionOrderSkuPicker();
    popover.querySelector(".order-sku-picker-option.is-active")?.scrollIntoView({ block: "nearest" });
}

function renderOrderSkuPicker() {
    if (!activeOrderSkuPicker) return;

    const popover = getOrderSkuPickerPopover();
    popover.innerHTML = `
        <div class="order-sku-picker-head">
            <strong>SKU 상품 선택</strong>
            <span data-order-sku-picker-count></span>
        </div>
        <input
            class="order-sku-picker-search"
            data-order-sku-picker-search
            type="search"
            value="${escapeHtml(activeOrderSkuPicker.searchTerm)}"
            placeholder="상품명 / 관리코드 검색"
            autocomplete="off"
        />
        <div class="order-sku-picker-list" data-order-sku-picker-list role="listbox"></div>
    `;

    updateOrderSkuPickerResults();

    const searchInput = popover.querySelector("[data-order-sku-picker-search]");
    if (searchInput instanceof HTMLInputElement) {
        searchInput.focus({ preventScroll: true });
        const caretPosition = searchInput.value.length;
        searchInput.setSelectionRange(caretPosition, caretPosition);
    }
}

function openOrderSkuPicker(trigger) {
    const matchKey = trigger.getAttribute("data-order-match-key") || "";
    const componentIndex = Number(trigger.getAttribute("data-order-match-index") || "0");
    if (!matchKey) return;

    if (
        activeOrderSkuPicker?.matchKey === matchKey &&
        activeOrderSkuPicker?.componentIndex === componentIndex
    ) {
        closeOrderSkuPicker();
        return;
    }

    closeOrderSkuPicker({ restoreFocus: false });

    const components = getEditableOrderComponents(getOrderProductNameByMatchKey(matchKey));
    const skuKey = components[componentIndex]?.skuKey || "";
    const selectedIndex = getMatchableSkuRows().findIndex((row) => getSkuMatchKey(row) === skuKey);

    activeOrderSkuPicker = {
        anchorEl: trigger,
        componentIndex,
        highlightedIndex: selectedIndex >= 0 ? selectedIndex : 0,
        isComposing: false,
        matchKey,
        searchTerm: "",
        skuKey,
    };
    trigger.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    renderOrderSkuPicker();
}

function selectOrderSkuForMatch(skuKey) {
    if (!activeOrderSkuPicker) return;

    const skuRow = getSkuByMatchKey(skuKey);
    if (!skuRow) return;

    const { matchKey, componentIndex } = activeOrderSkuPicker;
    const components = getEditableOrderComponents(getOrderProductNameByMatchKey(matchKey))
        .map((component) => ({ ...component }));

    if (!components[componentIndex]) {
        components[componentIndex] = { skuKey: "", skuName: "", quantity: 1 };
    }

    components[componentIndex] = createOrderMatchComponent(skuRow, components[componentIndex].quantity);
    orderMatchDraftComponents[matchKey] = components;
    confirmedOrderMatchKeys.delete(matchKey);

    if (hasCompleteOrderComponents(components)) {
        saveOrderMatchComponents(matchKey, components);
    }

    closeOrderSkuPicker({ restoreFocus: false });
    renderOrderMatchPanel();
}

function handleOrderSkuPickerInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-sku-picker-search]")) return;
    if (!activeOrderSkuPicker) return;
    if (event.isComposing || activeOrderSkuPicker.isComposing) return;

    activeOrderSkuPicker.searchTerm = target.value;
    activeOrderSkuPicker.highlightedIndex = 0;
    updateOrderSkuPickerResults();
}

function handleOrderSkuPickerCompositionStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-sku-picker-search]")) return;
    if (!activeOrderSkuPicker) return;

    activeOrderSkuPicker.isComposing = true;
}

function handleOrderSkuPickerCompositionEnd(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-sku-picker-search]")) return;
    if (!activeOrderSkuPicker) return;

    activeOrderSkuPicker.isComposing = false;
    activeOrderSkuPicker.searchTerm = target.value;
    activeOrderSkuPicker.highlightedIndex = 0;
    updateOrderSkuPickerResults();
}

function handleOrderSkuPickerClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const option = target.closest("[data-order-sku-option]");
    if (!(option instanceof HTMLButtonElement)) return;

    const skuKey = option.getAttribute("data-order-sku-option") || "";
    selectOrderSkuForMatch(skuKey);
}

function handleOrderSkuPickerKeydown(event) {
    if (!activeOrderSkuPicker) return;

    const options = getOrderSkuPickerOptions(activeOrderSkuPicker.searchTerm);
    if (event.key === "Escape") {
        event.preventDefault();
        closeOrderSkuPicker();
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeOrderSkuPicker.highlightedIndex = options.length
            ? (activeOrderSkuPicker.highlightedIndex + 1) % options.length
            : 0;
        updateOrderSkuPickerResults();
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeOrderSkuPicker.highlightedIndex = options.length
            ? (activeOrderSkuPicker.highlightedIndex - 1 + options.length) % options.length
            : 0;
        updateOrderSkuPickerResults();
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        const nextSku = options[activeOrderSkuPicker.highlightedIndex];
        if (nextSku) selectOrderSkuForMatch(getSkuMatchKey(nextSku));
    }
}

function handleOrderSkuPickerOutsideClick(event) {
    if (!activeOrderSkuPicker) return;
    const target = event.target;
    if (!(target instanceof Node)) return;

    const popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);
    if (popover?.contains(target)) return;
    if (target instanceof HTMLElement && target.closest("[data-order-match-sku-trigger]")) return;
    closeOrderSkuPicker({ restoreFocus: false });
}

function handleOrderSkuPickerViewportChange(event) {
    if (!activeOrderSkuPicker) return;
    const target = event?.target;
    const popover = document.getElementById(ORDER_SKU_PICKER_POPOVER_ID);
    if (target instanceof Node && popover?.contains(target)) return;
    positionOrderSkuPicker();
}

function handleOrderMatchChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-match-key]")) return;

    const matchKey = target.getAttribute("data-order-match-key") || "";
    const field = target.getAttribute("data-order-match-field") || "";
    const componentIndex = Number(target.getAttribute("data-order-match-index") || "0");
    if (!matchKey) return;

    const components = getEditableOrderComponents(getOrderProductNameByMatchKey(matchKey))
        .map((component) => ({ ...component }));

    if (!components[componentIndex]) {
        components[componentIndex] = { skuKey: "", skuName: "", quantity: 1 };
    }

    if (field === "quantity") {
        components[componentIndex].quantity = normalizeOrderMatchQuantity(target.value);
    } else {
        const inputValue = target.value.trim();

        if (!inputValue) {
            components[componentIndex].skuKey = "";
            components[componentIndex].skuName = "";
        } else {
            const skuRow = getSkuBySearchValue(inputValue);
            if (!skuRow) {
                window.alert("SKU 관리에 등록된 상품 중에서 선택해주세요.");
                renderOrderMatchPanel();
                return;
            }

            components[componentIndex] = createOrderMatchComponent(skuRow, components[componentIndex].quantity);
        }
    }

    orderMatchDraftComponents[matchKey] = components;
    confirmedOrderMatchKeys.delete(matchKey);

    if (hasCompleteOrderComponents(components)) {
        saveOrderMatchComponents(matchKey, components);
    } else if (!components.some((component) => component.skuKey)) {
        delete orderProductMatches[matchKey];
        void saveOrderProductMatches();
    }

    renderOrderMatchPanel();
}

function handleOrderMatchClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const skuTrigger = target.closest("[data-order-match-sku-trigger]");
    if (skuTrigger instanceof HTMLButtonElement) {
        event.preventDefault();
        openOrderSkuPicker(skuTrigger);
        return;
    }

    const addButton = target.closest("[data-order-match-add-key]");
    if (addButton instanceof HTMLElement) {
        const matchKey = addButton.getAttribute("data-order-match-add-key") || "";
        if (!matchKey) return;

        const components = getEditableOrderComponents(getOrderProductNameByMatchKey(matchKey))
            .map((component) => ({ ...component }));
        components.push({ skuKey: "", skuName: "", quantity: 1 });
        orderMatchDraftComponents[matchKey] = components;
        confirmedOrderMatchKeys.delete(matchKey);
        renderOrderMatchPanel();
        return;
    }

    const removeButton = target.closest("[data-order-match-remove-key]");
    if (removeButton instanceof HTMLElement) {
        const matchKey = removeButton.getAttribute("data-order-match-remove-key") || "";
        const componentIndex = Number(removeButton.getAttribute("data-order-match-index") || "0");
        if (!matchKey) return;

        const components = getEditableOrderComponents(getOrderProductNameByMatchKey(matchKey))
            .map((component) => ({ ...component }))
            .filter((_, index) => index !== componentIndex);
        const nextComponents = components.length ? components : [{ skuKey: "", skuName: "", quantity: 1 }];

        orderMatchDraftComponents[matchKey] = nextComponents;
        confirmedOrderMatchKeys.delete(matchKey);

        if (hasCompleteOrderComponents(nextComponents)) {
            saveOrderMatchComponents(matchKey, nextComponents);
        } else if (!nextComponents.some((component) => component.skuKey)) {
            delete orderProductMatches[matchKey];
            void saveOrderProductMatches();
        }

        renderOrderMatchPanel();
    }
}

function persistConfirmedOrderMatchIfNeeded(item) {
    const components = getResolvedOrderComponents(item.productName);
    if (!hasCompleteOrderComponents(components)) return false;

    saveOrderMatchComponents(item.matchKey, components);
    confirmedOrderMatchKeys.add(item.matchKey);
    return true;
}

function handleConfirmAllOrderMatches() {
    const products = getUniqueOrderProducts();
    const openProducts = products.filter((item) => !confirmedOrderMatchKeys.has(item.matchKey));
    const unmatchedProducts = openProducts.filter((item) => !hasCompleteOrderMatch(item.productName));

    if (!openProducts.length) return;

    if (unmatchedProducts.length) {
        window.alert(`아직 매칭되지 않은 상품이 ${unmatchedProducts.length}개 있습니다.`);
        return;
    }

    openProducts.forEach((item) => {
        persistConfirmedOrderMatchIfNeeded(item);
    });

    renderOrderMatchPanel();
}

function renderOrderMatchDeleteList() {
    syncOrderMatchDeleteButton();
    if (!orderMatchDeleteListEl) return;

    const entries = getSavedOrderMatchEntries();
    const rawTerm = String(orderMatchDeleteSearchInput?.value || "").trim().toLowerCase();
    const normalizedTerm = normalizeOrderProductName(rawTerm);
    const filteredEntries = entries.filter((entry) => {
        if (!normalizedTerm && !rawTerm) return true;

        return (
            normalizeOrderProductName(entry.orderProductName).includes(normalizedTerm) ||
            normalizeOrderProductName(entry.componentSummary).includes(normalizedTerm) ||
            entry.components.some((component) => (
                normalizeOrderProductName(component.skuName).includes(normalizedTerm) ||
                String(component.skuKey).toLowerCase().includes(rawTerm)
            ))
        );
    });

    if (!entries.length) {
        orderMatchDeleteListEl.innerHTML = '<div class="order-match-delete-empty">저장된 매칭이 없습니다.</div>';
        return;
    }

    if (!filteredEntries.length) {
        orderMatchDeleteListEl.innerHTML = '<div class="order-match-delete-empty">검색 결과가 없습니다.</div>';
        return;
    }

    orderMatchDeleteListEl.innerHTML = filteredEntries.map((entry) => `
        <div class="order-match-delete-item">
            <div class="order-match-delete-main">
                <strong>${escapeHtml(entry.orderProductName)}</strong>
                <span>${escapeHtml(entry.componentSummary)}</span>
            </div>
            <button
                class="order-match-delete-action"
                data-order-match-delete-key="${escapeHtml(entry.matchKey)}"
                type="button"
            >
                삭제
            </button>
        </div>
    `).join("");
}

function openOrderMatchDeleteModal() {
    if (!orderMatchDeleteModal) return;

    if (orderMatchDeleteSearchInput) {
        orderMatchDeleteSearchInput.value = "";
    }

    renderOrderMatchDeleteList();
    orderMatchDeleteModal.classList.remove("is-hidden");
    orderMatchDeleteModal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => orderMatchDeleteSearchInput?.focus(), 0);
}

function closeOrderMatchDeleteModal() {
    if (!orderMatchDeleteModal) return;

    orderMatchDeleteModal.classList.add("is-hidden");
    orderMatchDeleteModal.setAttribute("aria-hidden", "true");
}

function handleOrderMatchDeleteClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteButton = target.closest("[data-order-match-delete-key]");
    if (!(deleteButton instanceof HTMLElement)) return;

    const matchKey = deleteButton.getAttribute("data-order-match-delete-key") || "";
    if (!matchKey) return;

    const orderProductName = getOrderProductNameByMatchKey(matchKey);
    if (!window.confirm(`${orderProductName} 매칭을 삭제할까요?`)) return;

    delete orderProductMatches[matchKey];
    delete orderMatchDraftComponents[matchKey];
    confirmedOrderMatchKeys.delete(matchKey);
    void saveOrderProductMatches();
    renderOrderMatchDeleteList();
    renderOrderMatchPanel();
}

function buildOrderUploadErrorMessage(rows, channelName) {
    const invalidRows = (rows ?? []).filter((row) => !row.isValid);
    if (!invalidRows.length) return "";

    const previewLines = invalidRows
        .slice(0, 5)
        .map((row) => `${row.rowId}행: ${(row.errors ?? []).join(" / ")}`);
    const suffix = invalidRows.length > 5 ? `\n외 ${invalidRows.length - 5}건` : "";

    return `${channelName} 발주서 검증 오류\n${previewLines.join("\n")}${suffix}\n\n파일을 수정한 뒤 다시 업로드해주세요.`;
}

function applyCoupangOrdersToMilkrun(rows) {
    const validRows = (rows ?? []).filter((row) => row.channel === "coupang" && row.isValid);
    milkrunRows = buildMilkrunRowsFromOrderRows(validRows);

    const uploadedCenters = getUniqueMilkrunCenters(validRows.map((row) => row.center));
    const nextCenters = getUniqueMilkrunCenters([...coupangCenterOptions, ...uploadedCenters]);

    if (nextCenters.length !== coupangCenterOptions.length) {
        setMilkrunCenterOptions(nextCenters);
    }

    renderMilkrunDashboard();
}

function applyKurlyOrdersToLabel(validationRows, file) {
    const validRows = (validationRows ?? []).filter((row) => row.isValid);

    kurlyRows = validRows;
    kurlyParsedFileName = file?.name || "";
    updateSelectedFileName(file, kurlyLabelFileNameEl);
    setKurlyLabelResult(`발주서 업로드에서 전달됨: 총 ${validRows.length}건\n컬리 라벨 PDF 다운로드를 눌러 출력할 수 있습니다.`);
    setKurlyProgress({
        message: "업로드/검증 완료",
        detail: `정상 ${validRows.length}건, 라벨 생성 준비 완료`,
        value: 100,
        visible: true,
    });
}

async function setOrderUploadFileSelectedState(channel, file, fileInput = null) {
    const channelLabel = getOrderUploadChannelLabel(channel);

    if (!file) {
        orderUploadRows = orderUploadRows.filter((row) => row.channel !== channel);
        setOrderUploadChannelStatus(channel, "대기 중", "idle");
        renderOrderMatchPanel();
        return;
    }

    try {
        setOrderUploadChannelStatus(channel, "읽는 중", "loading");

        let normalizedRows = [];
        let validationRows = [];

        if (channel === "coupang") {
            normalizedRows = await parseCoupangOrderFile(file);
            validationRows = normalizedRows;
        } else {
            const parsedKurlyRows = await parseKurlyLabelFile(file);
            const validationResult = validateKurlyRows(parsedKurlyRows);
            validationRows = validationResult.rows;
            normalizedRows = buildKurlyOrderRows(validationRows);
        }

        orderUploadRows = [
            ...orderUploadRows.filter((row) => row.channel !== channel),
            ...normalizedRows,
        ];
        normalizedRows.forEach((row) => {
            const matchKey = normalizeOrderProductName(row.productName);
            if (matchKey) confirmedOrderMatchKeys.delete(matchKey);
        });
        renderOrderMatchPanel();

        const total = normalizedRows.length;
        const invalid = normalizedRows.filter((row) => !row.isValid).length;
        const valid = total - invalid;

        if (!total) {
            setOrderUploadChannelStatus(channel, "데이터 없음", "warning");
            return;
        }

        if (invalid > 0) {
            setOrderUploadChannelStatus(channel, `확인 필요 ${invalid}건`, "warning");
            window.alert(buildOrderUploadErrorMessage(normalizedRows, channelLabel));
            return;
        }

        if (channel === "coupang") {
            applyCoupangOrdersToMilkrun(normalizedRows);
            setOrderUploadChannelStatus(channel, `완료 ${valid}건`, "success");
        } else {
            applyKurlyOrdersToLabel(validationRows, file);
            setOrderUploadChannelStatus(channel, `완료 ${valid}건`, "success");
        }
    } catch (error) {
        console.error(error);
        orderUploadRows = orderUploadRows.filter((row) => row.channel !== channel);
        renderOrderMatchPanel();
        setOrderUploadChannelStatus(channel, error.message || "파일 처리 중 오류가 발생했습니다.", "error");
    } finally {
        if (fileInput instanceof HTMLInputElement) {
            fileInput.value = "";
        }
    }
}

function buildKurlyUploadErrorMessage(validationRows) {
    const invalidRows = (validationRows ?? []).filter((row) => !row.isValid);
    if (!invalidRows.length) return "";

    const previewLines = invalidRows
        .slice(0, 5)
        .map((row) => `- ${row.rowId}행: ${(row.errors ?? []).join(", ")}`)
        .join("\n");

    const remainingCount = invalidRows.length - Math.min(invalidRows.length, 5);
    const remainingLine = remainingCount > 0
        ? `\n외 ${remainingCount}건의 오류가 더 있습니다.`
        : "";

    return `컬리 라벨 생성에 실패했습니다.\n오류를 수정한 뒤 다시 업로드해주세요.\n\n${previewLines}${remainingLine}`;
}

async function downloadKurlyLabelPdf(labelItems, options = {}) {
    if (!labelItems.length) {
        setKurlyLabelResult("생성할 라벨이 없습니다.");
        return false;
    }

    const jsPdfLib = window.jspdf?.jsPDF;
    const html2canvasLib = window.html2canvas;
    if (!jsPdfLib || !html2canvasLib) {
        setKurlyLabelResult("PDF 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        return false;
    }

    const doc = new jsPdfLib({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
    });

    const renderLabelNode = (item) => {
        const rows = [
            ["발주코드", item.orderCode],
            ["공급사명", item.supplierName],
            ["상품명", item.productName],
            ["상품코드", item.productCode],
            ["유통기한", item.expiry],
            ["수량/총수량", `박스 내 입수량 (${item.boxPerUnit}) / 총 입고수량 (${item.totalEa})`],
            ["C/T", `박스 번호 (${item.boxNo}) / 전체 박스 수 (${item.totalBoxes})`],
        ];

        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.left = "-10000px";
        wrapper.style.top = "0";
        wrapper.style.width = "1122px"; // A4 landscape @ 96dpi
        wrapper.style.height = "794px";
        wrapper.style.background = "#ffffff";
        wrapper.style.padding = "40px";
        wrapper.style.boxSizing = "border-box";
        wrapper.style.fontFamily = "\"Malgun Gothic\", \"Apple SD Gothic Neo\", sans-serif";

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.height = "100%";
        table.style.borderCollapse = "collapse";
        table.style.tableLayout = "fixed";
        table.style.fontSize = "28px";
        table.style.fontWeight = "700";
        table.style.color = "#111827";

        rows.forEach(([key, value]) => {
            const tr = document.createElement("tr");
            const th = document.createElement("th");
            const td = document.createElement("td");

            th.textContent = String(key ?? "");
            td.textContent = String(value ?? "");

            th.style.width = "200px";
            th.style.border = "2px solid #111827";
            td.style.border = "2px solid #111827";
            th.style.padding = "14px 16px";
            td.style.padding = "14px 16px";
            th.style.textAlign = "left";
            td.style.textAlign = "left";
            th.style.verticalAlign = "middle";
            td.style.verticalAlign = "middle";
            td.style.wordBreak = "break-word";
            td.style.whiteSpace = "pre-wrap";

            tr.appendChild(th);
            tr.appendChild(td);
            table.appendChild(tr);
        });

        wrapper.appendChild(table);
        document.body.appendChild(wrapper);
        return wrapper;
    };

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let index = 0; index < labelItems.length; index += 1) {
        const item = labelItems[index];
        options.onProgress?.({
            step: "render-page",
            current: index + 1,
            total: labelItems.length,
            message: options.message || "PDF 페이지를 생성하는 중입니다...",
            detail: `${index + 1}/${labelItems.length} 페이지 렌더링`,
            percent: Math.round(((index + 1) / labelItems.length) * 100),
        });
        const node = renderLabelNode(item);
        try {
            const canvas = await html2canvasLib(node, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false,
            });
            const imageData = canvas.toDataURL("image/png");
            if (index > 0) doc.addPage("a4", "landscape");
            doc.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
        } finally {
            document.body.removeChild(node);
        }
    }

    return doc.output("blob");
}

function sanitizeFilenamePart(value) {
    return String(value ?? "")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 40) || "미지정센터";
}

function triggerBlobDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
}

async function downloadKurlyLabelByCenter(labelItems) {
    if (!labelItems.length) {
        setKurlyLabelResult("생성할 라벨이 없습니다.");
        return false;
    }

    const grouped = new Map();
    labelItems.forEach((item) => {
        const centerKey = sanitizeFilenamePart(item.center || "미지정센터");
        if (!grouped.has(centerKey)) grouped.set(centerKey, []);
        grouped.get(centerKey).push(item);
    });

    try {
        const today = new Date().toISOString().slice(0, 10);
        const centerEntries = Array.from(grouped.entries());
        setKurlyProgress({
            message: "센터별 파일을 준비하는 중입니다...",
            detail: `총 ${centerEntries.length}개 센터`,
            value: 5,
            visible: true,
        });

        if (centerEntries.length === 1) {
            const [center, items] = centerEntries[0];
            const pdfBlob = await downloadKurlyLabelPdf(items, {
                message: `[${center}] PDF 생성 중`,
                onProgress: ({ detail, percent }) => {
                    setKurlyProgress({
                        message: `[${center}] PDF 생성 중`,
                        detail,
                        value: 10 + Math.round(percent * 0.8),
                        visible: true,
                    });
                },
            });
            triggerBlobDownload(pdfBlob, `컬리_입고라벨_${center}_${today}.pdf`);
            setKurlyProgress({
                message: "다운로드 완료",
                detail: `${center} 센터 PDF 1개를 다운로드했습니다.`,
                value: 100,
                visible: true,
            });
            return true;
        }

        const zipLib = window.JSZip;
        if (!zipLib) {
            setKurlyLabelResult("ZIP 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
            return false;
        }

        const zip = new zipLib();
        for (let i = 0; i < centerEntries.length; i += 1) {
            const [center, items] = centerEntries[i];
            const centerBase = Math.round((i / centerEntries.length) * 80);
            const pdfBlob = await downloadKurlyLabelPdf(items, {
                message: `[${center}] PDF 생성 중`,
                onProgress: ({ detail, percent }) => {
                    setKurlyProgress({
                        message: `[${center}] PDF 생성 중`,
                        detail,
                        value: 10 + centerBase + Math.round((percent / centerEntries.length) * 0.8),
                        visible: true,
                    });
                },
            });
            zip.file(`컬리_입고라벨_${center}_${today}.pdf`, pdfBlob);
        }

        setKurlyProgress({
            message: "센터별 ZIP 파일을 압축하는 중입니다...",
            detail: `${centerEntries.length}개 PDF 압축`,
            value: 92,
            visible: true,
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerBlobDownload(zipBlob, `컬리_입고라벨_${today}_센터별.zip`);
        setKurlyProgress({
            message: "다운로드 완료",
            detail: `센터 ${centerEntries.length}개 파일을 ZIP으로 다운로드했습니다.`,
            value: 100,
            visible: true,
        });
        return true;
    } catch (error) {
        console.error(error);
        setKurlyLabelResult("PDF 저장 중 오류가 발생했습니다. 브라우저 다운로드 설정을 확인해주세요.");
        setKurlyProgress({
            message: "다운로드 실패",
            detail: error?.message || "PDF/ZIP 생성 중 오류가 발생했습니다.",
            value: 100,
            visible: true,
        });
        return false;
    }
}

function getSkuWorkspaceDocRef() {
    if (!skuWorkspaceUserId) return null;
    return doc(db, "users", skuWorkspaceUserId, "preferences", "skuWorkspace");
}

async function persistSkuWorkspace() {
    const workspaceDocRef = getSkuWorkspaceDocRef();
    if (!workspaceDocRef) return false;

    try {
        await setDoc(
            workspaceDocRef,
            {
                selectedSkuHeaderKeys,
                rows: skuRows,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        return true;
    } catch (error) {
        console.error(error);
        if (error?.code === "permission-denied") {
            setSkuResult("SKU 저장 권한이 없습니다. Firestore 보안 규칙을 확인해주세요.");
        } else {
            setSkuResult("SKU 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
        return false;
    }
}

function getLabelTemplateDocRefByUser(userId) {
    if (!userId) return null;
    return doc(db, "users", userId, "preferences", "labelTemplates");
}

async function loadSkuLabelTemplates(userId) {
    const templateDocRef = getLabelTemplateDocRefByUser(userId);
    if (!templateDocRef) return;

    try {
        const templateSnap = await getDoc(templateDocRef);
        const templates = templateSnap.data()?.templates;
        skuLabelTemplates = Array.isArray(templates) ? templates : [];
        renderSkuLabelTemplateOptions();
    } catch (error) {
        console.error(error);
        skuLabelTemplates = [];
        renderSkuLabelTemplateOptions();
    }
}

function renderSkuLabelTemplateOptions(preferredId = "") {
    if (!skuLabelTemplateSelect) return;

    skuLabelTemplateSelect.innerHTML = "";
    if (!skuLabelTemplates.length) {
        skuLabelTemplateSelect.innerHTML = `<option value="">저장된 라벨 양식이 없습니다.</option>`;
        return;
    }

    skuLabelTemplates.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name;
        skuLabelTemplateSelect.appendChild(option);
    });

    skuLabelTemplateSelect.value = preferredId || skuLabelTemplates[0].id;
}

function buildSkuUploadErrorMessage(validationRows) {
    const invalidRows = (validationRows ?? []).filter((row) => !row.isValid);
    if (!invalidRows.length) return "";

    const previewLines = invalidRows
        .slice(0, 5)
        .map((row) => `- ${row.rowId}행: ${(row.errors ?? []).join(", ")}`)
        .join("\n");

    const remainingCount = invalidRows.length - Math.min(invalidRows.length, 5);
    const remainingLine = remainingCount > 0
        ? `\n외 ${remainingCount}건의 오류가 더 있습니다.`
        : "";

    return `SKU 업로드에 실패했습니다.\n오류를 수정한 뒤 다시 업로드해주세요.\n\n${previewLines}${remainingLine}`;
}

function setSkuEmptyTable(message) {
    if (!skuTableBody) return;
    skuTableBody.innerHTML = `
    <tr class="tracking-empty-row">
      <td colspan="${getSkuTableColumnCount()}">${message}</td>
    </tr>
  `;
}

function getSkuTableColumnCount() {
    return 2 + selectedSkuHeaderKeys.length + 4;
}

function getFieldByKey(key) {
    return SKU_FIELDS.find((field) => field.key === key) ?? null;
}

function isSkuImageField(key) {
    return key === SKU_IMAGE_FIELD_KEY;
}

function getDefaultSkuHeaderKeys() {
    return ensureSkuHeaderSelection(["adminProductCode", "productName", "brand", "category", "productImageUrl"]);
}

function ensureSkuHeaderSelection(keys) {
    const availableKeySet = new Set(SKU_FIELDS.map((field) => field.key));
    const orderedKeys = [];

    (keys ?? []).forEach((key) => {
        if (!availableKeySet.has(key) || orderedKeys.includes(key)) return;
        orderedKeys.push(key);
    });

    SKU_REQUIRED_KEYS.forEach((key) => {
        if (!availableKeySet.has(key) || orderedKeys.includes(key)) return;
        orderedKeys.push(key);
    });

    return orderedKeys;
}

function getSkuHeaderConfigOrderKeys() {
    if (!skuHeaderCheckboxList) return [];

    return [...skuHeaderCheckboxList.querySelectorAll("[data-sku-header-option-key]")]
        .map((node) => node.getAttribute("data-sku-header-option-key") || "")
        .filter(Boolean);
}

function getOrderedSkuHeaderFields(orderKeys = []) {
    const fieldsByKey = new Map(SKU_FIELDS.map((field) => [field.key, field]));
    const orderedKeys = [];

    [...orderKeys, ...SKU_FIELDS.map((field) => field.key)].forEach((key) => {
        if (!fieldsByKey.has(key) || orderedKeys.includes(key)) return;
        orderedKeys.push(key);
    });

    return orderedKeys.map((key) => fieldsByKey.get(key)).filter(Boolean);
}

function renderSkuTableHead() {
    if (!skuTableHead) return;

    const headerHtml = selectedSkuHeaderKeys
        .map((key) => {
            const field = getFieldByKey(key);
            return `
              <th class="sku-draggable-header sku-data-column" draggable="true" data-sku-header-key="${key}">
                <span class="sku-draggable-header-label">${escapeHtml(field?.label ?? key)}</span>
              </th>
            `;
        })
        .join("");

    skuTableHead.innerHTML = `
    <tr>
      <th>선택</th>
      <th>행</th>
      ${headerHtml}
      <th>상태</th>
      <th>오류</th>
      <th>수정</th>
      <th>라벨 출력</th>
    </tr>
  `;

    const skuTable = skuTableHead.closest("table");
    if (skuTable instanceof HTMLTableElement) {
        const estimatedWidth = 620 + (selectedSkuHeaderKeys.length * 140);
        skuTable.style.minWidth = `${Math.max(estimatedWidth, 980)}px`;
    }
}

function renderSkuTable(rows) {
    if (!skuTableBody) return;

    if (!rows.length) {
        setSkuEmptyTable("검증 가능한 데이터가 없습니다.");
        return;
    }

    skuTableBody.innerHTML = rows.map((row) => {
        const status = row.isValid ? "정상" : "오류";
        const errorText = row.isValid
            ? "-"
            : (row.errors ?? []).join("; ");
        const columnHtml = selectedSkuHeaderKeys
            .map((key) => `<td class="sku-data-column">${buildSkuCellMarkup(key, row[key])}</td>`)
            .join("");

        return `
      <tr>
        <td><input type="checkbox" data-sku-row-id="${row.rowId}" ${selectedSkuRowIds.has(row.rowId) ? "checked" : ""} /></td>
        <td>${row.rowId}</td>
        ${columnHtml}
        <td>${status}</td>
        <td>${escapeHtml(errorText)}</td>
        <td><button type="button" class="secondary-btn" data-sku-edit-row-id="${row.rowId}">수정</button></td>
        <td><button type="button" class="secondary-btn" data-sku-print-row-id="${row.rowId}">라벨 출력</button></td>
      </tr>
    `;
    }).join("");
}

function isLikelyImageUrl(value) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    return /^https?:\/\//i.test(text) || /^data:image\//i.test(text) || /^blob:/i.test(text);
}

function buildSkuCellMarkup(key, value) {
    const safeValue = String(value ?? "");
    if (!isSkuImageField(key)) {
        return escapeHtml(safeValue);
    }

    if (!safeValue.trim()) {
        return '<span class="sku-image-empty">-</span>';
    }

    if (!isLikelyImageUrl(safeValue)) {
        return `<span title="${escapeHtml(safeValue)}">${escapeHtml(safeValue)}</span>`;
    }

    return `
      <a href="${escapeHtml(safeValue)}" target="_blank" rel="noopener noreferrer" class="sku-image-link">
        <img src="${escapeHtml(safeValue)}" alt="제품 사진" class="sku-product-thumb" loading="lazy" />
      </a>
    `;
}

function renderSkuHeaderCheckboxes(orderKeys = selectedSkuHeaderKeys, selectedKeys = selectedSkuHeaderKeys) {
    if (!skuHeaderCheckboxList) return;

    const requiredKeySet = new Set(SKU_REQUIRED_KEYS);
    const selectedKeySet = new Set(ensureSkuHeaderSelection(selectedKeys));
    const orderedFields = getOrderedSkuHeaderFields(orderKeys);

    skuHeaderCheckboxList.innerHTML = orderedFields.map((field) => {
        const checked = selectedKeySet.has(field.key);
        const disabled = requiredKeySet.has(field.key);
        const requiredBadge = disabled ? " (필수)" : "";

        return `
      <label class="sku-header-checkbox-item" data-sku-header-option-key="${field.key}">
        <span class="sku-header-drag-handle" draggable="true" data-sku-header-drag-handle="true" aria-hidden="true"></span>
        <input type="checkbox" data-sku-header-key="${field.key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
        <span>${escapeHtml(field.label)}${requiredBadge}</span>
      </label>
    `;
    }).join("");
}

function setSkuHeaderCheckboxSelection(keys, options = {}) {
    if (!skuHeaderCheckboxList) return;

    const selectedKeys = ensureSkuHeaderSelection(keys);
    const currentOrderKeys = getSkuHeaderConfigOrderKeys();
    const orderKeys = options.resetOrder ? selectedKeys : currentOrderKeys;

    renderSkuHeaderCheckboxes(orderKeys, selectedKeys);
}

function openSkuHeaderModal() {
    if (!skuHeaderModal) return;
    renderSkuHeaderCheckboxes();
    skuHeaderModal.classList.remove("is-hidden");
    skuHeaderModal.setAttribute("aria-hidden", "false");
}

function closeSkuHeaderModal() {
    if (!skuHeaderModal) return;
    skuHeaderModal.classList.add("is-hidden");
    skuHeaderModal.setAttribute("aria-hidden", "true");
}

function handleApplySkuHeaders() {
    if (!skuHeaderCheckboxList) return;

    const checkedKeys = [...skuHeaderCheckboxList.querySelectorAll('input[data-sku-header-key]:checked')]
        .map((node) => node.getAttribute("data-sku-header-key") || "")
        .filter(Boolean);

    selectedSkuHeaderKeys = ensureSkuHeaderSelection(checkedKeys);
    renderSkuTableHead();

    if (skuRows.length) {
        const validationResult = validateSkuRows(skuRows);
        renderSkuTable(validationResult.rows);
        const { total, valid, invalid } = validationResult.summary;
        setSkuResult(`총 ${total}건 중 정상 ${valid}건, 오류 ${invalid}건`);
    } else {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
    }

    void persistSkuWorkspace();
    closeSkuHeaderModal();
}

function renderCurrentSkuRows() {
    if (!skuRows.length) {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 SKU 데이터가 없습니다.");
        renderOrderMatchPanel();
        return;
    }

    const validationResult = validateSkuRows(skuRows);
    renderSkuTable(validationResult.rows);
    const { total, valid, invalid } = validationResult.summary;
    setSkuResult(`총 ${total}건 중 정상 ${valid}건, 오류 ${invalid}건`);
    renderOrderMatchPanel();
}

function handleSkuRowSelectionChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('input[type="checkbox"][data-sku-row-id]')) return;

    const rowId = Number(target.getAttribute("data-sku-row-id"));
    if (!Number.isFinite(rowId)) return;

    if (target.checked) {
        selectedSkuRowIds.add(rowId);
    } else {
        selectedSkuRowIds.delete(rowId);
    }
}

function handleDeleteSelectedSkuRows() {
    if (!selectedSkuRowIds.size) {
        window.alert("삭제할 SKU를 먼저 선택해주세요.");
        return;
    }

    skuRows = skuRows.filter((row) => !selectedSkuRowIds.has(row.rowId));
    selectedSkuRowIds = new Set();

    if (!skuRows.length) {
        updateSelectedFileName(null, skuFileNameEl);
        setSkuEmptyTable("선택한 SKU를 모두 삭제했습니다. 새 파일을 업로드해주세요.");
        setSkuResult("SKU 목록이 비어 있습니다.");
        renderOrderMatchPanel();
        void persistSkuWorkspace();
        return;
    }

    renderCurrentSkuRows();
    void persistSkuWorkspace();
}

function openSkuEditModal(rowId) {
    const targetRow = skuRows.find((row) => row.rowId === rowId);
    if (!targetRow || !skuEditModal || !skuEditForm) return;

    editingSkuRowId = rowId;
    const editableKeys = ensureSkuHeaderSelection([...selectedSkuHeaderKeys, ...SKU_REQUIRED_KEYS]);

    skuEditForm.innerHTML = editableKeys.map((key) => {
        const field = getFieldByKey(key);
        const value = escapeHtml(targetRow[key] ?? "");
        const imageInputHint = isSkuImageField(key)
            ? `
        <div class="sku-image-edit-controls">
          <input type="file" accept="image/*" data-sku-edit-upload-key="${key}" />
          <small class="subcard-text">이미지 파일을 선택하면 URL 입력칸에 자동으로 반영됩니다. (최대 2MB)</small>
        </div>
      `
            : "";

        return `
      <div class="form-group">
        <label>${escapeHtml(field?.label ?? key)}</label>
        <input type="text" data-sku-edit-key="${key}" value="${value}" />
        ${imageInputHint}
      </div>
    `;
    }).join("");

    skuEditModal.classList.remove("is-hidden");
    skuEditModal.setAttribute("aria-hidden", "false");
}

function closeSkuEditModal() {
    editingSkuRowId = null;
    if (!skuEditModal) return;
    skuEditModal.classList.add("is-hidden");
    skuEditModal.setAttribute("aria-hidden", "true");
}

function openSkuLabelPrintModal(rowId) {
    if (!skuLabelPrintModal) return;
    printingSkuRowId = rowId;
    renderSkuLabelTemplateOptions();
    setSkuLabelPrintStatus("출력할 라벨 양식을 선택해주세요.", "info");
    skuLabelPrintModal.classList.remove("is-hidden");
    skuLabelPrintModal.setAttribute("aria-hidden", "false");
}

function closeSkuLabelPrintModal() {
    printingSkuRowId = null;
    if (!skuLabelPrintModal) return;
    skuLabelPrintModal.classList.add("is-hidden");
    skuLabelPrintModal.setAttribute("aria-hidden", "true");
}

function normalizeLookupToken(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()_\-]/g, "");
}

function buildSkuValueLookup(row) {
    const lookup = new Map();
    SKU_FIELDS.forEach((field) => {
        const fieldValue = String(row?.[field.key] ?? "");
        lookup.set(normalizeLookupToken(field.key), fieldValue);
        lookup.set(normalizeLookupToken(field.label), fieldValue);
    });
    return lookup;
}

function buildPrintMarkup(template, row) {
    const mmToPx = (mm) => Math.round((Number(mm) || 0) * 3.78);
    const snapshot = template?.snapshot ?? {};
    const label = snapshot.label ?? { widthMm: 100, heightMm: 150 };
    const boxes = Array.isArray(snapshot.boxes) ? snapshot.boxes : [];
    const lookup = buildSkuValueLookup(row);

    const boxHtml = boxes.map((box) => {
        const lookupKey = normalizeLookupToken(box.headerName ?? "");
        const mappedValue = lookup.get(lookupKey);
        const text = mappedValue || box.headerName || box.name || "";

        return `
      <div style="
        position:absolute;
        left:${mmToPx(box.x)}px;
        top:${mmToPx(box.y)}px;
        width:${mmToPx(box.width)}px;
        height:${mmToPx(box.height)}px;
        font-size:${box.fontSize || 10}px;
        text-align:${box.textAlign || "left"};
        overflow:hidden;
        line-height:1.2;
      ">${escapeHtml(text)}</div>
    `;
    }).join("");

    return `
    <div style="
      position:relative;
      width:${mmToPx(label.widthMm)}px;
      height:${mmToPx(label.heightMm)}px;
      border:1px solid #cbd5e1;
      box-sizing:border-box;
      background:#fff;
    ">
      ${boxHtml}
    </div>
  `;
}

function handleRunSkuLabelPrint() {
    if (printingSkuRowId === null) return;
    const row = skuRows.find((item) => item.rowId === printingSkuRowId);
    if (!row) {
        setSkuLabelPrintStatus("출력 대상 SKU를 찾을 수 없습니다.", "error");
        return;
    }

    const templateId = skuLabelTemplateSelect?.value || "";
    const template = skuLabelTemplates.find((item) => item.id === templateId);
    if (!template) {
        setSkuLabelPrintStatus("출력할 라벨 양식을 먼저 선택해주세요.", "error");
        return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
        setSkuLabelPrintStatus("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.", "error");
        return;
    }

    const markup = buildPrintMarkup(template, row);
    printWindow.document.write(`
      <html>
        <head><title>SKU 라벨 출력</title></head>
        <body style="margin:20px;font-family:Arial,sans-serif;">${markup}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setSkuLabelPrintStatus("라벨 출력 창을 열었습니다.", "success");
}

function handleSkuTableClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const editButton = target.closest("button[data-sku-edit-row-id]");
    if (editButton instanceof HTMLButtonElement) {
        const rowId = Number(editButton.getAttribute("data-sku-edit-row-id"));
        if (!Number.isFinite(rowId)) return;
        openSkuEditModal(rowId);
        return;
    }

    const printButton = target.closest("button[data-sku-print-row-id]");
    if (printButton instanceof HTMLButtonElement) {
        const rowId = Number(printButton.getAttribute("data-sku-print-row-id"));
        if (!Number.isFinite(rowId)) return;
        openSkuLabelPrintModal(rowId);
    }
}

function handleSaveSkuEdit() {
    if (!skuEditForm || editingSkuRowId === null) return;

    const rowIndex = skuRows.findIndex((row) => row.rowId === editingSkuRowId);
    if (rowIndex < 0) return;

    const nextRow = { ...skuRows[rowIndex] };
    const inputNodes = skuEditForm.querySelectorAll("input[data-sku-edit-key]");
    inputNodes.forEach((node) => {
        if (!(node instanceof HTMLInputElement)) return;
        const key = node.getAttribute("data-sku-edit-key") || "";
        if (!key) return;
        nextRow[key] = node.value.trim();
    });

    const nextRows = [...skuRows];
    nextRows[rowIndex] = nextRow;

    const validationResult = validateSkuRows(nextRows);
    const editedRowValidation = validationResult.rows.find((row) => row.rowId === editingSkuRowId);
    if (editedRowValidation && !editedRowValidation.isValid) {
        window.alert(`수정한 SKU에 오류가 있습니다.\n${(editedRowValidation.errors ?? []).join("\n")}`);
        return;
    }

    skuRows = nextRows;
    renderCurrentSkuRows();
    void persistSkuWorkspace();
    closeSkuEditModal();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
        reader.readAsDataURL(file);
    });
}

async function handleSkuEditFormChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "file") return;

    const key = target.getAttribute("data-sku-edit-upload-key") || "";
    if (!isSkuImageField(key)) return;

    const file = target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        window.alert("이미지 파일만 업로드할 수 있습니다.");
        target.value = "";
        return;
    }

    if (file.size > SKU_IMAGE_MAX_BYTES) {
        window.alert("이미지는 2MB 이하만 업로드할 수 있습니다.");
        target.value = "";
        return;
    }

    try {
        const dataUrl = await readFileAsDataUrl(file);
        const textInput = skuEditForm?.querySelector(`input[data-sku-edit-key="${key}"]`);
        if (textInput instanceof HTMLInputElement) {
            textInput.value = dataUrl;
        }
    } catch (error) {
        console.error(error);
        window.alert("이미지 업로드 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
        target.value = "";
    }
}

function handleSelectAllSkuHeaders() {
    setSkuHeaderCheckboxSelection(SKU_FIELDS.map((field) => field.key));
}

function handleSelectRequiredSkuHeaders() {
    setSkuHeaderCheckboxSelection(SKU_REQUIRED_KEYS);
}

function handleResetSkuHeaders() {
    setSkuHeaderCheckboxSelection(getDefaultSkuHeaderKeys(), { resetOrder: true });
}

function clearSkuHeaderOptionDragClasses() {
    if (!skuHeaderCheckboxList) return;
    skuHeaderCheckboxList.querySelectorAll(".sku-header-checkbox-item").forEach((item) => {
        item.classList.remove("is-dragging", "is-drag-over");
    });
}

function moveSkuHeaderOption(sourceKey, targetKey) {
    if (!skuHeaderCheckboxList || sourceKey === targetKey) return false;

    const items = [...skuHeaderCheckboxList.querySelectorAll("[data-sku-header-option-key]")];
    const sourceItem = items.find((item) => item.getAttribute("data-sku-header-option-key") === sourceKey);
    const targetItem = items.find((item) => item.getAttribute("data-sku-header-option-key") === targetKey);
    const sourceIndex = items.indexOf(sourceItem);
    const targetIndex = items.indexOf(targetItem);

    if (!sourceItem || !targetItem || sourceIndex < 0 || targetIndex < 0) return false;

    if (sourceIndex < targetIndex) {
        targetItem.after(sourceItem);
    } else {
        targetItem.before(sourceItem);
    }

    return true;
}

function handleSkuHeaderOptionDragStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest("[data-sku-header-drag-handle]")) return;

    const item = target.closest("[data-sku-header-option-key]");
    if (!(item instanceof HTMLElement)) return;

    const key = item.getAttribute("data-sku-header-option-key") || "";
    if (!key) return;

    draggingSkuHeaderOptionKey = key;
    item.classList.add("is-dragging");
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
    }
}

function handleSkuHeaderOptionDragOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const item = target.closest("[data-sku-header-option-key]");
    if (!(item instanceof HTMLElement) || !draggingSkuHeaderOptionKey) return;

    event.preventDefault();
    clearSkuHeaderOptionDragClasses();
    item.classList.add("is-drag-over");
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

function handleSkuHeaderOptionDrop(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const item = target.closest("[data-sku-header-option-key]");
    if (!(item instanceof HTMLElement)) return;
    event.preventDefault();

    const targetKey = item.getAttribute("data-sku-header-option-key") || "";
    if (draggingSkuHeaderOptionKey && targetKey) {
        moveSkuHeaderOption(draggingSkuHeaderOptionKey, targetKey);
    }

    draggingSkuHeaderOptionKey = "";
    clearSkuHeaderOptionDragClasses();
}

function handleSkuHeaderOptionDragEnd() {
    draggingSkuHeaderOptionKey = "";
    clearSkuHeaderOptionDragClasses();
}

function clearSkuHeaderDragClasses() {
    if (!skuTableHead) return;
    skuTableHead.querySelectorAll("th.sku-draggable-header").forEach((th) => {
        th.classList.remove("is-dragging", "is-drag-over");
    });
}

function moveSkuHeaderKey(sourceKey, targetKey) {
    const sourceIndex = selectedSkuHeaderKeys.indexOf(sourceKey);
    const targetIndex = selectedSkuHeaderKeys.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

    const nextKeys = [...selectedSkuHeaderKeys];
    const [movedKey] = nextKeys.splice(sourceIndex, 1);
    nextKeys.splice(targetIndex, 0, movedKey);
    selectedSkuHeaderKeys = nextKeys;
    return true;
}

function handleSkuHeaderDragStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const th = target.closest("th[data-sku-header-key]");
    if (!(th instanceof HTMLTableCellElement)) return;

    const key = th.getAttribute("data-sku-header-key") || "";
    if (!key) return;

    draggingSkuHeaderKey = key;
    th.classList.add("is-dragging");
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
    }
}

function handleSkuHeaderDragOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const th = target.closest("th[data-sku-header-key]");
    if (!(th instanceof HTMLTableCellElement) || !draggingSkuHeaderKey) return;

    event.preventDefault();
    clearSkuHeaderDragClasses();
    th.classList.add("is-drag-over");
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

function handleSkuHeaderDrop(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const th = target.closest("th[data-sku-header-key]");
    if (!(th instanceof HTMLTableCellElement)) return;
    event.preventDefault();

    const targetKey = th.getAttribute("data-sku-header-key") || "";
    if (!draggingSkuHeaderKey || !targetKey) {
        clearSkuHeaderDragClasses();
        return;
    }

    const moved = moveSkuHeaderKey(draggingSkuHeaderKey, targetKey);
    clearSkuHeaderDragClasses();
    draggingSkuHeaderKey = "";

    if (!moved) return;

    renderSkuTableHead();
    if (skuRows.length) {
        renderCurrentSkuRows();
    } else {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
    }
    void persistSkuWorkspace();
}

function handleSkuHeaderDragEnd() {
    draggingSkuHeaderKey = "";
    clearSkuHeaderDragClasses();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatMilkrunNumber(value, digits = 0) {
    return Number(value || 0).toLocaleString("ko-KR", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
}

function normalizeMilkrunCenterName(value) {
    return String(value ?? "").trim();
}

function getUniqueMilkrunCenters(centers) {
    return [...new Set((centers ?? []).map(normalizeMilkrunCenterName).filter(Boolean))];
}

function sortMilkrunCenters(centers) {
    return [...centers].sort((a, b) => a.localeCompare(b, "ko-KR", { numeric: true }));
}

function getMilkrunCenterUsageMap() {
    const usageMap = new Map();
    milkrunRows.forEach((row) => {
        const center = row.assignedCenter || row.originalCenter;
        if (!center) return;
        usageMap.set(center, (usageMap.get(center) || 0) + 1);
    });
    return usageMap;
}

function setMilkrunCenterStatus(message = "", type = "info") {
    if (!milkrunCenterStatusEl) return;
    milkrunCenterStatusEl.textContent = message;
    milkrunCenterStatusEl.className = `milkrun-center-status ${message ? "is-visible" : ""} ${type ? `is-${type}` : ""}`.trim();
}

function getMilkrunStorage() {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch (error) {
        console.warn("브라우저 저장소를 사용할 수 없습니다.", error);
        return null;
    }
}

function saveMilkrunCenterOptions() {
    try {
        const storage = getMilkrunStorage();
        storage?.setItem(COUPANG_CENTER_STORAGE_KEY, JSON.stringify(coupangCenterOptions));
        storage?.setItem(COUPANG_CENTER_DEFAULT_VERSION_STORAGE_KEY, COUPANG_CENTER_DEFAULT_VERSION);
    } catch (error) {
        console.warn("쿠팡 센터 목록을 저장하지 못했습니다.", error);
    }
}

function loadMilkrunCenterOptions() {
    try {
        const storage = getMilkrunStorage();
        if (!storage) {
            coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
            return;
        }

        const rawCenters = storage.getItem(COUPANG_CENTER_STORAGE_KEY);
        const parsedCenters = rawCenters ? JSON.parse(rawCenters) : [];
        const savedCenters = Array.isArray(parsedCenters) ? parsedCenters : [];
        const loadedCenters = getUniqueMilkrunCenters(savedCenters);
        const storedDefaultVersion = storage.getItem(COUPANG_CENTER_DEFAULT_VERSION_STORAGE_KEY) || "";

        if (rawCenters === null) {
            coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
            return;
        }

        if (storedDefaultVersion !== COUPANG_CENTER_DEFAULT_VERSION) {
            const customCenters = loadedCenters.filter((center) => !COUPANG_CENTER_DEFAULT_SET.has(center));
            coupangCenterOptions = getUniqueMilkrunCenters([...DEFAULT_COUPANG_CENTER_OPTIONS, ...customCenters]);
            saveMilkrunCenterOptions();
            return;
        }

        coupangCenterOptions = loadedCenters;
    } catch (error) {
        console.warn("쿠팡 센터 목록을 불러오지 못했습니다.", error);
        coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
    }
}

function openMilkrunCenterModal() {
    if (!milkrunCenterModal) return;
    refreshMilkrunCenterUi();
    milkrunCenterModal.classList.remove("is-hidden");
    milkrunCenterModal.setAttribute("aria-hidden", "false");
}

function closeMilkrunCenterModal() {
    if (!milkrunCenterModal) return;
    milkrunCenterModal.classList.add("is-hidden");
    milkrunCenterModal.setAttribute("aria-hidden", "true");
}

function renderMilkrunCenterManager() {
    const usageMap = getMilkrunCenterUsageMap();
    const centerItems = coupangCenterOptions
        .map((center, index) => ({ center, index, usageCount: usageMap.get(center) || 0 }));

    if (milkrunCenterCountLabelEl) {
        milkrunCenterCountLabelEl.textContent = `${coupangCenterOptions.length}개 센터`;
    }
    if (!milkrunCenterListEl) return;

    if (!centerItems.length) {
        milkrunCenterListEl.innerHTML = `
            <div class="milkrun-center-empty">등록된 센터가 없습니다. 위 입력창에서 센터를 추가해주세요.</div>
        `;
        return;
    }

    milkrunCenterListEl.innerHTML = centerItems.map(({ center, index, usageCount }) => `
        <div class="milkrun-center-item">
            <input
                class="milkrun-center-name-input"
                data-milkrun-center-index="${index}"
                type="text"
                value="${escapeHtml(center)}"
                aria-label="센터명 수정"
            />
            <span class="milkrun-center-usage-badge" title="현재 작업판에서 배정된 발주 수">${usageCount}건</span>
            <button class="milkrun-center-remove-btn" data-milkrun-center-remove="${index}" type="button">삭제</button>
        </div>
    `).join("");
}

function refreshMilkrunCenterUi() {
    renderMilkrunCenterManager();
}

function setMilkrunCenterOptions(nextCenters) {
    coupangCenterOptions = getUniqueMilkrunCenters(nextCenters);
    saveMilkrunCenterOptions();
    refreshMilkrunCenterUi();
    renderMilkrunOrders();
}

function addMilkrunCenters(centerNames) {
    const existingCenters = new Set(coupangCenterOptions);
    const duplicateCenters = [];
    const addedCenters = [];

    centerNames.forEach((centerName) => {
        if (existingCenters.has(centerName)) {
            duplicateCenters.push(centerName);
            return;
        }
        existingCenters.add(centerName);
        addedCenters.push(centerName);
    });

    if (!addedCenters.length) {
        setMilkrunCenterStatus(duplicateCenters.length ? "이미 등록된 센터만 입력되었습니다." : "추가할 센터명을 입력해주세요.", "warning");
        return false;
    }

    setMilkrunCenterOptions([...addedCenters, ...coupangCenterOptions]);
    if (milkrunCenterListEl) milkrunCenterListEl.scrollTop = 0;
    setMilkrunCenterStatus(`${addedCenters.length}개 센터를 추가했습니다. 새 센터는 목록 맨 위에 표시됩니다.${duplicateCenters.length ? ` (${duplicateCenters.length}개 중복 제외)` : ""}`, "success");
    return true;
}

function handleAddMilkrunCenter() {
    const centerName = normalizeMilkrunCenterName(milkrunCenterAddInput?.value);
    const centerNames = centerName ? [centerName] : [];
    if (addMilkrunCenters(centerNames) && milkrunCenterAddInput) {
        milkrunCenterAddInput.value = "";
        milkrunCenterAddInput.focus();
    }
}

function handleSortMilkrunCenters() {
    setMilkrunCenterOptions(sortMilkrunCenters(coupangCenterOptions));
    setMilkrunCenterStatus("센터 목록을 가나다순으로 정렬했습니다.", "success");
}

function handleResetMilkrunCenters() {
    const shouldReset = window.confirm("쿠팡 센터 목록을 기본값으로 복원할까요? 직접 추가한 센터 목록은 초기화됩니다.");
    if (!shouldReset) return;
    coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
    saveMilkrunCenterOptions();
    refreshMilkrunCenterUi();
    renderMilkrunOrders();
    setMilkrunCenterStatus("기본 쿠팡 센터 목록으로 복원했습니다.", "success");
}

function handleMilkrunCenterListInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const index = Number(target.getAttribute("data-milkrun-center-index"));
    if (!Number.isInteger(index)) return;

    const oldCenter = coupangCenterOptions[index];
    const nextCenter = normalizeMilkrunCenterName(target.value);
    if (!nextCenter) {
        target.value = oldCenter;
        return;
    }
    if (nextCenter === oldCenter) return;
    if (coupangCenterOptions.some((center, centerIndex) => center === nextCenter && centerIndex !== index)) {
        target.classList.add("is-invalid");
        target.title = "이미 등록된 센터명입니다.";
        setMilkrunCenterStatus("이미 등록된 센터명입니다.", "warning");
        return;
    }

    const nextCenters = [...coupangCenterOptions];
    nextCenters[index] = nextCenter;
    milkrunRows = milkrunRows.map((row) => (
        row.assignedCenter === oldCenter
            ? { ...row, assignedCenter: nextCenter }
            : row
    ));
    target.classList.remove("is-invalid");
    target.title = "";
    setMilkrunCenterOptions(nextCenters);
    renderMilkrunDashboard();
    setMilkrunCenterStatus(`센터명을 ${oldCenter}에서 ${nextCenter}(으)로 변경했습니다.`, "success");
}

function handleMilkrunCenterListClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const removeButton = target.closest("button[data-milkrun-center-remove]");
    if (!(removeButton instanceof HTMLButtonElement)) return;

    const index = Number(removeButton.getAttribute("data-milkrun-center-remove"));
    if (!Number.isInteger(index)) return;
    const centerName = coupangCenterOptions[index];
    const isCenterInUse = milkrunRows.some((row) => (row.assignedCenter || row.originalCenter) === centerName);
    if (isCenterInUse) {
        setMilkrunCenterStatus("현재 작업판에 배정된 센터는 삭제할 수 없습니다.", "warning");
        return;
    }
    setMilkrunCenterOptions(coupangCenterOptions.filter((_, centerIndex) => centerIndex !== index));
    setMilkrunCenterStatus(`${centerName} 센터를 삭제했습니다.`, "success");
}

function getMilkrunSortedRows() {
    return [...milkrunRows].sort((a, b) => {
        const centerCompare = a.assignedCenter.localeCompare(b.assignedCenter, "ko-KR");
        if (centerCompare !== 0) return centerCompare;
        return a.orderId.localeCompare(b.orderId, "ko-KR");
    });
}

function getMilkrunCenterSummaries() {
    const summaryMap = new Map();
    milkrunRows.forEach((row) => {
        const center = row.assignedCenter || row.originalCenter;
        if (!summaryMap.has(center)) {
            summaryMap.set(center, {
                center,
                orderCount: 0,
                skuCount: 0,
                qty: 0,
                boxCount: 0,
                ptCount: 0,
                weight: 0,
                destination: row.destination || "",
            });
        }

        const summary = summaryMap.get(center);
        summary.orderCount += 1;
        summary.skuCount += Number(row.skuCount) || 0;
        summary.qty += Number(row.qty) || 0;
        summary.boxCount += Number(row.boxCount) || 0;
        summary.ptCount += Number(row.ptCount) || 0;
        summary.weight += Number(row.weight) || 0;
        if (!summary.destination && row.destination) summary.destination = row.destination;
    });

    return Array.from(summaryMap.values()).sort((a, b) => a.center.localeCompare(b.center, "ko-KR"));
}

function renderMilkrunSummary() {
    const summaries = getMilkrunCenterSummaries();
    const totalPlt = summaries.reduce((sum, item) => sum + Math.ceil(item.ptCount), 0);
    const totalSku = milkrunRows.reduce((sum, row) => sum + (Number(row.skuCount) || 0), 0);
    const totalWeight = summaries.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);

    if (milkrunCenterCountEl) milkrunCenterCountEl.textContent = formatMilkrunNumber(summaries.length);
    if (milkrunTotalPltEl) milkrunTotalPltEl.textContent = formatMilkrunNumber(totalPlt);
    if (milkrunTotalSkuEl) milkrunTotalSkuEl.textContent = formatMilkrunNumber(totalSku);
    if (milkrunTotalWeightEl) milkrunTotalWeightEl.textContent = formatMilkrunNumber(totalWeight, 1);

    if (!milkrunCenterSummaryBody) return;
    if (!summaries.length) {
        milkrunCenterSummaryBody.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="6">샘플 데이터를 불러오면 센터별 요약이 표시됩니다.</td>
            </tr>
        `;
        return;
    }

    milkrunCenterSummaryBody.innerHTML = summaries.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.center)}</strong></td>
            <td>${formatMilkrunNumber(item.boxCount, 2)}</td>
            <td>${formatMilkrunNumber(item.ptCount, 2)}</td>
            <td>${formatMilkrunNumber(item.skuCount)}</td>
            <td>${formatMilkrunNumber(item.weight, 1)}</td>
            <td>${escapeHtml(item.destination || "-")}</td>
        </tr>
    `).join("") + `
        <tr class="milkrun-total-row">
            <td><strong>총계</strong></td>
            <td>${formatMilkrunNumber(summaries.reduce((sum, item) => sum + item.boxCount, 0), 2)}</td>
            <td>${formatMilkrunNumber(summaries.reduce((sum, item) => sum + item.ptCount, 0), 2)}</td>
            <td>${formatMilkrunNumber(summaries.reduce((sum, item) => sum + item.skuCount, 0))}</td>
            <td>${formatMilkrunNumber(summaries.reduce((sum, item) => sum + item.weight, 0), 1)}</td>
            <td>-</td>
        </tr>
    `;
}

function renderMilkrunOrders() {
    if (!milkrunOrderBody) return;
    closeMilkrunCenterPicker({ restoreFocus: false });
    if (!milkrunRows.length) {
        milkrunOrderBody.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="10">샘플 데이터를 불러오면 발주번호 단위 작업판이 표시됩니다.</td>
            </tr>
        `;
        return;
    }

    milkrunOrderBody.innerHTML = getMilkrunSortedRows().map((row) => {
        const changed = row.assignedCenter !== row.originalCenter;
        const statusClass = changed ? "milkrun-status-changed" : "milkrun-status-keep";
        const statusText = changed ? "센터 변경" : "유지";
        const triggerClass = changed ? "milkrun-center-trigger is-changed" : "milkrun-center-trigger";
        return `
            <tr data-milkrun-order-row="${escapeHtml(row.orderId)}">
                <td><strong>${escapeHtml(row.orderId)}</strong></td>
                <td>${escapeHtml(row.dueDate)}</td>
                <td>${escapeHtml(row.originalCenter)}</td>
                <td>
                    <button
                        class="${triggerClass}"
                        data-milkrun-order-id="${escapeHtml(row.orderId)}"
                        data-milkrun-center-trigger
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                    >
                        <span class="milkrun-center-trigger-text">${escapeHtml(row.assignedCenter)}</span>
                        <span class="milkrun-center-trigger-chev" aria-hidden="true"></span>
                    </button>
                </td>
                <td>${formatMilkrunNumber(row.skuCount)}</td>
                <td>${formatMilkrunNumber(row.qty)}</td>
                <td>${formatMilkrunNumber(row.boxCount, 2)}</td>
                <td>${formatMilkrunNumber(row.ptCount, 2)}</td>
                <td>${formatMilkrunNumber(row.weight, 1)}</td>
                <td><span class="milkrun-status ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join("");
}

function renderMilkrunDashboard() {
    renderMilkrunSummary();
    renderMilkrunOrders();
}

function loadMilkrunSampleRows() {
    milkrunRows = MILKRUN_SAMPLE_ROWS.map((row) => ({ ...row }));
    renderMilkrunDashboard();
}

function getMilkrunRowByOrderId(orderId) {
    return milkrunRows.find((row) => row.orderId === orderId) || null;
}

function getMilkrunCenterPickerOptions(searchTerm = "") {
    const normalizedTerm = normalizeMilkrunCenterName(searchTerm).toLocaleLowerCase("ko-KR");
    if (!normalizedTerm) return coupangCenterOptions;
    return coupangCenterOptions.filter((center) => (
        center.toLocaleLowerCase("ko-KR").includes(normalizedTerm)
    ));
}

function getMilkrunCenterPickerPopover() {
    let popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);
    if (popover) return popover;

    popover = document.createElement("div");
    popover.id = MILKRUN_CENTER_PICKER_POPOVER_ID;
    popover.className = "milkrun-center-picker-popover";
    popover.setAttribute("role", "dialog");
    popover.addEventListener("input", handleMilkrunCenterPickerInput);
    popover.addEventListener("compositionstart", handleMilkrunCenterPickerCompositionStart);
    popover.addEventListener("compositionend", handleMilkrunCenterPickerCompositionEnd);
    popover.addEventListener("click", handleMilkrunCenterPickerClick);
    popover.addEventListener("keydown", handleMilkrunCenterPickerKeydown);
    document.body.appendChild(popover);
    return popover;
}

function closeMilkrunCenterPicker(options = {}) {
    const { restoreFocus = true } = options;
    const previousPicker = activeMilkrunCenterPicker;
    const popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);

    if (previousPicker?.anchorEl) {
        previousPicker.anchorEl.classList.remove("is-open");
        previousPicker.anchorEl.setAttribute("aria-expanded", "false");
        if (restoreFocus && previousPicker.anchorEl.isConnected) {
            previousPicker.anchorEl.focus();
        }
    }
    popover?.remove();
    activeMilkrunCenterPicker = null;
}

function positionMilkrunCenterPicker() {
    if (!activeMilkrunCenterPicker?.anchorEl?.isConnected) {
        closeMilkrunCenterPicker({ restoreFocus: false });
        return;
    }

    const popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);
    if (!popover) return;

    const anchorRect = activeMilkrunCenterPicker.anchorEl.getBoundingClientRect();
    if (anchorRect.width === 0 || anchorRect.height === 0) {
        closeMilkrunCenterPicker({ restoreFocus: false });
        return;
    }

    const margin = 10;
    const width = Math.min(320, Math.max(260, anchorRect.width + 84));
    const availableBelow = window.innerHeight - anchorRect.bottom - margin;
    const availableAbove = anchorRect.top - margin;
    const openAbove = availableBelow < 250 && availableAbove > availableBelow;
    const availableHeight = Math.max(168, Math.min(320, openAbove ? availableAbove : availableBelow));

    popover.style.width = `${width}px`;
    popover.style.setProperty("--milkrun-picker-list-max", `${Math.max(88, availableHeight - 100)}px`);

    const adjustedLeft = Math.min(
        Math.max(anchorRect.left, margin),
        window.innerWidth - width - margin
    );
    popover.style.left = `${adjustedLeft}px`;

    const popoverRect = popover.getBoundingClientRect();
    const adjustedTop = openAbove
        ? Math.max(margin, anchorRect.top - popoverRect.height - 6)
        : Math.min(anchorRect.bottom + 6, window.innerHeight - popoverRect.height - margin);

    popover.style.top = `${adjustedTop}px`;
    popover.classList.toggle("is-above", openAbove);
}

function getMilkrunCenterPickerOptionList(row, options) {
    if (!options.length) {
        return '<div class="milkrun-center-picker-empty">일치하는 센터가 없습니다.</div>';
    }

    return options.map((center, index) => {
        const selected = center === row.assignedCenter;
        const highlighted = index === activeMilkrunCenterPicker.highlightedIndex;
        const tag = selected ? "선택됨" : center === row.originalCenter ? "기존" : "";
        return `
            <button
                class="milkrun-center-picker-option${selected ? " is-selected" : ""}${highlighted ? " is-active" : ""}"
                data-milkrun-center-option="${escapeHtml(center)}"
                type="button"
                role="option"
                aria-selected="${selected ? "true" : "false"}"
            >
                <span class="milkrun-center-picker-option-name">${escapeHtml(center)}</span>
                ${tag ? `<span class="milkrun-center-picker-option-tag">${tag}</span>` : ""}
            </button>
        `;
    }).join("");
}

function updateMilkrunCenterPickerResults() {
    if (!activeMilkrunCenterPicker) return;

    const popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);
    const row = getMilkrunRowByOrderId(activeMilkrunCenterPicker.orderId);
    if (!popover || !row) {
        closeMilkrunCenterPicker({ restoreFocus: false });
        return;
    }

    const options = getMilkrunCenterPickerOptions(activeMilkrunCenterPicker.searchTerm);
    if (activeMilkrunCenterPicker.highlightedIndex >= options.length) {
        activeMilkrunCenterPicker.highlightedIndex = Math.max(0, options.length - 1);
    }

    const countEl = popover.querySelector("[data-milkrun-center-picker-count]");
    if (countEl) countEl.textContent = `${options.length} / ${coupangCenterOptions.length}`;

    const listEl = popover.querySelector("[data-milkrun-center-picker-list]");
    if (listEl) listEl.innerHTML = getMilkrunCenterPickerOptionList(row, options);

    positionMilkrunCenterPicker();
    popover.querySelector(".milkrun-center-picker-option.is-active")?.scrollIntoView({ block: "nearest" });
}

function renderMilkrunCenterPicker() {
    if (!activeMilkrunCenterPicker) return;

    const popover = getMilkrunCenterPickerPopover();
    const row = getMilkrunRowByOrderId(activeMilkrunCenterPicker.orderId);
    if (!row) {
        closeMilkrunCenterPicker({ restoreFocus: false });
        return;
    }

    popover.innerHTML = `
        <div class="milkrun-center-picker-head">
            <strong>센터 선택</strong>
            <span data-milkrun-center-picker-count></span>
        </div>
        <input
            class="milkrun-center-picker-search"
            data-milkrun-center-picker-search
            type="search"
            value="${escapeHtml(activeMilkrunCenterPicker.searchTerm)}"
            placeholder="센터명 검색"
            autocomplete="off"
        />
        <div class="milkrun-center-picker-list" data-milkrun-center-picker-list role="listbox"></div>
    `;

    updateMilkrunCenterPickerResults();

    const searchInput = popover.querySelector("[data-milkrun-center-picker-search]");
    if (searchInput instanceof HTMLInputElement) {
        searchInput.focus({ preventScroll: true });
        const caretPosition = searchInput.value.length;
        searchInput.setSelectionRange(caretPosition, caretPosition);
    }
}

function openMilkrunCenterPicker(trigger) {
    const orderId = trigger.getAttribute("data-milkrun-order-id");
    const row = orderId ? getMilkrunRowByOrderId(orderId) : null;
    if (!orderId || !row) return;

    if (activeMilkrunCenterPicker?.orderId === orderId) {
        closeMilkrunCenterPicker();
        return;
    }

    closeMilkrunCenterPicker({ restoreFocus: false });
    const selectedIndex = coupangCenterOptions.indexOf(row.assignedCenter);
    activeMilkrunCenterPicker = {
        anchorEl: trigger,
        highlightedIndex: selectedIndex >= 0 ? selectedIndex : 0,
        isComposing: false,
        orderId,
        searchTerm: "",
    };
    trigger.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    renderMilkrunCenterPicker();
}

function selectMilkrunCenterForOrder(orderId, nextCenter) {
    if (!orderId || !coupangCenterOptions.includes(nextCenter)) return;

    milkrunRows = milkrunRows.map((row) => (
        row.orderId === orderId
            ? { ...row, assignedCenter: nextCenter }
            : row
    ));
    closeMilkrunCenterPicker({ restoreFocus: false });
    renderMilkrunDashboard();
}

function handleMilkrunOrderClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const trigger = target.closest("[data-milkrun-center-trigger]");
    if (!(trigger instanceof HTMLButtonElement)) return;

    event.preventDefault();
    openMilkrunCenterPicker(trigger);
}

function handleMilkrunCenterPickerInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-milkrun-center-picker-search]")) return;
    if (!activeMilkrunCenterPicker) return;
    if (event.isComposing || activeMilkrunCenterPicker.isComposing) return;

    activeMilkrunCenterPicker.searchTerm = target.value;
    activeMilkrunCenterPicker.highlightedIndex = 0;
    updateMilkrunCenterPickerResults();
}

function handleMilkrunCenterPickerCompositionStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-milkrun-center-picker-search]")) return;
    if (!activeMilkrunCenterPicker) return;

    activeMilkrunCenterPicker.isComposing = true;
}

function handleMilkrunCenterPickerCompositionEnd(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-milkrun-center-picker-search]")) return;
    if (!activeMilkrunCenterPicker) return;

    activeMilkrunCenterPicker.isComposing = false;
    activeMilkrunCenterPicker.searchTerm = target.value;
    activeMilkrunCenterPicker.highlightedIndex = 0;
    updateMilkrunCenterPickerResults();
}

function handleMilkrunCenterPickerClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const option = target.closest("[data-milkrun-center-option]");
    if (!(option instanceof HTMLButtonElement) || !activeMilkrunCenterPicker) return;

    const nextCenter = option.getAttribute("data-milkrun-center-option") || "";
    selectMilkrunCenterForOrder(activeMilkrunCenterPicker.orderId, nextCenter);
}

function handleMilkrunCenterPickerKeydown(event) {
    if (!activeMilkrunCenterPicker) return;

    const options = getMilkrunCenterPickerOptions(activeMilkrunCenterPicker.searchTerm);
    if (event.key === "Escape") {
        event.preventDefault();
        closeMilkrunCenterPicker();
        return;
    }
    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeMilkrunCenterPicker.highlightedIndex = options.length
            ? (activeMilkrunCenterPicker.highlightedIndex + 1) % options.length
            : 0;
        updateMilkrunCenterPickerResults();
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeMilkrunCenterPicker.highlightedIndex = options.length
            ? (activeMilkrunCenterPicker.highlightedIndex - 1 + options.length) % options.length
            : 0;
        updateMilkrunCenterPickerResults();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        const nextCenter = options[activeMilkrunCenterPicker.highlightedIndex];
        if (nextCenter) selectMilkrunCenterForOrder(activeMilkrunCenterPicker.orderId, nextCenter);
    }
}

function handleMilkrunCenterPickerOutsideClick(event) {
    if (!activeMilkrunCenterPicker) return;
    const target = event.target;
    if (!(target instanceof Node)) return;

    const popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);
    if (popover?.contains(target)) return;
    if (target instanceof HTMLElement && target.closest("[data-milkrun-center-trigger]")) return;
    closeMilkrunCenterPicker({ restoreFocus: false });
}

function handleMilkrunCenterPickerViewportChange(event) {
    if (!activeMilkrunCenterPicker) return;
    const target = event?.target;
    const popover = document.getElementById(MILKRUN_CENTER_PICKER_POPOVER_ID);
    if (target instanceof Node && popover?.contains(target)) return;
    positionMilkrunCenterPicker();
}


function showView(viewName) {
    const paidOnlyViewNames = {
        tracking: "송장번호 Tracking",
        "kurly-label": "컬리 라벨 생성",
        "coupang-milkrun": "쿠팡 밀크런 도우미",
    };
    if (paidOnlyViewNames[viewName] && !hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage(paidOnlyViewNames[viewName]);
        viewName = "home";
    }

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

    if (headerActionsEl) {
        headerActionsEl.hidden = viewName !== "home";
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

        mergedRows = applyTrackingResults(mergedRows, apiResult.data, {
            trackingNumbers: payload.trackingNumbers,
        });

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

async function setSkuFileSelectedState(file) {
    if (!file) {
        skuRows = [];
        selectedSkuRowIds = new Set();
        closeSkuEditModal();
        updateSelectedFileName(null, skuFileNameEl);
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 파일이 없습니다.");
        renderOrderMatchPanel();
        return;
    }

    try {
        const parsedRows = await parseSkuFile(file);
        const validationResult = validateSkuRows(parsedRows);
        const { total, valid, invalid } = validationResult.summary;

        if (invalid > 0) {
            if (!skuRows.length) {
                setSkuEmptyTable("오류가 있는 파일은 업로드되지 않습니다. 파일을 수정한 뒤 다시 시도해주세요.");
            }
            setSkuResult(`업로드 실패: 총 ${total}건 중 오류 ${invalid}건`);
            window.alert(buildSkuUploadErrorMessage(validationResult.rows));
            return;
        }

        skuRows = parsedRows;
        selectedSkuRowIds = new Set();
        closeSkuEditModal();
        updateSelectedFileName(file, skuFileNameEl);
        renderSkuTable(validationResult.rows);
        setSkuResult(`업로드 완료: 총 ${total}건 (정상 ${valid}건)`);
        renderOrderMatchPanel();
        await persistSkuWorkspace();
    } catch (error) {
        console.error(error);
        if (!skuRows.length) {
            setSkuEmptyTable("파일을 불러오지 못했습니다.");
        }
        setSkuResult(error.message || "파일 처리 중 오류가 발생했습니다.");
        window.alert("SKU 파일을 업로드할 수 없습니다.\n파일 형식과 내용을 확인해주세요.");
    }
}

async function setKurlyFileSelectedState(file) {
    if (!file) {
        kurlyRows = [];
        kurlyParsedFileName = "";
        updateSelectedFileName(null, kurlyLabelFileNameEl);
        setKurlyLabelResult("선택된 파일이 없습니다.");
        resetKurlyProgress();
        return;
    }

    try {
        setKurlyProgress({
            message: "엑셀 파일을 읽는 중입니다...",
            detail: `${file.name}`,
            value: 15,
            visible: true,
        });
        const parsedRows = await parseKurlyLabelFile(file);
        setKurlyProgress({
            message: "데이터를 검증하는 중입니다...",
            detail: `${parsedRows.length}건 검증`,
            value: 45,
            visible: true,
        });
        const validationResult = validateKurlyRows(parsedRows);
        const { total, valid, invalid } = validationResult.summary;

        if (!total) {
            kurlyRows = [];
            kurlyParsedFileName = "";
            updateSelectedFileName(file, kurlyLabelFileNameEl);
            setKurlyLabelResult("파일은 읽었지만 처리할 데이터가 없습니다.");
            setKurlyProgress({
                message: "처리할 데이터 없음",
                detail: "업로드 파일의 본문 데이터가 비어 있습니다.",
                value: 100,
                visible: true,
            });
            return;
        }

        if (invalid > 0) {
            kurlyRows = [];
            kurlyParsedFileName = "";
            updateSelectedFileName(file, kurlyLabelFileNameEl);
            setKurlyLabelResult(`업로드 실패: 총 ${total}건 중 오류 ${invalid}건`);
            window.alert(buildKurlyUploadErrorMessage(validationResult.rows));
            setKurlyProgress({
                message: "검증 실패",
                detail: `오류 ${invalid}건`,
                value: 100,
                visible: true,
            });
            return;
        }

        kurlyRows = validationResult.rows;
        kurlyParsedFileName = file.name;
        updateSelectedFileName(file, kurlyLabelFileNameEl);
        setKurlyLabelResult(`업로드 완료: 총 ${total}건 (정상 ${valid}건)\n마스터코드 값이 라벨 상품코드로 사용됩니다.`);
        setKurlyProgress({
            message: "업로드/검증 완료",
            detail: `정상 ${valid}건, 다운로드 준비 완료`,
            value: 100,
            visible: true,
        });
    } catch (error) {
        console.error(error);
        kurlyRows = [];
        kurlyParsedFileName = "";
        updateSelectedFileName(file, kurlyLabelFileNameEl);
        setKurlyLabelResult(error.message || "컬리 라벨 파일 처리 중 오류가 발생했습니다.");
        setKurlyProgress({
            message: "파일 처리 실패",
            detail: error.message || "엑셀 파싱 중 오류",
            value: 100,
            visible: true,
        });
    }
}

async function handleGenerateKurlyLabels() {
    if (!hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage("컬리 라벨 생성");
        return;
    }

    if (!kurlyRows.length) {
        setKurlyLabelResult("먼저 컬리 라벨 파일을 업로드해주세요.");
        return;
    }

    const validRows = kurlyRows.filter((row) => row.isValid);
    const labelItems = buildKurlyLabelItems(validRows);
    if (!labelItems.length) {
        setKurlyLabelResult("생성 가능한 라벨이 없습니다.");
        return;
    }

    setKurlyProgress({
        message: "라벨 데이터를 정리하는 중입니다...",
        detail: `${validRows.length}행 / ${labelItems.length}라벨`,
        value: 5,
        visible: true,
    });

    const downloaded = await downloadKurlyLabelByCenter(labelItems);
    if (!downloaded) return;

    const centerCount = new Set(labelItems.map((item) => item.center || "미지정센터")).size;
    setKurlyLabelResult(
        `다운로드 완료: ${kurlyParsedFileName || "업로드 파일"} 기준 ${validRows.length}행, 총 ${labelItems.length}장, 센터 ${centerCount}개`
    );
}

async function handleTrackingRun() {
    if (!hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage("송장번호 Tracking");
        return;
    }

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
            setTrackingResult("한 번에 최대 2,000건까지 조회할 수 있습니다.");
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
    if (!hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage("송장번호 Tracking");
        return;
    }

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
            setManualTrackingResult("한 번에 최대 2,000건까지 조회할 수 있습니다.");
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

    const status = String(userData.status ?? "").trim().toLowerCase() || (userData.approved === true ? "approved" : "pending");

    if (status !== "approved") {
        window.location.href = "./pending.html";
        return;
    }

    const plan = userData.plan ?? "free";
    const role = userData.role ?? "user";
    currentUserPlan = plan;
    currentUserEmail = user.email ?? "";
    updatePaidFeatureLockUi();

    const planLabel = plan === "paid" ? "유료" : "무료";
    const roleLabel = role === "admin" ? "관리자" : (role === "manager" ? "매니저" : "일반 사용자");

    dashboardUserInfoEl.textContent = `계정: ${user.email}`;
    dashboardPlanInfoEl.textContent = `플랜: ${planLabel}`;
    dashboardRoleInfoEl.textContent = `권한: ${roleLabel}`;

    if (settingsUserEmailEl) settingsUserEmailEl.textContent = user.email;
    if (settingsUserPlanEl) settingsUserPlanEl.textContent = planLabel;
    if (settingsUserRoleEl) settingsUserRoleEl.textContent = roleLabel;
}

function bindNavigationEvents() {
    if (navigationEventsBound) return;
    navigationEventsBound = true;

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

    headerQuickViewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const viewName = button.dataset.quickView;
            if (!viewName) return;
            showView(viewName);
        });
    });
}

function bindEvents() {
    bindNavigationEvents();
    trackingNumberInput?.addEventListener("input", updateManualCountInfo);

    manualClearBtn?.addEventListener("click", () => {
        if (trackingNumberInput) trackingNumberInput.value = "";
        updateManualCountInfo();
        clearManualResultScreen();
    });

    logoutBtn?.addEventListener("click", async () => {
        try {
            await persistSkuWorkspace();
            await signOut(auth);
            window.location.href = "./login.html";
        } catch (error) {
            console.error(error);
            dashboardUserInfoEl.textContent = "로그아웃 중 오류가 발생했습니다.";
        }
    });

    paymentBtn?.addEventListener("click", async () => {
        try {
            await requestTossPayment();
        } catch (error) {
            console.error(error);
            window.alert("결제 요청 중 오류가 발생했습니다.");
        }
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
    skuFileInput?.addEventListener("change", async () => {
        const file = skuFileInput.files?.[0];
        await setSkuFileSelectedState(file);
    });
    orderUploadCoupangFileInput?.addEventListener("change", async () => {
        const file = orderUploadCoupangFileInput.files?.[0];
        await setOrderUploadFileSelectedState("coupang", file, orderUploadCoupangFileInput);
    });
    orderUploadKurlyFileInput?.addEventListener("change", async () => {
        const file = orderUploadKurlyFileInput.files?.[0];
        await setOrderUploadFileSelectedState("kurly", file, orderUploadKurlyFileInput);
    });
    orderMatchListEl?.addEventListener("change", handleOrderMatchChange);
    orderMatchListEl?.addEventListener("click", handleOrderMatchClick);
    orderMatchConfirmBtn?.addEventListener("click", handleConfirmAllOrderMatches);
    orderMatchDeleteOpenBtn?.addEventListener("click", openOrderMatchDeleteModal);
    orderMatchDeleteCloseBtn?.addEventListener("click", closeOrderMatchDeleteModal);
    orderMatchDeleteSearchInput?.addEventListener("input", renderOrderMatchDeleteList);
    orderMatchDeleteListEl?.addEventListener("click", handleOrderMatchDeleteClick);
    orderMatchDeleteModal?.addEventListener("click", (event) => {
        if (event.target === orderMatchDeleteModal) closeOrderMatchDeleteModal();
    });
    document.addEventListener("click", handleOrderSkuPickerOutsideClick);
    document.addEventListener("scroll", handleOrderSkuPickerViewportChange, true);
    window.addEventListener("resize", handleOrderSkuPickerViewportChange);
    kurlyLabelFileInput?.addEventListener("change", async () => {
        const file = kurlyLabelFileInput.files?.[0];
        await setKurlyFileSelectedState(file);
    });
    skuTableBody?.addEventListener("change", handleSkuRowSelectionChange);
    skuTableBody?.addEventListener("click", handleSkuTableClick);

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
    skuHeaderConfigBtn?.addEventListener("click", openSkuHeaderModal);
    skuDeleteSelectedBtn?.addEventListener("click", handleDeleteSelectedSkuRows);
    skuHeaderApplyBtn?.addEventListener("click", handleApplySkuHeaders);
    skuHeaderCancelBtn?.addEventListener("click", closeSkuHeaderModal);
    skuHeaderSelectAllBtn?.addEventListener("click", handleSelectAllSkuHeaders);
    skuHeaderRequiredBtn?.addEventListener("click", handleSelectRequiredSkuHeaders);
    skuHeaderResetBtn?.addEventListener("click", handleResetSkuHeaders);
    skuHeaderCheckboxList?.addEventListener("dragstart", handleSkuHeaderOptionDragStart);
    skuHeaderCheckboxList?.addEventListener("dragover", handleSkuHeaderOptionDragOver);
    skuHeaderCheckboxList?.addEventListener("drop", handleSkuHeaderOptionDrop);
    skuHeaderCheckboxList?.addEventListener("dragend", handleSkuHeaderOptionDragEnd);
    skuEditSaveBtn?.addEventListener("click", handleSaveSkuEdit);
    skuEditForm?.addEventListener("change", (event) => {
        void handleSkuEditFormChange(event);
    });
    skuEditCancelBtn?.addEventListener("click", closeSkuEditModal);
    skuLabelPrintRunBtn?.addEventListener("click", handleRunSkuLabelPrint);
    skuLabelPrintCancelBtn?.addEventListener("click", closeSkuLabelPrintModal);
    kurlyLabelGenerateBtn?.addEventListener("click", handleGenerateKurlyLabels);
    milkrunLoadSampleBtn?.addEventListener("click", loadMilkrunSampleRows);
    milkrunSortCenterBtn?.addEventListener("click", renderMilkrunDashboard);
    milkrunCenterToggleBtn?.addEventListener("click", openMilkrunCenterModal);
    milkrunCenterCloseBtn?.addEventListener("click", closeMilkrunCenterModal);
    milkrunCenterAddBtn?.addEventListener("click", handleAddMilkrunCenter);
    milkrunCenterSortBtn?.addEventListener("click", handleSortMilkrunCenters);
    milkrunCenterResetBtn?.addEventListener("click", handleResetMilkrunCenters);
    milkrunCenterAddInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleAddMilkrunCenter();
        }
    });
    milkrunCenterListEl?.addEventListener("change", handleMilkrunCenterListInput);
    milkrunCenterListEl?.addEventListener("click", handleMilkrunCenterListClick);
    milkrunCenterModal?.addEventListener("click", (event) => {
        if (event.target === milkrunCenterModal) closeMilkrunCenterModal();
    });
    milkrunOrderBody?.addEventListener("click", handleMilkrunOrderClick);
    document.addEventListener("click", handleMilkrunCenterPickerOutsideClick);
    document.addEventListener("scroll", handleMilkrunCenterPickerViewportChange, true);
    window.addEventListener("resize", handleMilkrunCenterPickerViewportChange);
    skuHeaderModal?.addEventListener("click", (event) => {
        if (event.target === skuHeaderModal) {
            closeSkuHeaderModal();
        }
    });
    skuEditModal?.addEventListener("click", (event) => {
        if (event.target === skuEditModal) {
            closeSkuEditModal();
        }
    });
    skuLabelPrintModal?.addEventListener("click", (event) => {
        if (event.target === skuLabelPrintModal) {
            closeSkuLabelPrintModal();
        }
    });
    skuTableHead?.addEventListener("dragstart", handleSkuHeaderDragStart);
    skuTableHead?.addEventListener("dragover", handleSkuHeaderDragOver);
    skuTableHead?.addEventListener("drop", handleSkuHeaderDrop);
    skuTableHead?.addEventListener("dragend", handleSkuHeaderDragEnd);
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

function initializeSkuUi() {
    selectedSkuHeaderKeys = getDefaultSkuHeaderKeys();
    selectedSkuRowIds = new Set();
    editingSkuRowId = null;
    renderSkuTableHead();
    updateSelectedFileName(null, skuFileNameEl);
    setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
    setSkuResult("업로드 시 자동 검증되며, 오류가 있으면 업로드되지 않습니다.");
    closeSkuHeaderModal();
    closeSkuEditModal();
    closeSkuLabelPrintModal();
}

function initializeOrderUploadUi() {
    orderUploadRows = [];
    orderMatchDraftComponents = {};
    loadLocalOrderProductMatches();
    setOrderUploadChannelStatus("coupang", "대기 중", "idle");
    setOrderUploadChannelStatus("kurly", "대기 중", "idle");
    renderOrderMatchPanel();
}

function initializeKurlyLabelUi() {
    kurlyRows = [];
    kurlyParsedFileName = "";
    updateSelectedFileName(null, kurlyLabelFileNameEl);
    setKurlyLabelResult("필수 헤더가 정확히 일치해야 라벨을 생성할 수 있습니다.");
    resetKurlyProgress();
}

function initializeMilkrunUi() {
    try {
        loadMilkrunCenterOptions();
        closeMilkrunCenterModal();
        refreshMilkrunCenterUi();
        loadMilkrunSampleRows();
    } catch (error) {
        console.error("쿠팡 밀크런 도우미 초기화 중 오류가 발생했습니다.", error);
        coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
        milkrunRows = [];
        try {
            refreshMilkrunCenterUi();
            renderMilkrunDashboard();
        } catch (fallbackError) {
            console.error("쿠팡 밀크런 도우미 기본 화면 복구에 실패했습니다.", fallbackError);
        }
    }
}

async function loadSkuWorkspace(userId) {
    skuWorkspaceUserId = userId ?? null;
    await loadOrderProductMatches();
    if (!skuWorkspaceUserId) return;

    const workspaceDocRef = getSkuWorkspaceDocRef();
    if (!workspaceDocRef) return;

    try {
        const workspaceSnap = await getDoc(workspaceDocRef);
        const data = workspaceSnap.data();
        const savedRows = Array.isArray(data?.rows) ? data.rows : [];
        const savedHeaders = Array.isArray(data?.selectedSkuHeaderKeys) ? data.selectedSkuHeaderKeys : [];

        skuRows = savedRows;
        selectedSkuHeaderKeys = ensureSkuHeaderSelection(savedHeaders.length ? savedHeaders : getDefaultSkuHeaderKeys());
        selectedSkuRowIds = new Set();
        renderSkuTableHead();

        if (skuRows.length) {
            renderCurrentSkuRows();
            setSkuResult(`저장된 SKU ${skuRows.length}건을 불러왔습니다.`);
        } else {
            setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
            setSkuResult("업로드 시 자동 검증되며, 오류가 있으면 업로드되지 않습니다.");
        }
        renderOrderMatchPanel();
    } catch (error) {
        console.error(error);
        if (error?.code === "permission-denied") {
            setSkuResult("SKU 조회 권한이 없습니다. Firestore 보안 규칙을 확인해주세요.");
        } else {
            setSkuResult("저장된 SKU 정보를 불러오지 못했습니다.");
        }
    }
}

function initializeDashboard() {
    setToolGroupOpenState(false);
    updatePaidFeatureLockUi();
    handlePaymentReturnMessage();
    showView("home");
    showTrackingMode("excel");
    initializeTrackingUi();
    initializeSkuUi();
    initializeOrderUploadUi();
    initializeKurlyLabelUi();
    bindEvents();
    initializeMilkrunUi();
}

function safelyInitializeDashboard() {
    window.__flowbutlerDashboardModuleReady = true;
    bindNavigationEvents();
    try {
        initializeDashboard();
    } catch (error) {
        console.error("대시보드 초기화 중 오류가 발생했습니다.", error);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        skuWorkspaceUserId = null;
        skuLabelTemplates = [];
        currentUserPlan = "free";
        currentUserEmail = "";
        updatePaidFeatureLockUi();
        window.location.href = "./login.html";
        return;
    }

    try {
        skuWorkspaceUserId = user.uid;
        await loadApprovedUser(user);
        await loadSkuWorkspace(user.uid);
        await loadSkuLabelTemplates(user.uid);
        initializeLabelEditor({ userId: user.uid });
    } catch (error) {
        console.error(error);
        dashboardUserInfoEl.textContent = "사용자 상태 확인 중 오류가 발생했습니다.";
    }
});

safelyInitializeDashboard();
