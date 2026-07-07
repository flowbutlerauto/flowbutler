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
    buildMilkrunDetailRowsFromOrderRows,
    buildMilkrunRowsFromOrderRows,
    parseCoupangOrderFile,
    parseGenericOrderFile,
    readOrderHeaderPreview,
} from "./order-upload-file.js?v=20260707-crm1";
import {
    buildCrmAnalytics,
    parseCrmHistoricalOrderFile,
} from "./crm-upload-file.js?v=20260707-crm1";
import {
    buildCoupangLoadingListData,
    getLoadingListPoDisplay,
    prepareCoupangLoadingListPdfs,
    triggerCoupangLoadingListDownload,
} from "./coupang-loading-list.js?v=20260629-po-readable1";
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
const skuSearchFieldSelect = document.getElementById("sku-search-field");
const skuSearchInput = document.getElementById("sku-search-input");
const skuSearchClearBtn = document.getElementById("sku-search-clear-btn");
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
const kurlyLabelDownloadBtn = document.getElementById("kurly-label-download-btn");
const kurlyLabelResultEl = document.getElementById("kurly-label-result");
const kurlyProgressCardEl = document.getElementById("kurly-progress-card");
const kurlyProgressMessageEl = document.getElementById("kurly-progress-message");
const kurlyProgressDetailEl = document.getElementById("kurly-progress-detail");
const kurlyProgressBarEl = document.getElementById("kurly-progress-bar");
const kurlyProgressPercentEl = document.getElementById("kurly-progress-percent");
const kurlyLabelSummaryEl = document.getElementById("kurly-label-summary");
const kurlyLabelTotalLabelsEl = document.getElementById("kurly-label-total-labels");
const kurlyLabelTotalRowsEl = document.getElementById("kurly-label-total-rows");
const kurlyLabelCenterCountEl = document.getElementById("kurly-label-center-count");
const kurlyLabelActiveNameEl = document.getElementById("kurly-label-active-name");
const kurlyLabelSessionListEl = document.getElementById("kurly-label-session-list");
const kurlyLabelWorkspaceGridEl = document.getElementById("kurly-label-workspace-grid");
const kurlyLabelWorkspaceActionsEl = document.getElementById("kurly-label-workspace-actions");
const kurlyLabelListActionsEl = document.getElementById("kurly-label-list-actions");
const kurlyLabelWorkspaceBackBtn = document.getElementById("kurly-label-workspace-back-btn");
const kurlyLabelSelectAllBtn = document.getElementById("kurly-label-select-all-btn");
const kurlyLabelDeleteSelectedBtn = document.getElementById("kurly-label-delete-selected-btn");
const kurlyLabelWorkspaceTitleEl = document.getElementById("kurly-label-workspace-title");
const kurlyLabelWorkspaceDescEl = document.getElementById("kurly-label-workspace-desc");
const kurlyLabelPreviewGridEl = document.getElementById("kurly-label-preview-grid");
const kurlyLabelPreviewNoteEl = document.getElementById("kurly-label-preview-note");
const kurlyLabelOrderBodyEl = document.getElementById("kurly-label-order-body");
const orderUploadChannelListEl = document.getElementById("order-upload-channel-list");
const orderUploadChannelInput = document.getElementById("order-upload-channel-input");
const orderUploadChannelAddBtn = document.getElementById("order-upload-channel-add-btn");
const orderHeaderMapModal = document.getElementById("order-header-map-modal");
const orderHeaderMapTitleEl = document.getElementById("order-header-map-title");
const orderHeaderMapDescEl = document.getElementById("order-header-map-desc");
const orderHeaderMapCloseBtn = document.getElementById("order-header-map-close-btn");
const orderHeaderMapCancelBtn = document.getElementById("order-header-map-cancel-btn");
const orderHeaderMapSaveBtn = document.getElementById("order-header-map-save-btn");
const orderHeaderMapFileInput = document.getElementById("order-header-map-file");
const orderHeaderMapFileNameEl = document.getElementById("order-header-map-file-name");
const orderHeaderMapStatusEl = document.getElementById("order-header-map-status");
const orderHeaderMapSiteFieldsEl = document.getElementById("order-header-map-site-fields");
const orderHeaderMapSystemFieldsEl = document.getElementById("order-header-map-system-fields");
const orderHeaderMapFieldSelect = document.getElementById("order-header-map-field-select");
const orderHeaderMapAddFieldBtn = document.getElementById("order-header-map-add-field-btn");
const orderHeaderMapSummaryEl = document.getElementById("order-header-map-summary");
const orderHeaderMapPreviewEl = document.getElementById("order-header-map-preview");
const orderMatchStatusEl = document.getElementById("order-match-status");
const orderMatchListEl = document.getElementById("order-match-list");
const orderMatchConfirmBtn = document.getElementById("order-match-confirm-btn");
const orderMatchDeleteOpenBtn = document.getElementById("order-match-delete-open-btn");
const orderMatchDeleteModal = document.getElementById("order-match-delete-modal");
const orderMatchDeleteCloseBtn = document.getElementById("order-match-delete-close-btn");
const orderMatchDeleteSearchInput = document.getElementById("order-match-delete-search-input");
const orderMatchDeleteListEl = document.getElementById("order-match-delete-list");
const crmFileInput = document.getElementById("crm-file");
const crmFileNameEl = document.getElementById("crm-file-name");
const crmUploadStatusEl = document.getElementById("crm-upload-status");
const crmSummaryLinesEl = document.getElementById("crm-summary-lines");
const crmSummaryLinesDescEl = document.getElementById("crm-summary-lines-desc");
const crmSummaryOrdersEl = document.getElementById("crm-summary-orders");
const crmSummaryCustomersEl = document.getElementById("crm-summary-customers");
const crmSummaryRepeatRateEl = document.getElementById("crm-summary-repeat-rate");
const crmSummaryRepeatDescEl = document.getElementById("crm-summary-repeat-desc");
const crmSummaryGapEl = document.getElementById("crm-summary-gap");
const crmSummaryGapDescEl = document.getElementById("crm-summary-gap-desc");
const crmSummaryPeriodEl = document.getElementById("crm-summary-period");
const crmSummaryPeriodDescEl = document.getElementById("crm-summary-period-desc");
const crmPreviewMetaEl = document.getElementById("crm-preview-meta");
const crmPreviewBodyEl = document.getElementById("crm-preview-body");
const milkrunDetailBody = document.getElementById("milkrun-detail-body");
const milkrunCenterSummaryBody = document.getElementById("milkrun-center-summary-body");
const milkrunOrderBody = document.getElementById("milkrun-order-body");
const milkrunViewTabButtons = document.querySelectorAll("[data-milkrun-view-tab]");
const milkrunViewPanels = document.querySelectorAll("[data-milkrun-view-panel]");
const milkrunOverviewResizerEl = document.getElementById("milkrun-overview-resizer");
const milkrunDetailTabCountEl = document.getElementById("milkrun-detail-tab-count");
const milkrunCenterTabCountEl = document.getElementById("milkrun-center-tab-count");
const milkrunOrderTabCountEl = document.getElementById("milkrun-order-tab-count");
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
const milkrunLoadingListDownloadBtn = document.getElementById("milkrun-loading-list-download-btn");
const milkrunLoadingEditorModal = document.getElementById("milkrun-loading-editor-modal");
const milkrunLoadingEditorCloseBtn = document.getElementById("milkrun-loading-editor-close-btn");
const milkrunLoadingEditorCancelBtn = document.getElementById("milkrun-loading-editor-cancel-btn");
const milkrunLoadingEditorDownloadBtn = document.getElementById("milkrun-loading-editor-download-btn");
const milkrunLoadingEditorAddPalletBtn = document.getElementById("milkrun-loading-editor-add-pallet-btn");
const milkrunLoadingEditorCenterCountEl = document.getElementById("milkrun-loading-editor-center-count");
const milkrunLoadingEditorCenterListEl = document.getElementById("milkrun-loading-editor-center-list");
const milkrunLoadingEditorActiveCenterEl = document.getElementById("milkrun-loading-editor-active-center");
const milkrunLoadingEditorActiveDescEl = document.getElementById("milkrun-loading-editor-active-desc");
const milkrunLoadingEditorSummaryGridEl = document.getElementById("milkrun-loading-editor-summary-grid");
const milkrunLoadingEditorStatusEl = document.getElementById("milkrun-loading-editor-status");
const milkrunLoadingEditorPagesEl = document.getElementById("milkrun-loading-editor-pages");
const milkrunLoadingEditorNewPalletDropEl = document.getElementById("milkrun-loading-editor-new-pallet-drop");
const milkrunSessionListEl = document.getElementById("milkrun-session-list");
const milkrunWorkboardGridEl = document.getElementById("milkrun-workboard-grid");
const milkrunWorkboardActionsEl = document.getElementById("milkrun-workboard-actions");
const milkrunWorkspaceListActionsEl = document.getElementById("milkrun-workspace-list-actions");
const milkrunWorkspaceBackBtn = document.getElementById("milkrun-workspace-back-btn");
const milkrunSelectAllBtn = document.getElementById("milkrun-select-all-btn");
const milkrunDeleteSelectedBtn = document.getElementById("milkrun-delete-selected-btn");
const milkrunWorkspaceTitleEl = document.getElementById("milkrun-workspace-title");
const milkrunWorkspaceDescEl = document.getElementById("milkrun-workspace-desc");

const viewMeta = {
    home: {
        title: "대시보드",
        subtitle: "자주 쓰는 작업을 빠르게 실행합니다.",
    },
    tracking: {
        title: "송장 조회",
        subtitle: "",
    },
    label: {
        title: "라벨 양식",
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
    crm: {
        title: "CRM",
        subtitle: "고객 재구매 흐름을 확인합니다.",
    },
    "kurly-label": {
        title: "컬리 라벨 생성",
        subtitle: "",
    },
    "coupang-milkrun": {
        title: "쿠팡 밀크런",
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
let skuSearchFieldKey = "all";
let skuSearchQuery = "";
let skuSortKey = "";
let skuSortDirection = "asc";
let editingSkuRowId = null;
let skuWorkspaceUserId = null;
let skuLabelTemplates = [];
let printingSkuRowId = null;
let orderUploadRows = [];
let orderUploadCustomChannels = [];
let orderUploadChannelOrder = [];
let orderUploadChannelStates = {};
let draggedOrderUploadChannelKey = "";
let activeOrderHeaderMapChannelKey = "";
let orderHeaderMapSelectedFieldKeys = [];
let orderHeaderMapPreviewData = null;
let orderHeaderMapDraft = {};
let orderHeaderMaps = {};
let draggedOrderHeaderFieldKey = "";
let orderProductMatches = {};
let orderMatchDraftComponents = {};
let confirmedOrderMatchKeys = new Set();
let crmRows = [];
let crmAnalytics = buildCrmAnalytics([]);
let crmSourceFileName = "";
let kurlyRows = [];
let kurlyParsedFileName = "";
let kurlyLabelWorkspaces = [];
let activeKurlyLabelWorkspaceId = "";
let selectedKurlyLabelWorkspaceIds = new Set();
let milkrunRows = [];
let milkrunWorkspaces = [];
let milkrunWorkspaceSourceRows = new Map();
let activeMilkrunWorkspaceId = "";
let selectedMilkrunWorkspaceIds = new Set();
let activeMilkrunViewTab = "overview";
let activeOrderSkuPicker = null;
let activeMilkrunCenterPicker = null;
let milkrunOverviewResizeState = null;
let milkrunLoadingEditorState = null;
let milkrunLoadingEditorDrag = null;
let crmDbPromise = null;
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
const MILKRUN_WORKSPACE_STORAGE_KEY = "flowbutler:milkrun-workspaces";
const MILKRUN_OVERVIEW_LEFT_STORAGE_KEY = "flowbutler:milkrun-overview-left-percent";
const KURLY_LABEL_WORKSPACE_STORAGE_KEY = "flowbutler:kurly-label-workspaces";
const ORDER_UPLOAD_CUSTOM_CHANNELS_STORAGE_KEY = "flowbutler:order-upload-custom-channels";
const ORDER_HEADER_MAPS_STORAGE_KEY = "flowbutler:order-header-maps";
const CRM_DB_NAME = "flowbutler-crm";
const CRM_DB_VERSION = 1;
const CRM_STORE_NAME = "crmOrderPayloads";
const MIXED_ORDER_UPLOAD_CHANNEL_KEY = "multi-channel";
const ORDER_HEADER_REQUIRED_FIELD_KEYS = ["productName", "quantity", "recipientName", "recipientPhone", "recipientAddress"];
const ORDER_HEADER_DATE_TIME_CONFLICT_GROUPS = [
    { combined: "orderDateTime", parts: ["orderDate", "orderTime"] },
    { combined: "issuedDateTime", parts: ["issuedDate", "issuedTime"] },
];
const ORDER_HEADER_FIELD_DEFINITIONS = [
    { key: "managementId", label: "관리번호", group: "optional" },
    { key: "channelName", label: "판매처", group: "system" },
    { key: "orderCode", label: "주문번호", group: "optional" },
    { key: "marketplaceProductCode", label: "판매처상품코드", group: "optional" },
    { key: "productName", label: "상품명", group: "required" },
    { key: "quantity", label: "수량", group: "required" },
    { key: "salePrice", label: "판매가", group: "optional" },
    { key: "paymentAmount", label: "결제금액", group: "optional" },
    { key: "orderDateTime", label: "주문일+주문시간", group: "optional" },
    { key: "orderDate", label: "주문일", group: "optional" },
    { key: "orderTime", label: "주문시간", group: "optional" },
    { key: "issuedDateTime", label: "발주일+발주시간", group: "optional" },
    { key: "issuedDate", label: "발주일", group: "optional" },
    { key: "issuedTime", label: "발주시간", group: "optional" },
    { key: "issuedAt", label: "업로드일시", group: "system" },
    { key: "invoiceNo", label: "송장번호", group: "optional" },
    { key: "courierName", label: "택배사", group: "optional" },
    { key: "ordererName", label: "주문자", group: "optional" },
    { key: "ordererPhone", label: "주문자전화번호", group: "optional" },
    { key: "recipientName", label: "수령자이름", group: "required" },
    { key: "recipientPhone", label: "수령자전화번호", group: "required" },
    { key: "recipientZip", label: "수령자우편번호", group: "optional" },
    { key: "recipientAddress", label: "수령자주소", group: "required" },
    { key: "deliveryMemo", label: "배송메모", group: "optional" },
    { key: "location", label: "로케이션", group: "optional" },
    { key: "expiry", label: "유통기한", group: "optional" },
    { key: "status", label: "상태", group: "optional" },
    { key: "cs", label: "CS", group: "optional" },
    { key: "sourceFileName", label: "원본파일명", group: "system" },
];
const ORDER_HEADER_FIELD_MAP = new Map(ORDER_HEADER_FIELD_DEFINITIONS.map((field) => [field.key, field]));
const SKU_CODE_LIKE_KEYS = new Set([
    "barcode",
    "adminProductCode",
    "selfProductCode",
    "manufacturerProductCode",
    "hsCode",
]);
const SKU_WIDE_TEXT_KEYS = new Set([
    "productName",
    "englishName",
    "contentVolumeOrWeight",
    "supplier",
]);
const SKU_SEARCH_ALL_KEY = "all";

function getMilkrunWorkspaceLabel(fileName = "") {
    return String(fileName || "")
        .replace(/\.[^.]+$/, "")
        .trim() || "업로드 발주서";
}

function buildMilkrunWorkspaceId(fileName = "") {
    const label = getMilkrunWorkspaceLabel(fileName);
    return label.toLowerCase().replace(/\s+/g, "-");
}

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
let lastSkuHeaderDragEndedAt = 0;
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
        detail: "엑셀 파일을 업로드하고 조회 실행을 눌러주세요.",
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
    return ["tracking", "label", "sku", "order-upload", "crm", "kurly-label", "coupang-milkrun"].includes(viewName);
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
        detail: "발주서를 선택한 뒤 PDF 다운로드를 눌러주세요.",
        value: 0,
        visible: false,
    });
}

function setCrmUploadStatus(message, tone = "info") {
    if (!crmUploadStatusEl) return;
    crmUploadStatusEl.textContent = message ?? "";
    crmUploadStatusEl.className = `info-block crm-upload-status is-${tone}`;
}

function getCrmAccountKey() {
    return auth.currentUser?.uid || skuWorkspaceUserId || "local";
}

function openCrmDb() {
    if (crmDbPromise) return crmDbPromise;

    crmDbPromise = new Promise((resolve, reject) => {
        if (typeof window === "undefined" || !window.indexedDB) {
            reject(new Error("브라우저 저장소를 사용할 수 없습니다."));
            return;
        }

        const request = window.indexedDB.open(CRM_DB_NAME, CRM_DB_VERSION);

        request.onupgradeneeded = () => {
            const dbInstance = request.result;
            if (!dbInstance.objectStoreNames.contains(CRM_STORE_NAME)) {
                dbInstance.createObjectStore(CRM_STORE_NAME, { keyPath: "accountKey" });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("CRM 저장소를 열지 못했습니다."));
    });

    return crmDbPromise;
}

async function getCrmStoredPayload(accountKey = getCrmAccountKey()) {
    const dbInstance = await openCrmDb();

    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(CRM_STORE_NAME, "readonly");
        const store = transaction.objectStore(CRM_STORE_NAME);
        const request = store.get(accountKey);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("CRM 데이터를 불러오지 못했습니다."));
    });
}

async function saveCrmStoredPayload(payload) {
    const dbInstance = await openCrmDb();

    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(CRM_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CRM_STORE_NAME);
        store.put(payload);

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("CRM 데이터를 저장하지 못했습니다."));
    });
}

function compactCrmRows(rows) {
    return (rows ?? []).map((row) => ({
        rowId: row.rowId,
        orderDate: row.orderDate,
        orderTime: row.orderTime,
        orderDateTime: row.orderDateTime,
        orderCode: row.orderCode,
        productCode: row.productCode,
        barcode: row.barcode,
        channelName: row.channelName,
        marketplaceProductName: row.marketplaceProductName,
        marketplaceOption: row.marketplaceOption,
        productName: row.productName,
        quantity: row.quantity,
        quantityNumber: row.quantityNumber,
        salePrice: row.salePrice,
        salePriceNumber: row.salePriceNumber,
        paymentAmount: row.paymentAmount,
        paymentAmountNumber: row.paymentAmountNumber,
        ordererId: row.ordererId,
        ordererKey: row.ordererKey,
        recipientKey: row.recipientKey,
        sourceFileName: row.sourceFileName,
        isValid: row.isValid,
        errors: Array.isArray(row.errors) ? row.errors : [],
    }));
}

async function persistCrmOrders() {
    if (!crmRows.length) return false;

    try {
        await saveCrmStoredPayload({
            accountKey: getCrmAccountKey(),
            sourceFileName: crmSourceFileName,
            rows: compactCrmRows(crmRows),
            updatedAt: new Date().toISOString(),
        });
        return true;
    } catch (error) {
        console.error(error);
        setCrmUploadStatus("CRM 데이터를 브라우저 저장소에 저장하지 못했습니다. 업로드 결과는 현재 화면에서만 유지됩니다.", "warning");
        return false;
    }
}

async function loadCrmOrdersForCurrentUser() {
    try {
        const payload = await getCrmStoredPayload();
        const savedRows = Array.isArray(payload?.rows) ? payload.rows : [];

        if (!savedRows.length) {
            crmRows = [];
            crmAnalytics = buildCrmAnalytics([]);
            crmSourceFileName = "";
            renderCrmDashboard();
            return false;
        }

        crmRows = compactCrmRows(savedRows);
        crmAnalytics = buildCrmAnalytics(crmRows);
        crmSourceFileName = payload?.sourceFileName || "저장된 CRM 데이터";
        updateSelectedFileName({ name: crmSourceFileName }, crmFileNameEl);
        renderCrmDashboard();
        setCrmUploadStatus(`저장된 CRM 주문 ${formatMilkrunNumber(crmAnalytics.validRows)}건을 불러왔습니다.`, "success");
        return true;
    } catch (error) {
        console.error(error);
        renderCrmDashboard();
        setCrmUploadStatus("저장된 CRM 데이터를 불러오지 못했습니다.", "warning");
        return false;
    }
}

function formatCrmRate(value) {
    const rate = Number(value) || 0;
    return `${(rate * 100).toLocaleString("ko-KR", {
        maximumFractionDigits: 1,
        minimumFractionDigits: rate > 0 && rate < 0.1 ? 1 : 0,
    })}%`;
}

function formatCrmDays(value) {
    const dayValue = Number(value) || 0;
    return `${dayValue.toLocaleString("ko-KR", {
        maximumFractionDigits: dayValue % 1 ? 1 : 0,
    })}일`;
}

function getCrmPeriodText(analytics) {
    if (!analytics?.dateMin && !analytics?.dateMax) return "-";
    if (analytics.dateMin === analytics.dateMax) return analytics.dateMin;
    return `${analytics.dateMin || "-"} ~ ${analytics.dateMax || "-"}`;
}

function maskCrmKey(value) {
    const safeValue = String(value ?? "");
    if (safeValue.length <= 18) return safeValue || "-";
    return `${safeValue.slice(0, 9)}...${safeValue.slice(-6)}`;
}

function getCrmFileList(files) {
    return Array.from(files ?? []).filter(Boolean);
}

function getCrmFileSelectionLabel(files) {
    const selectedFiles = getCrmFileList(files);
    if (!selectedFiles.length) return "";
    if (selectedFiles.length === 1) return selectedFiles[0].name || "선택된 파일";

    const firstName = selectedFiles[0].name || "첫 번째 파일";
    const remainingCount = selectedFiles.length - 1;
    return `${formatMilkrunNumber(selectedFiles.length)}개 파일 · ${firstName}${remainingCount ? ` 외 ${formatMilkrunNumber(remainingCount)}개` : ""}`;
}

function updateCrmSelectedFileName(files) {
    if (!crmFileNameEl) return;

    const label = getCrmFileSelectionLabel(files);
    if (!label) {
        updateSelectedFileName(null, crmFileNameEl);
        return;
    }

    crmFileNameEl.textContent = label;
}

function renderCrmSummary() {
    const analytics = crmAnalytics || buildCrmAnalytics(crmRows);

    if (crmSummaryLinesEl) crmSummaryLinesEl.textContent = formatMilkrunNumber(analytics.totalRows);
    if (crmSummaryLinesDescEl) {
        crmSummaryLinesDescEl.textContent = `정상 ${formatMilkrunNumber(analytics.validRows)}건 · 오류 ${formatMilkrunNumber(analytics.invalidRows)}건`;
    }
    if (crmSummaryOrdersEl) crmSummaryOrdersEl.textContent = formatMilkrunNumber(analytics.uniqueOrders);
    if (crmSummaryCustomersEl) crmSummaryCustomersEl.textContent = formatMilkrunNumber(analytics.uniqueCustomers);
    if (crmSummaryRepeatRateEl) crmSummaryRepeatRateEl.textContent = formatCrmRate(analytics.repeatRate);
    if (crmSummaryRepeatDescEl) {
        crmSummaryRepeatDescEl.textContent = `2회 이상 구매 ${formatMilkrunNumber(analytics.repeatCustomers)}명 · 30일 내 ${formatCrmRate(analytics.repeatWithin30Rate)}`;
    }
    if (crmSummaryGapEl) crmSummaryGapEl.textContent = formatCrmDays(analytics.medianFirstRepeatDays);
    if (crmSummaryGapDescEl) {
        crmSummaryGapDescEl.textContent = `첫 재구매 평균 ${formatCrmDays(analytics.averageFirstRepeatDays)}`;
    }
    if (crmSummaryPeriodEl) crmSummaryPeriodEl.textContent = getCrmPeriodText(analytics);
    if (crmSummaryPeriodDescEl) {
        const topChannel = analytics.channelCounts?.[0];
        crmSummaryPeriodDescEl.textContent = topChannel
            ? `${topChannel.channelName} ${formatMilkrunNumber(topChannel.count)}행`
            : "주문일 범위";
    }
}

function renderCrmPreview() {
    if (crmPreviewMetaEl) {
        crmPreviewMetaEl.textContent = crmRows.length
            ? `${formatMilkrunNumber(crmRows.length)}행 · 미리보기 최대 50행`
            : "0건";
    }

    if (!crmPreviewBodyEl) return;

    if (!crmRows.length) {
        crmPreviewBodyEl.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="7">업로드된 주문 데이터가 없습니다.</td>
            </tr>
        `;
        return;
    }

    crmPreviewBodyEl.innerHTML = crmRows.slice(0, 50).map((row) => {
        const invalidTitle = !row.isValid && row.errors?.length
            ? ` title="${escapeHtml(row.errors.join("\n"))}"`
            : "";

        return `
            <tr class="${row.isValid ? "" : "is-warning"}"${invalidTitle}>
                <td>${escapeHtml(row.orderDate || "-")}</td>
                <td>${escapeHtml(row.channelName || "-")}</td>
                <td>${escapeHtml(row.orderCode || "-")}</td>
                <td class="crm-product-cell" title="${escapeHtml(row.productName || "")}">${escapeHtml(row.productName || "-")}</td>
                <td>${formatMilkrunNumber(row.quantityNumber || 0)}</td>
                <td>${Number.isFinite(row.paymentAmountNumber) ? formatMilkrunNumber(row.paymentAmountNumber) : "-"}</td>
                <td title="${escapeHtml(row.recipientKey || "")}">${escapeHtml(maskCrmKey(row.recipientKey))}</td>
            </tr>
        `;
    }).join("");
}

function renderCrmDashboard() {
    crmAnalytics = buildCrmAnalytics(crmRows);
    renderCrmSummary();
    renderCrmPreview();
}

async function setCrmFileSelectedState(file) {
    const selectedFiles = getCrmFileList(Array.isArray(file) ? file : (file ? [file] : []));
    await setCrmFilesSelectedState(selectedFiles);
}

async function setCrmFilesSelectedState(files) {
    const selectedFiles = getCrmFileList(files);

    if (!selectedFiles.length) {
        updateCrmSelectedFileName([]);
        setCrmUploadStatus("선택된 파일이 없습니다.", "info");
        return;
    }

    try {
        updateCrmSelectedFileName(selectedFiles);
        setCrmUploadStatus(`CRM 주문 엑셀 ${formatMilkrunNumber(selectedFiles.length)}개를 읽는 중입니다...`, "info");

        const parsedRows = [];
        const failedFiles = [];

        for (const selectedFile of selectedFiles) {
            try {
                const fileRows = await parseCrmHistoricalOrderFile(selectedFile);
                parsedRows.push(...fileRows);
            } catch (error) {
                console.error(error);
                failedFiles.push({
                    name: selectedFile?.name || "파일",
                    message: error?.message || "파일 처리 중 오류가 발생했습니다.",
                });
            }
        }

        if (!parsedRows.length) {
            const errorText = failedFiles.length
                ? ` 실패 파일: ${failedFiles.map((item) => item.name).join(", ")}`
                : "";
            setCrmUploadStatus("파일은 읽었지만 CRM에 반영할 주문 데이터가 없습니다.", "warning");
            if (errorText) console.warn(errorText);
            return;
        }

        const nextAnalytics = buildCrmAnalytics(parsedRows);
        if (!nextAnalytics.validRows) {
            window.alert("CRM 업로드에 실패했습니다.\n정상 주문 행이 없습니다. 필수 헤더와 값을 확인해주세요.");
            setCrmUploadStatus(`업로드 실패: 오류 ${formatMilkrunNumber(nextAnalytics.invalidRows)}건`, "error");
            return;
        }

        crmRows = parsedRows;
        crmAnalytics = nextAnalytics;
        crmSourceFileName = getCrmFileSelectionLabel(selectedFiles);
        renderCrmDashboard();
        const saved = await persistCrmOrders();
        const statusTone = nextAnalytics.invalidRows || failedFiles.length ? "warning" : "success";
        const saveText = saved ? "저장 완료" : "화면 반영 완료";
        const failedText = failedFiles.length ? ` 실패 파일 ${formatMilkrunNumber(failedFiles.length)}개.` : "";
        setCrmUploadStatus(
            `${saveText}: 파일 ${formatMilkrunNumber(selectedFiles.length)}개, 정상 ${formatMilkrunNumber(nextAnalytics.validRows)}건, 오류 ${formatMilkrunNumber(nextAnalytics.invalidRows)}건.${failedText} 대/중/소/용량 컬럼은 반영하지 않았습니다.`,
            statusTone,
        );
    } catch (error) {
        console.error(error);
        setCrmUploadStatus(error.message || "CRM 파일 처리 중 오류가 발생했습니다.", "error");
        window.alert("CRM 엑셀을 업로드할 수 없습니다.\n파일 형식과 필수 헤더를 확인해주세요.");
    }
}

function getOrderUploadStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        console.warn("판매처 목록 저장소에 접근하지 못했습니다.", error);
        return null;
    }
}

function normalizeOrderUploadChannelName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function buildCustomOrderUploadChannelKey(label) {
    const normalizedName = normalizeOrderProductName(label)
        .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/gi, "");
    return `custom-${normalizedName || Date.now()}`;
}

function getDefaultOrderUploadChannels() {
    return [
        { key: "coupang", label: "쿠팡(밀크런)" },
        { key: "kurly", label: "컬리" },
        { key: MIXED_ORDER_UPLOAD_CHANNEL_KEY, label: "여러 판매처 등록" },
    ];
}

function isDefaultOrderUploadChannel(channelKey) {
    return getDefaultOrderUploadChannels().some((channel) => channel.key === channelKey);
}

function getAllOrderUploadChannels() {
    const channelMap = new Map(
        [...getDefaultOrderUploadChannels(), ...orderUploadCustomChannels]
            .map((channel) => [channel.key, channel]),
    );
    const orderedChannels = [];

    orderUploadChannelOrder.forEach((channelKey) => {
        const channel = channelMap.get(channelKey);
        if (!channel) return;
        orderedChannels.push(channel);
        channelMap.delete(channelKey);
    });

    channelMap.forEach((channel) => orderedChannels.push(channel));
    return orderedChannels;
}

function syncOrderUploadChannelOrder() {
    const channels = [...getDefaultOrderUploadChannels(), ...orderUploadCustomChannels];
    const availableKeys = new Set(channels.map((channel) => channel.key));
    const nextOrder = orderUploadChannelOrder.filter((channelKey) => availableKeys.has(channelKey));

    channels.forEach((channel) => {
        if (!nextOrder.includes(channel.key)) nextOrder.push(channel.key);
    });

    orderUploadChannelOrder = nextOrder;
}

function getOrderUploadChannelLabel(channel) {
    const defaultChannel = getDefaultOrderUploadChannels().find((item) => item.key === channel);
    if (defaultChannel?.label) return defaultChannel.label;
    const customChannel = orderUploadCustomChannels.find((item) => item.key === channel);
    if (customChannel?.label) return customChannel.label;
    return channel || "판매처";
}

function isMixedOrderUploadChannel(channelKey = activeOrderHeaderMapChannelKey) {
    return channelKey === MIXED_ORDER_UPLOAD_CHANNEL_KEY;
}

function getRequiredOrderHeaderFieldKeys(channelKey = activeOrderHeaderMapChannelKey) {
    return isMixedOrderUploadChannel(channelKey)
        ? ["channelName", ...ORDER_HEADER_REQUIRED_FIELD_KEYS]
        : [...ORDER_HEADER_REQUIRED_FIELD_KEYS];
}

function getOrderUploadChannelElements(channel) {
    const statusEl = [...document.querySelectorAll("[data-order-upload-status]")]
        .find((element) => element.getAttribute("data-order-upload-status") === channel) || null;
    return { statusEl };
}

function setOrderUploadChannelStatus(channel, message, tone = "idle") {
    orderUploadChannelStates[channel] = {
        message: message ?? "",
        tone,
    };

    const { statusEl } = getOrderUploadChannelElements(channel);

    if (statusEl) {
        const displayMessage = tone === "error" ? "실패" : (message ?? "");
        statusEl.textContent = displayMessage;
        statusEl.title = message ?? "";
        statusEl.className = `order-upload-simple-status is-${tone}`;
    }
}

function saveOrderUploadCustomChannels() {
    try {
        getOrderUploadStorage()?.setItem(
            ORDER_UPLOAD_CUSTOM_CHANNELS_STORAGE_KEY,
            JSON.stringify({
                customChannels: orderUploadCustomChannels,
                order: orderUploadChannelOrder,
            }),
        );
    } catch (error) {
        console.warn("판매처 목록을 저장하지 못했습니다.", error);
    }
}

function loadOrderUploadCustomChannels() {
    try {
        const raw = getOrderUploadStorage()?.getItem(ORDER_UPLOAD_CUSTOM_CHANNELS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const customChannels = Array.isArray(parsed) ? parsed : parsed?.customChannels;
        orderUploadCustomChannels = Array.isArray(customChannels)
            ? customChannels
                .map((item) => ({
                    key: String(item?.key || buildCustomOrderUploadChannelKey(item?.label)).trim(),
                    label: normalizeOrderUploadChannelName(item?.label),
                }))
                .filter((item) => item.key && item.label)
            : [];
        orderUploadChannelOrder = Array.isArray(parsed?.order)
            ? parsed.order.map((channelKey) => String(channelKey || "").trim()).filter(Boolean)
            : [];
        syncOrderUploadChannelOrder();
    } catch (error) {
        console.warn("판매처 목록을 불러오지 못했습니다.", error);
        orderUploadCustomChannels = [];
        orderUploadChannelOrder = [];
        syncOrderUploadChannelOrder();
    }
}

function getOrderUploadAcceptForChannel(channelKey) {
    if (channelKey === "kurly") return ".xlsx,.xls";
    return ".xlsx,.xls,.csv";
}

function getOrderHeaderField(fieldKey) {
    return ORDER_HEADER_FIELD_MAP.get(fieldKey) || { key: fieldKey, label: fieldKey, group: "optional" };
}

function getOrderHeaderConflictKeys(fieldKey) {
    const conflictGroup = ORDER_HEADER_DATE_TIME_CONFLICT_GROUPS.find((group) => (
        group.combined === fieldKey || group.parts.includes(fieldKey)
    ));
    if (!conflictGroup) return [];

    return conflictGroup.combined === fieldKey ? conflictGroup.parts : [conflictGroup.combined];
}

function isOrderHeaderFieldDisabledByConflict(fieldKey) {
    return getOrderHeaderConflictKeys(fieldKey)
        .some((conflictKey) => orderHeaderMapSelectedFieldKeys.includes(conflictKey));
}

function normalizeOrderHeaderConflictSelection(fieldKeys, draft = orderHeaderMapDraft) {
    const selectedSet = new Set(fieldKeys);
    const nextDraft = { ...draft };

    ORDER_HEADER_DATE_TIME_CONFLICT_GROUPS.forEach((group) => {
        if (selectedSet.has(group.combined)) {
            group.parts.forEach((partKey) => {
                selectedSet.delete(partKey);
                delete nextDraft[partKey];
            });
            return;
        }

        if (group.parts.some((partKey) => selectedSet.has(partKey))) {
            selectedSet.delete(group.combined);
            delete nextDraft[group.combined];
        }
    });

    return {
        fieldKeys: ORDER_HEADER_FIELD_DEFINITIONS
            .map((field) => field.key)
            .filter((fieldKey) => selectedSet.has(fieldKey)),
        draft: nextDraft,
    };
}

function setOrderHeaderMapSelectedFieldKeys(fieldKeys, draft = orderHeaderMapDraft) {
    const normalized = normalizeOrderHeaderConflictSelection(fieldKeys, draft);
    orderHeaderMapSelectedFieldKeys = normalized.fieldKeys;
    orderHeaderMapDraft = normalized.draft;
}

function getOrderHeaderSnapshot(headers = []) {
    return (headers ?? []).map((header, index) => ({
        sourceHeader: String(header?.header || header?.label || "").trim(),
        columnIndex: Number.isInteger(header?.columnIndex) ? header.columnIndex : index,
    }));
}

function getOrderHeaderSignature(headers = []) {
    return getOrderHeaderSnapshot(headers)
        .map((header) => `${header.columnIndex}:${header.sourceHeader}`)
        .join("|");
}

function getSavedOrderHeaderMap(channelKey = activeOrderHeaderMapChannelKey) {
    const savedMap = orderHeaderMaps[channelKey];
    return savedMap && typeof savedMap === "object" ? savedMap : null;
}

function buildOrderHeaderPreviewFromSavedMap(savedMap) {
    const savedHeaders = Array.isArray(savedMap?.headers) ? savedMap.headers : [];
    const fieldMappings = savedMap?.fields && typeof savedMap.fields === "object" ? savedMap.fields : {};
    const fallbackHeaders = Object.values(fieldMappings)
        .map((mapping) => ({
            sourceHeader: String(mapping?.sourceHeader ?? "").trim(),
            columnIndex: Number(mapping?.columnIndex),
        }))
        .filter((mapping) => mapping.sourceHeader && Number.isInteger(mapping.columnIndex));

    const headers = (savedHeaders.length ? savedHeaders : fallbackHeaders)
        .map((header, index) => ({
            columnIndex: Number.isInteger(header?.columnIndex) ? header.columnIndex : index,
            header: String(header?.sourceHeader || header?.header || header?.label || "").trim(),
            label: String(header?.sourceHeader || header?.header || header?.label || `빈 헤더 ${index + 1}`).trim(),
        }))
        .sort((a, b) => a.columnIndex - b.columnIndex);

    if (!headers.length) return null;

    return {
        fileName: savedMap?.fileName || "",
        headerRowIndex: Number.isInteger(savedMap?.headerRowIndex) ? savedMap.headerRowIndex : 0,
        headers,
        sampleRows: [],
        rowCount: 0,
        isSavedSnapshot: true,
    };
}

function doesSavedOrderHeaderMatchPreview(savedMap, previewData) {
    if (!savedMap || !previewData?.headers?.length) return false;

    const savedSignature = savedMap.headerSignature
        || getOrderHeaderSignature((savedMap.headers ?? []).map((header) => ({
            header: header?.sourceHeader,
            columnIndex: header?.columnIndex,
        })));

    return Boolean(savedSignature) && savedSignature === getOrderHeaderSignature(previewData.headers);
}

function loadOrderHeaderMaps() {
    try {
        const raw = getOrderUploadStorage()?.getItem(ORDER_HEADER_MAPS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        orderHeaderMaps = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        console.warn("주문 헤더 매칭을 불러오지 못했습니다.", error);
        orderHeaderMaps = {};
    }
}

function saveOrderHeaderMaps() {
    try {
        getOrderUploadStorage()?.setItem(ORDER_HEADER_MAPS_STORAGE_KEY, JSON.stringify(orderHeaderMaps));
    } catch (error) {
        console.warn("주문 헤더 매칭을 저장하지 못했습니다.", error);
    }
}

function getOrderHeaderFieldKeyForColumn(columnIndex) {
    const matchedEntry = Object.entries(orderHeaderMapDraft)
        .find(([, mapping]) => Number(mapping?.columnIndex) === Number(columnIndex));
    return matchedEntry?.[0] || "";
}

function getMissingRequiredOrderHeaderFields() {
    return getRequiredOrderHeaderFieldKeys().filter((fieldKey) => (
        typeof orderHeaderMapDraft[fieldKey]?.columnIndex !== "number"
    ));
}

function updateOrderHeaderMapSaveState() {
    if (!orderHeaderMapSaveBtn) return;
    const hasPreview = Boolean(orderHeaderMapPreviewData?.headers?.length);
    orderHeaderMapSaveBtn.disabled = !hasPreview || getMissingRequiredOrderHeaderFields().length > 0;
}

function setOrderHeaderMapProgressStatus() {
    if (!orderHeaderMapPreviewData?.headers?.length) return;

    const missingFields = getMissingRequiredOrderHeaderFields();
    if (!missingFields.length) {
        setOrderHeaderMapStatus("필수 헤더 매칭이 완료되었습니다. 저장할 수 있습니다.", "success");
        return;
    }

    const missingLabels = missingFields.map((fieldKey) => getOrderHeaderField(fieldKey).label).join(", ");
    setOrderHeaderMapStatus(`필수 헤더를 엑셀 헤더 위로 드래그해주세요. 남은 필수: ${missingLabels}`);
}

function assignOrderHeaderFieldToColumn(fieldKey, columnIndex) {
    const field = getOrderHeaderField(fieldKey);
    const header = orderHeaderMapPreviewData?.headers?.find((item) => item.columnIndex === columnIndex);
    if (!field.key || !header) return;

    const conflictKeys = getOrderHeaderConflictKeys(field.key);
    let nextDraft = { ...orderHeaderMapDraft };
    conflictKeys.forEach((conflictKey) => {
        delete nextDraft[conflictKey];
    });

    const replacedFieldKey = getOrderHeaderFieldKeyForColumn(columnIndex);
    if (replacedFieldKey && replacedFieldKey !== field.key) {
        delete nextDraft[replacedFieldKey];
    }

    nextDraft[field.key] = { columnIndex };
    setOrderHeaderMapSelectedFieldKeys([
        ...orderHeaderMapSelectedFieldKeys.filter((key) => !conflictKeys.includes(key)),
        field.key,
    ], nextDraft);

    renderOrderHeaderMapModal({ preservePreviewScroll: true });
    setOrderHeaderMapProgressStatus();
}

function unassignOrderHeaderField(fieldKey) {
    if (!orderHeaderMapDraft[fieldKey]) return;

    const nextDraft = { ...orderHeaderMapDraft };
    delete nextDraft[fieldKey];
    orderHeaderMapDraft = nextDraft;
    renderOrderHeaderMapModal({ preservePreviewScroll: true });
    setOrderHeaderMapProgressStatus();
}

function restoreOrderHeaderMapDraftForPreview() {
    const headers = orderHeaderMapPreviewData?.headers ?? [];
    const savedFields = orderHeaderMaps[activeOrderHeaderMapChannelKey]?.fields ?? {};
    const nextDraft = {};
    const savedOptionalFieldKeys = [];
    const requiredFieldKeys = getRequiredOrderHeaderFieldKeys();

    Object.entries(savedFields).forEach(([fieldKey, mapping]) => {
        const sourceHeader = String(mapping?.sourceHeader ?? "").trim();
        if (!sourceHeader) return;

        const header = headers.find((item) => String(item.header || item.label || "").trim() === sourceHeader);
        if (!header) return;

        nextDraft[fieldKey] = { columnIndex: header.columnIndex };
        if (!requiredFieldKeys.includes(fieldKey)) savedOptionalFieldKeys.push(fieldKey);
    });

    setOrderHeaderMapSelectedFieldKeys([
        ...requiredFieldKeys,
        ...savedOptionalFieldKeys.filter((fieldKey) => ORDER_HEADER_FIELD_MAP.has(fieldKey)),
    ], nextDraft);
}

function loadSavedOrderHeaderMapIntoModal() {
    const savedMap = getSavedOrderHeaderMap();
    const savedPreview = buildOrderHeaderPreviewFromSavedMap(savedMap);
    if (!savedPreview) return false;

    orderHeaderMapPreviewData = savedPreview;
    restoreOrderHeaderMapDraftForPreview();
    if (orderHeaderMapFileNameEl) {
        orderHeaderMapFileNameEl.textContent = savedMap?.fileName
            ? `저장된 양식: ${savedMap.fileName}`
            : "저장된 엑셀 헤더";
    }
    renderOrderHeaderMapModal();
    setOrderHeaderMapStatus("저장된 엑셀 양식입니다.", "success");
    return true;
}

function setOrderHeaderMapStatus(message, tone = "idle") {
    if (!orderHeaderMapStatusEl) return;
    orderHeaderMapStatusEl.textContent = message || "";
    orderHeaderMapStatusEl.classList.remove("is-idle", "is-loading", "is-success", "is-error");
    orderHeaderMapStatusEl.classList.add(`is-${tone}`);
}

function renderOrderHeaderMapFieldSelect() {
    if (!orderHeaderMapFieldSelect || !orderHeaderMapAddFieldBtn) return;

    const candidateFields = ORDER_HEADER_FIELD_DEFINITIONS
        .filter((field) => field.group === "optional" && !orderHeaderMapSelectedFieldKeys.includes(field.key));
    const enabledFields = candidateFields.filter((field) => !isOrderHeaderFieldDisabledByConflict(field.key));

    orderHeaderMapFieldSelect.innerHTML = candidateFields.length
        ? candidateFields
            .map((field) => {
                const disabled = isOrderHeaderFieldDisabledByConflict(field.key);
                return `
                    <option
                        value="${escapeHtml(field.key)}"
                        class="${disabled ? "is-disabled-field" : ""}"
                        ${disabled ? "disabled" : ""}
                    >${escapeHtml(field.label)}${disabled ? " (사용 불가)" : ""}</option>
                `;
            })
            .join("")
        : `<option value="">추가할 헤더 없음</option>`;
    orderHeaderMapFieldSelect.disabled = enabledFields.length === 0;
    orderHeaderMapAddFieldBtn.disabled = enabledFields.length === 0;
    if (enabledFields.length) orderHeaderMapFieldSelect.value = enabledFields[0].key;
}

function renderOrderHeaderMapSiteFields() {
    if (!orderHeaderMapSiteFieldsEl) return;

    orderHeaderMapSiteFieldsEl.innerHTML = orderHeaderMapSelectedFieldKeys
        .map((fieldKey) => {
            const field = getOrderHeaderField(fieldKey);
            const isRequired = getRequiredOrderHeaderFieldKeys().includes(field.key);
            const mappedColumnIndex = orderHeaderMapDraft[field.key]?.columnIndex;
            const isMapped = typeof mappedColumnIndex === "number";
            return `
                <div
                    class="order-header-site-chip ${isRequired ? "is-required" : "is-optional"} ${isMapped ? "is-mapped" : ""}"
                    data-order-header-site-field="${escapeHtml(field.key)}"
                    data-order-header-drag-field="${escapeHtml(field.key)}"
                    draggable="true"
                >
                    <span>${escapeHtml(field.label)}</span>
                    <em>${isMapped ? `${mappedColumnIndex + 1}열` : (isRequired ? "필수" : "선택")}</em>
                    ${isRequired ? "" : `
                        <button
                            class="order-header-site-chip-remove"
                            data-order-header-field-remove="${escapeHtml(field.key)}"
                            type="button"
                            aria-label="${escapeHtml(field.label)} 제거"
                        >×</button>
                    `}
                </div>
            `;
        })
        .join("");
}

function renderOrderHeaderMapSystemFields() {
    if (!orderHeaderMapSystemFieldsEl) return;

    const requiredFieldKeys = new Set(getRequiredOrderHeaderFieldKeys());
    const systemFields = ORDER_HEADER_FIELD_DEFINITIONS
        .filter((field) => field.group === "system" && !requiredFieldKeys.has(field.key));
    orderHeaderMapSystemFieldsEl.innerHTML = systemFields
        .map((field) => `
            <span class="order-header-system-chip">
                ${escapeHtml(field.label)}
                <em>자동</em>
            </span>
        `)
        .join("");
}

function renderOrderHeaderMapPreview() {
    if (!orderHeaderMapPreviewEl || !orderHeaderMapSummaryEl) return;

    if (!orderHeaderMapPreviewData?.headers?.length) {
        orderHeaderMapSummaryEl.textContent = "-";
        orderHeaderMapPreviewEl.classList.remove("has-preview");
        orderHeaderMapPreviewEl.textContent = "샘플 엑셀을 업로드하면 헤더가 표시됩니다.";
        return;
    }

    const { headers, sampleRows = [], rowCount = 0, isSavedSnapshot = false } = orderHeaderMapPreviewData;
    orderHeaderMapSummaryEl.textContent = isSavedSnapshot
        ? `${headers.length}개 헤더 · 저장된 양식`
        : `${headers.length}개 헤더 · ${rowCount.toLocaleString("ko-KR")}개 행`;
    orderHeaderMapPreviewEl.classList.add("has-preview");
    orderHeaderMapPreviewEl.innerHTML = `
        <div class="order-header-map-preview-scroll">
            <table class="order-header-map-table">
                <thead>
                    <tr class="order-header-map-site-row">
                        ${headers.map((header) => {
                            const fieldKey = getOrderHeaderFieldKeyForColumn(header.columnIndex);
                            const field = fieldKey ? getOrderHeaderField(fieldKey) : null;
                            return `
                                <th
                                    class="order-header-map-drop-cell ${field ? "is-mapped" : ""}"
                                    data-order-header-drop-column="${header.columnIndex}"
                                >
                                    <div class="order-header-map-drop-zone">
                                        ${field ? `
                                            <div
                                                class="order-header-assigned-chip"
                                                data-order-header-drag-field="${escapeHtml(field.key)}"
                                                draggable="true"
                                            >
                                                <span>${escapeHtml(field.label)}</span>
                                                <button
                                                    data-order-header-unmap-field="${escapeHtml(field.key)}"
                                                    type="button"
                                                    aria-label="${escapeHtml(field.label)} 매칭 해제"
                                                >×</button>
                                            </div>
                                        ` : `
                                            <span class="order-header-drop-placeholder">사이트 헤더</span>
                                        `}
                                    </div>
                                </th>
                            `;
                        }).join("")}
                    </tr>
                    <tr class="order-header-map-excel-row">
                        ${headers.map((header) => `
                            <th>
                                <span>${header.columnIndex + 1}</span>
                                <strong>${escapeHtml(header.label)}</strong>
                            </th>
                        `).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${sampleRows.length ? sampleRows.map((row) => `
                        <tr>
                            ${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}
                        </tr>
                    `).join("") : `
                        <tr>
                            <td colspan="${headers.length}">미리볼 데이터 행이 없습니다.</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

function getOrderHeaderMapPreviewScrollState() {
    const scrollEl = orderHeaderMapPreviewEl?.querySelector(".order-header-map-preview-scroll");
    if (!(scrollEl instanceof HTMLElement)) return null;

    return {
        left: scrollEl.scrollLeft,
        top: scrollEl.scrollTop,
    };
}

function restoreOrderHeaderMapPreviewScrollState(scrollState) {
    if (!scrollState) return;

    const restore = () => {
        const scrollEl = orderHeaderMapPreviewEl?.querySelector(".order-header-map-preview-scroll");
        if (!(scrollEl instanceof HTMLElement)) return;
        scrollEl.scrollLeft = scrollState.left;
        scrollEl.scrollTop = scrollState.top;
    };

    restore();
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(restore);
    }
}

function renderOrderHeaderMapModal(options = {}) {
    const scrollState = options.preservePreviewScroll ? getOrderHeaderMapPreviewScrollState() : null;

    renderOrderHeaderMapFieldSelect();
    renderOrderHeaderMapSiteFields();
    renderOrderHeaderMapSystemFields();
    renderOrderHeaderMapPreview();
    updateOrderHeaderMapSaveState();
    restoreOrderHeaderMapPreviewScrollState(scrollState);
}

function resetOrderHeaderMapModalState() {
    orderHeaderMapSelectedFieldKeys = getRequiredOrderHeaderFieldKeys();
    orderHeaderMapPreviewData = null;
    orderHeaderMapDraft = {};
    draggedOrderHeaderFieldKey = "";
    if (orderHeaderMapFileInput) orderHeaderMapFileInput.value = "";
    updateSelectedFileName(null, orderHeaderMapFileNameEl);
    setOrderHeaderMapStatus("필수 주문 헤더가 먼저 표시됩니다.");
    renderOrderHeaderMapModal();
}

function openOrderHeaderMapModal(channelKey) {
    activeOrderHeaderMapChannelKey = channelKey;
    const channelLabel = getOrderUploadChannelLabel(channelKey);

    if (orderHeaderMapTitleEl) orderHeaderMapTitleEl.textContent = `${channelLabel} 엑셀 양식 설정`;
    if (orderHeaderMapDescEl) {
        orderHeaderMapDescEl.textContent = "샘플 발주서의 헤더를 불러와 사이트 주문 헤더와 맞춥니다.";
    }

    resetOrderHeaderMapModalState();
    loadSavedOrderHeaderMapIntoModal();
    orderHeaderMapModal?.classList.remove("is-hidden");
    orderHeaderMapModal?.setAttribute("aria-hidden", "false");
}

function closeOrderHeaderMapModal() {
    activeOrderHeaderMapChannelKey = "";
    draggedOrderHeaderFieldKey = "";
    clearOrderHeaderDragUi();
    orderHeaderMapModal?.classList.add("is-hidden");
    orderHeaderMapModal?.setAttribute("aria-hidden", "true");
}

function handleAddOrderHeaderMapField() {
    const fieldKey = orderHeaderMapFieldSelect?.value || "";
    if (!fieldKey || orderHeaderMapSelectedFieldKeys.includes(fieldKey)) return;
    if (isOrderHeaderFieldDisabledByConflict(fieldKey)) return;

    setOrderHeaderMapSelectedFieldKeys([...orderHeaderMapSelectedFieldKeys, fieldKey]);
    renderOrderHeaderMapModal({ preservePreviewScroll: true });
}

function handleOrderHeaderMapSiteFieldClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const removeButton = target.closest("[data-order-header-field-remove]");
    if (!(removeButton instanceof HTMLElement)) return;

    const fieldKey = removeButton.getAttribute("data-order-header-field-remove") || "";
    if (!fieldKey || getRequiredOrderHeaderFieldKeys().includes(fieldKey)) return;

    const nextDraft = { ...orderHeaderMapDraft };
    delete nextDraft[fieldKey];
    setOrderHeaderMapSelectedFieldKeys(orderHeaderMapSelectedFieldKeys.filter((key) => key !== fieldKey), nextDraft);
    renderOrderHeaderMapModal({ preservePreviewScroll: true });
    setOrderHeaderMapProgressStatus();
}

async function handleOrderHeaderMapFileChange() {
    const file = orderHeaderMapFileInput?.files?.[0] || null;
    updateSelectedFileName(file, orderHeaderMapFileNameEl);

    if (!file) {
        orderHeaderMapPreviewData = null;
        orderHeaderMapDraft = {};
        setOrderHeaderMapStatus("샘플 발주서를 업로드해주세요.");
        renderOrderHeaderMapModal();
        return;
    }

    setOrderHeaderMapStatus("엑셀 헤더를 읽는 중입니다.", "loading");

    try {
        const nextPreviewData = await readOrderHeaderPreview(file);
        const savedMap = getSavedOrderHeaderMap();
        const hasSavedHeaderMap = Boolean(buildOrderHeaderPreviewFromSavedMap(savedMap));
        const isSameHeader = hasSavedHeaderMap && doesSavedOrderHeaderMatchPreview(savedMap, nextPreviewData);

        if (hasSavedHeaderMap && !isSameHeader) {
            const shouldResetDraft = window.confirm([
                "기존 엑셀 양식과 업로드한 샘플의 헤더가 다릅니다.",
                "새 양식으로 다시 설정하면 현재 화면의 매칭은 초기화됩니다.",
                "저장 버튼을 누르기 전까지 기존 저장값은 유지됩니다.",
                "계속할까요?",
            ].join("\n"));

            if (!shouldResetDraft) {
                if (orderHeaderMapFileInput) orderHeaderMapFileInput.value = "";
                loadSavedOrderHeaderMapIntoModal();
                return;
            }
        }

        orderHeaderMapPreviewData = nextPreviewData;
        if (isSameHeader) {
            restoreOrderHeaderMapDraftForPreview();
        } else {
            setOrderHeaderMapSelectedFieldKeys(getRequiredOrderHeaderFieldKeys(), {});
        }
        renderOrderHeaderMapModal();
        if (isSameHeader) {
            setOrderHeaderMapStatus("기존 매칭을 새 샘플에 복원했습니다.", "success");
        } else {
            setOrderHeaderMapProgressStatus();
        }
    } catch (error) {
        console.error(error);
        orderHeaderMapPreviewData = null;
        orderHeaderMapDraft = {};
        updateSelectedFileName(null, orderHeaderMapFileNameEl);
        if (orderHeaderMapFileInput) orderHeaderMapFileInput.value = "";
        renderOrderHeaderMapModal();
        setOrderHeaderMapStatus(error?.message || "엑셀 헤더를 불러오지 못했습니다.", "error");
    }
}

function clearOrderHeaderDragUi() {
    orderHeaderMapModal
        ?.querySelectorAll(".order-header-site-chip.is-dragging, .order-header-assigned-chip.is-dragging, .order-header-map-drop-cell.is-drag-over")
        .forEach((element) => element.classList.remove("is-dragging", "is-drag-over"));
}

function handleOrderHeaderFieldDragStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const chip = target.closest("[data-order-header-drag-field]");
    if (!(chip instanceof HTMLElement)) return;

    const fieldKey = chip.getAttribute("data-order-header-drag-field") || "";
    if (!fieldKey) return;

    draggedOrderHeaderFieldKey = fieldKey;
    chip.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", fieldKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleOrderHeaderFieldDragEnd() {
    draggedOrderHeaderFieldKey = "";
    clearOrderHeaderDragUi();
}

function handleOrderHeaderDropDragOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !draggedOrderHeaderFieldKey) return;

    const dropCell = target.closest("[data-order-header-drop-column]");
    if (!(dropCell instanceof HTMLElement)) return;

    event.preventDefault();
    dropCell.classList.add("is-drag-over");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleOrderHeaderDropDragLeave(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const dropCell = target.closest("[data-order-header-drop-column]");
    const relatedTarget = event.relatedTarget;
    if (dropCell instanceof HTMLElement && !(relatedTarget instanceof Node && dropCell.contains(relatedTarget))) {
        dropCell.classList.remove("is-drag-over");
    }
}

function handleOrderHeaderDrop(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const dropCell = target.closest("[data-order-header-drop-column]");
    if (!(dropCell instanceof HTMLElement)) return;

    event.preventDefault();
    const fieldKey = event.dataTransfer?.getData("text/plain") || draggedOrderHeaderFieldKey;
    const columnIndex = Number(dropCell.getAttribute("data-order-header-drop-column"));
    draggedOrderHeaderFieldKey = "";
    clearOrderHeaderDragUi();

    if (!fieldKey || Number.isNaN(columnIndex)) return;
    assignOrderHeaderFieldToColumn(fieldKey, columnIndex);
}

function handleOrderHeaderMapPreviewClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const unmapButton = target.closest("[data-order-header-unmap-field]");
    if (!(unmapButton instanceof HTMLElement)) return;

    const fieldKey = unmapButton.getAttribute("data-order-header-unmap-field") || "";
    if (!fieldKey) return;
    unassignOrderHeaderField(fieldKey);
}

function handleSaveOrderHeaderMapSetup() {
    if (!activeOrderHeaderMapChannelKey || !orderHeaderMapPreviewData?.headers?.length) return;

    const missingFields = getMissingRequiredOrderHeaderFields();
    if (missingFields.length) {
        const missingLabels = missingFields.map((fieldKey) => getOrderHeaderField(fieldKey).label).join(", ");
        window.alert(`필수 헤더를 먼저 매칭해주세요.\n남은 필수: ${missingLabels}`);
        return;
    }

    const fields = Object.fromEntries(
        Object.entries(orderHeaderMapDraft)
            .map(([fieldKey, mapping]) => {
                const header = orderHeaderMapPreviewData.headers
                    .find((item) => item.columnIndex === mapping.columnIndex);
                if (!header) return null;
                return [fieldKey, {
                    sourceHeader: header.header || header.label,
                    columnIndex: header.columnIndex,
                }];
            })
            .filter(Boolean),
    );

    orderHeaderMaps[activeOrderHeaderMapChannelKey] = {
        channelKey: activeOrderHeaderMapChannelKey,
        channelName: getOrderUploadChannelLabel(activeOrderHeaderMapChannelKey),
        fileName: orderHeaderMapPreviewData.fileName,
        headerRowIndex: orderHeaderMapPreviewData.headerRowIndex,
        headers: getOrderHeaderSnapshot(orderHeaderMapPreviewData.headers),
        headerSignature: getOrderHeaderSignature(orderHeaderMapPreviewData.headers),
        updatedAt: new Date().toISOString(),
        fields,
    };
    saveOrderHeaderMaps();
    setOrderHeaderMapStatus("엑셀 양식 매칭을 저장했습니다.", "success");
}

function renderOrderUploadChannels() {
    if (!orderUploadChannelListEl) return;
    syncOrderUploadChannelOrder();

    orderUploadChannelListEl.innerHTML = getAllOrderUploadChannels().map((channel) => {
        const state = orderUploadChannelStates[channel.key] || { message: "대기 중", tone: "idle" };
        const isCustom = !isDefaultOrderUploadChannel(channel.key);
        return `
            <div
                class="order-upload-simple-row order-upload-channel-row"
                data-order-upload-channel-row="${escapeHtml(channel.key)}"
                draggable="true"
            >
                <span class="order-upload-drag-handle" aria-hidden="true"></span>
                <div class="order-upload-simple-name">
                    <strong>${escapeHtml(channel.label)}</strong>
                    <span
                        class="order-upload-simple-status is-${escapeHtml(state.tone || "idle")}"
                        data-order-upload-status="${escapeHtml(channel.key)}"
                        title="${escapeHtml(state.message || "")}"
                    >${escapeHtml(state.tone === "error" ? "실패" : (state.message || "대기 중"))}</span>
                </div>
                <div class="order-upload-custom-actions">
                    <button
                        class="order-upload-simple-btn order-upload-format-btn"
                        data-order-header-map-open="${escapeHtml(channel.key)}"
                        type="button"
                        aria-label="${escapeHtml(channel.label)} 엑셀 양식 설정"
                    >엑셀 양식 설정</button>
                    <label for="order-upload-file-${escapeHtml(channel.key)}" class="order-upload-simple-btn">업로드</label>
                    ${isCustom ? `
                        <button
                            class="order-upload-channel-remove-btn"
                            data-order-upload-channel-remove="${escapeHtml(channel.key)}"
                            type="button"
                            aria-label="${escapeHtml(channel.label)} 삭제"
                        >삭제</button>
                    ` : ""}
                </div>
                <input
                    id="order-upload-file-${escapeHtml(channel.key)}"
                    class="hidden-file-input"
                    data-order-upload-file="${escapeHtml(channel.key)}"
                    type="file"
                    accept="${escapeHtml(getOrderUploadAcceptForChannel(channel.key))}"
                />
            </div>
        `;
    }).join("");
}

function getOrderUploadDropPosition(row, clientY) {
    const rect = row.getBoundingClientRect();
    return clientY > rect.top + (rect.height / 2) ? "after" : "before";
}

function clearOrderUploadDropIndicators() {
    orderUploadChannelListEl
        ?.querySelectorAll(".order-upload-channel-row.is-drop-target, .order-upload-channel-row.is-drop-before, .order-upload-channel-row.is-drop-after")
        .forEach((row) => row.classList.remove("is-drop-target", "is-drop-before", "is-drop-after"));
}

function reorderOrderUploadChannel(draggedKey, targetKey, position = "before") {
    if (!draggedKey || !targetKey || draggedKey === targetKey) return;

    syncOrderUploadChannelOrder();
    const nextOrder = orderUploadChannelOrder.filter((channelKey) => channelKey !== draggedKey);
    let targetIndex = nextOrder.indexOf(targetKey);
    if (targetIndex < 0) return;

    if (position === "after") targetIndex += 1;
    nextOrder.splice(targetIndex, 0, draggedKey);
    orderUploadChannelOrder = nextOrder;
    saveOrderUploadCustomChannels();
    renderOrderUploadChannels();
}

function handleOrderUploadChannelDragStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest("[data-order-upload-channel-row]");
    if (!(row instanceof HTMLElement)) return;

    draggedOrderUploadChannelKey = row.getAttribute("data-order-upload-channel-row") || "";
    row.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", draggedOrderUploadChannelKey);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleOrderUploadChannelDragOver(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !draggedOrderUploadChannelKey) return;
    const row = target.closest("[data-order-upload-channel-row]");
    if (!(row instanceof HTMLElement)) return;

    event.preventDefault();
    const targetKey = row.getAttribute("data-order-upload-channel-row") || "";
    if (targetKey === draggedOrderUploadChannelKey) {
        clearOrderUploadDropIndicators();
        return;
    }

    const position = getOrderUploadDropPosition(row, event.clientY);
    clearOrderUploadDropIndicators();
    row.classList.add("is-drop-target", position === "after" ? "is-drop-after" : "is-drop-before");
}

function handleOrderUploadChannelDrop(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest("[data-order-upload-channel-row]");
    if (!(row instanceof HTMLElement)) return;

    event.preventDefault();
    const targetKey = row.getAttribute("data-order-upload-channel-row") || "";
    const position = getOrderUploadDropPosition(row, event.clientY);
    reorderOrderUploadChannel(draggedOrderUploadChannelKey, targetKey, position);
}

function handleOrderUploadChannelDragEnd() {
    draggedOrderUploadChannelKey = "";
    orderUploadChannelListEl
        ?.querySelectorAll(".order-upload-channel-row.is-dragging")
        .forEach((row) => row.classList.remove("is-dragging"));
    clearOrderUploadDropIndicators();
}

function handleOrderUploadChannelDragLeave(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest("[data-order-upload-channel-row]");
    const relatedTarget = event.relatedTarget;
    if (row instanceof HTMLElement && !(relatedTarget instanceof Node && row.contains(relatedTarget))) {
        row.classList.remove("is-drop-target", "is-drop-before", "is-drop-after");
    }
}

function handleOrderUploadChannelFileChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const channelKey = target.getAttribute("data-order-upload-file") || "";
    if (!channelKey) return;
    const file = target.files?.[0];
    void setOrderUploadFileSelectedState(channelKey, file, target);
}

function handleOpenOrderHeaderMapSetup(channelKey) {
    openOrderHeaderMapModal(channelKey);
}

function handleAddOrderUploadChannel() {
    if (!orderUploadChannelInput) return;

    const label = normalizeOrderUploadChannelName(orderUploadChannelInput.value);
    if (!label) {
        window.alert("추가할 판매처명을 입력해주세요.");
        orderUploadChannelInput.focus();
        return;
    }

    const normalizedLabel = normalizeOrderProductName(label);
    const isDuplicate = getAllOrderUploadChannels()
        .some((channel) => normalizeOrderProductName(channel.label) === normalizedLabel);

    if (isDuplicate) {
        window.alert("이미 등록된 판매처입니다.");
        orderUploadChannelInput.focus();
        return;
    }

    let key = buildCustomOrderUploadChannelKey(label);
    const existingKeys = new Set(getAllOrderUploadChannels().map((channel) => channel.key));
    let suffix = 2;
    while (existingKeys.has(key)) {
        key = `${buildCustomOrderUploadChannelKey(label)}-${suffix}`;
        suffix += 1;
    }

    orderUploadCustomChannels = [...orderUploadCustomChannels, { key, label }];
    orderUploadChannelOrder = [...orderUploadChannelOrder.filter((channelKey) => channelKey !== key), key];
    orderUploadChannelStates[key] = { message: "대기 중", tone: "idle" };
    orderUploadChannelInput.value = "";
    saveOrderUploadCustomChannels();
    renderOrderUploadChannels();
}

function handleRemoveOrderUploadChannel(channelKey) {
    const channel = orderUploadCustomChannels.find((item) => item.key === channelKey);
    if (!channel) return;

    const hasRows = orderUploadRows.some((row) => row.channel === channelKey);
    if (hasRows && !window.confirm(`${channel.label} 업로드 데이터도 함께 비울까요?`)) return;

    orderUploadCustomChannels = orderUploadCustomChannels.filter((item) => item.key !== channelKey);
    orderUploadChannelOrder = orderUploadChannelOrder.filter((item) => item !== channelKey);
    orderUploadRows = orderUploadRows.filter((row) => row.channel !== channelKey);
    delete orderUploadChannelStates[channelKey];
    if (orderHeaderMaps[channelKey]) {
        delete orderHeaderMaps[channelKey];
        saveOrderHeaderMaps();
    }
    clearOrderMatchDraftsForChannel(channelKey);
    saveOrderUploadCustomChannels();
    renderOrderUploadChannels();
    renderOrderMatchPanel();
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

const ORDER_MATCH_SCOPED_KEY_PREFIX = "channel:";

function normalizeOrderChannel(channel) {
    return String(channel ?? "").trim().toLowerCase();
}

function getOrderProductMatchKey(channel, productName) {
    const normalizedChannel = normalizeOrderChannel(channel);
    const normalizedName = normalizeOrderProductName(productName);
    if (!normalizedChannel || !normalizedName) return "";
    return `${ORDER_MATCH_SCOPED_KEY_PREFIX}${normalizedChannel}:${normalizedName}`;
}

function parseOrderProductMatchKey(matchKey) {
    const matchKeyText = String(matchKey ?? "");
    if (!matchKeyText.startsWith(ORDER_MATCH_SCOPED_KEY_PREFIX)) {
        return {
            channel: "",
            isScoped: false,
            legacyMatchKey: matchKeyText,
            normalizedName: matchKeyText,
        };
    }

    const rest = matchKeyText.slice(ORDER_MATCH_SCOPED_KEY_PREFIX.length);
    const separatorIndex = rest.indexOf(":");
    if (separatorIndex < 0) {
        return {
            channel: "",
            isScoped: true,
            legacyMatchKey: rest,
            normalizedName: rest,
        };
    }

    const channel = rest.slice(0, separatorIndex);
    const normalizedName = rest.slice(separatorIndex + 1);
    return {
        channel,
        isScoped: true,
        legacyMatchKey: normalizedName,
        normalizedName,
    };
}

function isScopedOrderProductMatchKey(matchKey) {
    return parseOrderProductMatchKey(matchKey).isScoped;
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

function getOrderProductByMatchKey(matchKey) {
    const matchKeyText = String(matchKey ?? "");
    if (!matchKeyText) return null;
    return getUniqueOrderProducts().find((item) => item.matchKey === matchKeyText) || null;
}

function getOrderProductNameByMatchKey(matchKey) {
    const matchKeyText = String(matchKey ?? "");
    const product = getOrderProductByMatchKey(matchKeyText);
    if (product?.productName) return product.productName;
    const matchRecord = orderProductMatches[matchKeyText] || orderProductMatches[parseOrderProductMatchKey(matchKeyText).legacyMatchKey];
    return matchRecord?.orderProductName || matchKeyText;
}

function getOrderProductChannelByMatchKey(matchKey) {
    const product = getOrderProductByMatchKey(matchKey);
    if (product?.channel) return product.channel;

    const matchRecord = orderProductMatches[String(matchKey ?? "")];
    if (matchRecord?.channel) return normalizeOrderChannel(matchRecord.channel);

    return parseOrderProductMatchKey(matchKey).channel;
}

function getOrderProductChannelLabelByMatchKey(matchKey) {
    const product = getOrderProductByMatchKey(matchKey);
    if (product?.channelName) return product.channelName;

    const matchRecord = orderProductMatches[String(matchKey ?? "")];
    if (matchRecord?.channelName) return matchRecord.channelName;

    return getOrderUploadChannelLabel(getOrderProductChannelByMatchKey(matchKey));
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

function getOrderMatchRecord(matchKey, { includeLegacy = false } = {}) {
    const matchKeyText = String(matchKey ?? "");
    if (!matchKeyText) return null;

    const scopedRecord = orderProductMatches[matchKeyText];
    if (scopedRecord && typeof scopedRecord === "object") {
        return {
            isLegacy: false,
            matchKey: matchKeyText,
            record: scopedRecord,
        };
    }

    const parsedKey = parseOrderProductMatchKey(matchKeyText);
    if (!includeLegacy || !parsedKey.isScoped || !parsedKey.legacyMatchKey) return null;

    const legacyRecord = orderProductMatches[parsedKey.legacyMatchKey];
    if (!legacyRecord || typeof legacyRecord !== "object") return null;

    return {
        isLegacy: true,
        matchKey: parsedKey.legacyMatchKey,
        record: legacyRecord,
    };
}

function getSavedOrderComponents(matchKey, { includeIncomplete = false, includeLegacy = true } = {}) {
    const matchEntry = getOrderMatchRecord(matchKey, { includeLegacy });
    return normalizeOrderMatchComponents(matchEntry?.record, { includeIncomplete });
}

function findSkuByProductNameCandidate(productName) {
    const normalizedName = normalizeOrderProductName(productName);
    if (!normalizedName) return null;
    return getMatchableSkuRows().find((row) => normalizeOrderProductName(row.productName) === normalizedName) || null;
}

function normalizeBarcode(value) {
    return String(value ?? "").trim().replace(/\s+/g, "");
}

function getSkuProductCodeCandidates(value) {
    const rawCode = String(value ?? "").trim().replace(/\s+/g, "");
    if (!rawCode) return [];

    const candidates = new Set([rawCode.toUpperCase()]);
    if (/^\d+$/.test(rawCode)) {
        candidates.add(rawCode.replace(/^0+/, "") || "0");
    }

    return [...candidates];
}

function findSkuByBarcode(barcode) {
    const normalizedBarcode = normalizeBarcode(barcode);
    if (!normalizedBarcode) return null;
    return getMatchableSkuRows().find((row) => normalizeBarcode(row?.barcode) === normalizedBarcode) || null;
}

function findSkuByProductCode(productCode) {
    const codeCandidates = getSkuProductCodeCandidates(productCode);
    if (!codeCandidates.length) return null;
    const codeCandidateSet = new Set(codeCandidates);

    return getMatchableSkuRows().find((row) => (
        [row?.adminProductCode, row?.selfProductCode, row?.manufacturerProductCode]
            .some((candidate) => getSkuProductCodeCandidates(candidate).some((code) => codeCandidateSet.has(code)))
    )) || null;
}

function toMilkrunSkuComponent(component) {
    const skuRow = getSkuByMatchKey(component?.skuKey);
    if (!skuRow) return null;

    return {
        skuKey: getSkuMatchKey(skuRow),
        skuName: skuRow.productName || component?.skuName || "",
        quantity: normalizeOrderMatchQuantity(component?.quantity),
        pcsPerBox: skuRow.pcsPerBox,
        boxesPerPlt: skuRow.boxesPerPlt,
        pcsPerPlt: skuRow.pcsPerPlt,
        skuGrossWeightG: skuRow.skuGrossWeightG,
        outboxGrossWeightG: skuRow.outboxGrossWeightG,
    };
}

function getMilkrunSkuComponentsForOrderRow(row) {
    const matchKey = getOrderProductMatchKey(row?.channel, row?.productName);
    const matchedComponents = getResolvedOrderComponents(matchKey)
        .map(toMilkrunSkuComponent)
        .filter(Boolean);

    if (matchedComponents.length) return matchedComponents;

    const directSkuRow = findSkuByProductCode(row?.productCode) ||
        findSkuByBarcode(row?.barcode) ||
        findSkuByProductNameCandidate(row?.productName);

    return directSkuRow
        ? [toMilkrunSkuComponent(createOrderMatchComponent(directSkuRow, 1))].filter(Boolean)
        : [];
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

function getAutoOrderComponents(productName, barcode = "") {
    const productNameText = String(productName ?? "").trim();
    if (!productNameText) return [];

    const barcodeSkuRow = findSkuByBarcode(barcode);
    if (barcodeSkuRow) {
        return [createOrderMatchComponent(barcodeSkuRow, 1)];
    }

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

function getEditableOrderComponents(matchKey) {
    if (Array.isArray(orderMatchDraftComponents[matchKey])) {
        return orderMatchDraftComponents[matchKey];
    }

    const savedComponents = getSavedOrderComponents(matchKey, { includeIncomplete: true, includeLegacy: true });
    if (savedComponents.length) return savedComponents;

    const orderProduct = getOrderProductByMatchKey(matchKey);
    const productName = orderProduct?.productName || getOrderProductNameByMatchKey(matchKey);
    const autoComponents = getAutoOrderComponents(productName, orderProduct?.barcode || "");
    if (autoComponents.length) return autoComponents;

    return [{ skuKey: "", skuName: "", quantity: 1 }];
}

function getResolvedOrderComponents(matchKey) {
    if (Array.isArray(orderMatchDraftComponents[matchKey])) {
        return orderMatchDraftComponents[matchKey];
    }

    const savedComponents = getSavedOrderComponents(matchKey, { includeLegacy: true });
    if (savedComponents.length) return savedComponents;

    const orderProduct = getOrderProductByMatchKey(matchKey);
    const productName = orderProduct?.productName || getOrderProductNameByMatchKey(matchKey);
    return getAutoOrderComponents(productName, orderProduct?.barcode || "");
}

function hasSavedOrderProductMatch(matchKey) {
    return hasCompleteOrderComponents(getSavedOrderComponents(matchKey, { includeLegacy: false }));
}

function hasDraftOrderProductMatch(matchKey) {
    return hasCompleteOrderComponents(orderMatchDraftComponents[matchKey]);
}

function clearOrderMatchDraftsForChannel(channel) {
    const normalizedChannel = normalizeOrderChannel(channel);
    if (!normalizedChannel) return;

    Object.keys(orderMatchDraftComponents).forEach((matchKey) => {
        if (parseOrderProductMatchKey(matchKey).channel !== normalizedChannel) return;
        delete orderMatchDraftComponents[matchKey];
        confirmedOrderMatchKeys.delete(matchKey);
    });
}

function hasLegacyOrderProductMatch(matchKey) {
    const legacyEntry = getOrderMatchRecord(matchKey, { includeLegacy: true });
    return legacyEntry?.isLegacy === true &&
        hasCompleteOrderComponents(normalizeOrderMatchComponents(legacyEntry.record));
}

function hasCompleteOrderMatch(matchKey) {
    return hasCompleteOrderComponents(getResolvedOrderComponents(matchKey));
}

function getOrderMatchStateText(matchKey) {
    const components = getResolvedOrderComponents(matchKey);
    if (!hasCompleteOrderComponents(components)) return "매칭 필요";

    let prefix = "자동 매칭";
    if (hasDraftOrderProductMatch(matchKey)) {
        prefix = "확인 대기";
    } else if (hasSavedOrderProductMatch(matchKey)) {
        prefix = "저장된 매칭";
    } else if (hasLegacyOrderProductMatch(matchKey)) {
        prefix = "기존 공용 매칭";
    }

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
    const channel = getOrderProductChannelByMatchKey(matchKey);
    const channelName = getOrderProductChannelLabelByMatchKey(matchKey);
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
        channel,
        channelName,
        orderProductName,
        components: cleanComponents,
        matchedAt: new Date().toISOString(),
    };
    orderMatchDraftComponents[matchKey] = cleanComponents;
    void saveOrderProductMatches();
}

function getSavedOrderMatchEntries() {
    return Object.entries(orderProductMatches ?? {})
        .filter(([matchKey]) => isScopedOrderProductMatchKey(matchKey))
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
            const channelName = String(matchRecord.channelName || getOrderProductChannelLabelByMatchKey(matchKey)).trim();

            return {
                matchKey,
                channelName,
                orderProductName,
                components,
                componentSummary: getOrderMatchComponentSummary(components),
                matchedAt: matchRecord.matchedAt || "",
            };
        })
        .sort((left, right) => (
            left.channelName.localeCompare(right.channelName, "ko") ||
            left.orderProductName.localeCompare(right.orderProductName, "ko")
        ));
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
            const channel = normalizeOrderChannel(row.channel);
            const channelName = row.channelName || getOrderUploadChannelLabel(channel);
            const matchKey = getOrderProductMatchKey(channel, productName);
            if (!matchKey) return;

            if (!productMap.has(matchKey)) {
                productMap.set(matchKey, {
                    channel,
                    channelName,
                    matchKey,
                    productName,
                    barcode: normalizeBarcode(row.barcode),
                    rowCount: 0,
                    channels: new Set(),
                });
            }

            const item = productMap.get(matchKey);
            item.rowCount += 1;
            if (!item.barcode) item.barcode = normalizeBarcode(row.barcode);
            item.channels.add(channelName);
        });

    return [...productMap.values()];
}

function shouldShowOrderMatchProduct(item) {
    if (!item?.matchKey || confirmedOrderMatchKeys.has(item.matchKey)) return false;
    return !hasSavedOrderProductMatch(item.matchKey);
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

    const openProducts = products.filter(shouldShowOrderMatchProduct);
    const matchedCount = products.filter((item) => hasCompleteOrderMatch(item.matchKey)).length;
    orderMatchStatusEl.textContent = `총 ${products.length}개 상품 중 ${matchedCount}개 매칭`;

    if (!openProducts.length) {
        orderMatchListEl.innerHTML = '<div class="order-match-empty is-success">상품 매칭 확인이 완료되었습니다.</div>';
        if (orderMatchConfirmBtn) orderMatchConfirmBtn.disabled = true;
        return;
    }

    orderMatchListEl.innerHTML = `
        ${openProducts.map((item) => {
        const components = getEditableOrderComponents(item.matchKey);
        const hasCompleteMatch = hasCompleteOrderComponents(getResolvedOrderComponents(item.matchKey));
        const matchStateText = getOrderMatchStateText(item.matchKey);
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

    const hasUnmatched = openProducts.some((item) => !hasCompleteOrderMatch(item.matchKey));
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

    const components = getEditableOrderComponents(matchKey);
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
    const components = getEditableOrderComponents(matchKey)
        .map((component) => ({ ...component }));

    if (!components[componentIndex]) {
        components[componentIndex] = { skuKey: "", skuName: "", quantity: 1 };
    }

    components[componentIndex] = createOrderMatchComponent(skuRow, components[componentIndex].quantity);
    orderMatchDraftComponents[matchKey] = components;
    confirmedOrderMatchKeys.delete(matchKey);

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

    const components = getEditableOrderComponents(matchKey)
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

        const components = getEditableOrderComponents(matchKey)
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

        const components = getEditableOrderComponents(matchKey)
            .map((component) => ({ ...component }))
            .filter((_, index) => index !== componentIndex);
        const nextComponents = components.length ? components : [{ skuKey: "", skuName: "", quantity: 1 }];

        orderMatchDraftComponents[matchKey] = nextComponents;
        confirmedOrderMatchKeys.delete(matchKey);

        renderOrderMatchPanel();
    }
}

function persistConfirmedOrderMatchIfNeeded(item) {
    const components = getResolvedOrderComponents(item.matchKey);
    if (!hasCompleteOrderComponents(components)) return false;

    saveOrderMatchComponents(item.matchKey, components);
    confirmedOrderMatchKeys.add(item.matchKey);
    return true;
}

function handleConfirmAllOrderMatches() {
    const products = getUniqueOrderProducts();
    const openProducts = products.filter(shouldShowOrderMatchProduct);
    const unmatchedProducts = openProducts.filter((item) => !hasCompleteOrderMatch(item.matchKey));

    if (!openProducts.length) return;

    if (unmatchedProducts.length) {
        window.alert(`아직 매칭되지 않은 상품이 ${unmatchedProducts.length}개 있습니다.`);
        return;
    }

    openProducts.forEach((item) => {
        persistConfirmedOrderMatchIfNeeded(item);
    });

    renderOrderMatchPanel();
    rebuildMilkrunWorkspacesFromSkuData();
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
            normalizeOrderProductName(entry.channelName).includes(normalizedTerm) ||
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
                <span>${escapeHtml(entry.channelName)} · ${escapeHtml(entry.componentSummary)}</span>
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
    const channelName = getOrderProductChannelLabelByMatchKey(matchKey);
    if (!window.confirm(`[${channelName}] ${orderProductName} 매칭을 삭제할까요?`)) return;

    delete orderProductMatches[matchKey];
    delete orderMatchDraftComponents[matchKey];
    confirmedOrderMatchKeys.delete(matchKey);
    void saveOrderProductMatches();
    renderOrderMatchDeleteList();
    renderOrderMatchPanel();
    rebuildMilkrunWorkspacesFromSkuData();
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

function buildCoupangMilkrunRows(rows) {
    return buildMilkrunRowsFromOrderRows(rows, {
        resolveSkuComponents: getMilkrunSkuComponentsForOrderRow,
    });
}

function getMilkrunWorkspaceSourceRows(workspace) {
    const sourceRowsFromMemory = milkrunWorkspaceSourceRows.get(workspace?.id);
    if (Array.isArray(sourceRowsFromMemory) && sourceRowsFromMemory.length) return sourceRowsFromMemory;
    return Array.isArray(workspace?.sourceRows) ? workspace.sourceRows : [];
}

function hydrateMilkrunWorkspaceSourceRows(workspaces = milkrunWorkspaces) {
    (workspaces ?? []).forEach((workspace) => {
        if (!workspace?.id || !Array.isArray(workspace.sourceRows) || !workspace.sourceRows.length) return;
        milkrunWorkspaceSourceRows.set(workspace.id, workspace.sourceRows);
    });
}

function compactCoupangSourceRows(rows) {
    return (rows ?? []).map((row) => ({
        rowId: row.rowId,
        channel: "coupang",
        channelName: row.channelName || "쿠팡(밀크런)",
        isValid: row.isValid !== false,
        orderCode: row.orderCode,
        dueDate: row.dueDate,
        center: row.center,
        productCode: row.productCode,
        productName: row.productName,
        barcode: row.barcode,
        quantity: row.quantity,
        boxPerUnit: row.boxPerUnit,
        boxCount: row.boxCount,
        ptCount: row.ptCount,
        weight: row.weight,
        destination: row.destination,
    }));
}

function preserveMilkrunAssignedCenters(nextRows, previousRows) {
    const previousByOrderId = new Map((previousRows ?? [])
        .map((row) => [String(row.orderId ?? ""), row])
        .filter(([orderId]) => orderId));

    return (nextRows ?? []).map((row) => {
        const previousRow = previousByOrderId.get(String(row.orderId ?? ""));
        return previousRow?.assignedCenter
            ? { ...row, assignedCenter: previousRow.assignedCenter }
            : row;
    });
}

function rebuildMilkrunWorkspacesFromSkuData({ persist = true, render = true } = {}) {
    let hasChanges = false;

    milkrunWorkspaces = milkrunWorkspaces.map((workspace) => {
        const sourceRows = getMilkrunWorkspaceSourceRows(workspace);
        if (!Array.isArray(sourceRows) || !sourceRows.length) return workspace;

        const rebuiltRows = preserveMilkrunAssignedCenters(
            buildCoupangMilkrunRows(sourceRows),
            workspace.rows,
        );
        hasChanges = true;

        return {
            ...workspace,
            rows: rebuiltRows,
            sourceRows,
            updatedAt: new Date().toISOString(),
        };
    });

    if (!hasChanges) return false;

    if (activeMilkrunWorkspaceId) {
        milkrunRows = getActiveMilkrunWorkspace()?.rows ?? [];
    }

    saveMilkrunWorkspacesToLocal();
    if (persist) void persistSkuWorkspace();

    if (render) {
        renderMilkrunWorkspaceList();
        renderMilkrunDashboard();
    }

    return true;
}

async function applyCoupangOrdersToMilkrun(rows, file) {
    const validRows = (rows ?? []).filter((row) => row.channel === "coupang" && row.isValid);
    const sourceRows = compactCoupangSourceRows(validRows);
    const nextRows = buildCoupangMilkrunRows(sourceRows);
    const workspaceId = buildMilkrunWorkspaceId(file?.name || `order-${Date.now()}`);
    const workspaceTitle = getMilkrunWorkspaceLabel(file?.name || "");
    milkrunWorkspaceSourceRows.set(workspaceId, sourceRows);
    selectedMilkrunWorkspaceIds.delete(workspaceId);

    milkrunWorkspaces = [
        ...milkrunWorkspaces.filter((item) => item.id !== workspaceId),
        { id: workspaceId, title: workspaceTitle, rows: nextRows, sourceRows, updatedAt: new Date().toISOString() },
    ].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    activeMilkrunWorkspaceId = "";
    milkrunRows = [];

    const uploadedCenters = getUniqueMilkrunCenters(validRows.map((row) => row.center));
    const nextCenters = getUniqueMilkrunCenters([...coupangCenterOptions, ...uploadedCenters]);

    if (nextCenters.length !== coupangCenterOptions.length) {
        setMilkrunCenterOptions(nextCenters);
    }

    renderMilkrunWorkspaceList();
    renderMilkrunDashboard();
    saveMilkrunWorkspacesToLocal();
    await persistSkuWorkspace();
}

async function applyKurlyOrdersToLabel(validationRows, file) {
    const validRows = (validationRows ?? []).filter((row) => row.isValid);
    const workspaceId = buildKurlyLabelWorkspaceId(file?.name || `kurly-order-${Date.now()}`);
    const workspaceTitle = getKurlyLabelWorkspaceLabel(file?.name || "");
    selectedKurlyLabelWorkspaceIds.delete(workspaceId);

    kurlyLabelWorkspaces = [
        ...kurlyLabelWorkspaces.filter((item) => item.id !== workspaceId),
        { id: workspaceId, title: workspaceTitle, rows: validRows, updatedAt: new Date().toISOString() },
    ].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    activeKurlyLabelWorkspaceId = "";
    kurlyRows = [];
    kurlyParsedFileName = "";

    renderKurlyLabelWorkspaceList();
    renderKurlyLabelWorkspaceDetail();
    saveKurlyLabelWorkspacesToLocal();
    await persistSkuWorkspace();
    setKurlyLabelResult(`발주서 업로드에서 컬리 발주서 ${workspaceTitle} 저장 완료: 총 ${validRows.length}건`);
    setKurlyProgress({
        message: "업로드/검증 완료",
        detail: "컬리 라벨 생성에서 발주서를 선택해 출력할 수 있습니다.",
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
        } else if (channel === "kurly") {
            const parsedKurlyRows = await parseKurlyLabelFile(file);
            const validationResult = validateKurlyRows(parsedKurlyRows);
            validationRows = validationResult.rows;
            normalizedRows = buildKurlyOrderRows(validationRows);
        } else {
            normalizedRows = await parseGenericOrderFile(file, {
                channel,
                channelName: channelLabel,
                headerMap: getSavedOrderHeaderMap(channel),
                requiredFields: getRequiredOrderHeaderFieldKeys(channel),
            });
            validationRows = normalizedRows;
        }

        orderUploadRows = [
            ...orderUploadRows.filter((row) => row.channel !== channel),
            ...normalizedRows,
        ];
        clearOrderMatchDraftsForChannel(channel);
        normalizedRows.forEach((row) => {
            const matchKey = getOrderProductMatchKey(row.channel, row.productName);
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
            await applyCoupangOrdersToMilkrun(normalizedRows, file);
            setOrderUploadChannelStatus(channel, `완료 ${valid}건`, "success");
        } else if (channel === "kurly") {
            await applyKurlyOrdersToLabel(validationRows, file);
            setOrderUploadChannelStatus(channel, `완료 ${valid}건`, "success");
        } else {
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

function getKurlyLabelWorkspaceLabel(fileName = "") {
    return String(fileName || "")
        .replace(/\.[^.]+$/, "")
        .trim() || "업로드 발주서";
}

function buildKurlyLabelWorkspaceId(fileName = "") {
    const label = getKurlyLabelWorkspaceLabel(fileName);
    return label.toLowerCase().replace(/\s+/g, "-");
}

function getKurlyLabelWorkspaceRows(workspace) {
    return Array.isArray(workspace?.rows) ? workspace.rows : [];
}

function getKurlyLabelItemsFromRows(rows) {
    return buildKurlyLabelItems((rows ?? []).filter((row) => row.isValid));
}

function getKurlyLabelWorkspaceSummary(workspace) {
    const rows = getKurlyLabelWorkspaceRows(workspace);
    const labelItems = getKurlyLabelItemsFromRows(rows);
    const centerCount = new Set(labelItems.map((item) => item.center || "미지정센터")).size;

    return {
        centerCount,
        labelItems,
        labelCount: labelItems.length,
        rowCount: rows.length,
    };
}

function getActiveKurlyLabelWorkspace() {
    return kurlyLabelWorkspaces.find((item) => item.id === activeKurlyLabelWorkspaceId) || null;
}

function syncSelectedKurlyLabelWorkspaceIds() {
    const existingIds = new Set(kurlyLabelWorkspaces.map((workspace) => workspace.id));
    selectedKurlyLabelWorkspaceIds = new Set([...selectedKurlyLabelWorkspaceIds].filter((id) => existingIds.has(id)));
}

function syncKurlyLabelWorkspaceListActions() {
    syncSelectedKurlyLabelWorkspaceIds();

    const selectedCount = selectedKurlyLabelWorkspaceIds.size;
    const hasWorkspaces = kurlyLabelWorkspaces.length > 0;
    const allSelected = hasWorkspaces && selectedCount === kurlyLabelWorkspaces.length;

    if (kurlyLabelSelectAllBtn) {
        kurlyLabelSelectAllBtn.disabled = !hasWorkspaces;
        kurlyLabelSelectAllBtn.textContent = allSelected ? "전체 해제" : "전체 선택";
    }
    if (kurlyLabelDeleteSelectedBtn) {
        kurlyLabelDeleteSelectedBtn.disabled = selectedCount === 0;
        kurlyLabelDeleteSelectedBtn.textContent = selectedCount > 0
            ? `선택 삭제 (${selectedCount})`
            : "선택 삭제";
    }
}

function saveKurlyLabelWorkspacesToLocal() {
    try {
        const storage = getMilkrunStorage();
        storage?.setItem(KURLY_LABEL_WORKSPACE_STORAGE_KEY, JSON.stringify({
            activeId: activeKurlyLabelWorkspaceId,
            workspaces: kurlyLabelWorkspaces,
        }));
    } catch (error) {
        console.warn("컬리 라벨 발주서 목록을 저장하지 못했습니다.", error);
    }
}

function loadKurlyLabelWorkspacesFromLocal() {
    try {
        const storage = getMilkrunStorage();
        const raw = storage?.getItem(KURLY_LABEL_WORKSPACE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        kurlyLabelWorkspaces = Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
        activeKurlyLabelWorkspaceId = String(parsed?.activeId || "");
    } catch (error) {
        console.warn("컬리 라벨 발주서 목록을 불러오지 못했습니다.", error);
    }
}

function renderKurlyLabelWorkspaceMode() {
    const active = getActiveKurlyLabelWorkspace();
    const hasActiveWorkspace = Boolean(active);

    if (kurlyLabelSessionListEl) kurlyLabelSessionListEl.hidden = hasActiveWorkspace;
    if (kurlyLabelSummaryEl) kurlyLabelSummaryEl.hidden = !hasActiveWorkspace;
    if (kurlyLabelWorkspaceGridEl) kurlyLabelWorkspaceGridEl.hidden = !hasActiveWorkspace;
    if (kurlyLabelWorkspaceActionsEl) kurlyLabelWorkspaceActionsEl.hidden = !hasActiveWorkspace;
    if (kurlyLabelListActionsEl) kurlyLabelListActionsEl.hidden = hasActiveWorkspace;

    if (kurlyLabelWorkspaceTitleEl) {
        kurlyLabelWorkspaceTitleEl.textContent = hasActiveWorkspace
            ? `${active.title || active.id} 라벨 작업`
            : "업로드 발주서 목록";
    }
    if (kurlyLabelWorkspaceDescEl) {
        kurlyLabelWorkspaceDescEl.textContent = hasActiveWorkspace
            ? "라벨 내용을 미리 확인한 뒤 센터별 PDF를 다운로드합니다."
            : "발주서 업로드에서 컬리 발주서를 업로드한 뒤, 발주서명을 선택해 라벨을 미리보고 PDF를 다운로드합니다.";
    }
}

function renderKurlyLabelWorkspaceList() {
    if (!kurlyLabelSessionListEl) return;
    syncSelectedKurlyLabelWorkspaceIds();

    if (!kurlyLabelWorkspaces.length) {
        kurlyLabelSessionListEl.innerHTML = `
            <div class="milkrun-session-empty">
                발주서 업로드에서 컬리 발주서를 업로드하면 이곳에 발주서명이 표시됩니다.
            </div>
        `;
        renderKurlyLabelWorkspaceMode();
        syncKurlyLabelWorkspaceListActions();
        return;
    }

    kurlyLabelSessionListEl.innerHTML = kurlyLabelWorkspaces.map((workspace) => {
        const summary = getKurlyLabelWorkspaceSummary(workspace);
        const updatedAt = formatMilkrunWorkspaceUpdatedAt(workspace.updatedAt);

        return `
            <article class="milkrun-session-item${workspace.id === activeKurlyLabelWorkspaceId ? " is-active" : ""}">
                <label class="milkrun-session-check">
                    <input
                        type="checkbox"
                        data-kurly-label-workspace-check="${escapeHtml(workspace.id)}"
                        ${selectedKurlyLabelWorkspaceIds.has(workspace.id) ? "checked" : ""}
                        aria-label="${escapeHtml(workspace.title || workspace.id)} 선택"
                    />
                </label>
                <button
                    type="button"
                    class="milkrun-session-chip"
                    data-kurly-label-workspace-id="${escapeHtml(workspace.id)}"
                >
                    <span class="milkrun-session-title" title="${escapeHtml(workspace.title || workspace.id)}">${escapeHtml(workspace.title || workspace.id)}</span>
                    <span class="milkrun-session-meta">
                        상품 ${formatMilkrunNumber(summary.rowCount)}행 · 라벨 ${formatMilkrunNumber(summary.labelCount)}장 · 센터 ${formatMilkrunNumber(summary.centerCount)}개${updatedAt ? ` · ${escapeHtml(updatedAt)}` : ""}
                    </span>
                </button>
            </article>
        `;
    }).join("");

    renderKurlyLabelWorkspaceMode();
    syncKurlyLabelWorkspaceListActions();
}

function renderKurlyLabelSummary(workspace) {
    const summary = getKurlyLabelWorkspaceSummary(workspace);
    if (kurlyLabelTotalLabelsEl) kurlyLabelTotalLabelsEl.textContent = formatMilkrunNumber(summary.labelCount);
    if (kurlyLabelTotalRowsEl) kurlyLabelTotalRowsEl.textContent = formatMilkrunNumber(summary.rowCount);
    if (kurlyLabelCenterCountEl) kurlyLabelCenterCountEl.textContent = formatMilkrunNumber(summary.centerCount);
    if (kurlyLabelActiveNameEl) kurlyLabelActiveNameEl.textContent = workspace?.title || "-";
}

function renderKurlyLabelPreview(labelItems) {
    if (!kurlyLabelPreviewGridEl) return;

    if (!labelItems.length) {
        kurlyLabelPreviewGridEl.innerHTML = '<div class="kurly-label-preview-empty">미리볼 라벨이 없습니다.</div>';
        if (kurlyLabelPreviewNoteEl) kurlyLabelPreviewNoteEl.textContent = "";
        return;
    }

    const previewItems = labelItems;
    if (kurlyLabelPreviewNoteEl) {
        kurlyLabelPreviewNoteEl.textContent = labelItems.length > previewItems.length
            ? `처음 ${previewItems.length}장만 표시합니다. 전체 ${labelItems.length}장은 PDF에 포함됩니다.`
            : `전체 ${labelItems.length}장을 미리보고 있습니다.`;
    }

    kurlyLabelPreviewGridEl.innerHTML = previewItems.map((item) => `
        <article class="kurly-label-preview-card">
            <table>
                <tbody>
                    <tr><th>발주코드</th><td>${escapeHtml(item.orderCode)}</td></tr>
                    <tr><th>공급사명</th><td>${escapeHtml(item.supplierName)}</td></tr>
                    <tr><th>상품명</th><td>${escapeHtml(item.productName)}</td></tr>
                    <tr><th>상품코드</th><td>${escapeHtml(item.productCode)}</td></tr>
                    <tr><th>유통기한</th><td>${escapeHtml(item.expiry)}</td></tr>
                    <tr><th>수량/총수량</th><td>박스 당 입수량 (${escapeHtml(item.boxPerUnit)}) / 총 입고수량 (${escapeHtml(item.totalEa)})</td></tr>
                    <tr><th>C/T</th><td>박스 번호 (${escapeHtml(item.boxNo)}) / 전체 박스 수 (${escapeHtml(item.totalBoxes)})</td></tr>
                </tbody>
            </table>
        </article>
    `).join("");
}

function renderKurlyLabelOrderRows(rows) {
    if (!kurlyLabelOrderBodyEl) return;

    if (!rows.length) {
        kurlyLabelOrderBodyEl.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="5">발주서를 선택하면 행 요약이 표시됩니다.</td>
            </tr>
        `;
        return;
    }

    kurlyLabelOrderBodyEl.innerHTML = rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.orderCode)}</td>
            <td>${escapeHtml(row.productName)}</td>
            <td>${escapeHtml(row.masterCode)}</td>
            <td>${escapeHtml(row.center)}</td>
            <td>${escapeHtml(row.totalBoxes)}</td>
        </tr>
    `).join("");
}

function renderKurlyLabelWorkspaceDetail() {
    const active = getActiveKurlyLabelWorkspace();
    if (!active) {
        renderKurlyLabelSummary(null);
        renderKurlyLabelPreview([]);
        renderKurlyLabelOrderRows([]);
        renderKurlyLabelWorkspaceMode();
        return;
    }

    const rows = getKurlyLabelWorkspaceRows(active);
    const labelItems = getKurlyLabelItemsFromRows(rows);
    renderKurlyLabelSummary(active);
    renderKurlyLabelPreview(labelItems);
    renderKurlyLabelOrderRows(rows);
    renderKurlyLabelWorkspaceMode();
}

function applyActiveKurlyLabelWorkspace() {
    const active = getActiveKurlyLabelWorkspace();
    kurlyRows = getKurlyLabelWorkspaceRows(active);
    kurlyParsedFileName = active?.title || "";
    renderKurlyLabelWorkspaceList();
    renderKurlyLabelWorkspaceDetail();
    saveKurlyLabelWorkspacesToLocal();
}

function showKurlyLabelWorkspaceList() {
    activeKurlyLabelWorkspaceId = "";
    kurlyRows = [];
    kurlyParsedFileName = "";
    renderKurlyLabelWorkspaceList();
    renderKurlyLabelWorkspaceDetail();
    resetKurlyProgress();
    setKurlyLabelResult("발주서를 선택하면 라벨 미리보기와 PDF 다운로드를 진행할 수 있습니다.");
    saveKurlyLabelWorkspacesToLocal();
}

function handleKurlyLabelWorkspaceClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-kurly-label-workspace-id]");
    if (!(button instanceof HTMLElement)) return;

    const nextId = button.getAttribute("data-kurly-label-workspace-id") || "";
    if (!nextId) return;

    activeKurlyLabelWorkspaceId = nextId;
    applyActiveKurlyLabelWorkspace();
    setKurlyLabelResult("라벨 미리보기를 확인한 뒤 PDF 다운로드를 눌러주세요.");
}

function handleKurlyLabelWorkspaceSelectionChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const workspaceId = target.getAttribute("data-kurly-label-workspace-check") || "";
    if (!workspaceId) return;

    if (target.checked) {
        selectedKurlyLabelWorkspaceIds.add(workspaceId);
    } else {
        selectedKurlyLabelWorkspaceIds.delete(workspaceId);
    }

    syncKurlyLabelWorkspaceListActions();
}

function handleToggleAllKurlyLabelWorkspaces() {
    syncSelectedKurlyLabelWorkspaceIds();

    if (kurlyLabelWorkspaces.length && selectedKurlyLabelWorkspaceIds.size === kurlyLabelWorkspaces.length) {
        selectedKurlyLabelWorkspaceIds = new Set();
    } else {
        selectedKurlyLabelWorkspaceIds = new Set(kurlyLabelWorkspaces.map((workspace) => workspace.id));
    }

    renderKurlyLabelWorkspaceList();
}

function handleDeleteSelectedKurlyLabelWorkspaces() {
    syncSelectedKurlyLabelWorkspaceIds();
    const selectedCount = selectedKurlyLabelWorkspaceIds.size;
    if (!selectedCount) {
        window.alert("삭제할 컬리 발주서를 먼저 선택해주세요.");
        return;
    }

    if (!window.confirm(`선택한 컬리 발주서 ${selectedCount}개를 삭제할까요?`)) return;

    const selectedIds = new Set(selectedKurlyLabelWorkspaceIds);
    kurlyLabelWorkspaces = kurlyLabelWorkspaces.filter((workspace) => !selectedIds.has(workspace.id));
    selectedKurlyLabelWorkspaceIds = new Set();

    if (selectedIds.has(activeKurlyLabelWorkspaceId)) {
        activeKurlyLabelWorkspaceId = "";
        kurlyRows = [];
        kurlyParsedFileName = "";
    }

    saveKurlyLabelWorkspacesToLocal();
    renderKurlyLabelWorkspaceList();
    renderKurlyLabelWorkspaceDetail();
    void persistSkuWorkspace();
    setKurlyLabelResult(`컬리 발주서 ${selectedCount}개를 삭제했습니다.`);
}

function handleKurlyLabelWorkspaceBackClick() {
    showKurlyLabelWorkspaceList();
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
                milkrunWorkspaces,
                activeMilkrunWorkspaceId,
                kurlyLabelWorkspaces,
                activeKurlyLabelWorkspaceId,
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

function formatSkuValidationSummary(summary = {}) {
    const total = Number(summary.total) || 0;
    const clean = Number(summary.clean) || 0;
    const warning = Number(summary.warning) || 0;
    const invalid = Number(summary.invalid) || 0;
    return `총 ${total}건 중 정상 ${clean}건, 주의 ${warning}건, 오류 ${invalid}건`;
}

function formatSkuDisplaySummary(summary = {}, displayCount = 0) {
    const baseSummary = formatSkuValidationSummary(summary);
    const total = Number(summary.total) || 0;
    const hasSearch = Boolean(skuSearchQuery.trim());
    if (!hasSearch && displayCount === total) return baseSummary;
    return `${baseSummary}, 표시 ${displayCount}건`;
}

function normalizeSkuSearchToken(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/,/g, "")
        .replace(/\s+/g, "");
}

function getSkuSearchFields() {
    if (skuSearchFieldKey === SKU_SEARCH_ALL_KEY) return SKU_FIELDS;
    const field = getFieldByKey(skuSearchFieldKey);
    return field ? [field] : SKU_FIELDS;
}

function filterSkuRowsBySearch(rows) {
    const query = normalizeSkuSearchToken(skuSearchQuery);
    if (!query) return rows;

    const searchFields = getSkuSearchFields();
    return rows.filter((row) => searchFields.some((field) => (
        normalizeSkuSearchToken(row?.[field.key]).includes(query)
    )));
}

function parseSkuSortableNumber(value) {
    const text = String(value ?? "").trim().replace(/,/g, "");
    if (!text) return Number.NaN;
    const numericValue = Number(text);
    return Number.isFinite(numericValue) ? numericValue : Number.NaN;
}

function compareSkuTextValue(leftValue, rightValue, { numeric = true } = {}) {
    return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "ko-KR", {
        numeric,
        sensitivity: "base",
    });
}

function compareSkuRowsForSort(leftRow, rightRow) {
    if (!skuSortKey) return Number(leftRow.rowId || 0) - Number(rightRow.rowId || 0);

    const directionMultiplier = skuSortDirection === "desc" ? -1 : 1;
    const leftRawValue = leftRow?.[skuSortKey];
    const rightRawValue = rightRow?.[skuSortKey];
    const leftText = String(leftRawValue ?? "").trim();
    const rightText = String(rightRawValue ?? "").trim();
    const leftEmpty = !leftText;
    const rightEmpty = !rightText;

    if (leftEmpty || rightEmpty) {
        if (leftEmpty && rightEmpty) return Number(leftRow.rowId || 0) - Number(rightRow.rowId || 0);
        return leftEmpty ? 1 : -1;
    }

    let compared = 0;
    if (isSkuNumericField(skuSortKey)) {
        const leftNumber = parseSkuSortableNumber(leftRawValue);
        const rightNumber = parseSkuSortableNumber(rightRawValue);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            compared = leftNumber - rightNumber;
        } else if (Number.isFinite(leftNumber) || Number.isFinite(rightNumber)) {
            return Number.isFinite(leftNumber) ? -1 : 1;
        }
    }

    if (compared === 0) {
        compared = compareSkuTextValue(leftText, rightText, {
            numeric: !isSkuCodeLikeField(skuSortKey),
        });
    }

    if (compared === 0) {
        compared = Number(leftRow.rowId || 0) - Number(rightRow.rowId || 0);
    }

    return compared * directionMultiplier;
}

function sortSkuRowsForDisplay(rows) {
    if (!skuSortKey) return rows;
    return [...rows].sort(compareSkuRowsForSort);
}

function getSkuDisplayRows(rows) {
    return sortSkuRowsForDisplay(filterSkuRowsBySearch(rows));
}

function renderSkuSearchFieldOptions() {
    if (!skuSearchFieldSelect) return;

    const currentValue = getFieldByKey(skuSearchFieldKey) ? skuSearchFieldKey : SKU_SEARCH_ALL_KEY;
    skuSearchFieldSelect.innerHTML = [
        `<option value="${SKU_SEARCH_ALL_KEY}">전체</option>`,
        ...SKU_FIELDS.map((field) => (
            `<option value="${escapeHtml(field.key)}">${escapeHtml(field.label)}</option>`
        )),
    ].join("");
    skuSearchFieldKey = currentValue;
    skuSearchFieldSelect.value = currentValue;
}

function syncSkuSearchControls() {
    renderSkuSearchFieldOptions();
    if (skuSearchInput instanceof HTMLInputElement) {
        skuSearchInput.value = skuSearchQuery;
    }
}

function resetSkuSearchAndSort({ render = true } = {}) {
    skuSearchFieldKey = SKU_SEARCH_ALL_KEY;
    skuSearchQuery = "";
    skuSortKey = "";
    skuSortDirection = "asc";
    syncSkuSearchControls();
    renderSkuTableHead();
    if (render) renderCurrentSkuRows();
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

function isSkuNumericField(key) {
    return Boolean(getFieldByKey(key)?.numeric);
}

function isSkuCodeLikeField(key) {
    return SKU_CODE_LIKE_KEYS.has(key);
}

function isSkuWideTextField(key) {
    return SKU_WIDE_TEXT_KEYS.has(key);
}

function getSkuColumnClassNames(key) {
    const classNames = ["sku-data-column"];
    if (isSkuImageField(key)) {
        classNames.push("sku-column-image");
    } else if (isSkuNumericField(key)) {
        classNames.push("sku-column-numeric");
    } else if (isSkuCodeLikeField(key)) {
        classNames.push("sku-column-code");
    } else if (isSkuWideTextField(key)) {
        classNames.push("sku-column-wide");
    } else {
        classNames.push("sku-column-text");
    }
    return classNames.join(" ");
}

function getSkuColumnWidth(key) {
    if (isSkuImageField(key)) return 98;
    if (isSkuNumericField(key)) return 116;
    if (isSkuCodeLikeField(key)) return 166;
    if (isSkuWideTextField(key)) return 240;
    return 150;
}

function formatSkuNumericDisplayValue(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";

    const normalizedText = text.replace(/,/g, "");
    const numericValue = Number(normalizedText);
    if (!Number.isFinite(numericValue)) return text;

    const decimalText = normalizedText.match(/\.(\d+)/)?.[1] ?? "";
    const maximumFractionDigits = Math.min(decimalText.length, 20);

    return numericValue.toLocaleString("ko-KR", {
        maximumFractionDigits,
    });
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
            const isSorted = skuSortKey === key;
            const sortDirectionLabel = isSorted && skuSortDirection === "desc" ? "내림차순" : "오름차순";
            const ariaSort = isSorted
                ? (skuSortDirection === "desc" ? "descending" : "ascending")
                : "none";
            const sortIndicator = isSorted
                ? (skuSortDirection === "desc" ? "▼" : "▲")
                : "↕";
            return `
              <th class="sku-draggable-header ${getSkuColumnClassNames(key)}${isSorted ? " is-sorted" : ""}" draggable="true" data-sku-header-key="${key}" aria-sort="${ariaSort}" title="${escapeHtml(field?.label ?? key)} ${sortDirectionLabel} 정렬">
                <span class="sku-draggable-header-label">${escapeHtml(field?.label ?? key)}</span>
                <span class="sku-sort-indicator" aria-hidden="true">${sortIndicator}</span>
              </th>
            `;
        })
        .join("");

    skuTableHead.innerHTML = `
    <tr>
      <th class="sku-select-column">선택</th>
      <th class="sku-row-number-column">행</th>
      ${headerHtml}
      <th class="sku-status-column">상태</th>
      <th class="sku-validation-column">오류/주의</th>
      <th class="sku-action-column">수정</th>
      <th class="sku-print-column">라벨 출력</th>
    </tr>
  `;

    const skuTable = skuTableHead.closest("table");
    if (skuTable instanceof HTMLTableElement) {
        const dataColumnWidth = selectedSkuHeaderKeys.reduce((sum, key) => sum + getSkuColumnWidth(key), 0);
        const estimatedWidth = 660 + dataColumnWidth;
        skuTable.style.minWidth = `${Math.max(estimatedWidth, 980)}px`;
    }
}

function renderSkuTable(rows, emptyMessage = "검증 가능한 데이터가 없습니다.") {
    if (!skuTableBody) return;

    if (!rows.length) {
        setSkuEmptyTable(emptyMessage);
        return;
    }

    skuTableBody.innerHTML = rows.map((row) => {
        const errors = Array.isArray(row.errors) ? row.errors : [];
        const warnings = Array.isArray(row.warnings) ? row.warnings : [];
        const status = row.isValid ? (warnings.length ? "주의" : "정상") : "오류";
        const statusClass = row.isValid ? (warnings.length ? "is-warning" : "is-normal") : "is-error";
        const validationMessages = [
            ...errors.map((message) => `[오류] ${message}`),
            ...warnings.map((message) => `[주의] ${message}`),
        ];
        const errorText = validationMessages.length ? validationMessages.join("; ") : "-";
        const columnHtml = selectedSkuHeaderKeys
            .map((key) => `<td class="${getSkuColumnClassNames(key)}">${buildSkuCellMarkup(key, row[key])}</td>`)
            .join("");

        return `
      <tr class="${warnings.length && row.isValid ? "is-warning" : ""}">
        <td class="sku-select-column"><input type="checkbox" data-sku-row-id="${row.rowId}" ${selectedSkuRowIds.has(row.rowId) ? "checked" : ""} /></td>
        <td class="sku-row-number-column">${row.rowId}</td>
        ${columnHtml}
        <td class="sku-status-column"><span class="sku-status-badge ${statusClass}">${status}</span></td>
        <td class="sku-validation-column sku-validation-message">${escapeHtml(errorText)}</td>
        <td class="sku-action-column"><button type="button" class="secondary-btn" data-sku-edit-row-id="${row.rowId}">수정</button></td>
        <td class="sku-print-column"><button type="button" class="secondary-btn" data-sku-print-row-id="${row.rowId}">라벨 출력</button></td>
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
        const displayValue = isSkuNumericField(key)
            ? formatSkuNumericDisplayValue(safeValue)
            : safeValue;
        return escapeHtml(displayValue);
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
    if (skuSortKey && !selectedSkuHeaderKeys.includes(skuSortKey)) {
        skuSortKey = "";
        skuSortDirection = "asc";
    }
    renderSkuTableHead();

    if (skuRows.length) {
        renderCurrentSkuRows();
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
    const displayRows = getSkuDisplayRows(validationResult.rows);
    renderSkuTable(displayRows, skuSearchQuery.trim() ? "검색 결과가 없습니다." : "검증 가능한 데이터가 없습니다.");
    setSkuResult(formatSkuDisplaySummary(validationResult.summary, displayRows.length));
    renderOrderMatchPanel();
}

function handleSkuSearchFieldChange() {
    skuSearchFieldKey = skuSearchFieldSelect?.value || SKU_SEARCH_ALL_KEY;
    renderCurrentSkuRows();
}

function handleSkuSearchInput() {
    skuSearchQuery = skuSearchInput instanceof HTMLInputElement ? skuSearchInput.value : "";
    renderCurrentSkuRows();
}

function handleClearSkuSearch() {
    skuSearchFieldKey = SKU_SEARCH_ALL_KEY;
    skuSearchQuery = "";
    syncSkuSearchControls();
    renderCurrentSkuRows();
}

function handleSkuHeaderSortClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const th = target.closest("th[data-sku-header-key]");
    if (!(th instanceof HTMLTableCellElement)) return;
    if (Date.now() - lastSkuHeaderDragEndedAt < 200) return;

    const key = th.getAttribute("data-sku-header-key") || "";
    if (!key) return;

    if (skuSortKey === key) {
        skuSortDirection = skuSortDirection === "asc" ? "desc" : "asc";
    } else {
        skuSortKey = key;
        skuSortDirection = "asc";
    }

    renderSkuTableHead();
    renderCurrentSkuRows();
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
        rebuildMilkrunWorkspacesFromSkuData({ persist: false });
        void persistSkuWorkspace();
        return;
    }

    renderCurrentSkuRows();
    rebuildMilkrunWorkspacesFromSkuData({ persist: false });
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
    rebuildMilkrunWorkspacesFromSkuData({ persist: false });
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
    lastSkuHeaderDragEndedAt = Date.now();

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
    lastSkuHeaderDragEndedAt = Date.now();
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

function getMilkrunCalculationWarnings(row) {
    return Array.isArray(row?.calculationWarnings) ? row.calculationWarnings.filter(Boolean) : [];
}

function buildMilkrunCalculationTitle(warnings) {
    const safeWarnings = (warnings ?? []).filter(Boolean);
    return safeWarnings.length ? safeWarnings.join("\n") : "계산에 필요한 SKU 정보가 부족합니다.";
}

function renderMilkrunMetricValue(value, digits, isCalculated, warnings = []) {
    if (isCalculated === false) {
        return `<span class="milkrun-calculation-missing" title="${escapeHtml(buildMilkrunCalculationTitle(warnings))}">계산 불가</span>`;
    }

    return formatMilkrunNumber(value, digits);
}

function getMilkrunDetailRows() {
    const activeWorkspace = getActiveMilkrunWorkspace();
    const sourceRows = getMilkrunWorkspaceSourceRows(activeWorkspace);
    if (!sourceRows.length) return [];

    const assignedCenterByOrderId = new Map(milkrunRows
        .map((row) => [String(row.orderId ?? ""), row.assignedCenter || row.originalCenter])
        .filter(([orderId, center]) => orderId && center));

    return buildMilkrunDetailRowsFromOrderRows(sourceRows, {
        resolveSkuComponents: getMilkrunSkuComponentsForOrderRow,
    }).map((row) => ({
        ...row,
        assignedCenter: assignedCenterByOrderId.get(row.orderId) || row.originalCenter,
    }));
}

function getMilkrunSortedDetailRows(detailRows = getMilkrunDetailRows()) {
    return [...detailRows].sort((left, right) => {
        const orderCompare = left.orderId.localeCompare(right.orderId, "ko-KR", { numeric: true });
        if (orderCompare !== 0) return orderCompare;
        return Number(left.rowId || 0) - Number(right.rowId || 0);
    });
}

function setActiveMilkrunViewTab(nextTab = "overview") {
    const validTabs = new Set(["overview", "sku", "centers", "orders"]);
    activeMilkrunViewTab = validTabs.has(nextTab) ? nextTab : "overview";
    closeMilkrunCenterPicker({ restoreFocus: false });

    if (milkrunWorkboardGridEl) {
        milkrunWorkboardGridEl.classList.toggle("is-overview", activeMilkrunViewTab === "overview");
    }

    milkrunViewTabButtons.forEach((button) => {
        const isActive = button.getAttribute("data-milkrun-view-tab") === activeMilkrunViewTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    milkrunViewPanels.forEach((panel) => {
        panel.hidden = activeMilkrunViewTab !== "overview"
            && panel.getAttribute("data-milkrun-view-panel") !== activeMilkrunViewTab;
    });
}

function renderMilkrunViewTabs(detailRows, centerSummaries) {
    if (milkrunDetailTabCountEl) milkrunDetailTabCountEl.textContent = formatMilkrunNumber(detailRows.length);
    if (milkrunCenterTabCountEl) milkrunCenterTabCountEl.textContent = formatMilkrunNumber(centerSummaries.length);
    if (milkrunOrderTabCountEl) milkrunOrderTabCountEl.textContent = formatMilkrunNumber(milkrunRows.length);
    setActiveMilkrunViewTab(activeMilkrunViewTab);
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

function clampMilkrunOverviewLeftPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 46;
    return Math.min(62, Math.max(36, numericValue));
}

function setMilkrunOverviewLeftPercent(value, options = {}) {
    const { persist = true } = options;
    const percent = clampMilkrunOverviewLeftPercent(value);
    const roundedPercent = Math.round(percent * 10) / 10;

    if (milkrunWorkboardGridEl) {
        milkrunWorkboardGridEl.style.setProperty("--milkrun-overview-left", `${roundedPercent}%`);
    }
    if (milkrunOverviewResizerEl) {
        milkrunOverviewResizerEl.setAttribute("aria-valuenow", String(Math.round(roundedPercent)));
    }
    if (!persist) return roundedPercent;

    try {
        getMilkrunStorage()?.setItem(MILKRUN_OVERVIEW_LEFT_STORAGE_KEY, String(roundedPercent));
    } catch (error) {
        console.warn("밀크런 작업판 너비 설정을 저장하지 못했습니다.", error);
    }

    return roundedPercent;
}

function restoreMilkrunOverviewLeftPercent() {
    try {
        const storedValue = getMilkrunStorage()?.getItem(MILKRUN_OVERVIEW_LEFT_STORAGE_KEY);
        setMilkrunOverviewLeftPercent(storedValue ?? 46, { persist: false });
    } catch (error) {
        console.warn("밀크런 작업판 너비 설정을 불러오지 못했습니다.", error);
        setMilkrunOverviewLeftPercent(46, { persist: false });
    }
}

function getMilkrunOverviewLeftPercentFromPointer(clientX) {
    if (!milkrunWorkboardGridEl) return 46;
    const rect = milkrunWorkboardGridEl.getBoundingClientRect();
    if (!rect.width) return 46;
    return ((clientX - rect.left) / rect.width) * 100;
}

function handleMilkrunOverviewResizePointerDown(event) {
    if (!milkrunWorkboardGridEl || !milkrunOverviewResizerEl || activeMilkrunViewTab !== "overview") return;
    if (window.matchMedia?.("(max-width: 1180px)").matches) return;

    event.preventDefault();
    milkrunOverviewResizeState = { pointerId: event.pointerId };
    milkrunOverviewResizerEl.classList.add("is-dragging");
    document.body.classList.add("is-milkrun-overview-resizing");
    milkrunOverviewResizerEl.setPointerCapture?.(event.pointerId);
    setMilkrunOverviewLeftPercent(getMilkrunOverviewLeftPercentFromPointer(event.clientX));
}

function handleMilkrunOverviewResizePointerMove(event) {
    if (!milkrunOverviewResizeState || milkrunOverviewResizeState.pointerId !== event.pointerId) return;
    setMilkrunOverviewLeftPercent(getMilkrunOverviewLeftPercentFromPointer(event.clientX));
}

function finishMilkrunOverviewResize(event) {
    if (!milkrunOverviewResizeState) return;
    if (event?.pointerId != null && milkrunOverviewResizeState.pointerId !== event.pointerId) return;

    milkrunOverviewResizerEl?.classList.remove("is-dragging");
    document.body.classList.remove("is-milkrun-overview-resizing");
    if (event?.pointerId != null) {
        milkrunOverviewResizerEl?.releasePointerCapture?.(event.pointerId);
    }
    milkrunOverviewResizeState = null;
}

function handleMilkrunOverviewResizeKeydown(event) {
    if (!milkrunWorkboardGridEl || activeMilkrunViewTab !== "overview") return;

    const currentValue = Number.parseFloat(milkrunWorkboardGridEl.style.getPropertyValue("--milkrun-overview-left")) || 46;
    let nextValue = currentValue;

    if (event.key === "ArrowLeft") {
        nextValue = currentValue - (event.shiftKey ? 5 : 2);
    } else if (event.key === "ArrowRight") {
        nextValue = currentValue + (event.shiftKey ? 5 : 2);
    } else if (event.key === "Home") {
        nextValue = 36;
    } else if (event.key === "End") {
        nextValue = 62;
    } else {
        return;
    }

    event.preventDefault();
    setMilkrunOverviewLeftPercent(nextValue);
}

function resetMilkrunOverviewLeftPercent() {
    setMilkrunOverviewLeftPercent(46);
}

function initializeMilkrunOverviewResizer() {
    restoreMilkrunOverviewLeftPercent();

    milkrunOverviewResizerEl?.addEventListener("pointerdown", handleMilkrunOverviewResizePointerDown);
    document.addEventListener("pointermove", handleMilkrunOverviewResizePointerMove);
    document.addEventListener("pointerup", finishMilkrunOverviewResize);
    document.addEventListener("pointercancel", finishMilkrunOverviewResize);
    milkrunOverviewResizerEl?.addEventListener("keydown", handleMilkrunOverviewResizeKeydown);
    milkrunOverviewResizerEl?.addEventListener("dblclick", resetMilkrunOverviewLeftPercent);
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

function saveMilkrunWorkspacesToLocal() {
    try {
        const storage = getMilkrunStorage();
        storage?.setItem(MILKRUN_WORKSPACE_STORAGE_KEY, JSON.stringify({
            activeId: activeMilkrunWorkspaceId,
            workspaces: milkrunWorkspaces,
        }));
    } catch (error) {
        console.warn("밀크런 작업 목록을 저장하지 못했습니다.", error);
    }
}

function loadMilkrunWorkspacesFromLocal() {
    try {
        const storage = getMilkrunStorage();
        const raw = storage?.getItem(MILKRUN_WORKSPACE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        milkrunWorkspaces = Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
        hydrateMilkrunWorkspaceSourceRows(milkrunWorkspaces);
        activeMilkrunWorkspaceId = String(parsed?.activeId || "");
    } catch (error) {
        console.warn("밀크런 작업 목록을 불러오지 못했습니다.", error);
    }
}

function getActiveMilkrunWorkspace() {
    return milkrunWorkspaces.find((item) => item.id === activeMilkrunWorkspaceId) || null;
}

function syncSelectedMilkrunWorkspaceIds() {
    const existingIds = new Set(milkrunWorkspaces.map((workspace) => workspace.id));
    selectedMilkrunWorkspaceIds = new Set([...selectedMilkrunWorkspaceIds].filter((id) => existingIds.has(id)));
}

function syncMilkrunWorkspaceListActions() {
    syncSelectedMilkrunWorkspaceIds();

    const selectedCount = selectedMilkrunWorkspaceIds.size;
    const hasWorkspaces = milkrunWorkspaces.length > 0;
    const allSelected = hasWorkspaces && selectedCount === milkrunWorkspaces.length;

    if (milkrunSelectAllBtn) {
        milkrunSelectAllBtn.disabled = !hasWorkspaces;
        milkrunSelectAllBtn.textContent = allSelected ? "전체 해제" : "전체 선택";
    }
    if (milkrunDeleteSelectedBtn) {
        milkrunDeleteSelectedBtn.disabled = selectedCount === 0;
        milkrunDeleteSelectedBtn.textContent = selectedCount > 0
            ? `선택 삭제 (${selectedCount})`
            : "선택 삭제";
    }
}

function renderMilkrunWorkspaceMode() {
    const active = getActiveMilkrunWorkspace();
    const hasActiveWorkspace = Boolean(active);

    if (milkrunSessionListEl) milkrunSessionListEl.hidden = hasActiveWorkspace;
    if (milkrunWorkboardGridEl) milkrunWorkboardGridEl.hidden = !hasActiveWorkspace;
    if (milkrunWorkboardActionsEl) milkrunWorkboardActionsEl.hidden = !hasActiveWorkspace;
    if (milkrunWorkspaceListActionsEl) milkrunWorkspaceListActionsEl.hidden = hasActiveWorkspace;
    if (milkrunLoadingListDownloadBtn) milkrunLoadingListDownloadBtn.disabled = !hasActiveWorkspace;

    if (milkrunWorkspaceTitleEl) {
        milkrunWorkspaceTitleEl.textContent = hasActiveWorkspace
            ? `${active.title || active.id} 테트리스 작업판`
            : "업로드 발주서 목록";
    }
    if (milkrunWorkspaceDescEl) {
        milkrunWorkspaceDescEl.textContent = hasActiveWorkspace
            ? "SKU 상세, 센터별 요약, 발주번호별 센터 변경을 한 화면에서 확인하며 작업합니다."
            : "발주서명을 선택하면 해당 발주서의 테트리스 작업판으로 이동합니다.";
    }
}

function formatMilkrunWorkspaceUpdatedAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function renderMilkrunWorkspaceList() {
    if (!milkrunSessionListEl) return;
    syncSelectedMilkrunWorkspaceIds();

    if (!milkrunWorkspaces.length) {
        milkrunSessionListEl.innerHTML = `
            <div class="milkrun-session-empty">
                발주서 업로드에서 쿠팡 발주서를 업로드하면 이곳에 발주서명이 표시됩니다.
            </div>
        `;
        renderMilkrunWorkspaceMode();
        syncMilkrunWorkspaceListActions();
        return;
    }

    milkrunSessionListEl.innerHTML = milkrunWorkspaces.map((workspace) => {
        const rows = Array.isArray(workspace.rows) ? workspace.rows : [];
        const centerCount = new Set(rows.map((row) => row.assignedCenter || row.originalCenter).filter(Boolean)).size;
        const updatedAt = formatMilkrunWorkspaceUpdatedAt(workspace.updatedAt);

        return `
            <article class="milkrun-session-item${workspace.id === activeMilkrunWorkspaceId ? " is-active" : ""}">
                <label class="milkrun-session-check">
                    <input
                        type="checkbox"
                        data-milkrun-workspace-check="${escapeHtml(workspace.id)}"
                        ${selectedMilkrunWorkspaceIds.has(workspace.id) ? "checked" : ""}
                        aria-label="${escapeHtml(workspace.title || workspace.id)} 선택"
                    />
                </label>
                <button
                    type="button"
                    class="milkrun-session-chip"
                    data-milkrun-workspace-id="${escapeHtml(workspace.id)}"
                >
                    <span class="milkrun-session-title" title="${escapeHtml(workspace.title || workspace.id)}">${escapeHtml(workspace.title || workspace.id)}</span>
                    <span class="milkrun-session-meta">
                        발주 ${formatMilkrunNumber(rows.length)}건 · 센터 ${formatMilkrunNumber(centerCount)}개${updatedAt ? ` · ${escapeHtml(updatedAt)}` : ""}
                    </span>
                </button>
            </article>
        `;
    }).join("");
    renderMilkrunWorkspaceMode();
    syncMilkrunWorkspaceListActions();
}

function applyActiveMilkrunWorkspace() {
    const active = getActiveMilkrunWorkspace();
    milkrunRows = Array.isArray(active?.rows) ? active.rows : [];
    renderMilkrunWorkspaceList();
    renderMilkrunDashboard();
    saveMilkrunWorkspacesToLocal();
}

function showMilkrunWorkspaceList() {
    clearPendingMilkrunLoadingListDownload();
    activeMilkrunWorkspaceId = "";
    milkrunRows = [];
    closeMilkrunCenterPicker({ restoreFocus: false });
    renderMilkrunWorkspaceList();
    renderMilkrunDashboard();
    saveMilkrunWorkspacesToLocal();
}

function syncActiveMilkrunWorkspaceRows() {
    if (!activeMilkrunWorkspaceId) return;
    milkrunWorkspaces = milkrunWorkspaces.map((item) => (
        item.id === activeMilkrunWorkspaceId
            ? { ...item, rows: milkrunRows, updatedAt: new Date().toISOString() }
            : item
    ));
    saveMilkrunWorkspacesToLocal();
    void persistSkuWorkspace();
}

function sanitizeDownloadFileNamePart(value) {
    return String(value ?? "")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "coupang-milkrun";
}

function clearPendingMilkrunLoadingListDownload() {
    if (milkrunLoadingListDownloadBtn) {
        milkrunLoadingListDownloadBtn.hidden = false;
    }
    if (milkrunLoadingListDownloadBtn && !milkrunLoadingListDownloadBtn.disabled) {
        milkrunLoadingListDownloadBtn.textContent = "적재리스트 편집";
    }
}

function getMilkrunLoadingEditorItemFootprint(item) {
    const footprint = Number(item?.footprint);
    return Number.isFinite(footprint) && footprint > 0 ? footprint : 0;
}

function getMilkrunLoadingEditorBoxCount(item) {
    return Math.ceil(Number(item?.boxCount) || 0);
}

function getMilkrunLoadingEditorQty(item) {
    return Math.round(Number(item?.eaQty) || 0);
}

function getMilkrunLoadingEditorPalletStats(pallet) {
    const items = Array.isArray(pallet?.items) ? pallet.items : [];
    return {
        totalBoxes: items.reduce((sum, item) => sum + getMilkrunLoadingEditorBoxCount(item), 0),
        totalQty: items.reduce((sum, item) => sum + getMilkrunLoadingEditorQty(item), 0),
        footprint: items.reduce((sum, item) => sum + getMilkrunLoadingEditorItemFootprint(item), 0),
        skuCount: items.length,
    };
}

function recalculateMilkrunLoadingEditorCenter(center) {
    const pallets = Array.isArray(center?.pallets) ? center.pallets : [];
    const allItems = pallets.flatMap((pallet) => Array.isArray(pallet.items) ? pallet.items : []);
    center.totalBoxes = allItems.reduce((sum, item) => sum + getMilkrunLoadingEditorBoxCount(item), 0);
    center.totalQty = allItems.reduce((sum, item) => sum + getMilkrunLoadingEditorQty(item), 0);
    center.skuCount = new Set(allItems.map((item) => item.skuCode || item.skuName).filter(Boolean)).size;
    center.palletCount = pallets.filter((pallet) => pallet.items?.length).length;
    center.footprint = allItems.reduce((sum, item) => sum + getMilkrunLoadingEditorItemFootprint(item), 0);
    return center;
}

function recalculateMilkrunLoadingEditorDraft() {
    milkrunLoadingEditorState?.centers?.forEach(recalculateMilkrunLoadingEditorCenter);
}

function createMilkrunLoadingEditorId(prefix, ...parts) {
    const safeParts = parts
        .map((part) => String(part ?? "").replace(/[^a-zA-Z0-9가-힣_-]+/g, "-"))
        .filter(Boolean)
        .join("-");
    return `${prefix}-${safeParts || Date.now()}`;
}

function createMilkrunLoadingEditorDraft(loadingListData, fileNameBase) {
    const centers = (loadingListData ?? []).map((center, centerIndex) => {
        const centerId = createMilkrunLoadingEditorId("center", centerIndex, center.center);
        const pallets = (center.pallets ?? []).map((items, palletIndex) => ({
            id: createMilkrunLoadingEditorId("pallet", centerIndex, palletIndex),
            items: (items ?? []).map((item, itemIndex) => ({
                ...item,
                id: createMilkrunLoadingEditorId("item", centerIndex, palletIndex, itemIndex, item.skuCode || item.skuName),
            })),
        }));

        return recalculateMilkrunLoadingEditorCenter({
            ...center,
            id: centerId,
            pallets: pallets.length ? pallets : [{ id: createMilkrunLoadingEditorId("pallet", centerIndex, "empty"), items: [] }],
        });
    });

    return {
        fileNameBase,
        centers,
        activeCenterId: centers[0]?.id || "",
    };
}

function getMilkrunLoadingEditorActiveCenter() {
    const centers = milkrunLoadingEditorState?.centers ?? [];
    return centers.find((center) => center.id === milkrunLoadingEditorState?.activeCenterId) || centers[0] || null;
}

function setMilkrunLoadingEditorStatus(message = "", type = "") {
    if (!milkrunLoadingEditorStatusEl) return;
    milkrunLoadingEditorStatusEl.textContent = message;
    milkrunLoadingEditorStatusEl.className = [
        "milkrun-loading-editor-status",
        message ? "is-visible" : "",
        type ? `is-${type}` : "",
    ].filter(Boolean).join(" ");
}

function renderMilkrunLoadingEditorCenterList() {
    if (!milkrunLoadingEditorCenterListEl) return;
    const centers = milkrunLoadingEditorState?.centers ?? [];
    if (milkrunLoadingEditorCenterCountEl) {
        milkrunLoadingEditorCenterCountEl.textContent = `${centers.length}개`;
    }
    if (!centers.length) {
        milkrunLoadingEditorCenterListEl.innerHTML = `<div class="tracking-empty-row">편집할 센터가 없습니다.</div>`;
        return;
    }

    milkrunLoadingEditorCenterListEl.innerHTML = centers.map((center) => {
        const active = center.id === milkrunLoadingEditorState.activeCenterId;
        return `
            <button class="milkrun-loading-editor-center-btn${active ? " is-active" : ""}"
                type="button"
                data-loading-editor-center-id="${escapeHtml(center.id)}">
                <span class="milkrun-loading-editor-center-title">${escapeHtml(center.center || "-")}</span>
                <span class="milkrun-loading-editor-center-meta">
                    <span>${formatMilkrunNumber(center.palletCount)} PLT</span>
                    <span>${formatMilkrunNumber(center.totalBoxes)} BOX</span>
                    <span>${formatMilkrunNumber(center.skuCount)} SKU</span>
                </span>
            </button>
        `;
    }).join("");
}

function renderMilkrunLoadingEditorSummary(center) {
    if (milkrunLoadingEditorActiveCenterEl) {
        milkrunLoadingEditorActiveCenterEl.textContent = center?.center || "센터 선택";
    }
    if (milkrunLoadingEditorActiveDescEl) {
        milkrunLoadingEditorActiveDescEl.textContent = center
            ? `${center.dueDate || "입고예정일 확인"} · ${center.poNumbersText || "발주번호 없음"}`
            : "센터를 선택하면 적재리스트를 편집할 수 있습니다.";
    }
    if (!milkrunLoadingEditorSummaryGridEl) return;

    const metrics = [
        ["PLT 수", formatMilkrunNumber(center?.palletCount || 0)],
        ["박스 수", formatMilkrunNumber(center?.totalBoxes || 0)],
        ["SKU 수", formatMilkrunNumber(center?.skuCount || 0)],
        ["점유율", `${formatMilkrunNumber(center?.footprint || 0, 2)} PLT`],
    ];
    milkrunLoadingEditorSummaryGridEl.innerHTML = metrics.map(([label, value]) => `
        <div class="milkrun-loading-editor-metric">
            <span class="milkrun-loading-editor-metric-label">${escapeHtml(label)}</span>
            <span class="milkrun-loading-editor-metric-value">${escapeHtml(value)}</span>
        </div>
    `).join("");
}

function renderMilkrunLoadingEditorRow(item, palletId, rowIndex) {
    if (!item) {
        return `
            <tr class="milkrun-loading-editor-empty-row"
                data-loading-editor-drop-pallet-id="${escapeHtml(palletId)}"
                data-loading-editor-drop-index="${rowIndex}">
                <td>${rowIndex + 1}</td>
                <td colspan="4">여기로 SKU를 드롭</td>
            </tr>
        `;
    }

    return `
        <tr class="milkrun-loading-editor-row"
            draggable="true"
            data-loading-editor-item-id="${escapeHtml(item.id)}"
            data-loading-editor-drop-pallet-id="${escapeHtml(palletId)}"
            data-loading-editor-drop-index="${rowIndex}">
            <td>${rowIndex + 1}</td>
            <td>${escapeHtml(item.skuCode || "")}</td>
            <td class="milkrun-loading-editor-sku-name" title="${escapeHtml(item.skuName || "")}">
                <span class="milkrun-loading-editor-sku-text">${escapeHtml(item.skuName || "")}</span>
                <span class="milkrun-loading-editor-footprint">${formatMilkrunNumber(getMilkrunLoadingEditorItemFootprint(item), 2)} PLT</span>
            </td>
            <td>${formatMilkrunNumber(getMilkrunLoadingEditorBoxCount(item))}</td>
            <td>${formatMilkrunNumber(getMilkrunLoadingEditorQty(item))}</td>
        </tr>
    `;
}

function renderMilkrunLoadingEditorPage(center, pallet, palletIndex, palletCount) {
    const stats = getMilkrunLoadingEditorPalletStats(pallet);
    const poDisplay = getLoadingListPoDisplay(center.poNumbersText || "");
    const rows = [];
    const rowCount = Math.max(10, pallet.items.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        rows.push(renderMilkrunLoadingEditorRow(pallet.items[rowIndex], pallet.id, rowIndex));
    }

    return `
        <article class="milkrun-loading-editor-page${pallet.items.length ? "" : " is-empty"}"
            data-loading-editor-pallet-id="${escapeHtml(pallet.id)}">
            <div class="milkrun-loading-page-title">쿠팡 파렛트 적재리스트 (일반)</div>
            <div class="milkrun-loading-page-meta">
                <div>
                    <span class="milkrun-loading-page-meta-label">총 PLT</span>
                    <span class="milkrun-loading-page-meta-value">${formatMilkrunNumber(palletCount)}</span>
                </div>
                <div>
                    <span class="milkrun-loading-page-meta-label">PLT 번호</span>
                    <span class="milkrun-loading-page-meta-value">${formatMilkrunNumber(palletCount)}-${palletIndex + 1}</span>
                </div>
                <div>
                    <span class="milkrun-loading-page-meta-label">입고예정일자</span>
                    <span class="milkrun-loading-page-meta-value">${escapeHtml(center.dueDate || "")}</span>
                </div>
                <div>
                    <span class="milkrun-loading-page-meta-label">납품센터명</span>
                    <span class="milkrun-loading-page-meta-value">${escapeHtml(center.center || "")}</span>
                </div>
                <div class="milkrun-loading-page-po-row">
                    <span class="milkrun-loading-page-meta-label">발주번호</span>
                    <span class="milkrun-loading-page-meta-value milkrun-loading-page-po-value" style="--po-font-size: ${poDisplay.fontSize}px; --po-line-height: ${poDisplay.lineHeight}px;" title="${escapeHtml(poDisplay.text)}">${escapeHtml(poDisplay.text)}</span>
                </div>
                <div class="milkrun-loading-page-box-row">
                    <span class="milkrun-loading-page-meta-label">총 박스수량</span>
                    <span class="milkrun-loading-page-meta-value">${formatMilkrunNumber(center.totalBoxes)} BOX</span>
                </div>
            </div>
            <table class="milkrun-loading-editor-table">
                <colgroup>
                    <col style="width: 9%">
                    <col style="width: 18%">
                    <col style="width: 45%">
                    <col style="width: 14%">
                    <col style="width: 14%">
                </colgroup>
                <thead>
                    <tr>
                        <th>NO</th>
                        <th>SKU NO</th>
                        <th>SKU NAME</th>
                        <th>BOX 수량</th>
                        <th>수량</th>
                    </tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
            </table>
            <div class="milkrun-loading-editor-page-foot">
                <span>${formatMilkrunNumber(stats.totalBoxes)} BOX · ${formatMilkrunNumber(stats.totalQty)} EA · ${formatMilkrunNumber(stats.footprint, 2)} PLT</span>
                <button class="milkrun-loading-editor-delete-pallet"
                    data-loading-editor-delete-pallet="${escapeHtml(pallet.id)}"
                    type="button"
                    ${pallet.items.length ? "disabled" : ""}>
                    빈 PLT 삭제
                </button>
            </div>
        </article>
    `;
}

function renderMilkrunLoadingEditorPages(center) {
    if (!milkrunLoadingEditorPagesEl) return;
    if (!center) {
        milkrunLoadingEditorPagesEl.innerHTML = `<div class="tracking-empty-row">센터를 선택해주세요.</div>`;
        return;
    }

    const pallets = center.pallets?.length
        ? center.pallets
        : [{ id: createMilkrunLoadingEditorId("pallet", center.id, "empty"), items: [] }];
    const palletCount = pallets.length;
    milkrunLoadingEditorPagesEl.innerHTML = pallets
        .map((pallet, index) => renderMilkrunLoadingEditorPage(center, pallet, index, palletCount))
        .join("");
}

function renderMilkrunLoadingEditor() {
    recalculateMilkrunLoadingEditorDraft();
    const center = getMilkrunLoadingEditorActiveCenter();
    if (center && milkrunLoadingEditorState) {
        milkrunLoadingEditorState.activeCenterId = center.id;
    }
    renderMilkrunLoadingEditorCenterList();
    renderMilkrunLoadingEditorSummary(center);
    renderMilkrunLoadingEditorPages(center);
}

function openMilkrunLoadingEditor(loadingListData, fileNameBase) {
    if (!loadingListData?.length) {
        window.alert("편집할 적재리스트 데이터가 없습니다.");
        return;
    }
    clearPendingMilkrunLoadingListDownload();
    milkrunLoadingEditorState = createMilkrunLoadingEditorDraft(loadingListData, fileNameBase);
    setMilkrunLoadingEditorStatus("");
    renderMilkrunLoadingEditor();
    milkrunLoadingEditorModal?.classList.remove("is-hidden");
    milkrunLoadingEditorModal?.setAttribute("aria-hidden", "false");
}

function closeMilkrunLoadingEditor() {
    milkrunLoadingEditorModal?.classList.add("is-hidden");
    milkrunLoadingEditorModal?.setAttribute("aria-hidden", "true");
    milkrunLoadingEditorState = null;
    milkrunLoadingEditorDrag = null;
    setMilkrunLoadingEditorStatus("");
}

function findMilkrunLoadingEditorItemLocation(itemId) {
    for (const center of milkrunLoadingEditorState?.centers ?? []) {
        for (const pallet of center.pallets ?? []) {
            const itemIndex = pallet.items.findIndex((item) => item.id === itemId);
            if (itemIndex >= 0) return { center, pallet, itemIndex, item: pallet.items[itemIndex] };
        }
    }
    return null;
}

function findMilkrunLoadingEditorPallet(palletId) {
    for (const center of milkrunLoadingEditorState?.centers ?? []) {
        const pallet = center.pallets?.find((item) => item.id === palletId);
        if (pallet) return { center, pallet };
    }
    return null;
}

function addMilkrunLoadingEditorPallet(centerId = milkrunLoadingEditorState?.activeCenterId) {
    const center = milkrunLoadingEditorState?.centers?.find((item) => item.id === centerId);
    if (!center) return null;
    const pallet = {
        id: createMilkrunLoadingEditorId("pallet", center.id, Date.now(), center.pallets.length + 1),
        items: [],
    };
    center.pallets.push(pallet);
    recalculateMilkrunLoadingEditorCenter(center);
    return pallet;
}

function moveMilkrunLoadingEditorItem(itemId, targetPalletId, targetIndex = Number.MAX_SAFE_INTEGER) {
    const sourceLocation = findMilkrunLoadingEditorItemLocation(itemId);
    const targetLocation = findMilkrunLoadingEditorPallet(targetPalletId);
    if (!sourceLocation || !targetLocation) return false;
    if (sourceLocation.center.id !== targetLocation.center.id) {
        setMilkrunLoadingEditorStatus("현재 버전에서는 같은 센터 안에서만 SKU를 이동할 수 있습니다.", "warning");
        return false;
    }

    const samePallet = sourceLocation.pallet.id === targetLocation.pallet.id;
    if (!samePallet && targetLocation.pallet.items.length >= 10) {
        setMilkrunLoadingEditorStatus("한 적재리스트에는 SKU를 최대 10개까지 넣을 수 있습니다.", "warning");
        return false;
    }
    if (!samePallet) {
        const targetFootprint = getMilkrunLoadingEditorPalletStats(targetLocation.pallet).footprint;
        const itemFootprint = getMilkrunLoadingEditorItemFootprint(sourceLocation.item);
        const nextFootprint = targetFootprint + itemFootprint;
        if (nextFootprint > 1.000001) {
            setMilkrunLoadingEditorStatus(
                `이동하면 해당 PLT가 ${formatMilkrunNumber(nextFootprint, 2)} PLT가 되어 1.00 PLT를 초과합니다.`,
                "warning",
            );
            return false;
        }
    }

    const [item] = sourceLocation.pallet.items.splice(sourceLocation.itemIndex, 1);
    let nextIndex = Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : targetLocation.pallet.items.length;
    if (samePallet && sourceLocation.itemIndex < nextIndex) nextIndex -= 1;
    nextIndex = Math.max(0, Math.min(nextIndex, targetLocation.pallet.items.length));
    targetLocation.pallet.items.splice(nextIndex, 0, item);

    if (!samePallet && sourceLocation.pallet.items.length === 0 && sourceLocation.center.pallets.length > 1) {
        sourceLocation.center.pallets = sourceLocation.center.pallets.filter((pallet) => pallet.id !== sourceLocation.pallet.id);
    }

    recalculateMilkrunLoadingEditorCenter(sourceLocation.center);
    setMilkrunLoadingEditorStatus("적재리스트 배치를 수정했습니다.", "success");
    renderMilkrunLoadingEditor();
    return true;
}

function deleteMilkrunLoadingEditorPallet(palletId) {
    const location = findMilkrunLoadingEditorPallet(palletId);
    if (!location) return;
    if (location.pallet.items.length) {
        setMilkrunLoadingEditorStatus("SKU가 들어있는 PLT는 삭제할 수 없습니다. SKU를 먼저 옮겨주세요.", "warning");
        return;
    }
    if (location.center.pallets.length <= 1) {
        setMilkrunLoadingEditorStatus("센터에는 최소 1개의 적재리스트가 필요합니다.", "warning");
        return;
    }
    location.center.pallets = location.center.pallets.filter((pallet) => pallet.id !== palletId);
    recalculateMilkrunLoadingEditorCenter(location.center);
    setMilkrunLoadingEditorStatus("빈 PLT를 삭제했습니다.", "success");
    renderMilkrunLoadingEditor();
}

function clearMilkrunLoadingEditorDropClasses() {
    document
        .querySelectorAll(".milkrun-loading-editor-row.is-drop-target, .milkrun-loading-editor-empty-row.is-drop-target, .milkrun-loading-editor-page.is-drop-target, .milkrun-loading-editor-new-drop.is-drop-target")
        .forEach((element) => element.classList.remove("is-drop-target"));
}

function handleMilkrunLoadingEditorDragStart(event) {
    const row = event.target instanceof HTMLElement
        ? event.target.closest("[data-loading-editor-item-id]")
        : null;
    if (!(row instanceof HTMLElement)) return;
    const itemId = row.getAttribute("data-loading-editor-item-id");
    if (!itemId) return;
    milkrunLoadingEditorDrag = { itemId };
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
}

function handleMilkrunLoadingEditorDragOver(event) {
    if (!milkrunLoadingEditorDrag) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const dropTarget = target?.closest("[data-loading-editor-drop-pallet-id], [data-loading-editor-pallet-id], #milkrun-loading-editor-new-pallet-drop");
    if (!(dropTarget instanceof HTMLElement)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearMilkrunLoadingEditorDropClasses();
    dropTarget.classList.add("is-drop-target");
}

function handleMilkrunLoadingEditorDrop(event) {
    if (!milkrunLoadingEditorDrag) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const itemId = event.dataTransfer.getData("text/plain") || milkrunLoadingEditorDrag.itemId;
    const newPalletDrop = target?.closest("#milkrun-loading-editor-new-pallet-drop");
    event.preventDefault();
    clearMilkrunLoadingEditorDropClasses();

    if (newPalletDrop) {
        const pallet = addMilkrunLoadingEditorPallet();
        const moved = pallet ? moveMilkrunLoadingEditorItem(itemId, pallet.id, 0) : false;
        if (pallet && !moved) {
            const center = getMilkrunLoadingEditorActiveCenter();
            if (center) {
                center.pallets = center.pallets.filter((item) => item.id !== pallet.id);
                renderMilkrunLoadingEditor();
            }
        }
        milkrunLoadingEditorDrag = null;
        return;
    }

    const rowDrop = target?.closest("[data-loading-editor-drop-pallet-id]");
    const pageDrop = target?.closest("[data-loading-editor-pallet-id]");
    const targetPalletId = rowDrop?.getAttribute("data-loading-editor-drop-pallet-id") ||
        pageDrop?.getAttribute("data-loading-editor-pallet-id") ||
        "";
    const targetIndex = rowDrop?.getAttribute("data-loading-editor-drop-index");
    if (targetPalletId) {
        moveMilkrunLoadingEditorItem(itemId, targetPalletId, targetIndex ?? Number.MAX_SAFE_INTEGER);
    }
    milkrunLoadingEditorDrag = null;
}

function handleMilkrunLoadingEditorDragEnd() {
    milkrunLoadingEditorDrag = null;
    clearMilkrunLoadingEditorDropClasses();
    document
        .querySelectorAll(".milkrun-loading-editor-row.is-dragging")
        .forEach((element) => element.classList.remove("is-dragging"));
}

function normalizeMilkrunLoadingEditorDraftForDownload() {
    recalculateMilkrunLoadingEditorDraft();
    return (milkrunLoadingEditorState?.centers ?? [])
        .map((center) => {
            const pallets = (center.pallets ?? [])
                .filter((pallet) => pallet.items?.length)
                .map((pallet) => pallet.items.map(({ id, ...item }) => ({ ...item })));
            const allItems = pallets.flat();
            return {
                center: center.center,
                dueDate: center.dueDate,
                poNumbersText: center.poNumbersText,
                totalBoxes: allItems.reduce((sum, item) => sum + getMilkrunLoadingEditorBoxCount(item), 0),
                totalQty: allItems.reduce((sum, item) => sum + getMilkrunLoadingEditorQty(item), 0),
                skuCount: new Set(allItems.map((item) => item.skuCode || item.skuName).filter(Boolean)).size,
                pallets,
                warnings: center.warnings ?? [],
            };
        })
        .filter((center) => center.pallets.length);
}

async function handleMilkrunLoadingEditorDownload() {
    if (!milkrunLoadingEditorState) return;
    const finalized = normalizeMilkrunLoadingEditorDraftForDownload();
    if (!finalized.length) {
        setMilkrunLoadingEditorStatus("출력할 SKU가 없습니다.", "warning");
        return;
    }

    const originalText = milkrunLoadingEditorDownloadBtn?.textContent || "편집 결과 PDF 다운로드";
    if (milkrunLoadingEditorDownloadBtn) {
        milkrunLoadingEditorDownloadBtn.disabled = true;
        milkrunLoadingEditorDownloadBtn.textContent = "PDF 생성 중...";
    }

    try {
        const preparedDownload = await prepareCoupangLoadingListPdfs(finalized, milkrunLoadingEditorState.fileNameBase, {
            onProgress: (progress) => {
                if (!milkrunLoadingEditorDownloadBtn) return;
                if (progress.phase === "zip") {
                    milkrunLoadingEditorDownloadBtn.textContent = "ZIP 압축 중...";
                    return;
                }
                milkrunLoadingEditorDownloadBtn.textContent = `PDF 생성 중 ${progress.centerIndex}/${progress.centerCount} · PLT ${progress.palletIndex}/${progress.palletCount}`;
            },
        });
        if (milkrunLoadingEditorDownloadBtn) {
            milkrunLoadingEditorDownloadBtn.textContent = "다운로드 시작 중...";
        }
        triggerCoupangLoadingListDownload(preparedDownload);
        closeMilkrunLoadingEditor();
    } catch (error) {
        console.error(error);
        setMilkrunLoadingEditorStatus(error?.message || "PDF를 만들 수 없습니다.", "warning");
    } finally {
        if (milkrunLoadingEditorDownloadBtn) {
            milkrunLoadingEditorDownloadBtn.disabled = false;
            milkrunLoadingEditorDownloadBtn.textContent = originalText;
        }
    }
}

function handleMilkrunLoadingEditorClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const centerButton = target.closest("[data-loading-editor-center-id]");
    if (centerButton instanceof HTMLElement && milkrunLoadingEditorState) {
        milkrunLoadingEditorState.activeCenterId = centerButton.getAttribute("data-loading-editor-center-id") || "";
        setMilkrunLoadingEditorStatus("");
        renderMilkrunLoadingEditor();
        return;
    }

    const deleteButton = target.closest("[data-loading-editor-delete-pallet]");
    if (deleteButton instanceof HTMLButtonElement) {
        deleteMilkrunLoadingEditorPallet(deleteButton.getAttribute("data-loading-editor-delete-pallet") || "");
    }
}

async function handleDownloadMilkrunLoadingList() {
    const activeWorkspace = getActiveMilkrunWorkspace();
    if (!activeWorkspace) {
        window.alert("먼저 쿠팡 밀크런 발주서를 선택해주세요.");
        return;
    }

    syncActiveMilkrunWorkspaceRows();
    const refreshedWorkspace = getActiveMilkrunWorkspace() || activeWorkspace;
    const sourceRows = getMilkrunWorkspaceSourceRows(refreshedWorkspace);
    if (!sourceRows.length) {
        window.alert("적재리스트를 만들 원본 쿠팡 발주 행이 없습니다. 발주서를 다시 업로드해주세요.");
        return;
    }

    const originalButtonText = milkrunLoadingListDownloadBtn?.textContent || "적재리스트 편집";
    if (milkrunLoadingListDownloadBtn) {
        milkrunLoadingListDownloadBtn.disabled = true;
        milkrunLoadingListDownloadBtn.textContent = "적재리스트 편집 준비 중...";
    }

    try {
        const loadingListData = buildCoupangLoadingListData({
            sourceRows,
            milkrunRows,
            resolveSkuComponents: getMilkrunSkuComponentsForOrderRow,
        });
        const fileNameBase = `coupang-loading-list-${sanitizeDownloadFileNamePart(refreshedWorkspace.title || refreshedWorkspace.id)}-${getNowForFileName()}`;
        openMilkrunLoadingEditor(loadingListData, fileNameBase);
    } catch (error) {
        console.error(error);
        window.alert(error?.message || "쿠팡 밀크런 적재리스트를 만들 수 없습니다.");
    } finally {
        if (milkrunLoadingListDownloadBtn) {
            milkrunLoadingListDownloadBtn.disabled = false;
            milkrunLoadingListDownloadBtn.hidden = false;
            milkrunLoadingListDownloadBtn.textContent = originalButtonText;
        }
    }
}

function handleMilkrunWorkspaceClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-milkrun-workspace-id]");
    if (!(button instanceof HTMLElement)) return;
    const nextId = button.getAttribute("data-milkrun-workspace-id") || "";
    if (!nextId) return;
    if (nextId !== activeMilkrunWorkspaceId) clearPendingMilkrunLoadingListDownload();
    activeMilkrunWorkspaceId = nextId;
    applyActiveMilkrunWorkspace();
}

function handleMilkrunViewTabClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-milkrun-view-tab]");
    if (!(button instanceof HTMLButtonElement)) return;
    setActiveMilkrunViewTab(button.getAttribute("data-milkrun-view-tab") || "overview");
}

function handleMilkrunWorkspaceSelectionChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const workspaceId = target.getAttribute("data-milkrun-workspace-check") || "";
    if (!workspaceId) return;

    if (target.checked) {
        selectedMilkrunWorkspaceIds.add(workspaceId);
    } else {
        selectedMilkrunWorkspaceIds.delete(workspaceId);
    }

    syncMilkrunWorkspaceListActions();
}

function handleToggleAllMilkrunWorkspaces() {
    syncSelectedMilkrunWorkspaceIds();

    if (milkrunWorkspaces.length && selectedMilkrunWorkspaceIds.size === milkrunWorkspaces.length) {
        selectedMilkrunWorkspaceIds = new Set();
    } else {
        selectedMilkrunWorkspaceIds = new Set(milkrunWorkspaces.map((workspace) => workspace.id));
    }

    renderMilkrunWorkspaceList();
}

function handleDeleteSelectedMilkrunWorkspaces() {
    syncSelectedMilkrunWorkspaceIds();
    const selectedCount = selectedMilkrunWorkspaceIds.size;
    if (!selectedCount) {
        window.alert("삭제할 쿠팡 발주서를 먼저 선택해주세요.");
        return;
    }

    if (!window.confirm(`선택한 쿠팡 발주서 ${selectedCount}개를 삭제할까요?`)) return;

    const selectedIds = new Set(selectedMilkrunWorkspaceIds);
    milkrunWorkspaces = milkrunWorkspaces.filter((workspace) => !selectedIds.has(workspace.id));
    selectedIds.forEach((workspaceId) => milkrunWorkspaceSourceRows.delete(workspaceId));
    selectedMilkrunWorkspaceIds = new Set();

    if (selectedIds.has(activeMilkrunWorkspaceId)) {
        activeMilkrunWorkspaceId = "";
        milkrunRows = [];
    }

    closeMilkrunCenterPicker({ restoreFocus: false });
    saveMilkrunWorkspacesToLocal();
    renderMilkrunWorkspaceList();
    renderMilkrunDashboard();
    void persistSkuWorkspace();
}

function handleMilkrunWorkspaceBackClick() {
    showMilkrunWorkspaceList();
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
    clearPendingMilkrunLoadingListDownload();
    renderMilkrunDashboard();
    syncActiveMilkrunWorkspaceRows();
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

function getMilkrunCenterSummaries(detailRows = getMilkrunDetailRows()) {
    const summaryMap = new Map();
    const rowsForSummary = detailRows.length ? detailRows : milkrunRows;

    rowsForSummary.forEach((row) => {
        const center = row.assignedCenter || row.originalCenter;
        if (!summaryMap.has(center)) {
            summaryMap.set(center, {
                center,
                orderIds: new Set(),
                skuKeys: new Set(),
                fallbackSkuCount: 0,
                qty: 0,
                boxCount: 0,
                ptCount: 0,
                weight: 0,
                boxCountCalculated: true,
                ptCountCalculated: true,
                weightCalculated: true,
                calculationWarnings: [],
                destination: row.destination || "",
            });
        }

        const rowWarnings = getMilkrunCalculationWarnings(row);
        const summary = summaryMap.get(center);
        if (row.orderId) summary.orderIds.add(row.orderId);
        const rowSkuKeys = Array.isArray(row.skuKeys) && row.skuKeys.length
            ? row.skuKeys
            : [row.productCode || row.productName].filter(Boolean);
        rowSkuKeys.forEach((skuKey) => summary.skuKeys.add(skuKey));
        if (!rowSkuKeys.length) summary.fallbackSkuCount += Number(row.skuCount) || 0;
        summary.qty += Number(row.qty) || 0;
        summary.boxCount += Number(row.boxCount) || 0;
        summary.ptCount += Number(row.ptCount) || 0;
        summary.weight += Number(row.weight) || 0;
        summary.boxCountCalculated = summary.boxCountCalculated && row.boxCountCalculated !== false;
        summary.ptCountCalculated = summary.ptCountCalculated && row.ptCountCalculated !== false;
        summary.weightCalculated = summary.weightCalculated && row.weightCalculated !== false;
        summary.calculationWarnings.push(...rowWarnings);
        if (!summary.destination && row.destination) summary.destination = row.destination;
    });

    return Array.from(summaryMap.values())
        .map((summary) => ({
            ...summary,
            orderCount: summary.orderIds.size,
            skuCount: summary.skuKeys.size + summary.fallbackSkuCount,
        }))
        .sort((a, b) => a.center.localeCompare(b.center, "ko-KR", { numeric: true }));
}

function renderMilkrunSummary(detailRows = getMilkrunDetailRows(), summaries = getMilkrunCenterSummaries(detailRows)) {
    if (!milkrunCenterSummaryBody) return;
    if (!summaries.length) {
        milkrunCenterSummaryBody.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="5">발주서를 선택하면 센터별 요약이 표시됩니다.</td>
            </tr>
        `;
        return;
    }

    milkrunCenterSummaryBody.innerHTML = summaries.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.center)}</strong></td>
            <td>${renderMilkrunMetricValue(item.boxCount, 2, item.boxCountCalculated, item.calculationWarnings)}</td>
            <td>${renderMilkrunMetricValue(item.ptCount, 2, item.ptCountCalculated, item.calculationWarnings)}</td>
            <td>${formatMilkrunNumber(item.skuCount)}</td>
            <td>${renderMilkrunMetricValue(item.weight, 1, item.weightCalculated, item.calculationWarnings)}</td>
        </tr>
    `).join("") + `
        <tr class="milkrun-total-row">
            <td><strong>총계</strong></td>
            <td>${renderMilkrunMetricValue(summaries.reduce((sum, item) => sum + item.boxCount, 0), 2, summaries.every((item) => item.boxCountCalculated), summaries.flatMap((item) => item.calculationWarnings))}</td>
            <td>${renderMilkrunMetricValue(summaries.reduce((sum, item) => sum + item.ptCount, 0), 2, summaries.every((item) => item.ptCountCalculated), summaries.flatMap((item) => item.calculationWarnings))}</td>
            <td>${formatMilkrunNumber(summaries.reduce((sum, item) => sum + item.skuCount, 0))}</td>
            <td>${renderMilkrunMetricValue(summaries.reduce((sum, item) => sum + item.weight, 0), 1, summaries.every((item) => item.weightCalculated), summaries.flatMap((item) => item.calculationWarnings))}</td>
        </tr>
    `;
}

function renderMilkrunDetails(detailRows = getMilkrunDetailRows()) {
    if (!milkrunDetailBody) return;

    if (!detailRows.length) {
        milkrunDetailBody.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="8">발주서를 선택하면 SKU 상세가 표시됩니다.</td>
            </tr>
        `;
        return;
    }

    milkrunDetailBody.innerHTML = getMilkrunSortedDetailRows(detailRows).map((row) => {
        const calculationWarnings = getMilkrunCalculationWarnings(row);
        const centerChanged = row.assignedCenter !== row.originalCenter;
        const centerTitle = centerChanged
            ? `기존 센터: ${row.originalCenter}`
            : "원본 발주 센터";

        return `
            <tr data-milkrun-detail-row="${escapeHtml(row.rowKey)}">
                <td><strong>${escapeHtml(row.orderId)}</strong></td>
                <td>
                    <span class="milkrun-detail-center${centerChanged ? " is-changed" : ""}" title="${escapeHtml(centerTitle)}">
                        ${escapeHtml(row.assignedCenter || "-")}
                    </span>
                </td>
                <td>${escapeHtml(row.productCode || "-")}</td>
                <td class="milkrun-product-name" title="${escapeHtml(row.productName)}">${escapeHtml(row.productName || "-")}</td>
                <td>${formatMilkrunNumber(row.qty)}</td>
                <td>${renderMilkrunMetricValue(row.boxCount, 2, row.boxCountCalculated !== false, calculationWarnings)}</td>
                <td>${renderMilkrunMetricValue(row.ptCount, 2, row.ptCountCalculated !== false, calculationWarnings)}</td>
                <td>${renderMilkrunMetricValue(row.weight, 1, row.weightCalculated !== false, calculationWarnings)}</td>
            </tr>
        `;
    }).join("");
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
        const calculationWarnings = getMilkrunCalculationWarnings(row);
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
                <td>${renderMilkrunMetricValue(row.boxCount, 2, row.boxCountCalculated !== false, calculationWarnings)}</td>
                <td>${renderMilkrunMetricValue(row.ptCount, 2, row.ptCountCalculated !== false, calculationWarnings)}</td>
                <td>${renderMilkrunMetricValue(row.weight, 1, row.weightCalculated !== false, calculationWarnings)}</td>
                <td><span class="milkrun-status ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join("");
}

function renderMilkrunDashboard() {
    const detailRows = getMilkrunDetailRows();
    const centerSummaries = getMilkrunCenterSummaries(detailRows);

    renderMilkrunDetails(detailRows);
    renderMilkrunSummary(detailRows, centerSummaries);
    renderMilkrunOrders();
    renderMilkrunViewTabs(detailRows, centerSummaries);
}

function loadMilkrunSampleRows() {
    milkrunRows = MILKRUN_SAMPLE_ROWS.map((row) => ({ ...row }));
    activeMilkrunWorkspaceId = "";
    renderMilkrunWorkspaceList();
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
    clearPendingMilkrunLoadingListDownload();
    renderMilkrunDashboard();
    syncActiveMilkrunWorkspaceRows();
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
        tracking: "송장 조회",
        "kurly-label": "컬리 라벨 생성",
        "coupang-milkrun": "쿠팡 밀크런",
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
            `파일을 불러왔습니다.\n\n파일명: ${file.name}\n총 ${parsedRows.length}건을 읽었습니다.\n이제 조회 실행을 눌러 진행해주세요.`
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
        resetSkuSearchAndSort({ render: false });
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
        const { total, invalid } = validationResult.summary;

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
        resetSkuSearchAndSort({ render: false });
        closeSkuEditModal();
        updateSelectedFileName(file, skuFileNameEl);
        renderCurrentSkuRows();
        setSkuResult(`업로드 완료: ${formatSkuValidationSummary(validationResult.summary)}`);
        renderOrderMatchPanel();
        rebuildMilkrunWorkspacesFromSkuData({ persist: false });
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

        updateSelectedFileName(file, kurlyLabelFileNameEl);
        await applyKurlyOrdersToLabel(validationResult.rows, file);
        setKurlyLabelResult(`업로드 완료: 총 ${total}건 (정상 ${valid}건)\n컬리 라벨 생성에서 발주서를 선택해 미리보기와 PDF 다운로드를 진행할 수 있습니다.`);
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

    const activeWorkspace = getActiveKurlyLabelWorkspace();
    if (!activeWorkspace) {
        setKurlyLabelResult("먼저 업로드된 컬리 발주서를 선택해주세요.");
        return;
    }

    const workspaceRows = getKurlyLabelWorkspaceRows(activeWorkspace);
    kurlyRows = workspaceRows;
    kurlyParsedFileName = activeWorkspace.title || "";

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
        `다운로드 완료: ${activeWorkspace.title || kurlyParsedFileName || "업로드 발주서"} 기준 ${validRows.length}행, 총 ${labelItems.length}장, 센터 ${centerCount}개`
    );
}

async function handleTrackingRun() {
    if (!hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage("송장 조회");
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
        setTrackingResult("먼저 조회 실행을 진행해주세요.");
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
        showPaidAccessRequiredMessage("송장 조회");
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

    setManualTrackingResult("수기입력 송장 조회 중입니다...");

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
    initializeMilkrunOverviewResizer();
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
    crmFileInput?.addEventListener("change", async () => {
        await setCrmFilesSelectedState(crmFileInput.files);
    });
    orderUploadChannelAddBtn?.addEventListener("click", handleAddOrderUploadChannel);
    orderUploadChannelInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleAddOrderUploadChannel();
        }
    });
    orderUploadChannelListEl?.addEventListener("change", handleOrderUploadChannelFileChange);
    orderUploadChannelListEl?.addEventListener("dragstart", handleOrderUploadChannelDragStart);
    orderUploadChannelListEl?.addEventListener("dragover", handleOrderUploadChannelDragOver);
    orderUploadChannelListEl?.addEventListener("dragleave", handleOrderUploadChannelDragLeave);
    orderUploadChannelListEl?.addEventListener("drop", handleOrderUploadChannelDrop);
    orderUploadChannelListEl?.addEventListener("dragend", handleOrderUploadChannelDragEnd);
    orderUploadChannelListEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const headerMapButton = target.closest("[data-order-header-map-open]");
        if (headerMapButton instanceof HTMLElement) {
            handleOpenOrderHeaderMapSetup(headerMapButton.getAttribute("data-order-header-map-open") || "");
            return;
        }
        const removeButton = target.closest("[data-order-upload-channel-remove]");
        if (!(removeButton instanceof HTMLElement)) return;
        handleRemoveOrderUploadChannel(removeButton.getAttribute("data-order-upload-channel-remove") || "");
    });
    orderHeaderMapCloseBtn?.addEventListener("click", closeOrderHeaderMapModal);
    orderHeaderMapCancelBtn?.addEventListener("click", closeOrderHeaderMapModal);
    orderHeaderMapSaveBtn?.addEventListener("click", handleSaveOrderHeaderMapSetup);
    orderHeaderMapFileInput?.addEventListener("change", () => {
        void handleOrderHeaderMapFileChange();
    });
    orderHeaderMapAddFieldBtn?.addEventListener("click", handleAddOrderHeaderMapField);
    orderHeaderMapSiteFieldsEl?.addEventListener("click", handleOrderHeaderMapSiteFieldClick);
    orderHeaderMapSiteFieldsEl?.addEventListener("dragstart", handleOrderHeaderFieldDragStart);
    orderHeaderMapSiteFieldsEl?.addEventListener("dragend", handleOrderHeaderFieldDragEnd);
    orderHeaderMapPreviewEl?.addEventListener("click", handleOrderHeaderMapPreviewClick);
    orderHeaderMapPreviewEl?.addEventListener("dragstart", handleOrderHeaderFieldDragStart);
    orderHeaderMapPreviewEl?.addEventListener("dragover", handleOrderHeaderDropDragOver);
    orderHeaderMapPreviewEl?.addEventListener("dragleave", handleOrderHeaderDropDragLeave);
    orderHeaderMapPreviewEl?.addEventListener("drop", handleOrderHeaderDrop);
    orderHeaderMapPreviewEl?.addEventListener("dragend", handleOrderHeaderFieldDragEnd);
    orderHeaderMapModal?.addEventListener("click", (event) => {
        if (event.target === orderHeaderMapModal) closeOrderHeaderMapModal();
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
    skuSearchFieldSelect?.addEventListener("change", handleSkuSearchFieldChange);
    skuSearchInput?.addEventListener("input", handleSkuSearchInput);
    skuSearchClearBtn?.addEventListener("click", handleClearSkuSearch);
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
    kurlyLabelDownloadBtn?.addEventListener("click", handleGenerateKurlyLabels);
    kurlyLabelSessionListEl?.addEventListener("click", handleKurlyLabelWorkspaceClick);
    kurlyLabelSessionListEl?.addEventListener("change", handleKurlyLabelWorkspaceSelectionChange);
    kurlyLabelWorkspaceBackBtn?.addEventListener("click", handleKurlyLabelWorkspaceBackClick);
    kurlyLabelSelectAllBtn?.addEventListener("click", handleToggleAllKurlyLabelWorkspaces);
    kurlyLabelDeleteSelectedBtn?.addEventListener("click", handleDeleteSelectedKurlyLabelWorkspaces);
    milkrunLoadSampleBtn?.addEventListener("click", loadMilkrunSampleRows);
    milkrunLoadingListDownloadBtn?.addEventListener("click", handleDownloadMilkrunLoadingList);
    milkrunLoadingEditorCloseBtn?.addEventListener("click", closeMilkrunLoadingEditor);
    milkrunLoadingEditorCancelBtn?.addEventListener("click", closeMilkrunLoadingEditor);
    milkrunLoadingEditorDownloadBtn?.addEventListener("click", handleMilkrunLoadingEditorDownload);
    milkrunLoadingEditorAddPalletBtn?.addEventListener("click", () => {
        if (!milkrunLoadingEditorState) return;
        addMilkrunLoadingEditorPallet();
        setMilkrunLoadingEditorStatus("현재 센터에 빈 PLT를 추가했습니다.", "success");
        renderMilkrunLoadingEditor();
    });
    milkrunLoadingEditorNewPalletDropEl?.addEventListener("click", () => {
        if (!milkrunLoadingEditorState) return;
        addMilkrunLoadingEditorPallet();
        setMilkrunLoadingEditorStatus("현재 센터에 빈 PLT를 추가했습니다.", "success");
        renderMilkrunLoadingEditor();
    });
    milkrunLoadingEditorCenterListEl?.addEventListener("click", handleMilkrunLoadingEditorClick);
    milkrunLoadingEditorPagesEl?.addEventListener("click", handleMilkrunLoadingEditorClick);
    milkrunLoadingEditorPagesEl?.addEventListener("dragstart", handleMilkrunLoadingEditorDragStart);
    milkrunLoadingEditorPagesEl?.addEventListener("dragover", handleMilkrunLoadingEditorDragOver);
    milkrunLoadingEditorPagesEl?.addEventListener("drop", handleMilkrunLoadingEditorDrop);
    milkrunLoadingEditorPagesEl?.addEventListener("dragend", handleMilkrunLoadingEditorDragEnd);
    milkrunLoadingEditorNewPalletDropEl?.addEventListener("dragover", handleMilkrunLoadingEditorDragOver);
    milkrunLoadingEditorNewPalletDropEl?.addEventListener("drop", handleMilkrunLoadingEditorDrop);
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
    milkrunSessionListEl?.addEventListener("click", handleMilkrunWorkspaceClick);
    milkrunSessionListEl?.addEventListener("change", handleMilkrunWorkspaceSelectionChange);
    milkrunViewTabButtons.forEach((button) => button.addEventListener("click", handleMilkrunViewTabClick));
    milkrunWorkspaceBackBtn?.addEventListener("click", handleMilkrunWorkspaceBackClick);
    milkrunSelectAllBtn?.addEventListener("click", handleToggleAllMilkrunWorkspaces);
    milkrunDeleteSelectedBtn?.addEventListener("click", handleDeleteSelectedMilkrunWorkspaces);
    milkrunCenterModal?.addEventListener("click", (event) => {
        if (event.target === milkrunCenterModal) closeMilkrunCenterModal();
    });
    milkrunLoadingEditorModal?.addEventListener("click", (event) => {
        if (event.target === milkrunLoadingEditorModal) closeMilkrunLoadingEditor();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (milkrunLoadingEditorModal && !milkrunLoadingEditorModal.classList.contains("is-hidden")) {
            closeMilkrunLoadingEditor();
        }
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
    skuTableHead?.addEventListener("click", handleSkuHeaderSortClick);
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
    resetSkuSearchAndSort({ render: false });
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
    draggedOrderUploadChannelKey = "";
    orderUploadChannelStates = {};
    loadOrderUploadCustomChannels();
    loadOrderHeaderMaps();
    loadLocalOrderProductMatches();
    syncOrderUploadChannelOrder();
    getAllOrderUploadChannels().forEach((channel) => {
        orderUploadChannelStates[channel.key] = { message: "대기 중", tone: "idle" };
    });
    renderOrderUploadChannels();
    renderOrderMatchPanel();
    closeOrderHeaderMapModal();
}

function initializeCrmUi() {
    crmRows = [];
    crmAnalytics = buildCrmAnalytics([]);
    crmSourceFileName = "";
    updateSelectedFileName(null, crmFileNameEl);
    renderCrmDashboard();
    setCrmUploadStatus("과거 주문 엑셀을 업로드하면 고객 재구매 요약이 표시됩니다.", "info");
}

function initializeKurlyLabelUi() {
    kurlyRows = [];
    kurlyParsedFileName = "";
    selectedKurlyLabelWorkspaceIds = new Set();
    kurlyLabelFileInput?.closest(".tracking-toolbar")?.setAttribute("hidden", "");
    updateSelectedFileName(null, kurlyLabelFileNameEl);
    loadKurlyLabelWorkspacesFromLocal();
    activeKurlyLabelWorkspaceId = "";
    renderKurlyLabelWorkspaceList();
    renderKurlyLabelWorkspaceDetail();
    setKurlyLabelResult("발주서를 선택하면 라벨 미리보기와 PDF 다운로드를 진행할 수 있습니다.");
    resetKurlyProgress();
}

function initializeMilkrunUi() {
    try {
        milkrunWorkspaceSourceRows = new Map();
        selectedMilkrunWorkspaceIds = new Set();
        loadMilkrunCenterOptions();
        closeMilkrunCenterModal();
        refreshMilkrunCenterUi();
        loadMilkrunWorkspacesFromLocal();
        activeMilkrunWorkspaceId = "";
        milkrunRows = [];
        renderMilkrunWorkspaceList();
        renderMilkrunDashboard();
    } catch (error) {
        console.error("쿠팡 밀크런 초기화 중 오류가 발생했습니다.", error);
        coupangCenterOptions = [...DEFAULT_COUPANG_CENTER_OPTIONS];
        milkrunRows = [];
        try {
            refreshMilkrunCenterUi();
            renderMilkrunDashboard();
        } catch (fallbackError) {
            console.error("쿠팡 밀크런 기본 화면 복구에 실패했습니다.", fallbackError);
        }
    }
}

async function loadSkuWorkspace(userId) {
    skuWorkspaceUserId = userId ?? null;
    milkrunWorkspaceSourceRows = new Map();
    selectedMilkrunWorkspaceIds = new Set();
    selectedKurlyLabelWorkspaceIds = new Set();
    await loadOrderProductMatches();
    if (!skuWorkspaceUserId) return;

    const workspaceDocRef = getSkuWorkspaceDocRef();
    if (!workspaceDocRef) return;

    try {
        const workspaceSnap = await getDoc(workspaceDocRef);
        const data = workspaceSnap.data();
        const savedRows = Array.isArray(data?.rows) ? data.rows : [];
        const savedHeaders = Array.isArray(data?.selectedSkuHeaderKeys) ? data.selectedSkuHeaderKeys : [];
        const savedMilkrunWorkspaces = Array.isArray(data?.milkrunWorkspaces) ? data.milkrunWorkspaces : [];
        const savedKurlyLabelWorkspaces = Array.isArray(data?.kurlyLabelWorkspaces) ? data.kurlyLabelWorkspaces : [];

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
        milkrunWorkspaces = savedMilkrunWorkspaces;
        hydrateMilkrunWorkspaceSourceRows(milkrunWorkspaces);
        activeMilkrunWorkspaceId = "";
        milkrunRows = [];
        rebuildMilkrunWorkspacesFromSkuData({ persist: false, render: false });
        kurlyLabelWorkspaces = savedKurlyLabelWorkspaces;
        activeKurlyLabelWorkspaceId = "";
        kurlyRows = [];
        kurlyParsedFileName = "";
        renderKurlyLabelWorkspaceList();
        renderKurlyLabelWorkspaceDetail();
        saveKurlyLabelWorkspacesToLocal();
        renderMilkrunWorkspaceList();
        renderMilkrunDashboard();
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
    setToolGroupOpenState(true);
    updatePaidFeatureLockUi();
    handlePaymentReturnMessage();
    showView("home");
    showTrackingMode("excel");
    initializeTrackingUi();
    initializeSkuUi();
    initializeOrderUploadUi();
    initializeCrmUi();
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
        await loadCrmOrdersForCurrentUser();
        await loadSkuLabelTemplates(user.uid);
        initializeLabelEditor({ userId: user.uid });
    } catch (error) {
        console.error(error);
        dashboardUserInfoEl.textContent = "사용자 상태 확인 중 오류가 발생했습니다.";
    }
});

safelyInitializeDashboard();
