import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-functions.js";
import { auth, db, functions } from "./firebase-config.js?v=20260721-server-orders1";
import { parseTrackingFile } from "./tracking-file.js";
import { initializeLabelEditor } from "./label-editor.js";
import { parseSkuFile } from "./sku-file.js?v=20260724-sku-types3";
import { validateSkuRows } from "./sku-utils.js?v=20260724-sku-types3";
import { downloadSkuExportWorkbook } from "./sku-export.js?v=20260804-sku-export1";
import {
    SKU_FIELDS,
    SKU_REQUIRED_KEYS,
    SKU_TYPE_DEFAULT,
    SKU_TYPE_OPTIONS,
    getSkuTypeFromCategory,
    normalizeSkuTypeValue,
} from "./sku-schema.js?v=20260724-sku-types3";
import {
    buildInventoryLotSnapshot,
    buildInventorySnapshot,
    buildInventoryStorageAdjustmentPlan,
    buildInventoryTransactionDraft,
    getInventoryDocumentId,
    getInventoryLotGroupKey,
    getInventorySkuKey,
    getInventoryTransactionTypeMeta,
    normalizeInventoryBalance,
    normalizeInventoryStorageRow,
    normalizeInventoryTransaction,
} from "./inventory-utils.js?v=20260813-order-allocation1";
import {
    INVENTORY_ALLOCATION_KIND_SHORTAGE,
    INVENTORY_ALLOCATION_KIND_STOCK,
    buildAutomaticInventoryAllocationPlan,
    buildInventoryAllocationCapacityRows,
    buildInventoryAllocationSnapshot,
    getInventoryAvailability,
    getOrderLineSkuRequirements,
    normalizeInventoryAllocation,
} from "./inventory-allocation-utils.js?v=20260813-shortage-allocation1";
import {
    getOrderLineRequiredQuantity,
    normalizeOrderLine,
} from "./order-line-utils.js?v=20260813-order-line2";
import {
    buildOrderAllocationLookup,
    getAllocationStatusMeta,
    getOrderLineAllocationState,
    getOrderStatusMeta,
    getShippingStatusMeta,
    normalizeOrderOperationalStatuses,
    normalizeOrderStatus,
    normalizeShippingStatus,
} from "./order-status-utils.js?v=20260813-manual-allocation1";
import {
    INVENTORY_ALLOCATION_POLICY_DEFAULTS,
    INVENTORY_ALLOCATION_POLICY_SCHEMA_VERSION,
    getInventoryAllocationPriorityLabel,
    normalizeInventoryAllocationPolicy,
    validateInventoryAllocationPriorityKeys,
} from "./inventory-allocation-settings.js?v=20260804-inventory-policy2";
import {
    buildReopenedInventoryReceiptItems,
    buildPostedInventoryReceiptItems,
    buildInventoryReceiptDraft,
    buildUpdatedInventoryReceiptPlan,
    compareInventoryReceiptsDesc,
    filterReceivingSkuRowsBySearch,
    findInventoryReceiptItemsByBarcode,
    formatReceivingExpiryDateInput,
    getInventoryReceiptItemProgress,
    getInventoryReceiptItemStatusMeta,
    getInventoryReceiptProgress,
    getInventoryReceiptStatusMeta,
    isInventoryReceiptEditableStatus,
    isValidReceivingExpiryDate,
    mergeInventoryReceiptAllocation,
    normalizeInventoryReceipt,
    normalizeInventoryReceiptAllocation,
    normalizeInventoryReceiptItem,
    normalizeReceivingBarcode,
} from "./receiving-utils.js?v=20260803-inbound-upload1";
import {
    buildInboundPlanImportPreview,
    parseInboundPlanFile,
} from "./receiving-file.js?v=20260803-inbound-date2";
import {
    applyReceivingCompletionImport,
    buildReceivingCompletionImportPreview,
    buildReceivingCompletionTemplateMatrix,
    parseReceivingCompletionFile,
} from "./receiving-completion-file.js?v=20260806-receiving-completion1";
import { parseKurlyLabelFile } from "./kurly-label-file.js";
import { buildKurlyLabelItems, validateKurlyRows } from "./kurly-label-utils.js";
import {
    buildKurlyOrderRows,
    buildMilkrunDetailRowsFromOrderRows,
    buildMilkrunRowsFromOrderRows,
    parseCoupangOrderFile,
    parseGenericOrderFile,
    readOrderHeaderPreview,
} from "./order-upload-file.js?v=20260721-date-normalize1";
import {
    buildCrmAnalytics,
    parseCrmHistoricalOrderFile,
} from "./crm-upload-file.js?v=20260720-crm-insights1";
import {
    buildCrmRepurchaseAnalytics,
} from "./crm-repurchase-analytics.js?v=20260720-crm-insights1";
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
const customerKeyStateEl = document.getElementById("customer-key-state");
const customerKeySecretInput = document.getElementById("customer-key-secret");
const customerKeySecretConfirmInput = document.getElementById("customer-key-secret-confirm");
const customerKeySaveBtn = document.getElementById("customer-key-save-btn");
const customerKeyUnlockBtn = document.getElementById("customer-key-unlock-btn");
const customerKeyLockBtn = document.getElementById("customer-key-lock-btn");
const customerKeyStatusEl = document.getElementById("customer-key-status");
const customerKeyReadinessEl = document.getElementById("customer-key-readiness");
const customerKeyReadinessTitleEl = document.getElementById("customer-key-readiness-title");
const customerKeyReadinessDetailEl = document.getElementById("customer-key-readiness-detail");
const customerKeyFormEl = document.getElementById("customer-key-form");
const customerKeySecretLabelEl = document.getElementById("customer-key-secret-label");
const customerKeyConfirmFieldEl = document.getElementById("customer-key-confirm-field");
const customerKeyConfirmLabelEl = document.getElementById("customer-key-confirm-label");
const customerKeySavedFieldEl = document.getElementById("customer-key-saved-field");
const customerKeySavedMaskInput = document.getElementById("customer-key-saved-mask");
const customerKeyRevealBtn = document.getElementById("customer-key-reveal-btn");
const customerKeyRevealAuthEl = document.getElementById("customer-key-reveal-auth");
const customerKeyAccountPasswordInput = document.getElementById("customer-key-account-password");
const customerKeyRevealConfirmBtn = document.getElementById("customer-key-reveal-confirm-btn");
const skuCategoryLabelInputs = [
    document.getElementById("sku-category-label-1"),
    document.getElementById("sku-category-label-2"),
    document.getElementById("sku-category-label-3"),
];
const skuCategoryLabelSaveBtn = document.getElementById("sku-category-label-save-btn");
const skuCategoryLabelResetBtn = document.getElementById("sku-category-label-reset-btn");
const skuCategoryLabelStatusEl = document.getElementById("sku-category-label-status");
const inventoryAllocationSettingsStateEl = document.getElementById("inventory-allocation-settings-state");
const inventoryAllocationPrioritySelects = [
    document.getElementById("inventory-allocation-priority-1"),
    document.getElementById("inventory-allocation-priority-2"),
    document.getElementById("inventory-allocation-priority-3"),
];
const inventoryAllocationUndatedPolicySelect = document.getElementById("inventory-allocation-undated-policy");
const inventoryAllocationLotSplitInput = document.getElementById("inventory-allocation-lot-split");
const inventoryAllocationExpiredExclusionInput = document.getElementById("inventory-allocation-expired-exclusion");
const inventoryAllocationPreviewStepsEl = document.getElementById("inventory-allocation-preview-steps");
const inventoryAllocationPreviewSummaryEl = document.getElementById("inventory-allocation-preview-summary");
const inventoryAllocationSaveBtn = document.getElementById("inventory-allocation-save-btn");
const inventoryAllocationResetBtn = document.getElementById("inventory-allocation-reset-btn");
const inventoryAllocationStatusEl = document.getElementById("inventory-allocation-status");

const paymentBtn = document.getElementById("payment-btn");
const logoutBtn = document.getElementById("logout-btn");
const navButtons = document.querySelectorAll(".sidebar-nav-item, .sidebar-subnav-item");
const topLevelNavButtons = document.querySelectorAll(".sidebar-nav-item");
const subNavButtons = document.querySelectorAll(".sidebar-subnav-item");
const views = document.querySelectorAll(".workspace-view");
const navGroupEls = [...document.querySelectorAll(".sidebar-nav-group[data-nav-group]")];
const navGroupToggleEls = [...document.querySelectorAll(".sidebar-nav-group-toggle")];
const SIDEBAR_NAV_GROUP_STORAGE_KEY = "flowbutler:sidebar-nav-groups";

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
const skuExportBtn = document.getElementById("sku-export-btn");
const skuDeleteSelectedBtn = document.getElementById("sku-delete-selected-btn");
const skuResultEl = document.getElementById("sku-result");
const skuSearchFieldSelect = document.getElementById("sku-search-field");
const skuSearchInput = document.getElementById("sku-search-input");
const skuSearchClearBtn = document.getElementById("sku-search-clear-btn");
const skuTypeTabs = document.getElementById("sku-type-tabs");
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
const inventoryOpeningOpenBtn = document.getElementById("inventory-opening-open-btn");
const inventoryAdjustmentOpenBtn = document.getElementById("inventory-adjustment-open-btn");
const inventoryLedgerViewEl = document.getElementById("view-inventory-ledger");
const inventoryPageStatusEl = document.getElementById("inventory-page-status");
const inventorySummarySkuCountEl = document.getElementById("inventory-summary-sku-count");
const inventorySummaryTotalStockEl = document.getElementById("inventory-summary-total-stock");
const inventorySummaryZeroStockEl = document.getElementById("inventory-summary-zero-stock");
const inventorySummaryTodayMovementEl = document.getElementById("inventory-summary-today-movement");
const inventoryViewTabsEl = document.querySelector(".inventory-view-tabs");
const inventoryViewPanels = document.querySelectorAll("[data-inventory-view-panel]");
const inventorySearchLoadingEl = document.getElementById("inventory-search-loading");
const inventoryStockSearchInput = document.getElementById("inventory-stock-search");
const inventoryStockTypeFilter = document.getElementById("inventory-stock-type-filter");
const inventoryStockStateFilter = document.getElementById("inventory-stock-state-filter");
const inventoryStockFilterResetBtn = document.getElementById("inventory-stock-filter-reset");
const inventoryStockSearchBtn = document.getElementById("inventory-stock-search-btn");
const inventoryStockCountEl = document.getElementById("inventory-stock-count");
const inventoryStockBodyEl = document.getElementById("inventory-stock-body");
const inventoryLotSearchInput = document.getElementById("inventory-lot-search");
const inventoryLotExpiryFilter = document.getElementById("inventory-lot-expiry-filter");
const inventoryLotStockFilter = document.getElementById("inventory-lot-stock-filter");
const inventoryLotFilterResetBtn = document.getElementById("inventory-lot-filter-reset");
const inventoryLotSearchBtn = document.getElementById("inventory-lot-search-btn");
const inventoryLotAlertEl = document.getElementById("inventory-lot-alert");
const inventoryLotCountEl = document.getElementById("inventory-lot-count");
const inventoryLotBodyEl = document.getElementById("inventory-lot-body");
const inventoryLedgerSearchInput = document.getElementById("inventory-ledger-search");
const inventoryLedgerTypeFilter = document.getElementById("inventory-ledger-type-filter");
const inventoryLedgerPeriodFilter = document.getElementById("inventory-ledger-period-filter");
const inventoryLedgerFilterResetBtn = document.getElementById("inventory-ledger-filter-reset");
const inventoryLedgerSearchBtn = document.getElementById("inventory-ledger-search-btn");
const inventoryLedgerCountEl = document.getElementById("inventory-ledger-count");
const inventoryLedgerBodyEl = document.getElementById("inventory-ledger-body");
const inventoryEntryModal = document.getElementById("inventory-entry-modal");
const inventoryEntryModalTitleEl = document.getElementById("inventory-entry-modal-title");
const inventoryEntryModalDescEl = document.getElementById("inventory-entry-modal-desc");
const inventoryEntryCloseBtn = document.getElementById("inventory-entry-close-btn");
const inventoryEntryCancelBtn = document.getElementById("inventory-entry-cancel-btn");
const inventoryEntrySaveBtn = document.getElementById("inventory-entry-save-btn");
const inventoryEntrySkuSearchInput = document.getElementById("inventory-entry-sku-search");
const inventoryEntrySkuResultsEl = document.getElementById("inventory-entry-sku-results");
const inventoryEntrySelectedSkuEl = document.getElementById("inventory-entry-selected-sku");
const inventoryEntryQuantityInput = document.getElementById("inventory-entry-quantity");
const inventoryEntryDateInput = document.getElementById("inventory-entry-date");
const inventoryEntryReasonField = document.getElementById("inventory-entry-reason-field");
const inventoryEntryReasonSelect = document.getElementById("inventory-entry-reason");
const inventoryEntryMemoInput = document.getElementById("inventory-entry-memo");
const inventoryEntryPreviewEl = document.getElementById("inventory-entry-preview");
const inventoryEntryStatusEl = document.getElementById("inventory-entry-status");
const inventoryEntryQuantityHelpEl = document.getElementById("inventory-entry-quantity-help");
const inventoryAdjustmentDirectionEl = document.getElementById("inventory-adjustment-direction");
const inventoryAdjustmentDirectionInputs = document.querySelectorAll('input[name="inventory-adjustment-direction"]');
const inventoryStorageModal = document.getElementById("inventory-storage-modal");
const inventoryStorageCloseBtn = document.getElementById("inventory-storage-close-btn");
const inventoryStorageCancelBtn = document.getElementById("inventory-storage-cancel-btn");
const inventoryStorageSaveBtn = document.getElementById("inventory-storage-save-btn");
const inventoryStorageProductNameEl = document.getElementById("inventory-storage-product-name");
const inventoryStorageProductMetaEl = document.getElementById("inventory-storage-product-meta");
const inventoryStorageCurrentTotalEl = document.getElementById("inventory-storage-current-total");
const inventoryStorageRowsEl = document.getElementById("inventory-storage-rows");
const inventoryStorageAddRowBtn = document.getElementById("inventory-storage-add-row-btn");
const inventoryStorageBeforeTotalEl = document.getElementById("inventory-storage-before-total");
const inventoryStorageAfterTotalEl = document.getElementById("inventory-storage-after-total");
const inventoryStorageDifferenceCardEl = document.getElementById("inventory-storage-difference-card");
const inventoryStorageDifferenceEl = document.getElementById("inventory-storage-difference");
const inventoryStorageChangePreviewEl = document.getElementById("inventory-storage-change-preview");
const inventoryStorageReasonSelect = document.getElementById("inventory-storage-reason");
const inventoryStorageDateInput = document.getElementById("inventory-storage-date");
const inventoryStorageMemoInput = document.getElementById("inventory-storage-memo");
const inventoryStorageStatusEl = document.getElementById("inventory-storage-status");
const receivingCreateOpenBtn = document.getElementById("receiving-create-open-btn");
const receivingPageStatusEl = document.getElementById("receiving-page-status");
const receivingSummaryTotalEl = document.getElementById("receiving-summary-total");
const receivingSummaryPlannedEl = document.getElementById("receiving-summary-planned");
const receivingSummaryCompletedEl = document.getElementById("receiving-summary-completed");
const receivingSummaryTodayQuantityEl = document.getElementById("receiving-summary-today-quantity");
const receivingSearchInput = document.getElementById("receiving-search-input");
const receivingStatusFilter = document.getElementById("receiving-status-filter");
const receivingPeriodFilter = document.getElementById("receiving-period-filter");
const receivingFilterResetBtn = document.getElementById("receiving-filter-reset-btn");
const receivingListCountEl = document.getElementById("receiving-list-count");
const receivingListBodyEl = document.getElementById("receiving-list-body");
const receivingUploadFileInput = document.getElementById("receiving-upload-file");
const receivingUploadModal = document.getElementById("receiving-upload-modal");
const receivingUploadFileNameEl = document.getElementById("receiving-upload-file-name");
const receivingUploadSummaryEl = document.getElementById("receiving-upload-summary");
const receivingUploadIssuesEl = document.getElementById("receiving-upload-issues");
const receivingUploadGroupsBodyEl = document.getElementById("receiving-upload-groups-body");
const receivingUploadStatusEl = document.getElementById("receiving-upload-status");
const receivingUploadCancelBtn = document.getElementById("receiving-upload-cancel-btn");
const receivingUploadSaveBtn = document.getElementById("receiving-upload-save-btn");
const receivingCreateModal = document.getElementById("receiving-create-modal");
const receivingCreateTitleEl = document.getElementById("receiving-create-title");
const receivingCreateDescriptionEl = document.getElementById("receiving-create-description");
const receivingCreateCancelBtn = document.getElementById("receiving-create-cancel-btn");
const receivingCreateSaveBtn = document.getElementById("receiving-create-save-btn");
const receivingSupplierInput = document.getElementById("receiving-supplier-input");
const receivingExpectedDateInput = document.getElementById("receiving-expected-date-input");
const receivingMemoInput = document.getElementById("receiving-memo-input");
const receivingSkuSearchInput = document.getElementById("receiving-sku-search-input");
const receivingSkuSearchCountEl = document.getElementById("receiving-sku-search-count");
const receivingSkuSearchResultsEl = document.getElementById("receiving-sku-search-results");
const receivingItemsSummaryEl = document.getElementById("receiving-items-summary");
const receivingItemsBodyEl = document.getElementById("receiving-items-body");
const receivingCreateStatusEl = document.getElementById("receiving-create-status");
const receivingDetailModal = document.getElementById("receiving-detail-modal");
const receivingDetailCloseBtn = document.getElementById("receiving-detail-close-btn");
const receivingDetailCloseActionBtn = document.getElementById("receiving-detail-close-action-btn");
const receivingDetailEditPlannedBtn = document.getElementById("receiving-detail-edit-planned-btn");
const receivingDetailTitleEl = document.getElementById("receiving-detail-title");
const receivingDetailStatusBadgeEl = document.getElementById("receiving-detail-status-badge");
const receivingDetailCodeEl = document.getElementById("receiving-detail-code");
const receivingReworkNoticeEl = document.getElementById("receiving-rework-notice");
const receivingScanWorkspaceEl = document.getElementById("receiving-scan-workspace");
const receivingScanStepEl = document.getElementById("receiving-scan-step");
const receivingDetailBarcodeInput = document.getElementById("receiving-detail-barcode-input");
const receivingDetailBarcodeSubmitBtn = document.getElementById("receiving-detail-barcode-submit-btn");
const receivingScanFeedbackEl = document.getElementById("receiving-scan-feedback");
const receivingScanProductPanelEl = document.getElementById("receiving-scan-product-panel");
const receivingDetailMetaEl = document.getElementById("receiving-detail-meta");
const receivingDetailProgressEl = document.getElementById("receiving-detail-progress");
const receivingDetailItemsSummaryEl = document.getElementById("receiving-detail-items-summary");
const receivingDetailItemsBodyEl = document.getElementById("receiving-detail-items-body");
const receivingDetailStatusEl = document.getElementById("receiving-detail-status");
const receivingDetailCancelReceiptBtn = document.getElementById("receiving-detail-cancel-receipt-btn");
const receivingDetailSaveBtn = document.getElementById("receiving-detail-save-btn");
const receivingDetailPartialBtn = document.getElementById("receiving-detail-partial-btn");
const receivingDetailCompleteBtn = document.getElementById("receiving-detail-complete-btn");
const receivingCompletionWorkspaceEl = document.getElementById("receiving-completion-workspace");
const receivingCompletionTemplateBtn = document.getElementById("receiving-completion-template-btn");
const receivingCompletionUploadTrigger = document.getElementById("receiving-completion-upload-trigger");
const receivingCompletionFileInput = document.getElementById("receiving-completion-file");
const receivingCompletionModal = document.getElementById("receiving-completion-modal");
const receivingCompletionFileNameEl = document.getElementById("receiving-completion-file-name");
const receivingCompletionCloseBtn = document.getElementById("receiving-completion-close-btn");
const receivingCompletionSummaryEl = document.getElementById("receiving-completion-summary");
const receivingCompletionIssuesEl = document.getElementById("receiving-completion-issues");
const receivingCompletionItemsBodyEl = document.getElementById("receiving-completion-items-body");
const receivingCompletionStatusEl = document.getElementById("receiving-completion-status");
const receivingCompletionCancelBtn = document.getElementById("receiving-completion-cancel-btn");
const receivingCompletionApplyBtn = document.getElementById("receiving-completion-apply-btn");
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
const uploadHistoryRefreshBtn = document.getElementById("upload-history-refresh-btn");
const uploadHistorySummaryTotalEl = document.getElementById("upload-history-summary-total");
const uploadHistorySummarySuccessEl = document.getElementById("upload-history-summary-success");
const uploadHistorySummaryFailedEl = document.getElementById("upload-history-summary-failed");
const uploadHistorySummaryDuplicateEl = document.getElementById("upload-history-summary-duplicate");
const uploadHistoryStatusFilter = document.getElementById("upload-history-status-filter");
const uploadHistoryChannelFilter = document.getElementById("upload-history-channel-filter");
const uploadHistorySearchInput = document.getElementById("upload-history-search-input");
const uploadHistoryClearBtn = document.getElementById("upload-history-clear-btn");
const uploadHistoryStatusEl = document.getElementById("upload-history-status");
const uploadHistoryCountEl = document.getElementById("upload-history-count");
const uploadHistoryBodyEl = document.getElementById("upload-history-body");
const uploadHistoryDetailEl = document.getElementById("upload-history-detail");
const uploadHistoryDetailStatusEl = document.getElementById("upload-history-detail-status");
const uploadHistoryDetailTitleEl = document.getElementById("upload-history-detail-title");
const uploadHistoryDetailMetaEl = document.getElementById("upload-history-detail-meta");
const uploadHistoryDetailSummaryEl = document.getElementById("upload-history-detail-summary");
const uploadHistoryDetailMessageEl = document.getElementById("upload-history-detail-message");
const uploadHistoryErrorListEl = document.getElementById("upload-history-error-list");
const uploadHistoryUploadLinkBtn = document.getElementById("upload-history-upload-link-btn");
const uploadHistoryErrorDownloadBtn = document.getElementById("upload-history-error-download-btn");
const uploadHistoryDetailCloseBtn = document.getElementById("upload-history-detail-close-btn");
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
const orderMatchDeleteSelectAllBtn = document.getElementById("order-match-delete-select-all-btn");
const orderMatchDeleteSelectedBtn = document.getElementById("order-match-delete-selected-btn");
const orderMatchDeleteSelectedCountEl = document.getElementById("order-match-delete-selected-count");
const orderMatchDeleteListEl = document.getElementById("order-match-delete-list");
const orderManagementSummaryTotalEl = document.getElementById("order-management-summary-total");
const orderManagementSummaryActiveEl = document.getElementById("order-management-summary-active");
const orderManagementSummaryAllocationPendingEl = document.getElementById("order-management-summary-allocation-pending");
const orderManagementSummaryShippedEl = document.getElementById("order-management-summary-shipped");
const orderManagementChannelFilter = document.getElementById("order-management-channel-filter");
const orderManagementOrderStatusFilter = document.getElementById("order-management-order-status-filter");
const orderManagementAllocationStatusFilter = document.getElementById("order-management-allocation-status-filter");
const orderManagementShippingStatusFilter = document.getElementById("order-management-shipping-status-filter");
const orderManagementMatchFilter = document.getElementById("order-management-match-filter");
const orderManagementPeriodFilter = document.getElementById("order-management-period-filter");
const orderManagementSearchInput = document.getElementById("order-management-search-input");
const orderManagementClearBtn = document.getElementById("order-management-clear-btn");
const orderManagementStatusEl = document.getElementById("order-management-status");
const orderManagementCountEl = document.getElementById("order-management-count");
const orderManagementSelectAllocationNeededBtn = document.getElementById("order-management-select-allocation-needed-btn");
const orderManagementBulkAllocateBtn = document.getElementById("order-management-bulk-allocate-btn");
const orderManagementBulkDeleteBtn = document.getElementById("order-management-bulk-delete-btn");
const orderManagementDeleteAllBtn = document.getElementById("order-management-delete-all-btn");
const orderManagementSelectAllCheckbox = document.getElementById("order-management-select-all");
const orderManagementBodyEl = document.getElementById("order-management-body");
const orderManagementDetailModal = document.getElementById("order-management-detail-modal");
const orderManagementDetailCloseBtn = document.getElementById("order-management-detail-close-btn");
const orderManagementDetailCancelBtn = document.getElementById("order-management-detail-cancel-btn");
const orderManagementDetailDeleteBtn = document.getElementById("order-management-detail-delete-btn");
const orderManagementDetailSaveBtn = document.getElementById("order-management-detail-save-btn");
const orderManagementDetailMetaEl = document.getElementById("order-management-detail-meta");
const orderManagementDetailGridEl = document.getElementById("order-management-detail-grid");
const orderManagementDetailOrderStatusSelect = document.getElementById("order-management-detail-order-status");
const orderManagementDetailAllocationStatusEl = document.getElementById("order-management-detail-allocation-status");
const orderManagementDetailShippingStatusSelect = document.getElementById("order-management-detail-shipping-status");
const orderManagementDetailShippingHelpEl = document.getElementById("order-management-detail-shipping-help");
const orderManagementDetailCourierInput = document.getElementById("order-management-detail-courier");
const orderManagementDetailInvoiceInput = document.getElementById("order-management-detail-invoice");
const orderManagementDetailCsInput = document.getElementById("order-management-detail-cs");
const orderManagementAllocationEditorEl = document.getElementById("order-management-allocation-editor");
const orderManagementAllocationPolicyEl = document.getElementById("order-management-allocation-policy");
const orderManagementAllocationSummaryEl = document.getElementById("order-management-allocation-summary");
const orderManagementAllocationStatusMessageEl = document.getElementById("order-management-allocation-message");
const orderManagementAllocationSearchInput = document.getElementById("order-management-allocation-search");
const orderManagementAllocationBodyEl = document.getElementById("order-management-allocation-body");
const orderManagementAllocationAutoBtn = document.getElementById("order-management-allocation-auto-btn");
const orderManagementAllocationReleaseBtn = document.getElementById("order-management-allocation-release-btn");
const orderManagementAllocationSaveBtn = document.getElementById("order-management-allocation-save-btn");
const crmFileInput = document.getElementById("crm-file");
const crmFileNameEl = document.getElementById("crm-file-name");
const crmUploadStatusEl = document.getElementById("crm-upload-status");
const crmDeleteBtn = document.getElementById("crm-delete-btn");
const crmPeriodPresetSelect = document.getElementById("crm-period-preset");
const crmPeriodCustomEl = document.getElementById("crm-period-custom");
const crmPeriodStartInput = document.getElementById("crm-period-start");
const crmPeriodEndInput = document.getElementById("crm-period-end");
const crmPeriodCaptionEl = document.getElementById("crm-period-caption");
const crmQualityStripEl = document.getElementById("crm-quality-strip");
const crmSummaryOrdersEl = document.getElementById("crm-summary-orders");
const crmSummaryCustomersEl = document.getElementById("crm-summary-customers");
const crmSummaryRepeatCustomersEl = document.getElementById("crm-summary-repeat-customers");
const crmSummaryRepeatRateEl = document.getElementById("crm-summary-repeat-rate");
const crmSummaryRepeatDescEl = document.getElementById("crm-summary-repeat-desc");
const crmChannelRetentionListEl = document.getElementById("crm-channel-retention-list");
const crmCategoryTabsEl = document.getElementById("crm-category-tabs");
const crmCategoryRetentionListEl = document.getElementById("crm-category-retention-list");
const crmTimeHeatmapEl = document.getElementById("crm-time-heatmap");
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

const SKU_CATEGORY_LABEL_DEFAULTS = Object.freeze({
    category1: "분류1",
    category2: "분류2",
    category3: "분류3",
});
const SKU_CATEGORY_FIELD_KEYS = Object.freeze(Object.keys(SKU_CATEGORY_LABEL_DEFAULTS));
const SKU_CATEGORY_DEFAULT_OPTIONS = Object.freeze([
    "본품",
    "기획상품",
    "사은품",
    "부자재",
    "세트상품",
    "기타",
    "단종",
]);

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
    "inventory-ledger": {
        title: "재고수불부",
        subtitle: "SKU별 현재고와 입·출고 변동을 관리합니다.",
    },
    receiving: {
        title: "입고 관리",
        subtitle: "입고 예정부터 완료와 재고 반영까지 관리합니다.",
    },
    "order-upload": {
        title: "발주서 업로드",
        subtitle: "쿠팡(밀크런)과 컬리 발주서를 판매처별 양식으로 업로드합니다.",
    },
    "upload-history": {
        title: "업로드 이력",
        subtitle: "발주서 처리 결과와 오류 원인을 확인합니다.",
    },
    "order-management": {
        title: "주문관리",
        subtitle: "수집된 주문을 확인하고 처리 상태를 관리합니다.",
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
        subtitle: "계정 정보와 재고 운영 기본 정책을 관리합니다.",
    },
};

let trackingRows = [];
let trackingExecuted = false;
let lastTrackingSummary = null;
let skuRows = [];
let skuWorkspaceLoaded = false;
let selectedSkuHeaderKeys = [];
let selectedSkuRowIds = new Set();
let skuSearchFieldKey = "all";
let skuSearchQuery = "";
let skuSearchHasSubmitted = false;
let skuExportRunning = false;
let skuTypeFilterKey = "active";
let skuSortKey = "";
let skuSortDirection = "asc";
let skuColumnWidths = {};
let skuColumnResizeState = null;
let skuColumnWidthPersistTimer = 0;
let skuLookupCache = null;
let editingSkuRowId = null;
let activeSkuInlineEdit = null;
let lastSkuInlineEdit = null;
let skuInlineToastTimer = null;
let skuInlinePersistQueue = Promise.resolve(true);
let skuWorkspaceUserId = null;
let skuCategoryLabels = { ...SKU_CATEGORY_LABEL_DEFAULTS };
let skuCategoryOptions = [];
let skuLabelTemplates = [];
let printingSkuRowId = null;
const INVENTORY_DEFAULT_SORT_STATES = Object.freeze({
    stock: Object.freeze({ key: "product", direction: "asc" }),
    lot: Object.freeze({ key: "expiryDate", direction: "asc" }),
    ledger: Object.freeze({ key: "occurredAt", direction: "desc" }),
});
const INVENTORY_COLUMN_WIDTH_SCHEMA_VERSION = 3;
const INVENTORY_COLUMN_MAX_WIDTH = 640;
const INVENTORY_COLUMN_DEFINITIONS = Object.freeze({
    stock: Object.freeze({
        product: Object.freeze({ label: "상품", defaultWidth: 270, minWidth: 140 }),
        skuType: Object.freeze({ label: "SKU 유형", defaultWidth: 120, minWidth: 88 }),
        category: Object.freeze({ label: "카테고리", defaultWidth: 140, minWidth: 88 }),
        quantity: Object.freeze({ label: "현재고", defaultWidth: 105, minWidth: 76 }),
        allocatedQuantity: Object.freeze({ label: "할당재고", defaultWidth: 105, minWidth: 84 }),
        availableQuantity: Object.freeze({ label: "가용재고", defaultWidth: 105, minWidth: 84 }),
        latest: Object.freeze({ label: "최근 변동", defaultWidth: 265, minWidth: 140 }),
        action: Object.freeze({ label: "관리", defaultWidth: 80, minWidth: 64, maxWidth: 160 }),
    }),
    lot: Object.freeze({
        product: Object.freeze({ label: "상품", defaultWidth: 240, minWidth: 140 }),
        lotNo: Object.freeze({ label: "LOT", defaultWidth: 125, minWidth: 88 }),
        expiryDate: Object.freeze({ label: "유통기한", defaultWidth: 125, minWidth: 96 }),
        expiryState: Object.freeze({ label: "기한 상태", defaultWidth: 110, minWidth: 88 }),
        location: Object.freeze({ label: "로케이션", defaultWidth: 140, minWidth: 88 }),
        palletNo: Object.freeze({ label: "PLT", defaultWidth: 110, minWidth: 80 }),
        quantity: Object.freeze({ label: "현재고", defaultWidth: 100, minWidth: 76 }),
        allocatedQuantity: Object.freeze({ label: "할당재고", defaultWidth: 100, minWidth: 84 }),
        availableQuantity: Object.freeze({ label: "가용재고", defaultWidth: 100, minWidth: 84 }),
        latest: Object.freeze({ label: "최근 변동", defaultWidth: 230, minWidth: 140 }),
        action: Object.freeze({ label: "관리", defaultWidth: 80, minWidth: 64, maxWidth: 160 }),
    }),
    ledger: Object.freeze({
        occurredAt: Object.freeze({ label: "일시", defaultWidth: 160, minWidth: 120 }),
        transactionCode: Object.freeze({ label: "수불번호", defaultWidth: 145, minWidth: 96 }),
        transactionType: Object.freeze({ label: "수불유형", defaultWidth: 145, minWidth: 96 }),
        product: Object.freeze({ label: "상품", defaultWidth: 230, minWidth: 140 }),
        inQuantity: Object.freeze({ label: "입고", defaultWidth: 85, minWidth: 72 }),
        outQuantity: Object.freeze({ label: "출고", defaultWidth: 85, minWidth: 72 }),
        balanceAfter: Object.freeze({ label: "현재고", defaultWidth: 100, minWidth: 76 }),
        reason: Object.freeze({ label: "사유·변경내역", defaultWidth: 300, minWidth: 180 }),
        createdBy: Object.freeze({ label: "작업자", defaultWidth: 110, minWidth: 88 }),
    }),
});
let inventoryTransactions = [];
let inventoryBalances = [];
let inventoryAllocations = [];
let inventoryLedgerLoaded = false;
let inventoryActiveView = "stock";
let inventorySearchLoading = false;
let inventoryViewSearchStates = {
    stock: false,
    lot: false,
    ledger: false,
};
let inventoryStockFilters = {
    query: "",
    skuType: "all",
    stockState: "active",
};
let inventoryLotFilters = {
    query: "",
    expiryState: "all",
    stockState: "available",
};
let inventoryLotSnapshotCache = null;
let inventoryLedgerFilters = {
    query: "",
    transactionType: "all",
    period: "30",
};
let inventorySortStates = createInventorySortStates();
let inventoryColumnWidths = {};
let inventoryColumnResizeState = null;
let inventoryColumnWidthPersistTimer = 0;
let inventoryEntryMode = "opening";
let selectedInventorySkuKey = "";
let inventoryEntrySaving = false;
let selectedInventoryStorageSkuKey = "";
let inventoryStorageBaselineRows = [];
let inventoryStorageDraftRows = [];
let inventoryStorageBaselineRevision = 0;
let inventoryStorageSaving = false;
let inventoryStorageRowSequence = 0;
let inventoryStorageReturnFocus = null;
let inventoryReceipts = [];
let receivingFilters = {
    query: "",
    status: "all",
    period: "30",
};
let receivingDraftItems = [];
let receivingUploadParsed = null;
let receivingUploadPreview = null;
let receivingUploadSaving = false;
let receivingEditReceiptId = "";
let receivingEditBaselineSignature = "";
let receivingCreateReturnToDetail = false;
let selectedReceivingId = "";
let receivingSaving = false;
let receivingActionPending = false;
let receivingDetailDraftItems = [];
let receivingDetailDirty = false;
let receivingDetailSaving = false;
let receivingAllocationSequence = 0;
let receivingScanDraft = null;
let receivingScanFeedback = {
    message: "상품 바코드를 스캔해주세요.",
    tone: "info",
};
let receivingCompletionParsed = null;
let receivingCompletionPreview = null;
let receivingCompletionBusy = false;
let orderUploadRows = [];
let orderManagementRows = [];
let orderManagementFilters = {
    channel: "all",
    orderStatus: "all",
    allocationStatus: "all",
    shippingStatus: "all",
    match: "all",
    period: "all",
    query: "",
};
let selectedOrderManagementIds = new Set();
let editingOrderManagementId = "";
let orderManagementAllocationDraft = new Map();
let orderManagementAllocationSearch = "";
let orderManagementAllocationSaving = false;
let orderManagementBulkAllocationPending = false;
let orderUploadCustomChannels = [];
let orderUploadChannelOrder = [];
let orderUploadChannelStates = {};
let uploadHistoryRows = [];
let uploadHistoryLoading = false;
let selectedUploadHistoryId = "";
let uploadHistoryFilters = {
    status: "all",
    channel: "all",
    query: "",
};
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
let selectedOrderMatchDeleteKeys = new Set();
let orderProductCandidateCache = null;
let crmRows = [];
let crmHistoricalRows = [];
let crmAnalytics = buildCrmAnalytics([]);
let crmRepurchaseAnalytics = buildCrmRepurchaseAnalytics([]);
let crmSourceFileName = "";
let crmPeriodPreset = "all";
let crmCustomStartDate = "";
let crmCustomEndDate = "";
let crmActiveCategoryKey = "category1";
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
let activeSkuCategoryPicker = null;
let milkrunOverviewResizeState = null;
let milkrunLoadingEditorState = null;
let milkrunLoadingEditorDrag = null;
let crmDbPromise = null;
let orderManagementCloudPersistQueue = Promise.resolve(false);
let crmCloudPersistQueue = Promise.resolve(false);
const cloudCollectionSyncHashes = new Map();
const MILKRUN_CENTER_PICKER_POPOVER_ID = "milkrun-center-picker-popover";
const ORDER_SKU_PICKER_POPOVER_ID = "order-sku-picker-popover";
const SKU_CATEGORY_PICKER_POPOVER_ID = "sku-category-picker-popover";
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
const ORDER_MANAGEMENT_STORAGE_PREFIX = "flowbutler:order-management";
const ORDER_PRIVACY_RETENTION_DAYS = 90;
const CLOUD_PERSISTENCE_BATCH_SIZE = 400;
const ORDER_UPLOAD_IMPORT_SCHEMA_VERSION = "1";
const UPLOAD_HISTORY_SCHEMA_VERSION = "1";
const UPLOAD_HISTORY_ERROR_LIMIT = 200;
const CLOUD_SYNC_IGNORED_FIELD_KEYS = new Set(["syncHash", "updatedAt"]);
const CRM_DB_NAME = "flowbutler-crm";
const CRM_DB_VERSION = 1;
const CRM_STORE_NAME = "crmOrderPayloads";
const CUSTOMER_KEY_SETTINGS_VERSION = "v1";
const SKU_WORKSPACE_SCHEMA_VERSION = "sku-categories-v6";
const INVENTORY_BALANCE_COLLECTION = "inventoryBalances";
const INVENTORY_TRANSACTION_COLLECTION = "inventoryTransactions";
const INVENTORY_RECEIPT_COLLECTION = "inventoryReceipts";
const INVENTORY_ALLOCATION_COLLECTION = "inventoryAllocations";
const INVENTORY_ADJUSTMENT_REASONS = Object.freeze({
    in: Object.freeze(["실사 차이", "반품 반영", "누락 재고 보정", "기타"]),
    out: Object.freeze(["실사 차이", "파손", "분실", "샘플 사용", "폐기", "기타"]),
});
const MIXED_ORDER_UPLOAD_CHANNEL_KEY = "multi-channel";
const ORDER_HEADER_REQUIRED_FIELD_KEYS = ["orderCode", "orderDate", "productName", "quantity", "recipientName", "recipientPhone", "recipientAddress"];
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
const LEGACY_ORDER_MANAGEMENT_STATUSES = ["접수", "확인 필요", "보류", "피킹", "패킹", "출고", "취소"];
const ORDER_MANAGEMENT_PRIVACY_FIELDS = [
    "ordererName",
    "ordererPhone",
    "recipientName",
    "recipientPhone",
    "recipientZip",
    "recipientAddress",
    "deliveryMemo",
];
const ORDER_MANAGEMENT_RENDER_LIMIT = 300;
const SKU_TABLE_RENDER_LIMIT = 300;
const SKU_COLUMN_MIN_WIDTH = 72;
const SKU_COLUMN_MAX_WIDTH = 640;
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
const SKU_TYPE_ALL_KEY = "all";
const SKU_TYPE_ACTIVE_KEY = "active";
const SKU_TYPE_DISCONTINUED_KEY = "discontinued";
const SKU_TYPE_FILTER_KEYS = Object.freeze([
    SKU_TYPE_ALL_KEY,
    SKU_TYPE_ACTIVE_KEY,
    ...SKU_TYPE_OPTIONS,
    SKU_TYPE_DISCONTINUED_KEY,
]);

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
let currentDashboardViewName = "home";
let customerKeySettings = null;
let customerKeyPrefixVisible = false;
let customerKeyRevealPromptOpen = false;
let customerKeyRevealTimer = 0;
let inventoryAllocationPolicy = normalizeInventoryAllocationPolicy(
    INVENTORY_ALLOCATION_POLICY_DEFAULTS,
);
let inventoryAllocationPolicyLoaded = false;
let inventoryAllocationPolicyLoading = false;
let inventoryAllocationPolicySaving = false;
let inventoryAllocationPolicyDirty = false;

function clampProgress(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
}

function createDebouncedHandler(callback, delay = 180) {
    let timerId = 0;
    return (...args) => {
        window.clearTimeout(timerId);
        timerId = window.setTimeout(() => callback(...args), delay);
    };
}

function isCurrentDashboardView(viewName) {
    return currentDashboardViewName === viewName;
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


function getStoredSidebarNavGroupState() {
    try {
        const rawState = window.localStorage.getItem(SIDEBAR_NAV_GROUP_STORAGE_KEY);
        const parsedState = rawState ? JSON.parse(rawState) : {};
        return parsedState && typeof parsedState === "object" && !Array.isArray(parsedState)
            ? parsedState
            : {};
    } catch (error) {
        console.warn("사이드 메뉴 상태를 불러오지 못했습니다.", error);
        return {};
    }
}

function persistSidebarNavGroupState() {
    try {
        const nextState = {};
        navGroupEls.forEach((groupEl) => {
            const groupKey = String(groupEl.dataset.navGroup || "").trim();
            if (groupKey) nextState[groupKey] = groupEl.classList.contains("is-open");
        });
        window.localStorage.setItem(SIDEBAR_NAV_GROUP_STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
        console.warn("사이드 메뉴 상태를 저장하지 못했습니다.", error);
    }
}

function setSidebarNavGroupOpenState(groupEl, isOpen, { persist = true } = {}) {
    if (!(groupEl instanceof HTMLElement)) return;
    const toggleEl = groupEl.querySelector(".sidebar-nav-group-toggle");
    const subnavId = toggleEl?.getAttribute("aria-controls") || "";
    const subnavEl = subnavId ? document.getElementById(subnavId) : null;
    if (!(toggleEl instanceof HTMLButtonElement) || !(subnavEl instanceof HTMLElement)) return;

    groupEl.classList.toggle("is-open", isOpen);
    toggleEl.setAttribute("aria-expanded", String(isOpen));
    subnavEl.hidden = !isOpen;
    if (persist) persistSidebarNavGroupState();
}

function initializeSidebarNavGroups() {
    const storedState = getStoredSidebarNavGroupState();
    navGroupEls.forEach((groupEl) => {
        const groupKey = String(groupEl.dataset.navGroup || "").trim();
        const hasStoredState = Object.prototype.hasOwnProperty.call(storedState, groupKey);
        const isOpen = hasStoredState ? storedState[groupKey] === true : groupKey === "orders";
        setSidebarNavGroupOpenState(groupEl, isOpen, { persist: false });
    });
}

function openSidebarNavGroupForView(viewName) {
    const activeButton = [...subNavButtons].find((button) => button.dataset.view === viewName);
    const groupEl = activeButton?.closest(".sidebar-nav-group");
    if (groupEl) setSidebarNavGroupOpenState(groupEl, true);
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

function hasCustomerKeySettings() {
    return Boolean(customerKeySettings?.configured);
}

function isCustomerKeyUnlocked() {
    return hasCustomerKeySettings();
}

function clearCustomerKeyInputs() {
    if (customerKeySecretInput) customerKeySecretInput.value = "";
    if (customerKeySecretConfirmInput) customerKeySecretConfirmInput.value = "";
}

function setCustomerKeyStatus(message, tone = "info") {
    if (!customerKeyStatusEl) return;
    customerKeyStatusEl.textContent = message ?? "";
    customerKeyStatusEl.className = `customer-key-status is-${tone}`;
}

function setCustomerKeyReadiness(title, detail, tone) {
    if (customerKeyReadinessTitleEl) customerKeyReadinessTitleEl.textContent = title;
    if (customerKeyReadinessDetailEl) customerKeyReadinessDetailEl.textContent = detail;
    if (customerKeyReadinessEl) customerKeyReadinessEl.className = `customer-key-readiness is-${tone}`;
}

function getCustomerKeySecretValidationMessage(secret) {
    if (!/^[A-Za-z0-9\uAC00-\uD7A3]{6,}$/.test(String(secret || ""))) {
        return "\uACE0\uAC1D\uD0A4\uB294 \uC601\uBB38, \uD55C\uAE00, \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD558\uBA70 6\uC790 \uC774\uC0C1\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.";
    }
    return "";
}

function getCustomerKeyDisplayMask() {
    const length = Math.max(Number(customerKeySettings?.secretLength) || 0, 6);
    return "\u2022".repeat(Math.min(length, 16));
}

function clearCustomerKeyPrefixReveal() {
    customerKeyPrefixVisible = false;
    customerKeyRevealPromptOpen = false;
    if (customerKeyRevealTimer) window.clearTimeout(customerKeyRevealTimer);
    customerKeyRevealTimer = 0;
    if (customerKeyAccountPasswordInput) customerKeyAccountPasswordInput.value = "";
}

function renderCustomerKeySettingsUi() {
    const configured = hasCustomerKeySettings();
    const prefix = String(customerKeySettings?.displayPrefix || "").slice(0, 2);

    if (customerKeyStateEl) {
        customerKeyStateEl.textContent = configured ? "\uB4F1\uB85D\uB428" : "\uBBF8\uC124\uC815";
        customerKeyStateEl.className = `customer-key-state ${configured ? "is-unlocked" : "is-empty"}`;
    }

    if (configured) {
        setCustomerKeyReadiness(
            "\uBC1C\uC8FC\uC11C \uC5C5\uB85C\uB4DC \uC900\uBE44 \uC644\uB8CC",
            "\uB4F1\uB85D\uD55C \uACE0\uAC1D\uD0A4\uB85C \uC11C\uBC84\uC5D0\uC11C \uACE0\uAC1D \uC2DD\uBCC4\uD0A4\uB97C \uC790\uB3D9 \uC0DD\uC131\uD569\uB2C8\uB2E4.",
            "ready",
        );
    } else {
        setCustomerKeyReadiness(
            "\uACE0\uAC1D\uD0A4 \uB4F1\uB85D \uD544\uC694",
            "\uACE0\uAC1D\uD0A4\uB97C \uD55C \uBC88 \uB4F1\uB85D\uD558\uBA74 \uBC1C\uC8FC\uC11C \uC5C5\uB85C\uB4DC \uB9C8\uB2E4 \uC11C\uBC84\uC5D0\uC11C \uC790\uB3D9 \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
            "empty",
        );
    }

    if (customerKeySavedFieldEl) customerKeySavedFieldEl.hidden = !configured;
    if (customerKeySavedMaskInput) {
        customerKeySavedMaskInput.value = configured
            ? (customerKeyPrefixVisible && prefix
                ? `${prefix}${getCustomerKeyDisplayMask().slice(prefix.length)}`
                : getCustomerKeyDisplayMask())
            : "";
    }
    if (customerKeyRevealBtn) {
        customerKeyRevealBtn.disabled = !configured;
        customerKeyRevealBtn.setAttribute("aria-label", "\uACE0\uAC1D\uD0A4 \uC55E \uB450 \uAE00\uC790 \uD655\uC778");
        customerKeyRevealBtn.title = "\uACC4\uC815 \uBE44\uBC00\uBC88\uD638 \uD655\uC778 \uD6C4 \uC55E \uB450 \uAE00\uC790 \uD45C\uC2DC";
    }
    if (customerKeyRevealAuthEl) customerKeyRevealAuthEl.hidden = !customerKeyRevealPromptOpen;

    if (customerKeyFormEl) {
        customerKeyFormEl.hidden = configured;
        customerKeyFormEl.classList.remove("is-single");
    }
    if (customerKeySecretLabelEl) customerKeySecretLabelEl.textContent = "\uC0C8 \uACE0\uAC1D\uD0A4";
    if (customerKeySecretInput) {
        customerKeySecretInput.autocomplete = "new-password";
        customerKeySecretInput.placeholder = "\uC601\uBB38, \uD55C\uAE00, \uC22B\uC790 6\uC790 \uC774\uC0C1";
    }
    if (customerKeyConfirmFieldEl) customerKeyConfirmFieldEl.hidden = configured;
    if (customerKeyConfirmLabelEl) customerKeyConfirmLabelEl.textContent = "\uACE0\uAC1D\uD0A4 \uB2E4\uC2DC \uC785\uB825";

    if (customerKeySaveBtn) customerKeySaveBtn.hidden = configured;
    if (customerKeyUnlockBtn) customerKeyUnlockBtn.hidden = true;
    if (customerKeyLockBtn) customerKeyLockBtn.hidden = true;
}

function normalizeServerCustomerKeySettings(data = {}) {
    const source = data?.settings ?? data;
    if (!source?.configured) return null;

    return {
        configured: true,
        version: String(source.version || "server-hmac-v1"),
        secretLength: Math.max(Number(source.secretLength) || 0, 6),
        displayPrefix: String(source.displayPrefix || "").slice(0, 2),
        updatedAt: source.updatedAt || "",
    };
}

async function loadCustomerKeySettings(userId) {
    clearCustomerKeyPrefixReveal();
    customerKeySettings = null;
    renderCustomerKeySettingsUi();

    if (!userId) {
        setCustomerKeyStatus("\uB85C\uADF8\uC778 \uD6C4 \uACE0\uAC1D\uD0A4\uB97C \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "warning");
        return;
    }

    try {
        const getCustomerKeySettings = httpsCallable(functions, "getCustomerKeySettings");
        const result = await getCustomerKeySettings();
        customerKeySettings = normalizeServerCustomerKeySettings(result.data);
        setCustomerKeyStatus(
            customerKeySettings
                ? "\uACE0\uAC1D\uD0A4\uAC00 \uC11C\uBC84\uC5D0 \uB4F1\uB85D\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uBC1C\uC8FC\uC11C \uC5C5\uB85C\uB4DC \uC2DC \uC790\uB3D9 \uC0AC\uC6A9\uB429\uB2C8\uB2E4."
                : "\uACE0\uAC1D\uD0A4\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694.",
            customerKeySettings ? "success" : "info",
        );
    } catch (error) {
        console.error(error);
        setCustomerKeyStatus("\uACE0\uAC1D\uD0A4 \uC124\uC815\uC744 \uC11C\uBC84\uC5D0\uC11C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", "error");
    }

    renderCustomerKeySettingsUi();
}

async function saveCustomerKeySettings(secret) {
    const registerCustomerKey = httpsCallable(functions, "registerCustomerKey");
    const result = await registerCustomerKey({ secret });
    const settings = normalizeServerCustomerKeySettings(result.data);
    if (!settings) throw new Error("\uACE0\uAC1D\uD0A4 \uB4F1\uB85D \uACB0\uACFC\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");

    customerKeySettings = settings;
    return true;
}
async function attachCustomerKeysToOrderRows(rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    if (!sourceRows.length) return { rows: sourceRows, generated: false };

    const phoneValues = sourceRows.flatMap((row) => [row?.ordererPhone || "", row?.recipientPhone || ""]);
    const generatedKeys = [];
    const generateCustomerKeys = httpsCallable(functions, "generateCustomerKeys");

    try {
        for (let start = 0; start < phoneValues.length; start += 2000) {
            const chunk = phoneValues.slice(start, start + 2000);
            const result = await generateCustomerKeys({ phoneValues: chunk });
            const keys = Array.isArray(result.data?.keys) ? result.data.keys : [];
            if (keys.length !== chunk.length) {
                throw new Error("고객 식별키 생성 결과가 올바르지 않습니다.");
            }
            generatedKeys.push(...keys.map((key) => String(key || "")));
        }
    } catch (error) {
        console.error("Failed to generate server-managed customer keys.", error);
        const message = String(error?.message || "").trim();
        throw new Error(
            message || "\uACE0\uAC1D \uC2DD\uBCC4\uD0A4 \uC0DD\uC131 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB85C\uADF8\uC778 \uC0C1\uD0DC\uC640 \uB124\uD2B8\uC6CC\uD06C\uB97C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.",
        );
    }

    const keyedRows = sourceRows.map((row, index) => ({
        ...row,
        ordererKey: generatedKeys[index * 2] || "",
        recipientKey: generatedKeys[(index * 2) + 1] || "",
    }));

    return {
        rows: keyedRows,
        generated: keyedRows.some((row) => Boolean(row.recipientKey || row.ordererKey)),
    };
}

async function handleSaveCustomerKeySettings() {
    const secret = customerKeySecretInput?.value.trim() || "";
    const confirmSecret = customerKeySecretConfirmInput?.value.trim() || "";
    const validationMessage = getCustomerKeySecretValidationMessage(secret);

    if (validationMessage) {
        setCustomerKeyStatus(validationMessage, "warning");
        customerKeySecretInput?.focus();
        return;
    }
    if (secret !== confirmSecret) {
        setCustomerKeyStatus("\uACE0\uAC1D\uD0A4\uC640 \uD655\uC778 \uAC12\uC774 \uB2E4\uB985\uB2C8\uB2E4.", "error");
        customerKeySecretConfirmInput?.focus();
        return;
    }

    try {
        await saveCustomerKeySettings(secret);
        clearCustomerKeyInputs();
        clearCustomerKeyPrefixReveal();
        renderCustomerKeySettingsUi();
        setCustomerKeyStatus("\uACE0\uAC1D\uD0A4\uAC00 \uC11C\uBC84\uC5D0 \uB4F1\uB85D\uB410\uC2B5\uB2C8\uB2E4. \uBC1C\uC8FC\uC11C \uC5C5\uB85C\uB4DC \uC2DC \uC790\uB3D9 \uC0AC\uC6A9\uB429\uB2C8\uB2E4.", "success");
    } catch (error) {
        console.error(error);
        setCustomerKeyStatus(error?.message || "\uACE0\uAC1D\uD0A4\uB97C \uC11C\uBC84\uC5D0 \uB4F1\uB85D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", "error");
    }
}

async function handleUnlockCustomerKeySettings() {
    setCustomerKeyStatus("\uB4F1\uB85D\uB41C \uACE0\uAC1D\uD0A4\uB294 \uBC1C\uC8FC\uC11C \uC5C5\uB85C\uB4DC \uC2DC \uC11C\uBC84\uC5D0\uC11C \uC790\uB3D9 \uC0AC\uC6A9\uB429\uB2C8\uB2E4.", "info");
}

function handleLockCustomerKeySettings() {
    setCustomerKeyStatus("\uACE0\uAC1D\uD0A4\uB294 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", "info");
}

function openCustomerKeyRevealPrompt() {
    if (!hasCustomerKeySettings()) {
        setCustomerKeyStatus("\uBA3C\uC800 \uACE0\uAC1D\uD0A4\uB97C \uB4F1\uB85D\uD574\uC8FC\uC138\uC694.", "warning");
        return;
    }
    customerKeyRevealPromptOpen = true;
    customerKeyPrefixVisible = false;
    renderCustomerKeySettingsUi();
    customerKeyAccountPasswordInput?.focus();
}

async function handleRevealCustomerKeyPrefix() {
    const password = customerKeyAccountPasswordInput?.value || "";
    const user = auth.currentUser;
    if (!password) {
        setCustomerKeyStatus("\uACC4\uC815 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.", "warning");
        customerKeyAccountPasswordInput?.focus();
        return;
    }
    if (!user?.email) {
        setCustomerKeyStatus("\uD604\uC7AC \uACC4\uC815\uC758 \uC7AC\uC778\uC99D \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", "error");
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        const revealCustomerKeyPrefix = httpsCallable(functions, "revealCustomerKeyPrefix");
        const result = await revealCustomerKeyPrefix();
        const displayPrefix = String(result.data?.displayPrefix || "").slice(0, 2);
        if (!displayPrefix) throw new Error("\uB4F1\uB85D\uB41C \uACE0\uAC1D\uD0A4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");

        customerKeySettings = {
            ...customerKeySettings,
            configured: true,
            displayPrefix,
            secretLength: Math.max(Number(result.data?.secretLength) || 0, customerKeySettings?.secretLength || 0, 6),
        };
        customerKeyPrefixVisible = true;
        customerKeyRevealPromptOpen = false;
        if (customerKeyAccountPasswordInput) customerKeyAccountPasswordInput.value = "";
        if (customerKeyRevealTimer) window.clearTimeout(customerKeyRevealTimer);
        customerKeyRevealTimer = window.setTimeout(() => {
            customerKeyPrefixVisible = false;
            renderCustomerKeySettingsUi();
        }, 15000);
        renderCustomerKeySettingsUi();
        setCustomerKeyStatus("\uACC4\uC815 \uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC644\uB8CC\uB418\uC5B4 \uC55E \uB450 \uAE00\uC790\uB97C 15\uCD08 \uB3D9\uC548 \uD45C\uC2DC\uD569\uB2C8\uB2E4.", "success");
    } catch (error) {
        console.error(error);
        if (customerKeyAccountPasswordInput) customerKeyAccountPasswordInput.value = "";
        customerKeyPrefixVisible = false;
        setCustomerKeyStatus(error?.message || "\uACE0\uAC1D\uD0A4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", "error");
        customerKeyAccountPasswordInput?.focus();
    }
}
function setCrmUploadStatus(message, tone = "info") {
    if (!crmUploadStatusEl) return;
    crmUploadStatusEl.textContent = message ?? "";
    crmUploadStatusEl.className = `info-block crm-upload-status is-${tone}`;
}

function getCrmAccountKey() {
    return auth.currentUser?.uid || skuWorkspaceUserId || "local";
}

function getCloudDataUserId() {
    return auth.currentUser?.uid || skuWorkspaceUserId || "";
}

function getInventoryAllocationSettingsDocRef(userId = getCloudDataUserId()) {
    if (!userId) return null;
    return doc(db, "users", userId, "preferences", "inventoryOperations");
}

async function loadInventoryColumnWidths(userId = getCloudDataUserId()) {
    const settingsDocRef = getInventoryAllocationSettingsDocRef(userId);
    if (!settingsDocRef) return false;

    try {
        const settingsSnap = await getDoc(settingsDocRef);
        const savedData = settingsSnap.data();
        const savedSchemaVersion = Number(savedData?.columnWidthSchemaVersion) || 0;
        const savedReasonWidth = Number(savedData?.columnWidths?.ledger?.reason);
        const shouldMigrateReasonWidth = savedSchemaVersion < INVENTORY_COLUMN_WIDTH_SCHEMA_VERSION
            && (!Number.isFinite(savedReasonWidth) || savedReasonWidth === 200);
        inventoryColumnWidths = normalizeInventoryColumnWidths(savedData?.columnWidths);
        if (shouldMigrateReasonWidth) {
            inventoryColumnWidths = {
                ...inventoryColumnWidths,
                ledger: {
                    ...(inventoryColumnWidths.ledger || {}),
                    reason: INVENTORY_COLUMN_DEFINITIONS.ledger.reason.defaultWidth,
                },
            };
        }
        applyInventoryColumnWidths();
        if (shouldMigrateReasonWidth) void persistInventoryColumnWidths();
        return true;
    } catch (error) {
        console.error("재고 표 열 너비를 불러오지 못했습니다.", error);
        applyInventoryColumnWidths();
        return false;
    }
}

async function persistInventoryColumnWidths() {
    const settingsDocRef = getInventoryAllocationSettingsDocRef();
    if (!settingsDocRef) return false;

    try {
        await setDoc(
            settingsDocRef,
            {
                columnWidthSchemaVersion: INVENTORY_COLUMN_WIDTH_SCHEMA_VERSION,
                columnWidths: normalizeInventoryColumnWidths(inventoryColumnWidths),
                columnWidthsUpdatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        return true;
    } catch (error) {
        console.error("재고 표 열 너비 저장에 실패했습니다.", error);
        setInventoryPageStatus(
            "열 너비를 저장하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 조절해주세요.",
            "warning",
        );
        return false;
    }
}

function scheduleInventoryColumnWidthPersist() {
    window.clearTimeout(inventoryColumnWidthPersistTimer);
    inventoryColumnWidthPersistTimer = window.setTimeout(() => {
        void persistInventoryColumnWidths();
    }, 300);
}

function setInventoryAllocationSettingsStatus(message = "", tone = "info") {
    if (!inventoryAllocationStatusEl) return;
    inventoryAllocationStatusEl.textContent = message;
    inventoryAllocationStatusEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") inventoryAllocationStatusEl.classList.add("is-success");
    if (tone === "warning") inventoryAllocationStatusEl.classList.add("is-warning");
    if (tone === "error") inventoryAllocationStatusEl.classList.add("is-error");
}

function setInventoryAllocationSettingsState(label, tone = "default") {
    if (!inventoryAllocationSettingsStateEl) return;
    inventoryAllocationSettingsStateEl.textContent = label;
    inventoryAllocationSettingsStateEl.className = "customer-key-state";
    if (tone === "saved") inventoryAllocationSettingsStateEl.classList.add("is-unlocked");
    if (tone === "pending" || tone === "error") {
        inventoryAllocationSettingsStateEl.classList.add("is-locked");
    }
    if (tone === "default") inventoryAllocationSettingsStateEl.classList.add("is-empty");
}

function getInventoryAllocationPolicyFromControls() {
    return {
        priorityKeys: inventoryAllocationPrioritySelects.map((select) => (
            select instanceof HTMLSelectElement ? select.value : ""
        )),
        undatedExpiryPolicy: inventoryAllocationUndatedPolicySelect instanceof HTMLSelectElement
            ? inventoryAllocationUndatedPolicySelect.value
            : "last",
        allowLotSplit: inventoryAllocationLotSplitInput instanceof HTMLInputElement
            ? inventoryAllocationLotSplitInput.checked
            : true,
        excludeExpired: true,
    };
}

function syncInventoryAllocationPrioritySelections() {
    inventoryAllocationPrioritySelects.forEach((select) => {
        if (!(select instanceof HTMLSelectElement)) return;
        [...select.options].forEach((option) => {
            option.disabled = false;
        });
        select.dataset.previousValue = select.value;
    });
}

function setInventoryAllocationControlsDisabled(disabled) {
    const shouldDisable = Boolean(disabled);
    [
        ...inventoryAllocationPrioritySelects,
        inventoryAllocationUndatedPolicySelect,
        inventoryAllocationLotSplitInput,
        inventoryAllocationSaveBtn,
        inventoryAllocationResetBtn,
    ].forEach((control) => {
        if (control instanceof HTMLInputElement
            || control instanceof HTMLSelectElement
            || control instanceof HTMLButtonElement) {
            control.disabled = shouldDisable;
        }
    });
    if (inventoryAllocationExpiredExclusionInput instanceof HTMLInputElement) {
        inventoryAllocationExpiredExclusionInput.checked = true;
        inventoryAllocationExpiredExclusionInput.disabled = true;
    }
    if (!shouldDisable) syncInventoryAllocationPrioritySelections();
}

function renderInventoryAllocationPreview(policy = inventoryAllocationPolicy) {
    const priorityKeys = Array.isArray(policy?.priorityKeys) ? policy.priorityKeys : [];
    if (inventoryAllocationPreviewStepsEl) {
        inventoryAllocationPreviewStepsEl.innerHTML = priorityKeys.map((key, index) => {
            const step = `
              <span class="inventory-allocation-preview-step">
                <b>${index + 1}순위</b>
                ${escapeHtml(getInventoryAllocationPriorityLabel(key))}
              </span>
            `;
            return index < priorityKeys.length - 1
                ? `${step}<span class="inventory-allocation-preview-arrow" aria-hidden="true">→</span>`
                : step;
        }).join("");
    }
    if (inventoryAllocationPreviewSummaryEl) {
        const undatedText = policy?.undatedExpiryPolicy === "first"
            ? "유통기한 미입력 재고를 우선 할당"
            : policy?.undatedExpiryPolicy === "exclude"
                ? "유통기한 미입력 재고는 재고 할당에서 제외"
                : "유통기한 미입력 재고는 마지막에 할당";
        const lotSplitText = policy?.allowLotSplit === false
            ? "한 LOT 안에서만 할당"
            : "부족 시 여러 LOT로 분할 할당";
        inventoryAllocationPreviewSummaryEl.textContent = `${undatedText} · ${lotSplitText} · 기한 경과 재고는 항상 제외`;
    }
}

function renderInventoryAllocationSettingsUi(policy = inventoryAllocationPolicy) {
    inventoryAllocationPolicy = normalizeInventoryAllocationPolicy(policy);
    inventoryAllocationPrioritySelects.forEach((select, index) => {
        if (select instanceof HTMLSelectElement) {
            select.value = inventoryAllocationPolicy.priorityKeys[index] || "";
        }
    });
    if (inventoryAllocationUndatedPolicySelect instanceof HTMLSelectElement) {
        inventoryAllocationUndatedPolicySelect.value = inventoryAllocationPolicy.undatedExpiryPolicy;
    }
    if (inventoryAllocationLotSplitInput instanceof HTMLInputElement) {
        inventoryAllocationLotSplitInput.checked = inventoryAllocationPolicy.allowLotSplit;
    }
    if (inventoryAllocationExpiredExclusionInput instanceof HTMLInputElement) {
        inventoryAllocationExpiredExclusionInput.checked = true;
    }
    syncInventoryAllocationPrioritySelections();
    renderInventoryAllocationPreview(inventoryAllocationPolicy);
}

function handleInventoryAllocationPriorityChange(event) {
    const changedSelect = event.currentTarget;
    if (!(changedSelect instanceof HTMLSelectElement)) return;
    const previousValue = String(changedSelect.dataset.previousValue || "");
    const duplicateSelect = inventoryAllocationPrioritySelects.find((select) => (
        select instanceof HTMLSelectElement
        && select !== changedSelect
        && select.value === changedSelect.value
    ));
    if (duplicateSelect instanceof HTMLSelectElement && previousValue) {
        duplicateSelect.value = previousValue;
    }
    syncInventoryAllocationPrioritySelections();
    handleInventoryAllocationPolicyControlChange();
}

function handleInventoryAllocationPolicyControlChange() {
    if (inventoryAllocationPolicyLoading || inventoryAllocationPolicySaving) return;
    const draftPolicy = getInventoryAllocationPolicyFromControls();
    const validation = validateInventoryAllocationPriorityKeys(draftPolicy.priorityKeys);
    syncInventoryAllocationPrioritySelections();
    renderInventoryAllocationPreview(draftPolicy);
    inventoryAllocationPolicyDirty = true;
    setInventoryAllocationSettingsState("저장 필요", "pending");
    if (inventoryAllocationSaveBtn instanceof HTMLButtonElement) {
        inventoryAllocationSaveBtn.disabled = !validation.isValid;
    }
    setInventoryAllocationSettingsStatus(
        validation.isValid
            ? "변경사항이 아직 저장되지 않았습니다."
            : validation.message,
        validation.isValid ? "warning" : "error",
    );
}

async function ensureInventoryAllocationPolicyLoaded({ force = false } = {}) {
    if (inventoryAllocationPolicyLoading || (!force && inventoryAllocationPolicyLoaded)) return;
    const settingsDocRef = getInventoryAllocationSettingsDocRef();
    if (!settingsDocRef) {
        setInventoryAllocationSettingsState("로그인 필요", "error");
        setInventoryAllocationSettingsStatus("로그인 후 재고 운영 설정을 사용할 수 있습니다.", "error");
        setInventoryAllocationControlsDisabled(true);
        return;
    }

    inventoryAllocationPolicyLoading = true;
    setInventoryAllocationControlsDisabled(true);
    setInventoryAllocationSettingsState("불러오는 중");
    setInventoryAllocationSettingsStatus("저장된 재고 운영 설정을 불러오고 있습니다.");

    try {
        const settingsSnap = await getDoc(settingsDocRef);
        const savedData = settingsSnap.data();
        const legacyPolicy = Array.isArray(savedData?.priorityKeys) ? savedData : null;
        const savedPolicy = savedData?.policy ?? legacyPolicy;
        const hasSavedPolicy = Boolean(savedPolicy);
        inventoryAllocationPolicy = normalizeInventoryAllocationPolicy(
            savedPolicy ?? INVENTORY_ALLOCATION_POLICY_DEFAULTS,
        );
        inventoryAllocationPolicyLoaded = true;
        inventoryAllocationPolicyDirty = false;
        renderInventoryAllocationSettingsUi(inventoryAllocationPolicy);
        setInventoryAllocationSettingsState(
            hasSavedPolicy ? "저장됨" : "추천 기본값",
            hasSavedPolicy ? "saved" : "default",
        );
        setInventoryAllocationSettingsStatus(
            hasSavedPolicy
                ? "저장된 기본 출고 재고 할당 정책을 불러왔습니다."
                : "아직 저장된 정책이 없어 추천 기본값을 표시했습니다. 확인 후 저장해주세요.",
            hasSavedPolicy ? "success" : "warning",
        );
    } catch (error) {
        console.error("재고 운영 설정을 불러오지 못했습니다.", error);
        inventoryAllocationPolicyLoaded = false;
        setInventoryAllocationSettingsState("불러오기 실패", "error");
        setInventoryAllocationSettingsStatus(
            error?.code === "permission-denied"
                ? "재고 운영 설정 조회 권한이 없습니다."
                : "재고 운영 설정을 불러오지 못했습니다. 잠시 후 설정 화면을 다시 열어주세요.",
            "error",
        );
    } finally {
        inventoryAllocationPolicyLoading = false;
        setInventoryAllocationControlsDisabled(!inventoryAllocationPolicyLoaded);
    }
}

async function handleSaveInventoryAllocationPolicy() {
    if (inventoryAllocationPolicyLoading || inventoryAllocationPolicySaving) return;
    const settingsDocRef = getInventoryAllocationSettingsDocRef();
    if (!settingsDocRef) {
        setInventoryAllocationSettingsStatus("로그인 정보를 확인한 뒤 다시 저장해주세요.", "error");
        return;
    }

    const draftPolicy = getInventoryAllocationPolicyFromControls();
    const validation = validateInventoryAllocationPriorityKeys(draftPolicy.priorityKeys);
    if (!validation.isValid) {
        setInventoryAllocationSettingsStatus(validation.message, "error");
        return;
    }

    inventoryAllocationPolicySaving = true;
    setInventoryAllocationControlsDisabled(true);
    setInventoryAllocationSettingsState("저장 중", "pending");
    setInventoryAllocationSettingsStatus("기본 출고 재고 할당 정책을 저장하고 있습니다.");
    try {
        const normalizedPolicy = normalizeInventoryAllocationPolicy(draftPolicy);
        await setDoc(
            settingsDocRef,
            {
                schemaVersion: INVENTORY_ALLOCATION_POLICY_SCHEMA_VERSION,
                policy: normalizedPolicy,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        inventoryAllocationPolicy = normalizedPolicy;
        inventoryAllocationPolicyLoaded = true;
        inventoryAllocationPolicyDirty = false;
        renderInventoryAllocationSettingsUi(inventoryAllocationPolicy);
        setInventoryAllocationSettingsState("저장됨", "saved");
        setInventoryAllocationSettingsStatus(
            "기본 출고 재고 할당 정책을 저장했습니다. 주문관리에서 재고 할당을 실행할 때 이 설정을 사용합니다.",
            "success",
        );
    } catch (error) {
        console.error("재고 운영 설정 저장에 실패했습니다.", error);
        inventoryAllocationPolicyDirty = true;
        setInventoryAllocationSettingsState("저장 실패", "error");
        setInventoryAllocationSettingsStatus(
            error?.code === "permission-denied"
                ? "재고 운영 설정 저장 권한이 없습니다."
                : "설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
            "error",
        );
    } finally {
        inventoryAllocationPolicySaving = false;
        setInventoryAllocationControlsDisabled(false);
    }
}

function handleResetInventoryAllocationPolicy() {
    if (inventoryAllocationPolicyLoading || inventoryAllocationPolicySaving) return;
    inventoryAllocationPolicy = normalizeInventoryAllocationPolicy(
        INVENTORY_ALLOCATION_POLICY_DEFAULTS,
    );
    inventoryAllocationPolicyDirty = true;
    renderInventoryAllocationSettingsUi(inventoryAllocationPolicy);
    setInventoryAllocationSettingsState("저장 필요", "pending");
    setInventoryAllocationSettingsStatus(
        "추천 기본값으로 변경했습니다. 실제 적용하려면 설정 저장을 눌러주세요.",
        "warning",
    );
}

function getCloudDataCollection(userId, collectionName) {
    if (!userId || !collectionName) return null;
    return collection(db, "users", userId, collectionName);
}

function getCloudCollectionSyncKey(userId, collectionName) {
    return `${userId || ""}:${collectionName || ""}`;
}

function getCloudCollectionSyncHashMap(userId, collectionName) {
    return cloudCollectionSyncHashes.get(getCloudCollectionSyncKey(userId, collectionName)) || null;
}

function setCloudCollectionSyncHashMap(userId, collectionName, hashMap) {
    cloudCollectionSyncHashes.set(getCloudCollectionSyncKey(userId, collectionName), hashMap);
}

function getCloudDocumentId(prefix, value, index = 0) {
    const text = String(value ?? "").trim().replaceAll("/", "∕");
    const safeText = text || `row-${index + 1}`;
    return `${prefix}-${safeText}`.slice(0, 1400);
}

function cloneCloudRows(rows) {
    return JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
}

function sanitizeFirestoreValue(value) {
    if (Array.isArray(value)) return value.map(sanitizeFirestoreValue);
    if (value && typeof value === "object") {
        return Object.entries(value).reduce((result, [key, childValue]) => {
            if (childValue !== undefined) result[key] = sanitizeFirestoreValue(childValue);
            return result;
        }, {});
    }
    return value;
}

function normalizeCloudSyncValue(value) {
    if (Array.isArray(value)) return value.map(normalizeCloudSyncValue);
    if (value && typeof value === "object") {
        return Object.keys(value)
            .filter((key) => !CLOUD_SYNC_IGNORED_FIELD_KEYS.has(key) && value[key] !== undefined)
            .sort()
            .reduce((result, key) => {
                result[key] = normalizeCloudSyncValue(value[key]);
                return result;
            }, {});
    }
    return value;
}

function getCloudSyncHash(row) {
    const text = JSON.stringify(normalizeCloudSyncValue(row));
    let hash = 0xcbf29ce484222325n;
    const hashMask = 0xffffffffffffffffn;

    for (let index = 0; index < text.length; index += 1) {
        hash ^= BigInt(text.charCodeAt(index));
        hash = (hash * 0x100000001b3n) & hashMask;
    }

    return hash.toString(16).padStart(16, "0");
}

function buildCloudPersistedRow(row) {
    const sanitizedRow = sanitizeFirestoreValue(row);
    return {
        ...sanitizedRow,
        syncHash: getCloudSyncHash(sanitizedRow),
    };
}

async function replaceCloudRows(userId, collectionName, rows, getDocumentId) {
    const rowsCollection = getCloudDataCollection(userId, collectionName);
    if (!rowsCollection) throw new Error("로그인한 계정의 저장소를 찾지 못했습니다.");

    const nextRows = new Map();
    rows.forEach((row, index) => {
        const documentId = getDocumentId(row, index);
        if (!documentId) return;
        nextRows.set(documentId, buildCloudPersistedRow(row));
    });

    let existingSyncHashes = getCloudCollectionSyncHashMap(userId, collectionName);
    if (!existingSyncHashes) {
        const existingSnapshot = await getDocs(rowsCollection);
        existingSyncHashes = new Map(existingSnapshot.docs.map((snapshot) => {
            const existingRow = snapshot.data();
            return [snapshot.id, String(existingRow?.syncHash || getCloudSyncHash(existingRow))];
        }));
        setCloudCollectionSyncHashMap(userId, collectionName, existingSyncHashes);
    }

    const operations = [];
    existingSyncHashes.forEach((_, documentId) => {
        if (!nextRows.has(documentId)) {
            operations.push({ type: "delete", documentId, ref: doc(rowsCollection, documentId) });
        }
    });
    nextRows.forEach((row, documentId) => {
        const existingSyncHash = existingSyncHashes.get(documentId);
        if (existingSyncHash === row.syncHash) return;
        operations.push({
            type: "set",
            documentId,
            ref: doc(rowsCollection, documentId),
            row,
        });
    });

    for (let start = 0; start < operations.length; start += CLOUD_PERSISTENCE_BATCH_SIZE) {
        const batch = writeBatch(db);
        operations.slice(start, start + CLOUD_PERSISTENCE_BATCH_SIZE).forEach((operation) => {
            if (operation.type === "delete") {
                batch.delete(operation.ref);
            } else {
                batch.set(operation.ref, operation.row);
            }
        });
        await batch.commit();
        operations.slice(start, start + CLOUD_PERSISTENCE_BATCH_SIZE).forEach((operation) => {
            if (operation.type === "delete") {
                existingSyncHashes.delete(operation.documentId);
            } else {
                existingSyncHashes.set(operation.documentId, operation.row.syncHash);
            }
        });
    }
}

async function loadCloudRows(userId, collectionName) {
    const rowsCollection = getCloudDataCollection(userId, collectionName);
    if (!rowsCollection) return null;
    const snapshot = await getDocs(rowsCollection);
    setCloudCollectionSyncHashMap(
        userId,
        collectionName,
        new Map(snapshot.docs.map((row) => {
            const data = row.data();
            return [row.id, String(data?.syncHash || getCloudSyncHash(data))];
        })),
    );
    return snapshot.docs.map((row) => row.data());
}

function queueOrderManagementCloudPersistence() {
    const userId = getCloudDataUserId();
    if (!userId) return Promise.resolve(false);

    const rows = cloneCloudRows(orderManagementRows);
    const task = orderManagementCloudPersistQueue.then(async () => {
        await replaceCloudRows(
            userId,
            "orderManagement",
            rows,
            (row, index) => getCloudDocumentId("order", row?.id || buildOrderManagementRowId(row, index), index),
        );
        return true;
    });
    orderManagementCloudPersistQueue = task.catch((error) => {
        console.warn("주문관리 데이터를 서버에 저장하지 못했습니다.", error);
        return false;
    });
    return orderManagementCloudPersistQueue;
}

function queueCrmCloudPersistence() {
    const userId = getCloudDataUserId();
    if (!userId) return Promise.resolve(false);

    const rows = cloneCloudRows(crmHistoricalRows);
    const task = crmCloudPersistQueue.then(async () => {
        await replaceCloudRows(
            userId,
            "crmOrders",
            rows,
            (row, index) => getCloudDocumentId("crm", getCrmRowMergeKey(row, index), index),
        );
        return true;
    });
    crmCloudPersistQueue = task.catch((error) => {
        console.warn("CRM 데이터를 서버에 저장하지 못했습니다.", error);
        return false;
    });
    return crmCloudPersistQueue;
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

async function deleteCrmStoredPayload(accountKey = getCrmAccountKey()) {
    const dbInstance = await openCrmDb();

    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction(CRM_STORE_NAME, "readwrite");
        const store = transaction.objectStore(CRM_STORE_NAME);
        store.delete(accountKey);

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error("CRM 데이터를 삭제하지 못했습니다."));
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
        status: row.status,
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
        sourceType: row.sourceType === "order-upload" ? "order-upload" : "historical",
        isValid: row.isValid,
        errors: Array.isArray(row.errors) ? row.errors : [],
    }));
}

function getAutoCrmRowsFromOrderManagement() {
    return orderManagementRows
        .filter((row) => row?.isValid !== false)
        .map((row, index) => buildCrmRowFromOrderRow(row, index))
        .filter((row) => row.isValid);
}

function normalizeHistoricalCrmRows(rows) {
    const automaticRowKeys = new Set(getAutoCrmRowsFromOrderManagement()
        .map((row, index) => getCrmRowMergeKey(row, index)));

    return compactCrmRows(rows)
        .filter((row, index) => {
            if (row.sourceType === "order-upload") return false;
            return !automaticRowKeys.has(getCrmRowMergeKey(row, index));
        })
        .map((row) => ({ ...row, sourceType: "historical" }));
}

function rebuildCrmRowsFromSources() {
    const mergedRows = new Map();
    getAutoCrmRowsFromOrderManagement().forEach((row, index) => {
        mergedRows.set(getCrmRowMergeKey(row, index), row);
    });
    crmHistoricalRows.forEach((row, index) => {
        mergedRows.set(getCrmRowMergeKey(row, index), row);
    });
    crmRows = [...mergedRows.values()];
    invalidateOrderProductCandidateCache();
    crmAnalytics = buildCrmAnalytics(crmRows);
}

async function persistCrmOrders() {
    let localSaved = true;
    try {
        if (crmHistoricalRows.length) {
            await saveCrmStoredPayload({
                accountKey: getCrmAccountKey(),
                sourceFileName: crmSourceFileName,
                rows: compactCrmRows(crmHistoricalRows),
                updatedAt: new Date().toISOString(),
            });
        } else {
            await deleteCrmStoredPayload();
        }
    } catch (error) {
        console.error(error);
        localSaved = false;
    }

    const cloudSaved = await queueCrmCloudPersistence();
    if (!cloudSaved) {
        setCrmUploadStatus("CRM 데이터를 서버에 저장하지 못했습니다. 네트워크와 권한 설정을 확인해주세요.", "warning");
    }
    return getCloudDataUserId() ? cloudSaved : localSaved;
}

async function loadCrmOrdersForCurrentUser() {
    const userId = getCloudDataUserId();
    if (userId) {
        try {
            const cloudRows = await loadCloudRows(userId, "crmOrders");
            if (Array.isArray(cloudRows) && cloudRows.length) {
                crmHistoricalRows = normalizeHistoricalCrmRows(cloudRows);
                rebuildCrmRowsFromSources();
                crmSourceFileName = "서버에 저장된 CRM 데이터";
                updateSelectedFileName({ name: crmSourceFileName }, crmFileNameEl);
                renderCrmDashboard();
                renderOrderMatchPanel();
                setCrmUploadStatus(`서버에 저장된 CRM 주문 ${formatMilkrunNumber(crmAnalytics.validRows)}건을 불러왔습니다.${getCrmOrderMatchStatusText()}`, "success");
                if (crmHistoricalRows.length !== cloudRows.length) {
                    void queueCrmCloudPersistence();
                }
                return true;
            }
        } catch (error) {
            console.warn("서버 CRM 데이터를 불러오지 못했습니다. 브라우저 백업을 확인합니다.", error);
        }
    }

    try {
        const payload = await getCrmStoredPayload();
        const savedRows = Array.isArray(payload?.rows) ? payload.rows : [];

        if (!savedRows.length) {
            crmHistoricalRows = [];
            rebuildCrmRowsFromSources();
            crmSourceFileName = "";
            renderCrmDashboard();
            renderOrderMatchPanel();
            return false;
        }

        crmHistoricalRows = normalizeHistoricalCrmRows(savedRows);
        rebuildCrmRowsFromSources();
        crmSourceFileName = payload?.sourceFileName || "저장된 CRM 데이터";
        updateSelectedFileName({ name: crmSourceFileName }, crmFileNameEl);
        renderCrmDashboard();
        renderOrderMatchPanel();
        setCrmUploadStatus(`저장된 CRM 주문 ${formatMilkrunNumber(crmAnalytics.validRows)}건을 불러왔습니다.${getCrmOrderMatchStatusText()}`, "success");
        void queueCrmCloudPersistence();
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

function getCrmAnalysisRows() {
    return (crmRows ?? []).map((row) => {
        const channel = getOrderMatchChannelFromRow(row);
        const matchKey = getOrderProductMatchKey(channel, row?.productName);
        const components = matchKey ? getResolvedOrderComponents(matchKey) : [];
        const expectedComponents = components.filter((component) => String(component?.skuKey || "").trim());
        const matchedSkuRows = expectedComponents
            .map((component) => getSkuByMatchKey(component.skuKey))
            .filter(Boolean);
        const crmCategories = SKU_CATEGORY_FIELD_KEYS.reduce((result, key) => {
            result[key] = [...new Set(matchedSkuRows
                .map((skuRow) => String(skuRow?.[key] || "").trim())
                .filter(Boolean))];
            return result;
        }, {});

        return {
            ...row,
            customerKey: String(row?.ordererKey || row?.recipientKey || "").trim(),
            crmCategories,
            isSkuMatched: expectedComponents.length > 0 && matchedSkuRows.length === expectedComponents.length,
        };
    });
}

function syncCrmPeriodControls(analytics = crmRepurchaseAnalytics) {
    if (crmPeriodPresetSelect instanceof HTMLSelectElement) {
        crmPeriodPresetSelect.value = crmPeriodPreset;
    }
    if (crmPeriodCustomEl) crmPeriodCustomEl.hidden = crmPeriodPreset !== "custom";

    if (crmPeriodPreset === "custom") {
        if (!crmCustomStartDate) crmCustomStartDate = analytics?.period?.startDate || "";
        if (!crmCustomEndDate) crmCustomEndDate = analytics?.period?.endDate || "";
    }
    if (crmPeriodStartInput instanceof HTMLInputElement) crmPeriodStartInput.value = crmCustomStartDate;
    if (crmPeriodEndInput instanceof HTMLInputElement) crmPeriodEndInput.value = crmCustomEndDate;

    if (!crmPeriodCaptionEl) return;
    const startDate = analytics?.period?.startDate || "";
    const endDate = analytics?.period?.endDate || "";
    if (!startDate && !endDate) {
        crmPeriodCaptionEl.textContent = "분석할 주문을 불러오면 기간이 표시됩니다.";
        return;
    }

    const rangeText = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
    const latestText = analytics?.period?.dataEndDate ? ` · 최신 주문 ${analytics.period.dataEndDate} 기준` : "";
    crmPeriodCaptionEl.textContent = `${rangeText}${latestText}`;
}

function renderCrmRepurchaseSummary(analytics = crmRepurchaseAnalytics) {
    const summary = analytics?.summary ?? {};
    if (crmSummaryCustomersEl) crmSummaryCustomersEl.textContent = formatMilkrunNumber(summary.customers || 0);
    if (crmSummaryOrdersEl) crmSummaryOrdersEl.textContent = formatMilkrunNumber(summary.orders || 0);
    if (crmSummaryRepeatCustomersEl) crmSummaryRepeatCustomersEl.textContent = formatMilkrunNumber(summary.repeatCustomers || 0);
    if (crmSummaryRepeatRateEl) crmSummaryRepeatRateEl.textContent = formatCrmRate(summary.repeatRate);
    if (crmSummaryRepeatDescEl) {
        crmSummaryRepeatDescEl.textContent = `구매 이벤트 ${formatMilkrunNumber(summary.purchaseEvents || 0)}회 · 같은 날은 1회`;
    }
}

function renderCrmQualityStrip(analytics = crmRepurchaseAnalytics) {
    if (!crmQualityStripEl) return;
    const summary = analytics?.summary ?? {};
    const quality = analytics?.quality ?? {};
    const issueCount = (quality.ordersWithoutCustomer || 0)
        + (quality.unmatchedProductRows || 0)
        + (quality.uncategorizedProductRows || 0)
        + (quality.invalidRows || 0);
    const parts = [
        `분석 주문 ${formatMilkrunNumber(summary.orders || 0)}건`,
        `고객키 없음 ${formatMilkrunNumber(quality.ordersWithoutCustomer || 0)}건`,
        `SKU 미매칭 ${formatMilkrunNumber(quality.unmatchedProductRows || 0)}행`,
        `미분류 ${formatMilkrunNumber(quality.uncategorizedProductRows || 0)}행`,
    ];
    if (quality.invalidRows) parts.push(`형식 오류 제외 ${formatMilkrunNumber(quality.invalidRows)}행`);
    if (quality.excludedStatusRows) parts.push(`취소·반품 제외 ${formatMilkrunNumber(quality.excludedStatusRows)}행`);

    crmQualityStripEl.classList.toggle("is-warning", issueCount > 0 && summary.orders > 0);
    crmQualityStripEl.classList.toggle("is-ready", issueCount === 0 && summary.orders > 0);
    crmQualityStripEl.innerHTML = `
        <span class="crm-quality-dot" aria-hidden="true"></span>
        <span>${escapeHtml(summary.orders ? parts.join(" · ") : "분석할 주문 데이터가 없습니다.")}</span>
    `;
}

function renderCrmRetentionList(container, rows = [], emptyMessage = "분석할 데이터가 없습니다.") {
    if (!container) return;
    if (!rows.length) {
        container.innerHTML = `<div class="crm-empty-state">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    container.innerHTML = rows.map((row) => {
        const rate = Number(row.rate) || 0;
        const width = Math.max(2, Math.min(100, rate * 100));
        return `
            <div class="crm-retention-row">
                <div class="crm-retention-copy">
                    <div class="crm-retention-label-line">
                        <strong title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</strong>
                        ${row.isSmallSample ? '<span class="crm-sample-badge">표본 적음</span>' : ""}
                    </div>
                    <span>첫 구매 ${formatMilkrunNumber(row.baseCustomers)}명 · 재구매 ${formatMilkrunNumber(row.repeatCustomers)}명</span>
                </div>
                <div class="crm-retention-metric">
                    <strong>${formatCrmRate(rate)}</strong>
                    <span>${formatMilkrunNumber(row.repeatCustomers)}/${formatMilkrunNumber(row.baseCustomers)}명</span>
                </div>
                <div class="crm-retention-track" aria-hidden="true">
                    <i style="width: ${width}%"></i>
                </div>
            </div>
        `;
    }).join("");
}

function renderCrmChannelRetention(analytics = crmRepurchaseAnalytics) {
    renderCrmRetentionList(
        crmChannelRetentionListEl,
        analytics?.channelRetention ?? [],
        "첫 구매와 이후 구매를 비교할 채널 데이터가 없습니다.",
    );
}

function getAvailableCrmCategoryKeys(analytics = crmRepurchaseAnalytics) {
    return SKU_CATEGORY_FIELD_KEYS.filter((key) => (analytics?.categories?.[key] ?? []).length > 0);
}

function renderCrmCategoryRetention(analytics = crmRepurchaseAnalytics) {
    const availableKeys = getAvailableCrmCategoryKeys(analytics);
    if (!availableKeys.includes(crmActiveCategoryKey)) {
        crmActiveCategoryKey = availableKeys[0] || "category1";
    }

    if (crmCategoryTabsEl) {
        crmCategoryTabsEl.innerHTML = availableKeys.map((key) => {
            const isActive = key === crmActiveCategoryKey;
            return `
                <button class="crm-category-tab${isActive ? " is-active" : ""}" type="button"
                    role="tab" aria-selected="${isActive ? "true" : "false"}" data-crm-category-key="${key}">
                    ${escapeHtml(getSkuFieldLabel(key))}
                </button>
            `;
        }).join("");
    }

    if (!availableKeys.length) {
        renderCrmRetentionList(
            crmCategoryRetentionListEl,
            [],
            "상품 매칭과 SKU 분류를 입력하면 분류별 재구매율이 표시됩니다.",
        );
        return;
    }

    renderCrmRetentionList(
        crmCategoryRetentionListEl,
        analytics?.categories?.[crmActiveCategoryKey] ?? [],
        `${getSkuFieldLabel(crmActiveCategoryKey)} 데이터가 없습니다.`,
    );
}

function formatCrmMonth(monthText) {
    const [year, month] = String(monthText || "").split("-");
    return year && month ? `${year}년 ${Number(month)}월` : monthText;
}

function renderCrmTimeHeatmap(analytics = crmRepurchaseAnalytics) {
    if (!crmTimeHeatmapEl) return;
    const months = analytics?.timeDistribution?.months ?? [];
    if (!months.length) {
        crmTimeHeatmapEl.innerHTML = '<div class="crm-empty-state">주문시간 데이터가 없습니다.</div>';
        return;
    }

    const slotLabels = Array.from({ length: 12 }, (_, index) => {
        const start = String(index * 2).padStart(2, "0");
        const end = String((index + 1) * 2).padStart(2, "0");
        return `${start}–${end}`;
    });
    const maxRate = Math.max(0.01, ...months.flatMap((month) => month.rates));
    const headCells = slotLabels.map((label) => `<th scope="col">${label}</th>`).join("");
    const bodyRows = months.map((month) => {
        const cells = month.rates.map((rate, index) => {
            const intensity = Math.min(1, rate / maxRate);
            const alpha = (0.06 + (intensity * 0.86)).toFixed(2);
            const strongClass = intensity >= 0.62 ? " is-strong" : "";
            const count = month.counts[index] || 0;
            return `
                <td class="crm-heat-cell${strongClass}" style="--crm-heat-alpha:${alpha}"
                    title="${escapeHtml(`${formatCrmMonth(month.month)} ${slotLabels[index]}시 · ${count}건 · ${formatCrmRate(rate)}`)}">
                    ${rate ? formatCrmRate(rate) : "–"}
                </td>
            `;
        }).join("");
        return `
            <tr>
                <th scope="row"><strong>${escapeHtml(formatCrmMonth(month.month))}</strong><span>${formatMilkrunNumber(month.totalOrders)}건</span></th>
                ${cells}
            </tr>
        `;
    }).join("");

    crmTimeHeatmapEl.innerHTML = `
        <table class="crm-heatmap-table">
            <thead><tr><th scope="col">월</th>${headCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
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
                <td title="${escapeHtml(row.ordererKey || row.recipientKey || "")}">${escapeHtml(maskCrmKey(row.ordererKey || row.recipientKey))}</td>
            </tr>
        `;
    }).join("");
}

function renderCrmDashboard({ rebuildAnalytics = false, force = false } = {}) {
    if (!force && !isCurrentDashboardView("crm")) return;

    if (rebuildAnalytics || !crmAnalytics) {
        crmAnalytics = buildCrmAnalytics(crmRows);
    }
    crmRepurchaseAnalytics = buildCrmRepurchaseAnalytics(getCrmAnalysisRows(), {
        preset: crmPeriodPreset,
        startDate: crmPeriodPreset === "custom" ? crmCustomStartDate : "",
        endDate: crmPeriodPreset === "custom" ? crmCustomEndDate : "",
    });
    syncCrmPeriodControls(crmRepurchaseAnalytics);
    renderCrmRepurchaseSummary(crmRepurchaseAnalytics);
    renderCrmQualityStrip(crmRepurchaseAnalytics);
    renderCrmChannelRetention(crmRepurchaseAnalytics);
    renderCrmCategoryRetention(crmRepurchaseAnalytics);
    renderCrmTimeHeatmap(crmRepurchaseAnalytics);
    renderCrmPreview();
    if (crmDeleteBtn) crmDeleteBtn.disabled = crmRows.length === 0;
}

function getCrmOrderMatchSummary() {
    const products = getUniqueOrderProducts()
        .filter((item) => item.sources?.has("CRM"));
    return {
        total: products.length,
        matched: products.filter((item) => hasCompleteOrderMatch(item.matchKey)).length,
        pending: products.filter(shouldShowOrderMatchProduct).length,
    };
}

function getCrmOrderMatchStatusText() {
    const summary = getCrmOrderMatchSummary();
    if (!summary.total) return "";
    if (!getMatchableSkuRows().length && !skuWorkspaceLoaded) {
        return ` 상품 매칭 대상 ${formatMilkrunNumber(summary.total)}건 · SKU 등록 후 매칭 가능`;
    }
    if (summary.pending > 0) {
        return ` 상품 매칭 필요 ${formatMilkrunNumber(summary.pending)}건`;
    }
    return ` 상품 매칭 완료 ${formatMilkrunNumber(summary.matched)}건`;
}

function getOrderManagementStorageKey() {
    const userKey = auth.currentUser?.uid || skuWorkspaceUserId || "local";
    return `${ORDER_MANAGEMENT_STORAGE_PREFIX}:${userKey}`;
}

function normalizeOrderManagementStatus(value) {
    const statusText = String(value ?? "").trim();
    if (!statusText || ["정상", "신규", "수집", "수집됨"].includes(statusText)) return "접수";
    if (LEGACY_ORDER_MANAGEMENT_STATUSES.includes(statusText)) return statusText;
    if (statusText.includes("취소")) return "취소";
    if (statusText.includes("보류")) return "보류";
    if (statusText.includes("피킹")) return "피킹";
    if (statusText.includes("패킹")) return "패킹";
    if (statusText.includes("출고") || statusText.includes("배송")) return "출고";
    if (statusText.includes("확인") || statusText.includes("오류")) return "확인 필요";
    return statusText;
}

function parseOrderManagementDate(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;

    const numericValue = Number(text);
    if (/^\d+(\.\d+)?$/.test(text) && numericValue > 25569 && numericValue < 80000) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const date = new Date(excelEpoch + numericValue * 86400000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const compactMatch = text.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
        const [, year, month, day] = compactMatch;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const normalizedText = text
        .replace(/[.\/]/g, "-")
        .replace(/년|월/g, "-")
        .replace(/일/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const dateMatch = normalizedText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
        const [, year, month, day] = dateMatch;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatOrderManagementDate(value) {
    const parsedDate = parseOrderManagementDate(value);
    if (!parsedDate) return String(value ?? "").trim() || "-";
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDaysIso(date, days) {
    const baseDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + days);
    return formatOrderManagementDate(nextDate);
}

function getTodayStartTime() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isOrderManagementPrivacyExpired(row) {
    const expiresAt = parseOrderManagementDate(row?.privacyExpiresAt);
    return Boolean(expiresAt) && expiresAt.getTime() < getTodayStartTime();
}

function stripExpiredOrderManagementPrivacy(row) {
    if (!isOrderManagementPrivacyExpired(row)) return row;

    const nextRow = {
        ...row,
        privacyPurgedAt: row?.privacyPurgedAt || new Date().toISOString(),
    };
    ORDER_MANAGEMENT_PRIVACY_FIELDS.forEach((fieldKey) => {
        nextRow[fieldKey] = "";
    });
    return nextRow;
}

function pruneExpiredOrderManagementPrivacy({ persist = true } = {}) {
    let changed = false;
    orderManagementRows = orderManagementRows.map((row) => {
        const nextRow = stripExpiredOrderManagementPrivacy(row);
        if (nextRow !== row) changed = true;
        return nextRow;
    });

    if (changed && persist) saveOrderManagementRowsToLocal();
    return changed;
}

function getOrderManagementOrderDate(row) {
    return row?.orderDateTime || row?.orderDate || row?.issuedDateTime || row?.issuedAt || row?.dueDate || "";
}

function getOrderManagementChannelLabel(row) {
    return String(row?.channelName || getOrderUploadChannelLabel(row?.channel || "") || row?.channel || "판매처 미지정").trim();
}

function getOrderManagementChannelFilterValue(row) {
    return getOrderManagementChannelLabel(row);
}

function getOrderManagementCustomerKey(row) {
    return row?.recipientKey || row?.ordererKey || row?.customerKey || "";
}

function buildOrderManagementRowId(row, index = 0) {
    const channel = normalizeOrderChannel(row?.channel || "");
    const parts = [
        channel,
        row?.managementId,
        row?.orderCode,
        row?.orderDetailCode,
        row?.marketplaceProductCode || row?.productCode || row?.barcode,
        row?.productName,
        row?.recipientName,
        row?.sourceFileName,
        row?.rowId || index + 1,
    ].map((part) => normalizeOrderProductName(part)).filter(Boolean);

    return parts.length ? parts.join(":") : `order-${Date.now()}-${index}`;
}

function enrichOrderLineSkuComponents(components = []) {
    return (Array.isArray(components) ? components : [])
        .map((component) => {
            const skuRow = getSkuByMatchKey(component?.skuKey);
            if (!skuRow) return null;
            return {
                skuKey: getSkuMatchKey(skuRow),
                inventorySkuKey: getInventorySkuKey(skuRow),
                skuRowId: Number(skuRow.rowId) || 0,
                adminProductCode: skuRow.adminProductCode || "",
                productName: skuRow.productName || component?.skuName || "",
                unitsPerOrder: normalizeOrderMatchQuantity(
                    component?.unitsPerOrder ?? component?.quantity,
                ),
            };
        })
        .filter(Boolean);
}

function getOrderLineMatchResolution(row) {
    const matchKey = getOrderProductMatchKey(
        getOrderMatchChannelFromRow(row),
        row?.productName,
    );

    if (!getMatchableSkuRows().length) {
        return {
            matchKey: matchKey || row?.matchKey || "",
            status: row?.matchStatus || "unmatched",
            source: row?.matchSource || "none",
            matchedAt: row?.matchedAt || "",
            components: row?.skuComponents || [],
        };
    }

    const savedMatch = getOrderMatchRecord(matchKey, { includeLegacy: true });
    const savedComponents = normalizeOrderMatchComponents(savedMatch?.record);
    if (hasCompleteOrderComponents(savedComponents)) {
        return {
            matchKey,
            status: "matched",
            source: savedMatch?.isLegacy ? "legacy" : "confirmed",
            matchedAt: savedMatch?.record?.matchedAt || row?.matchedAt || "",
            components: enrichOrderLineSkuComponents(savedComponents),
        };
    }

    const suggestedComponents = getAutoOrderComponents(
        row?.productName,
        row?.barcode,
        row?.productCode || row?.marketplaceProductCode,
    );
    if (hasCompleteOrderComponents(suggestedComponents)) {
        return {
            matchKey,
            status: "suggested",
            source: "automatic",
            matchedAt: "",
            components: enrichOrderLineSkuComponents(suggestedComponents),
        };
    }

    return {
        matchKey,
        status: "unmatched",
        source: "none",
        matchedAt: "",
        components: [],
    };
}

function standardizeOrderManagementRow(row, index = 0, options = {}) {
    const operationalStatuses = normalizeOrderOperationalStatuses(row);
    const orderedQuantity = Number(String(
        row?.orderedQuantity ?? row?.quantity ?? row?.qty ?? row?.totalEa ?? 0,
    ).replace(/,/g, "")) || 0;
    const cancelledQuantity = Object.prototype.hasOwnProperty.call(options, "cancelledQuantity")
        ? options.cancelledQuantity
        : (operationalStatuses.orderStatus === "cancelled" ? orderedQuantity : row?.cancelledQuantity);

    return normalizeOrderLine(
        {
            ...row,
            ...operationalStatuses,
        },
        {
            index,
            isCancelled: operationalStatuses.orderStatus === "cancelled",
            cancelledQuantity,
            matchResolution: getOrderLineMatchResolution(row),
        },
    );
}

function getOrderLineStandardSnapshot(row) {
    return JSON.stringify({
        orderLineSchemaVersion: row?.orderLineSchemaVersion,
        orderId: row?.orderId,
        orderLineId: row?.orderLineId,
        sourceLineNo: row?.sourceLineNo,
        orderedQuantity: row?.orderedQuantity,
        cancelledQuantity: row?.cancelledQuantity,
        allocatableQuantity: row?.allocatableQuantity,
        matchKey: row?.matchKey,
        matchStatus: row?.matchStatus,
        matchSource: row?.matchSource,
        matchedAt: row?.matchedAt,
        skuComponents: row?.skuComponents,
        inventoryLinkReady: row?.inventoryLinkReady,
        orderStatus: row?.orderStatus,
        shippingStatus: row?.shippingStatus,
        orderStatusSchemaVersion: row?.orderStatusSchemaVersion,
        legacyStatus: row?.legacyStatus,
        status: row?.status,
    });
}

function standardizeOrderManagementRows({ persist = false, render = false } = {}) {
    let changed = false;
    const nextRows = orderManagementRows.map((row, index) => {
        const nextRow = standardizeOrderManagementRow(row, index);
        if (getOrderLineStandardSnapshot(row) !== getOrderLineStandardSnapshot(nextRow)) {
            changed = true;
        }
        return nextRow;
    });

    if (!changed) return false;
    orderManagementRows = nextRows;
    restoreOrderUploadRowsFromManagement({ render: false });
    if (persist) void saveOrderManagementRowsToLocal();
    if (render) renderOrderManagement({ force: true });
    return true;
}

function buildOrderManagementRow(row, index = 0) {
    const orderDate = getOrderManagementOrderDate(row);
    const parsedDate = parseOrderManagementDate(orderDate) || parseOrderManagementDate(row?.issuedAt) || new Date();

    const baseRow = {
        id: buildOrderManagementRowId(row, index),
        sourceRowId: row?.rowId || "",
        channel: row?.channel || "",
        channelName: getOrderManagementChannelLabel(row),
        status: normalizeOrderManagementStatus(row?.status),
        legacyStatus: row?.legacyStatus || "",
        orderStatus: row?.orderStatus || "",
        shippingStatus: row?.shippingStatus || "",
        managementId: row?.managementId || "",
        orderCode: row?.orderCode || row?.orderId || "",
        marketplaceProductCode: row?.marketplaceProductCode || "",
        productCode: row?.productCode || row?.masterCode || "",
        barcode: row?.barcode || "",
        productName: row?.productName || row?.skuName || "",
        quantity: row?.quantity || row?.qty || row?.totalEa || "",
        salePrice: row?.salePrice || "",
        paymentAmount: row?.paymentAmount || "",
        orderDate,
        issuedAt: row?.issuedAt || row?.issuedDateTime || "",
        invoiceNo: row?.invoiceNo || "",
        courierName: row?.courierName || "",
        ordererName: row?.ordererName || "",
        ordererPhone: row?.ordererPhone || "",
        ordererKey: row?.ordererKey || "",
        recipientName: row?.recipientName || "",
        recipientPhone: row?.recipientPhone || "",
        recipientKey: row?.recipientKey || "",
        recipientZip: row?.recipientZip || "",
        recipientAddress: row?.recipientAddress || row?.destination || row?.center || "",
        deliveryMemo: row?.deliveryMemo || "",
        location: row?.location || "",
        expiry: row?.expiry || "",
        cs: row?.cs || "",
        sourceFileName: row?.sourceFileName || "",
        ...(row?.sourceImportHash ? { sourceImportHash: row.sourceImportHash } : {}),
        ...(Number(row?.sourceImportRowCount) > 0
            ? { sourceImportRowCount: Number(row.sourceImportRowCount) }
            : {}),
        customerKey: getOrderManagementCustomerKey(row),
        privacyExpiresAt: addDaysIso(parsedDate, ORDER_PRIVACY_RETENTION_DAYS),
        updatedAt: new Date().toISOString(),
        isValid: row?.isValid !== false,
        errors: Array.isArray(row?.errors) ? row.errors : [],
    };
    return standardizeOrderManagementRow(baseRow, index);
}

function saveOrderManagementRowsToLocal() {
    try {
        getOrderUploadStorage()?.setItem(getOrderManagementStorageKey(), JSON.stringify({
            rows: orderManagementRows,
            updatedAt: new Date().toISOString(),
        }));
    } catch (error) {
        console.warn("주문관리 데이터를 저장하지 못했습니다.", error);
    }
    return queueOrderManagementCloudPersistence();
}

function loadOrderManagementRowsFromLocal() {
    try {
        const raw = getOrderUploadStorage()?.getItem(getOrderManagementStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        orderManagementRows = Array.isArray(parsed?.rows)
            ? parsed.rows.map((row, index) => standardizeOrderManagementRow({
                ...buildOrderManagementRow(row, index),
                ...row,
                id: row?.id || buildOrderManagementRowId(row, index),
                status: normalizeOrderManagementStatus(row?.status),
                channelName: row?.channelName || getOrderManagementChannelLabel(row),
                customerKey: getOrderManagementCustomerKey(row),
            }, index))
            : [];
        pruneExpiredOrderManagementPrivacy({ persist: true });
    } catch (error) {
        console.warn("주문관리 데이터를 불러오지 못했습니다.", error);
        orderManagementRows = [];
    }
}

async function loadOrderManagementRowsForCurrentUser() {
    const userId = getCloudDataUserId();
    if (!userId) return false;

    loadOrderManagementRowsFromLocal();

    try {
        const cloudRows = await loadCloudRows(userId, "orderManagement");
        if (Array.isArray(cloudRows) && cloudRows.length) {
            orderManagementRows = cloudRows.map((row, index) => standardizeOrderManagementRow({
                ...buildOrderManagementRow(row, index),
                ...row,
                id: row?.id || buildOrderManagementRowId(row, index),
                status: normalizeOrderManagementStatus(row?.status),
                channelName: row?.channelName || getOrderManagementChannelLabel(row),
                customerKey: getOrderManagementCustomerKey(row),
            }, index));
            pruneExpiredOrderManagementPrivacy({ persist: false });
            getOrderUploadStorage()?.setItem(getOrderManagementStorageKey(), JSON.stringify({
                rows: orderManagementRows,
                updatedAt: new Date().toISOString(),
            }));
            restoreOrderUploadRowsFromManagement();
            return true;
        }

        if (orderManagementRows.length) {
            await queueOrderManagementCloudPersistence();
        }
    } catch (error) {
        console.warn("서버 주문관리 데이터를 불러오지 못했습니다. 브라우저 백업을 사용합니다.", error);
    }

    restoreOrderUploadRowsFromManagement();
    return false;
}

function restoreOrderUploadRowsFromManagement({ render = true } = {}) {
    orderUploadRows = orderManagementRows.map((row) => ({
        ...row,
        rowId: row.sourceRowId || row.rowId || "",
    }));
    invalidateOrderProductCandidateCache();

    const channelSummaries = new Map();
    orderManagementRows.forEach((row) => {
        const channel = String(row.channel || "").trim();
        if (!channel) return;
        const summary = channelSummaries.get(channel) || { count: 0, sourceFileName: "" };
        summary.count += 1;
        if (row.sourceFileName) summary.sourceFileName = row.sourceFileName;
        channelSummaries.set(channel, summary);
    });
    channelSummaries.forEach((summary, channel) => {
        orderUploadChannelStates[channel] = {
            message: `저장됨 ${formatMilkrunNumber(summary.count)}건`,
            tone: "success",
            sourceFileName: summary.sourceFileName,
            rowCount: summary.count,
            uploadedAt: "",
        };
    });

    if (render) {
        renderOrderUploadChannels();
        renderOrderMatchPanel();
    }
}

function clearOrderManagementRowsForChannel(channel) {
    const nextRows = orderManagementRows.filter((row) => row.channel !== channel);
    if (nextRows.length === orderManagementRows.length) return;
    orderManagementRows = nextRows;
    saveOrderManagementRowsToLocal();
    renderOrderManagement();
}

async function syncOrderManagementRowsFromUpload(channel, rows) {
    const validRows = (rows ?? []).filter((row) => row && row.isValid !== false);
    if (!validRows.length) return;

    const existingById = new Map(orderManagementRows.map((row) => [row.id, row]));
    const nextChannelRows = validRows.map((row, index) => {
        const nextRow = buildOrderManagementRow({ ...row, channel: row.channel || channel }, index);
        const previousRow = existingById.get(nextRow.id);
        if (!previousRow) return nextRow;

        return standardizeOrderManagementRow({
            ...nextRow,
            status: previousRow.status || nextRow.status,
            orderStatus: previousRow.orderStatus || nextRow.orderStatus,
            shippingStatus: previousRow.shippingStatus || nextRow.shippingStatus,
            courierName: nextRow.courierName || previousRow.courierName || "",
            invoiceNo: nextRow.invoiceNo || previousRow.invoiceNo || "",
            cs: previousRow.cs || nextRow.cs || "",
            updatedAt: previousRow.updatedAt || nextRow.updatedAt,
        }, index);
    });

    orderManagementRows = [
        ...orderManagementRows.filter((row) => row.channel !== channel),
        ...nextChannelRows,
    ];
    pruneExpiredOrderManagementPrivacy({ persist: false });
    const saved = await saveOrderManagementRowsToLocal();
    if (!saved && getCloudDataUserId()) {
        throw new Error("주문관리 데이터를 서버에 저장하지 못했습니다. 다시 시도해주세요.");
    }
    renderOrderManagement();
}

function getOrderManagementChannelOptions() {
    const optionMap = new Map();
    getAllOrderUploadChannels().forEach((channel) => {
        optionMap.set(channel.label, channel.label);
    });
    orderManagementRows.forEach((row) => {
        const label = getOrderManagementChannelFilterValue(row);
        if (label) optionMap.set(label, label);
    });
    return [...optionMap.values()].sort((a, b) => a.localeCompare(b, "ko"));
}

function syncOrderManagementFilterOptions() {
    if (orderManagementChannelFilter) {
        const channelOptions = getOrderManagementChannelOptions();
        if (orderManagementFilters.channel !== "all" && !channelOptions.includes(orderManagementFilters.channel)) {
            orderManagementFilters.channel = "all";
        }
        orderManagementChannelFilter.innerHTML = [
            '<option value="all">전체 판매처</option>',
            ...channelOptions.map((label) => (
                `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`
            )),
        ].join("");
        orderManagementChannelFilter.value = orderManagementFilters.channel;
    }

    if (orderManagementOrderStatusFilter) orderManagementOrderStatusFilter.value = orderManagementFilters.orderStatus;
    if (orderManagementAllocationStatusFilter) orderManagementAllocationStatusFilter.value = orderManagementFilters.allocationStatus;
    if (orderManagementShippingStatusFilter) orderManagementShippingStatusFilter.value = orderManagementFilters.shippingStatus;
    if (orderManagementMatchFilter) orderManagementMatchFilter.value = orderManagementFilters.match;
    if (orderManagementPeriodFilter) orderManagementPeriodFilter.value = orderManagementFilters.period;
    if (orderManagementSearchInput) orderManagementSearchInput.value = orderManagementFilters.query;
}

function normalizeOrderManagementSearchText(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function getOrderManagementOperationalRows(rows = orderManagementRows) {
    const inventorySnapshot = getInventorySnapshot();
    const availableBySkuKey = new Map(
        inventorySnapshot.rows.map((row) => [row.skuKey, row.physicalAvailableQuantity]),
    );
    const allocationLookup = buildOrderAllocationLookup(inventoryAllocations);

    return (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        allocationState: getOrderLineAllocationState(row, {
            allocationLookup,
            availableBySkuKey,
            inventoryReady: inventoryLedgerLoaded,
        }),
    }));
}

function getFilteredOrderManagementRows(operationalRows = getOrderManagementOperationalRows()) {
    const query = normalizeOrderManagementSearchText(orderManagementFilters.query);
    const periodDays = Number(orderManagementFilters.period);
    const cutoffTime = Number.isFinite(periodDays) && periodDays > 0
        ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - periodDays).getTime()
        : null;

    return operationalRows
        .filter((row) => {
            if (orderManagementFilters.channel !== "all"
                && getOrderManagementChannelFilterValue(row) !== orderManagementFilters.channel) {
                return false;
            }

            if (orderManagementFilters.orderStatus !== "all"
                && normalizeOrderStatus(row.orderStatus, row.status) !== orderManagementFilters.orderStatus) {
                return false;
            }

            if (orderManagementFilters.allocationStatus !== "all"
                && row.allocationState?.status !== orderManagementFilters.allocationStatus) {
                return false;
            }

            if (orderManagementFilters.shippingStatus !== "all"
                && normalizeShippingStatus(row.shippingStatus, row.status) !== orderManagementFilters.shippingStatus) {
                return false;
            }

            if (orderManagementFilters.match !== "all") {
                const matchStatus = row.matchStatus || "unmatched";
                if (orderManagementFilters.match === "needs_match") {
                    if (matchStatus === "matched") return false;
                } else if (matchStatus !== orderManagementFilters.match) {
                    return false;
                }
            }

            if (cutoffTime !== null) {
                const parsedDate = parseOrderManagementDate(getOrderManagementOrderDate(row));
                if (!parsedDate || parsedDate.getTime() < cutoffTime) return false;
            }

            if (!query) return true;

            const searchText = normalizeOrderManagementSearchText([
                row.channelName,
                row.orderCode,
                row.productName,
                row.recipientName,
                row.recipientPhone,
                row.recipientAddress,
                row.invoiceNo,
                row.courierName,
                row.sourceFileName,
                row.recipientKey,
                row.ordererKey,
                row.customerKey,
                row.matchKey,
                getOrderStatusMeta(row.orderStatus).label,
                getAllocationStatusMeta(row.allocationState?.status).label,
                getShippingStatusMeta(row.shippingStatus).label,
                ...(Array.isArray(row.skuComponents) ? row.skuComponents.flatMap((component) => [
                    component.skuKey,
                    component.inventorySkuKey,
                    component.adminProductCode,
                    component.productName,
                ]) : []),
            ].join(" "));
            return searchText.includes(query);
        })
        .sort((left, right) => {
            const rightDate = parseOrderManagementDate(getOrderManagementOrderDate(right))?.getTime() || 0;
            const leftDate = parseOrderManagementDate(getOrderManagementOrderDate(left))?.getTime() || 0;
            return rightDate - leftDate || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
        });
}

function getOrderManagementQuantityText(value) {
    const numberValue = Number(String(value ?? "").replace(/,/g, ""));
    return Number.isFinite(numberValue) && String(value ?? "").trim()
        ? formatMilkrunNumber(numberValue)
        : (String(value ?? "").trim() || "-");
}

function renderOrderOperationalStatusBadge(kind, status) {
    const meta = kind === "shipping"
        ? getShippingStatusMeta(status)
        : getOrderStatusMeta(status);
    return `<span class="order-operational-status-badge is-${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>`;
}

function renderOrderAllocationStatus(row, { compact = false } = {}) {
    const state = row?.allocationState || getOrderManagementOperationalRows([row])[0]?.allocationState;
    const meta = getAllocationStatusMeta(state?.status);
    const progressText = state?.requiredQuantity > 0
        ? `${formatMilkrunNumber(state.allocatedQuantity)} / ${formatMilkrunNumber(state.requiredQuantity)}`
        : "";
    const shortageText = state?.shortageQuantity > 0
        ? `부족 ${formatMilkrunNumber(state.shortageQuantity)}`
        : "";
    const detailText = [progressText, shortageText].filter(Boolean).join(" · ");

    return `
        <div class="order-allocation-status${compact ? " is-compact" : ""}">
            <span class="order-allocation-status-badge is-${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>
            ${detailText ? `<span class="order-allocation-status-progress">${escapeHtml(detailText)}</span>` : ""}
        </div>
    `;
}

function renderOrderProcessStatusCell(row) {
    const orderMeta = getOrderStatusMeta(row?.orderStatus);
    const allocationMeta = getAllocationStatusMeta(row?.allocationState?.status);
    const shippingMeta = getShippingStatusMeta(row?.shippingStatus);
    const allocationState = row?.allocationState || {};
    const allocationProgress = allocationState.requiredQuantity > 0
        ? `${formatMilkrunNumber(allocationState.allocatedQuantity)} / ${formatMilkrunNumber(allocationState.requiredQuantity)}`
        : "";
    const showShippingReadiness = orderMeta.tone === "active" && row?.shippingStatus === "waiting";
    const shippingReady = isOrderManagementFullyAllocated(row);
    const showOrderBadge = orderMeta.tone !== "active";
    const showShippingBadge = row?.shippingStatus !== "waiting";

    return `
        <div class="order-process-status-cell">
            <div class="order-process-status-badges">
                ${showOrderBadge ? `
                    <span class="order-operational-status-badge is-${escapeHtml(orderMeta.tone)}"
                        title="주문 상태: ${escapeHtml(orderMeta.label)}">${escapeHtml(orderMeta.label)}</span>
                ` : ""}
                <span class="order-allocation-status-badge is-${escapeHtml(allocationMeta.tone)}"
                    title="재고 할당: ${escapeHtml(allocationMeta.label)}${allocationProgress ? ` (${escapeHtml(allocationProgress)})` : ""}">${escapeHtml(allocationMeta.label)}</span>
                ${showShippingBadge ? `
                    <span class="order-operational-status-badge is-${escapeHtml(shippingMeta.tone)}"
                        title="출고 상태: ${escapeHtml(shippingMeta.label)}">${escapeHtml(shippingMeta.label)}</span>
                ` : ""}
            </div>
            <div class="order-process-status-meta">
                ${allocationProgress ? `<span class="order-process-allocation-progress">실재고 ${escapeHtml(allocationProgress)}</span>` : ""}
                ${showShippingReadiness ? `
                    <span class="order-shipping-readiness ${shippingReady ? "is-ready" : "is-blocked"}">
                        ${shippingReady ? "출고 가능" : "할당 후 출고"}
                    </span>
                ` : ""}
            </div>
        </div>
    `;
}

function renderOrderSummaryCell(row) {
    const orderCode = row?.orderCode || "주문번호 없음";
    const channel = row?.channelName || "판매처 미지정";
    const orderDate = formatOrderManagementDate(getOrderManagementOrderDate(row));
    return `
        <div class="order-summary-cell" title="${escapeHtml(`${channel} · ${orderDate} · ${orderCode}`)}">
            <strong>${escapeHtml(orderCode)}</strong>
            <span>${escapeHtml(channel)} · ${escapeHtml(orderDate)}</span>
        </div>
    `;
}

function renderOrderProductSummaryCell(row) {
    return `
        <div class="order-product-summary-cell" title="${escapeHtml(row?.productName || "")}">
            <strong>${escapeHtml(row?.productName || "-")}</strong>
            ${renderOrderLineMatchCell(row)}
        </div>
    `;
}

function renderOrderDeliverySummaryCell(row) {
    const courierName = row?.courierName || "택배사 미지정";
    const invoiceNo = row?.invoiceNo || "송장 미등록";
    return `
        <div class="order-delivery-summary-cell" title="${escapeHtml(`${courierName} · ${invoiceNo}`)}">
            <strong>${escapeHtml(row?.courierName || "-")}</strong>
            <span>${escapeHtml(invoiceNo)}</span>
        </div>
    `;
}

function getOrderLineMatchMeta(status) {
    if (status === "matched") {
        return { label: "연결 완료", className: "is-matched" };
    }
    if (status === "suggested") {
        return { label: "확인 필요", className: "is-suggested" };
    }
    return { label: "매칭 필요", className: "is-unmatched" };
}

function getOrderLineSkuSummary(row, { includeRequiredQuantity = true } = {}) {
    const components = Array.isArray(row?.skuComponents) ? row.skuComponents : [];
    if (!components.length) return "연결된 SKU 없음";

    return components.map((component) => {
        const skuLabel = component.productName || component.adminProductCode || component.skuKey;
        return includeRequiredQuantity
            ? `${skuLabel} × ${formatMilkrunNumber(component.requiredQuantity || 0)}`
            : skuLabel;
    }).join(", ");
}

function renderOrderLineMatchCell(row) {
    const meta = getOrderLineMatchMeta(row?.matchStatus);
    const summary = getOrderLineSkuSummary(row);
    const actionLabel = row?.matchStatus === "suggested" ? "매칭 확인" : "매칭하기";
    const actionHtml = row?.matchStatus === "matched"
        ? ""
        : `<button class="order-line-match-action" data-order-management-match-id="${escapeHtml(row?.id || "")}" type="button">${actionLabel}</button>`;

    return `
        <div class="order-line-match-cell" title="${escapeHtml(summary)}">
            <span class="order-line-match-badge ${meta.className}">${meta.label}</span>
            <span class="order-line-match-summary">${escapeHtml(summary)}</span>
            ${actionHtml}
        </div>
    `;
}

function renderOrderManagementSummary(operationalRows = getOrderManagementOperationalRows()) {
    const total = operationalRows.length;
    const activeCount = operationalRows.filter((row) => row.orderStatus === "active").length;
    const allocationPendingCount = operationalRows.filter((row) => (
        ["unallocated", "partial", "shortage"].includes(row.allocationState?.status)
    )).length;
    const shippedCount = operationalRows.filter((row) => row.shippingStatus === "shipped").length;
    if (orderManagementSummaryTotalEl) orderManagementSummaryTotalEl.textContent = formatMilkrunNumber(total);
    if (orderManagementSummaryActiveEl) orderManagementSummaryActiveEl.textContent = formatMilkrunNumber(activeCount);
    if (orderManagementSummaryAllocationPendingEl) {
        orderManagementSummaryAllocationPendingEl.textContent = formatMilkrunNumber(allocationPendingCount);
    }
    if (orderManagementSummaryShippedEl) orderManagementSummaryShippedEl.textContent = formatMilkrunNumber(shippedCount);
}

function pruneSelectedOrderManagementIds() {
    const existingIds = new Set(orderManagementRows.map((row) => String(row.id)));
    selectedOrderManagementIds = new Set([...selectedOrderManagementIds].filter((rowId) => existingIds.has(String(rowId))));
}

function getSelectedOrderManagementRows() {
    pruneSelectedOrderManagementIds();
    return orderManagementRows.filter((row) => selectedOrderManagementIds.has(String(row.id)));
}

function isOrderManagementFullyAllocated(row) {
    const state = row?.allocationState;
    return Boolean(
        state?.requiredQuantity > 0
        && state.status === "allocated"
        && state.allocatedQuantity >= state.requiredQuantity,
    );
}

function isOrderManagementBatchAllocationEligible(row) {
    return Boolean(
        inventoryLedgerLoaded
        && row?.matchStatus === "matched"
        && getOrderLineSkuRequirements(row).length > 0
        && normalizeOrderStatus(row.orderStatus, row.status) === "active"
        && normalizeShippingStatus(row.shippingStatus, row.status) === "waiting"
        && !isOrderManagementFullyAllocated(row),
    );
}

function syncOrderManagementBulkControls(visibleRows = []) {
    pruneSelectedOrderManagementIds();
    const visibleIds = visibleRows.map((row) => String(row.id)).filter(Boolean);
    const selectedVisibleCount = visibleIds.filter((rowId) => selectedOrderManagementIds.has(rowId)).length;
    const selectedCount = selectedOrderManagementIds.size;

    if (orderManagementSelectAllCheckbox instanceof HTMLInputElement) {
        orderManagementSelectAllCheckbox.checked = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
        orderManagementSelectAllCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
        orderManagementSelectAllCheckbox.disabled = !visibleIds.length;
    }

    if (orderManagementBulkDeleteBtn instanceof HTMLButtonElement) {
        orderManagementBulkDeleteBtn.disabled = selectedCount === 0;
        orderManagementBulkDeleteBtn.textContent = selectedCount
            ? `선택 삭제 · ${formatMilkrunNumber(selectedCount)}`
            : "선택 삭제";
    }
    if (orderManagementBulkAllocateBtn instanceof HTMLButtonElement) {
        orderManagementBulkAllocateBtn.disabled = selectedCount === 0
            || !inventoryLedgerLoaded
            || orderManagementBulkAllocationPending;
        orderManagementBulkAllocateBtn.textContent = orderManagementBulkAllocationPending
            ? "재고 할당 중..."
            : (selectedCount
                ? `재고 할당 · ${formatMilkrunNumber(selectedCount)}`
                : "재고 할당");
    }
}

function renderOrderManagementTable(rows, filteredCount = rows.length) {
    pruneSelectedOrderManagementIds();
    if (orderManagementCountEl) {
        const selectedCount = selectedOrderManagementIds.size;
        const totalText = filteredCount === orderManagementRows.length
            ? `총 ${formatMilkrunNumber(filteredCount)}건`
            : `검색 ${formatMilkrunNumber(filteredCount)}건 · 전체 ${formatMilkrunNumber(orderManagementRows.length)}건`;
        const limitedText = rows.length < filteredCount
            ? ` · ${formatMilkrunNumber(rows.length)}건 표시`
            : "";
        const selectedText = selectedCount
            ? ` · ${formatMilkrunNumber(selectedCount)}건 선택`
            : "";
        orderManagementCountEl.textContent = `${totalText}${limitedText}${selectedText}`;
    }

    if (!orderManagementBodyEl) return;

    if (!orderManagementRows.length) {
        orderManagementBodyEl.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="8">아직 주문 데이터가 없습니다. 발주서 업로드에서 주문을 먼저 업로드해 주세요.</td>
            </tr>
        `;
        syncOrderManagementBulkControls([]);
        return;
    }

    if (!rows.length) {
        orderManagementBodyEl.innerHTML = `
            <tr class="tracking-empty-row">
                <td colspan="8">조건에 맞는 주문이 없습니다.</td>
            </tr>
        `;
        syncOrderManagementBulkControls([]);
        return;
    }

    orderManagementBodyEl.innerHTML = rows.map((row) => {
        const privacyExpired = isOrderManagementPrivacyExpired(row);
        const recipientNameText = row.recipientName || (privacyExpired ? "보관 만료" : "-");
        const rowId = String(row.id);
        const checkedAttr = selectedOrderManagementIds.has(rowId) ? " checked" : "";
        return `
            <tr class="${checkedAttr ? "is-selected" : ""}">
                <td class="order-management-select-column">
                    <input class="order-management-row-checkbox" data-order-management-select-id="${escapeHtml(rowId)}"
                        type="checkbox" aria-label="주문 선택"${checkedAttr} />
                </td>
                <td>${renderOrderProcessStatusCell(row)}</td>
                <td>${renderOrderSummaryCell(row)}</td>
                <td>${renderOrderProductSummaryCell(row)}</td>
                <td class="order-management-number-cell">${escapeHtml(getOrderManagementQuantityText(row.orderedQuantity))}</td>
                <td title="${escapeHtml(row.recipientName || "")}">${escapeHtml(recipientNameText)}</td>
                <td>${renderOrderDeliverySummaryCell(row)}</td>
                <td>
                    <div class="order-management-row-actions">
                        <button class="secondary-btn order-management-row-btn" data-order-management-detail-id="${escapeHtml(row.id)}" type="button">상세</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    syncOrderManagementBulkControls(rows);
}

function renderOrderManagement({ force = false } = {}) {
    if (!force && !isCurrentDashboardView("order-management")) return;

    syncOrderManagementFilterOptions();
    const operationalRows = getOrderManagementOperationalRows();
    renderOrderManagementSummary(operationalRows);
    if (orderManagementDeleteAllBtn instanceof HTMLButtonElement) {
        orderManagementDeleteAllBtn.disabled = orderManagementRows.length === 0;
    }
    const filteredRows = getFilteredOrderManagementRows(operationalRows);
    const allocationNeededCount = filteredRows.filter(isOrderManagementBatchAllocationEligible).length;
    if (orderManagementSelectAllocationNeededBtn instanceof HTMLButtonElement) {
        orderManagementSelectAllocationNeededBtn.disabled = allocationNeededCount === 0
            || orderManagementBulkAllocationPending;
        orderManagementSelectAllocationNeededBtn.textContent = allocationNeededCount > 0
            ? `할당 필요 선택 · ${formatMilkrunNumber(allocationNeededCount)}`
            : "할당 필요 선택";
    }
    const renderedRows = filteredRows.slice(0, ORDER_MANAGEMENT_RENDER_LIMIT);
    renderOrderManagementTable(renderedRows, filteredRows.length);

    if (orderManagementStatusEl) {
        const matchedCount = orderManagementRows.filter((row) => row.matchStatus === "matched").length;
        const suggestedCount = orderManagementRows.filter((row) => row.matchStatus === "suggested").length;
        const unmatchedCount = Math.max(0, orderManagementRows.length - matchedCount - suggestedCount);
        const shortageCount = operationalRows.filter((row) => row.allocationState?.status === "shortage").length;
        orderManagementStatusEl.textContent = orderManagementRows.length
            ? `전체 ${formatMilkrunNumber(orderManagementRows.length)} · SKU 연결 ${formatMilkrunNumber(matchedCount)} · 확인 필요 ${formatMilkrunNumber(suggestedCount)} · 매칭 필요 ${formatMilkrunNumber(unmatchedCount)} · 재고부족 ${formatMilkrunNumber(shortageCount)}${filteredRows.length > renderedRows.length ? ` · ${formatMilkrunNumber(renderedRows.length)}건 우선 표시` : ""}`
            : "발주서 업로드에서 주문을 업로드하면 여기에 표시됩니다.";
    }
}

function setOrderManagementFilterFromControls() {
    orderManagementFilters = {
        channel: orderManagementChannelFilter?.value || "all",
        orderStatus: orderManagementOrderStatusFilter?.value || "all",
        allocationStatus: orderManagementAllocationStatusFilter?.value || "all",
        shippingStatus: orderManagementShippingStatusFilter?.value || "all",
        match: orderManagementMatchFilter?.value || "all",
        period: orderManagementPeriodFilter?.value || "all",
        query: orderManagementSearchInput?.value || "",
    };
}

function handleOrderManagementFilterChange() {
    setOrderManagementFilterFromControls();
    renderOrderManagement();
}

function openOrderMatchForManagedRow(rowId) {
    const row = getOrderManagementRowById(rowId);
    if (!row?.matchKey) return;

    confirmedOrderMatchKeys.delete(row.matchKey);
    showView("order-upload");
    renderOrderMatchPanel({ force: true });

    window.setTimeout(() => {
        const targetItem = [...(orderMatchListEl?.querySelectorAll("[data-order-match-item-key]") || [])]
            .find((item) => item.getAttribute("data-order-match-item-key") === row.matchKey);
        const scrollTarget = targetItem || orderMatchListEl?.closest(".order-match-panel");
        scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (targetItem) {
            targetItem.classList.add("is-focus");
            window.setTimeout(() => targetItem.classList.remove("is-focus"), 1800);
        }
    }, 0);
}

function handleOrderManagementSelectionChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-management-select-id]")) return;

    const rowId = target.getAttribute("data-order-management-select-id") || "";
    if (!rowId) return;

    if (target.checked) {
        selectedOrderManagementIds.add(rowId);
    } else {
        selectedOrderManagementIds.delete(rowId);
    }
    renderOrderManagement();
}

function handleOrderManagementSelectAllChange() {
    if (!(orderManagementSelectAllCheckbox instanceof HTMLInputElement)) return;
    const visibleRows = getFilteredOrderManagementRows().slice(0, ORDER_MANAGEMENT_RENDER_LIMIT);
    visibleRows.forEach((row) => {
        const rowId = String(row.id);
        if (orderManagementSelectAllCheckbox.checked) {
            selectedOrderManagementIds.add(rowId);
        } else {
            selectedOrderManagementIds.delete(rowId);
        }
    });
    renderOrderManagement();
}

function handleSelectOrderManagementAllocationNeeded() {
    const targets = getFilteredOrderManagementRows().filter(isOrderManagementBatchAllocationEligible);
    if (!targets.length) {
        if (orderManagementStatusEl) {
            orderManagementStatusEl.textContent = "현재 검색·필터 조건에는 재고 할당이 필요한 주문이 없습니다.";
        }
        return;
    }
    targets.forEach((row) => selectedOrderManagementIds.add(String(row.id)));
    renderOrderManagement();
    if (orderManagementStatusEl) {
        orderManagementStatusEl.textContent = `현재 조건의 할당 필요 주문 ${formatMilkrunNumber(targets.length)}건을 선택했습니다. ‘재고 할당’을 눌러 진행하세요.`;
    }
}

async function handleBulkAllocateOrderManagementRows() {
    if (orderManagementBulkAllocationPending) return;
    const selectedRows = getOrderManagementOperationalRows(getSelectedOrderManagementRows());
    if (!selectedRows.length) return;

    const targets = selectedRows
        .filter(isOrderManagementBatchAllocationEligible)
        .sort(compareOrderLinesForInventoryAllocation);
    const skippedCount = selectedRows.length - targets.length;
    if (!targets.length) {
        window.alert("선택한 주문 중 재고 할당 가능한 주문이 없습니다.\n\nSKU 연결·주문 상태·출고 상태 또는 기존 할당완료 여부를 확인해주세요.");
        return;
    }

    const confirmed = window.confirm([
        `선택한 주문 중 ${formatMilkrunNumber(targets.length)}건에 재고를 할당할까요?`,
        "가용재고 기준으로 설정된 우선순위 LOT부터 할당합니다.",
        "기존 실재고 할당은 유지하고 부족분만 추가로 채웁니다.",
        skippedCount > 0 ? `처리 대상이 아닌 ${formatMilkrunNumber(skippedCount)}건은 제외됩니다.` : "",
    ].filter(Boolean).join("\n"));
    if (!confirmed) return;

    orderManagementBulkAllocationPending = true;
    renderOrderManagement();
    if (orderManagementStatusEl) {
        orderManagementStatusEl.textContent = `선택 주문 ${formatMilkrunNumber(targets.length)}건의 최신 가용재고를 확인해 할당하고 있습니다.`;
    }

    let resultMessage = "";
    let shortageAlert = "";
    let processedCount = 0;
    try {
        for (let index = 0; index < targets.length; index += 30) {
            const chunk = targets.slice(index, index + 30);
            await fulfillShortageAllocationsFromAvailableStock(chunk);
            processedCount += chunk.length;
        }
        const targetIds = new Set(targets.map((row) => String(row.id)));
        const resultRows = getOrderManagementOperationalRows()
            .filter((row) => targetIds.has(String(row.id)));
        const completedRows = resultRows.filter(isOrderManagementFullyAllocated);
        const shortageRows = resultRows.filter((row) => row.allocationState?.status === "shortage");
        const remainingRows = resultRows.filter((row) => (
            !isOrderManagementFullyAllocated(row)
            && row.allocationState?.status !== "shortage"
        ));
        const shortageQuantity = shortageRows.reduce(
            (sum, row) => sum + Math.max(0, Number(row.allocationState?.shortageQuantity) || 0),
            0,
        );
        selectedOrderManagementIds = new Set(
            [...shortageRows, ...remainingRows].map((row) => String(row.id)),
        );
        resultMessage = [
            `재고 할당 ${formatMilkrunNumber(targets.length)}건 처리 완료`,
            `완전 할당 ${formatMilkrunNumber(completedRows.length)}건`,
            `재고부족 ${formatMilkrunNumber(shortageRows.length)}건`,
            shortageQuantity > 0 ? `부족수량 ${formatMilkrunNumber(shortageQuantity)}개` : "",
            skippedCount > 0 ? `제외 ${formatMilkrunNumber(skippedCount)}건` : "",
        ].filter(Boolean).join(" · ");
        if (shortageRows.length) {
            shortageAlert = [
                "재고 할당을 완료했습니다.",
                `완전 할당 ${formatMilkrunNumber(completedRows.length)}건`,
                `재고부족 ${formatMilkrunNumber(shortageRows.length)}건 · 부족수량 ${formatMilkrunNumber(shortageQuantity)}개`,
                "재고부족 주문은 피킹·출고할 수 없습니다. 입고 후 해당 주문을 선택해 재고 할당을 다시 실행해주세요.",
            ].join("\n");
        }
    } catch (error) {
        console.error("주문 일괄 재고 할당에 실패했습니다.", error);
        const partialText = processedCount > 0
            ? `${formatMilkrunNumber(processedCount)}건은 처리됐지만 나머지 주문을 완료하지 못했습니다. `
            : "";
        resultMessage = error?.code === "permission-denied"
            ? `${partialText}재고 할당 저장 권한이 없습니다.`
            : `${partialText}${error?.message || "최신 재고를 확인한 뒤 다시 시도해주세요."}`;
        shortageAlert = resultMessage;
    } finally {
        orderManagementBulkAllocationPending = false;
        renderOrderManagement();
        if (orderManagementStatusEl && resultMessage) orderManagementStatusEl.textContent = resultMessage;
    }
    if (shortageAlert) window.alert(shortageAlert);
}

function getInventoryAllocationRevision(data = {}) {
    return Math.max(0, Math.trunc(Number(data?.allocationRevision) || 0));
}

function getInventoryAllocationPolicySignature(policy = {}) {
    return JSON.stringify(normalizeInventoryAllocationPolicy(policy));
}

async function loadFreshInventoryAllocationContext(userId, maxAttempts = 3) {
    const settingsRef = getInventoryAllocationSettingsDocRef(userId);
    if (!settingsRef) throw new Error("재고 운영 설정 저장소를 찾지 못했습니다.");

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const beforeSettingsSnap = await getDoc(settingsRef);
        const beforeRevision = getInventoryAllocationRevision(beforeSettingsSnap.data());
        const [transactionRows, balanceRows, allocationRows] = await Promise.all([
            loadCloudRows(userId, INVENTORY_TRANSACTION_COLLECTION),
            loadCloudRows(userId, INVENTORY_BALANCE_COLLECTION),
            loadCloudRows(userId, INVENTORY_ALLOCATION_COLLECTION),
        ]);
        const afterSettingsSnap = await getDoc(settingsRef);
        const afterData = afterSettingsSnap.data() || {};
        const afterRevision = getInventoryAllocationRevision(afterData);
        if (beforeRevision !== afterRevision) continue;

        const transactions = (transactionRows || []).map(normalizeInventoryTransaction);
        const balances = (balanceRows || []).map(normalizeInventoryBalance);
        const allocations = (allocationRows || []).map(normalizeInventoryAllocation);
        const inventoryRows = buildInventorySnapshot(skuRows, balances, transactions).rows;
        const lotSnapshot = buildInventoryLotSnapshot(inventoryRows, transactions);
        const savedPolicy = afterData?.policy ?? INVENTORY_ALLOCATION_POLICY_DEFAULTS;
        return {
            userId,
            settingsRef,
            revision: afterRevision,
            policy: normalizeInventoryAllocationPolicy(savedPolicy),
            transactions,
            balances,
            balanceBySkuKey: new Map(balances.map((row) => [row.skuKey, row])),
            allocations,
            lotRows: lotSnapshot.rows,
        };
    }

    const staleError = new Error("할당 정보가 다른 화면에서 계속 변경되고 있습니다.");
    staleError.code = "inventory/allocation-stale";
    throw staleError;
}

function getInventoryAllocationReplacementSignature(rows = []) {
    const quantities = new Map();
    (Array.isArray(rows) ? rows : []).forEach((sourceRow) => {
        const row = normalizeInventoryAllocation(sourceRow);
        if (row.status !== "allocated" || row.quantity <= 0) return;
        const key = [row.orderLineId, row.skuKey, row.allocationKind, row.lotKey].join("\u001e");
        quantities.set(key, (quantities.get(key) || 0) + row.quantity);
    });
    return JSON.stringify([...quantities.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function validateInventoryAllocationReplacement(orderLines, desiredRows, context) {
    const targetLineIds = new Set(orderLines.map((row) => String(row.orderLineId || "")).filter(Boolean));
    const capacityRows = buildInventoryAllocationCapacityRows(
        context.lotRows,
        context.allocations,
        { excludeOrderLineIds: [...targetLineIds] },
    );
    const capacityByLotKey = new Map(capacityRows.map((row) => [row.lotKey, row]));
    const requiredByLineSku = new Map();
    orderLines.forEach((orderLine) => {
        getOrderLineSkuRequirements(orderLine).forEach((requirement) => {
            requiredByLineSku.set(
                `${orderLine.orderLineId}\u001f${requirement.skuKey}`,
                requirement.requiredQuantity,
            );
        });
    });

    const quantityByLotKey = new Map();
    const quantityByLineSku = new Map();
    desiredRows.forEach((row) => {
        if (!targetLineIds.has(String(row.orderLineId || ""))) {
            const error = new Error("할당 대상 주문이 변경되었습니다.");
            error.code = "inventory/allocation-invalid";
            throw error;
        }
        if (row.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK) {
            const capacity = capacityByLotKey.get(row.lotKey);
            if (!capacity || capacity.skuKey !== row.skuKey) {
                const error = new Error("선택한 LOT 재고가 이동되었거나 삭제되었습니다.");
                error.code = "inventory/allocation-lot-stale";
                throw error;
            }
            quantityByLotKey.set(row.lotKey, (quantityByLotKey.get(row.lotKey) || 0) + row.quantity);
        }
        const lineSkuKey = `${row.orderLineId}\u001f${row.skuKey}`;
        quantityByLineSku.set(lineSkuKey, (quantityByLineSku.get(lineSkuKey) || 0) + row.quantity);
    });

    quantityByLotKey.forEach((quantity, lotKey) => {
        if (quantity > (capacityByLotKey.get(lotKey)?.assignableQuantity || 0)) {
            const error = new Error("다른 주문이 먼저 할당하여 선택 수량이 가용재고를 초과했습니다.");
            error.code = "inventory/allocation-capacity";
            throw error;
        }
    });
    quantityByLineSku.forEach((quantity, lineSkuKey) => {
        if (quantity > (requiredByLineSku.get(lineSkuKey) || 0)) {
            const error = new Error("이번 할당 수량이 주문 필요수량을 초과했습니다.");
            error.code = "inventory/allocation-required";
            throw error;
        }
    });
}

async function replaceOrderLineInventoryAllocations(
    orderLines,
    buildPlan,
    { source = "manual", releaseReason = "manual_reallocation", requirePolicyStable = false } = {},
) {
    const userId = getCloudDataUserId();
    const targetLines = (Array.isArray(orderLines) ? orderLines : [])
        .filter((row) => row?.orderLineId);
    if (!userId || !targetLines.length) throw new Error("할당할 주문 정보를 찾지 못했습니다.");

    const allocationCollection = getCloudDataCollection(userId, INVENTORY_ALLOCATION_COLLECTION);
    const balanceCollection = getCloudDataCollection(userId, INVENTORY_BALANCE_COLLECTION);
    if (!allocationCollection || !balanceCollection) throw new Error("재고 할당 저장소를 찾지 못했습니다.");

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const context = await loadFreshInventoryAllocationContext(userId);
        const targetLineIds = new Set(targetLines.map((row) => String(row.orderLineId)));
        const currentActiveRows = context.allocations.filter((row) => (
            row.status === "allocated" && targetLineIds.has(row.orderLineId)
        ));
        const plan = await buildPlan(context);
        const desiredRows = (Array.isArray(plan?.allocations) ? plan.allocations : [])
            .map((row, index) => normalizeInventoryAllocation({
                ...row,
                id: row.id || `allocation-draft-${index + 1}`,
                status: "allocated",
            }))
            .filter((row) => row.quantity > 0);
        validateInventoryAllocationReplacement(targetLines, desiredRows, context);

        if (
            getInventoryAllocationReplacementSignature(currentActiveRows)
            === getInventoryAllocationReplacementSignature(desiredRows)
        ) {
            inventoryTransactions = context.transactions;
            inventoryBalances = context.balances;
            inventoryAllocations = context.allocations;
            inventoryLotSnapshotCache = null;
            renderOrderManagement();
            renderInventoryLedger({ force: isCurrentDashboardView("inventory-ledger") });
            return { ...plan, unchanged: true };
        }

        const savedAt = new Date().toISOString();
        const batchId = `allocation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const releasedRows = currentActiveRows.map((row) => normalizeInventoryAllocation({
            ...row,
            status: "released",
            releasedAt: savedAt,
            updatedAt: savedAt,
            releaseReason,
        }));
        const createdEntries = desiredRows.map((row) => {
            const ref = doc(allocationCollection);
            return {
                ref,
                row: normalizeInventoryAllocation({
                    ...row,
                    id: ref.id,
                    status: "allocated",
                    allocatedAt: savedAt,
                    updatedAt: savedAt,
                    createdBy: currentUserEmail || auth.currentUser?.email || "",
                    allocationSource: source,
                    allocationBatchId: batchId,
                    policySnapshot: source === "automatic" ? context.policy : null,
                }),
            };
        });
        if (releasedRows.length + createdEntries.length > 400) {
            throw new Error("한 번에 저장할 할당 행이 너무 많습니다. 주문을 나누어 처리해주세요.");
        }

        const affectedSkuKeys = new Set([
            ...targetLines.flatMap((row) => getOrderLineSkuRequirements(row).map((item) => item.skuKey)),
            ...desiredRows.map((row) => row.skuKey),
        ]);
        const balanceBaselines = [...affectedSkuKeys]
            .map((skuKey) => context.balanceBySkuKey.get(skuKey))
            .filter(Boolean);
        const expectedPolicySignature = getInventoryAllocationPolicySignature(context.policy);

        try {
            await runTransaction(db, async (firestoreTransaction) => {
                const settingsSnap = await firestoreTransaction.get(context.settingsRef);
                const liveSettings = settingsSnap.data() || {};
                if (getInventoryAllocationRevision(liveSettings) !== context.revision) {
                    const error = new Error("다른 화면에서 할당이 변경되었습니다.");
                    error.code = "inventory/allocation-stale";
                    throw error;
                }
                if (
                    requirePolicyStable
                    && getInventoryAllocationPolicySignature(liveSettings?.policy || INVENTORY_ALLOCATION_POLICY_DEFAULTS)
                        !== expectedPolicySignature
                ) {
                    const error = new Error("기본 할당 정책이 변경되었습니다.");
                    error.code = "inventory/allocation-stale";
                    throw error;
                }

                const liveBalanceSnaps = await Promise.all(balanceBaselines.map((baseline) => (
                    firestoreTransaction.get(doc(balanceCollection, getInventoryDocumentId(baseline.skuKey)))
                )));
                liveBalanceSnaps.forEach((snapshot, index) => {
                    const baseline = balanceBaselines[index];
                    const liveBalance = snapshot.exists() ? normalizeInventoryBalance(snapshot.data()) : null;
                    if (
                        !liveBalance
                        || liveBalance.quantity !== baseline.quantity
                        || liveBalance.storageRevision !== baseline.storageRevision
                    ) {
                        const error = new Error("할당 중 재고 수량 또는 보관정보가 변경되었습니다.");
                        error.code = "inventory/allocation-stale";
                        throw error;
                    }
                });

                releasedRows.forEach((row) => {
                    firestoreTransaction.set(doc(allocationCollection, row.id), sanitizeFirestoreValue(row));
                });
                createdEntries.forEach(({ ref, row }) => {
                    firestoreTransaction.set(ref, sanitizeFirestoreValue(row));
                });
                firestoreTransaction.set(context.settingsRef, {
                    allocationRevision: context.revision + 1,
                    allocationRevisionUpdatedAt: serverTimestamp(),
                }, { merge: true });
            });

            const releasedById = new Map(releasedRows.map((row) => [row.id, row]));
            inventoryTransactions = context.transactions;
            inventoryBalances = context.balances;
            inventoryAllocations = [
                ...context.allocations.map((row) => releasedById.get(row.id) || row),
                ...createdEntries.map((entry) => entry.row),
            ];
            inventoryLedgerLoaded = true;
            inventoryLotSnapshotCache = null;
            renderOrderManagement();
            renderInventoryLedger({ force: isCurrentDashboardView("inventory-ledger") });
            return { ...plan, unchanged: false };
        } catch (error) {
            if (error?.code === "inventory/allocation-stale" && attempt < 2) continue;
            throw error;
        }
    }

    const error = new Error("다른 작업과 충돌하여 할당을 저장하지 못했습니다. 다시 시도해주세요.");
    error.code = "inventory/allocation-stale";
    throw error;
}

function compareOrderLinesForInventoryAllocation(left, right) {
    const leftTime = parseOrderManagementDate(getOrderManagementOrderDate(left))?.getTime() || 0;
    const rightTime = parseOrderManagementDate(getOrderManagementOrderDate(right))?.getTime() || 0;
    return leftTime - rightTime || String(left.orderLineId).localeCompare(String(right.orderLineId));
}

async function fulfillShortageAllocationsFromAvailableStock(orderLines = []) {
    const targetLines = (Array.isArray(orderLines) ? orderLines : [])
        .filter((row) => (
            row?.orderLineId
            && row.matchStatus === "matched"
            && normalizeOrderStatus(row.orderStatus, row.status) !== "cancelled"
            && normalizeShippingStatus(row.shippingStatus, row.status) !== "shipped"
        ))
        .sort(compareOrderLinesForInventoryAllocation);
    if (!targetLines.length) {
        return {
            allocations: [],
            requiredQuantity: 0,
            allocatedQuantity: 0,
            shortageAllocatedQuantity: 0,
            plannedAllocatedQuantity: 0,
            shortageQuantity: 0,
            unchanged: true,
        };
    }

    return replaceOrderLineInventoryAllocations(
        targetLines,
        (context) => {
            const targetLineIds = new Set(targetLines.map((row) => String(row.orderLineId)));
            const requirementsByLineSku = new Map();
            let requiredQuantity = 0;
            targetLines.forEach((line) => {
                getOrderLineSkuRequirements(line).forEach((requirement) => {
                    const key = `${line.orderLineId}\u001f${requirement.skuKey}`;
                    requirementsByLineSku.set(key, requirement.requiredQuantity);
                    requiredQuantity += requirement.requiredQuantity;
                });
            });

            const capacityRows = buildInventoryAllocationCapacityRows(
                context.lotRows,
                context.allocations,
                { excludeOrderLineIds: [...targetLineIds] },
            );
            const remainingCapacityByLotKey = new Map(
                capacityRows.map((row) => [row.lotKey, row.assignableQuantity]),
            );
            const keptByLineSku = new Map();
            const keptStockAllocations = [];

            context.allocations
                .filter((allocation) => (
                    allocation.status === "allocated"
                    && allocation.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK
                    && targetLineIds.has(allocation.orderLineId)
                ))
                .forEach((allocation) => {
                    const lineSkuKey = `${allocation.orderLineId}\u001f${allocation.skuKey}`;
                    const remainingRequirement = Math.max(
                        0,
                        (requirementsByLineSku.get(lineSkuKey) || 0) - (keptByLineSku.get(lineSkuKey) || 0),
                    );
                    const remainingLotCapacity = remainingCapacityByLotKey.get(allocation.lotKey) || 0;
                    const keepQuantity = Math.min(
                        allocation.quantity,
                        remainingRequirement,
                        remainingLotCapacity,
                    );
                    if (keepQuantity <= 0) return;
                    keptStockAllocations.push({
                        ...allocation,
                        quantity: keepQuantity,
                        allocationKind: INVENTORY_ALLOCATION_KIND_STOCK,
                    });
                    keptByLineSku.set(
                        lineSkuKey,
                        (keptByLineSku.get(lineSkuKey) || 0) + keepQuantity,
                    );
                    remainingCapacityByLotKey.set(
                        allocation.lotKey,
                        remainingLotCapacity - keepQuantity,
                    );
                });

            const remainingLotRows = capacityRows.map((row) => ({
                ...row,
                quantity: Math.max(0, remainingCapacityByLotKey.get(row.lotKey) || 0),
            }));
            const remainingLines = targetLines.map((line) => ({
                ...line,
                skuComponents: getOrderLineSkuRequirements(line).map((requirement) => ({
                    ...requirement,
                    inventorySkuKey: requirement.skuKey,
                    requiredQuantity: Math.max(
                        0,
                        requirement.requiredQuantity
                            - (keptByLineSku.get(`${line.orderLineId}\u001f${requirement.skuKey}`) || 0),
                    ),
                })),
            }));
            const remainingPlan = buildAutomaticInventoryAllocationPlan(
                remainingLines,
                remainingLotRows,
                [],
                context.policy,
            );
            const allocations = [...keptStockAllocations, ...remainingPlan.allocations];
            const allocatedQuantity = allocations
                .filter((allocation) => allocation.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK)
                .reduce((sum, allocation) => sum + allocation.quantity, 0);
            const shortageAllocatedQuantity = allocations
                .filter((allocation) => allocation.allocationKind === INVENTORY_ALLOCATION_KIND_SHORTAGE)
                .reduce((sum, allocation) => sum + allocation.quantity, 0);

            return {
                ...remainingPlan,
                allocations,
                requiredQuantity,
                allocatedQuantity,
                shortageAllocatedQuantity,
                plannedAllocatedQuantity: allocatedQuantity + shortageAllocatedQuantity,
                shortageQuantity: shortageAllocatedQuantity,
            };
        },
        {
            source: "automatic",
            releaseReason: "batch_reallocation",
            requirePolicyStable: true,
        },
    );
}

async function releaseOrderLineInventoryAllocations(orderLines = [], releaseReason = "order_cancelled") {
    const targetLines = (Array.isArray(orderLines) ? orderLines : []).filter((row) => row?.orderLineId);
    if (!targetLines.length) return { allocations: [], unchanged: true };
    return replaceOrderLineInventoryAllocations(
        targetLines,
        () => ({
            allocations: [],
            requiredQuantity: targetLines.reduce((sum, row) => sum + getOrderLineRequiredQuantity(row), 0),
            allocatedQuantity: 0,
            shortageQuantity: 0,
        }),
        { source: "manual", releaseReason },
    );
}

function getActiveAllocationsForOrderLine(orderLineId, rows = inventoryAllocations) {
    const targetLineId = String(orderLineId || "");
    return (Array.isArray(rows) ? rows : [])
        .map(normalizeInventoryAllocation)
        .filter((row) => row.status === "allocated" && row.orderLineId === targetLineId);
}

function initializeOrderManagementAllocationDraft(row) {
    orderManagementAllocationDraft = new Map();
    getActiveAllocationsForOrderLine(row?.orderLineId).forEach((allocation) => {
        if (allocation.allocationKind !== INVENTORY_ALLOCATION_KIND_STOCK) return;
        orderManagementAllocationDraft.set(
            allocation.lotKey,
            (orderManagementAllocationDraft.get(allocation.lotKey) || 0) + allocation.quantity,
        );
    });
}

function getOrderManagementAllocationEditorRows(row) {
    if (!row) return [];
    const requirements = getOrderLineSkuRequirements(row);
    const requiredSkuKeys = new Set(requirements.map((item) => item.skuKey));
    const ownAllocations = getActiveAllocationsForOrderLine(row.orderLineId)
        .filter((allocation) => allocation.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK);
    const inventoryRows = getInventorySnapshot().rows;
    const lotRows = buildInventoryLotSnapshot(inventoryRows, inventoryTransactions).rows;
    const lotKeySet = new Set(lotRows.map((lotRow) => lotRow.lotKey));
    ownAllocations.forEach((allocation) => {
        if (lotKeySet.has(allocation.lotKey)) return;
        lotRows.push({
            lotKey: allocation.lotKey,
            skuKey: allocation.skuKey,
            skuRowId: allocation.skuRowId,
            adminProductCode: allocation.adminProductCode,
            productName: allocation.productName,
            lotNo: allocation.lotNo,
            expiryDate: allocation.expiryDate,
            location: allocation.location,
            palletNo: allocation.palletNo,
            quantity: 0,
            expiryState: "none",
            latestOccurredAt: "",
            isMissingInventoryLot: true,
        });
    });

    const ownQuantityByLotKey = new Map();
    ownAllocations.forEach((allocation) => {
        ownQuantityByLotKey.set(
            allocation.lotKey,
            (ownQuantityByLotKey.get(allocation.lotKey) || 0) + allocation.quantity,
        );
    });
    return buildInventoryAllocationCapacityRows(lotRows, inventoryAllocations, {
        excludeOrderLineIds: [row.orderLineId],
    }).filter((lotRow) => requiredSkuKeys.has(lotRow.skuKey)).map((lotRow) => {
        const ownQuantity = ownQuantityByLotKey.get(lotRow.lotKey) || 0;
        const draftQuantity = orderManagementAllocationDraft.get(lotRow.lotKey) || 0;
        const maxQuantity = Math.max(
            ownQuantity,
            lotRow.expiryState === "expired" ? ownQuantity : lotRow.assignableQuantity,
        );
        return {
            ...lotRow,
            ownQuantity,
            draftQuantity,
            maxQuantity,
        };
    }).filter((lotRow) => (
        lotRow.quantity > 0 || lotRow.ownQuantity > 0 || lotRow.draftQuantity > 0
    ));
}

function getOrderManagementAllocationDraftState(row, editorRows = getOrderManagementAllocationEditorRows(row)) {
    const requirements = getOrderLineSkuRequirements(row);
    const assignedBySkuKey = new Map();
    const errors = [];
    editorRows.forEach((lotRow) => {
        const quantity = Math.max(0, Math.trunc(Number(orderManagementAllocationDraft.get(lotRow.lotKey)) || 0));
        if (quantity > lotRow.maxQuantity) {
            errors.push(
                lotRow.expiryState === "expired"
                    ? "기한이 지난 재고는 기존 할당보다 늘릴 수 없습니다."
                    : "할당 수량이 현재 할당 가능한 수량을 초과했습니다.",
            );
        }
        assignedBySkuKey.set(
            lotRow.skuKey,
            (assignedBySkuKey.get(lotRow.skuKey) || 0) + quantity,
        );
    });
    const componentStates = requirements.map((requirement) => {
        const assignedQuantity = assignedBySkuKey.get(requirement.skuKey) || 0;
        if (assignedQuantity > requirement.requiredQuantity) {
            errors.push(`${requirement.productName || requirement.adminProductCode || "SKU"} 할당이 필요수량을 초과했습니다.`);
        }
        return {
            ...requirement,
            assignedQuantity,
            shortageQuantity: Math.max(0, requirement.requiredQuantity - assignedQuantity),
        };
    });
    return {
        componentStates,
        requiredQuantity: componentStates.reduce((sum, item) => sum + item.requiredQuantity, 0),
        assignedQuantity: componentStates.reduce((sum, item) => sum + item.assignedQuantity, 0),
        shortageQuantity: componentStates.reduce((sum, item) => sum + item.shortageQuantity, 0),
        errors: [...new Set(errors)],
        isValid: errors.length === 0,
    };
}

function getOrderManagementAllocationPolicyText() {
    const policy = normalizeInventoryAllocationPolicy(inventoryAllocationPolicy);
    const priorities = policy.priorityKeys.map(getInventoryAllocationPriorityLabel).join(" → ");
    const splitText = policy.allowLotSplit ? "LOT 분할 허용" : "단일 LOT 할당";
    return `${priorities} · ${splitText} · 기한 경과 재고 제외`;
}

function setOrderManagementAllocationMessage(message = "", tone = "info") {
    if (!orderManagementAllocationStatusMessageEl) return;
    orderManagementAllocationStatusMessageEl.textContent = message;
    orderManagementAllocationStatusMessageEl.className = `order-management-allocation-message is-${tone}`;
}

function renderOrderManagementAllocationEditor({ preserveMessage = false } = {}) {
    if (!orderManagementAllocationEditorEl || !editingOrderManagementId) return;
    const baseRow = orderManagementRows.find((row) => row.id === editingOrderManagementId);
    const row = baseRow ? getOrderManagementOperationalRows([baseRow])[0] : null;
    if (!row) return;
    const editorRows = getOrderManagementAllocationEditorRows(row);
    const draftState = getOrderManagementAllocationDraftState(row, editorRows);
    const isCancelled = orderManagementDetailOrderStatusSelect?.value === "cancelled";
    const isShipped = normalizeShippingStatus(row.shippingStatus, row.status) === "shipped";
    const isMatched = row.matchStatus === "matched" && getOrderLineSkuRequirements(row).length > 0;
    const isLocked = isCancelled || isShipped || !isMatched || !inventoryLedgerLoaded;

    if (orderManagementAllocationPolicyEl) {
        orderManagementAllocationPolicyEl.textContent = getOrderManagementAllocationPolicyText();
    }
    if (orderManagementAllocationSummaryEl) {
        orderManagementAllocationSummaryEl.innerHTML = draftState.componentStates.length
            ? draftState.componentStates.map((item) => `
                <span class="order-management-allocation-summary-chip${item.shortageQuantity > 0 ? " is-shortage" : " is-complete"}">
                    <b>${escapeHtml(item.productName || item.adminProductCode || item.skuKey)}</b>
                    실재고 ${formatMilkrunNumber(item.assignedQuantity)} · 입고대기 ${formatMilkrunNumber(item.shortageQuantity)} · 주문 ${formatMilkrunNumber(item.requiredQuantity)}
                </span>
            `).join("")
            : '<span class="order-management-allocation-summary-chip">할당할 SKU가 없습니다.</span>';
    }

    const query = normalizeOrderManagementSearchText(orderManagementAllocationSearch);
    const visibleRows = editorRows.filter((lotRow) => {
        if (!query) return true;
        return normalizeOrderManagementSearchText([
            lotRow.productName,
            lotRow.adminProductCode,
            lotRow.lotNo,
            lotRow.expiryDate,
            lotRow.location,
            lotRow.palletNo,
        ].join(" ")).includes(query);
    });
    if (orderManagementAllocationBodyEl) {
        if (!visibleRows.length) {
            orderManagementAllocationBodyEl.innerHTML = `
                <tr class="tracking-empty-row"><td colspan="9">${
                    isMatched ? "조건에 맞는 보관재고가 없습니다." : "SKU 매칭 완료 후 재고를 할당할 수 있습니다."
                }</td></tr>
            `;
        } else {
            orderManagementAllocationBodyEl.innerHTML = visibleRows.map((lotRow) => {
                const encodedLotKey = encodeURIComponent(lotRow.lotKey);
                const disabled = isLocked || orderManagementAllocationSaving || lotRow.maxQuantity <= 0;
                const riskText = lotRow.expiryState === "expired"
                    ? '<span class="order-management-allocation-risk">기한 경과</span>'
                    : "";
                return `
                    <tr class="${lotRow.draftQuantity > 0 ? "is-selected" : ""}">
                        <td><b>${escapeHtml(lotRow.productName || "-")}</b><small>${escapeHtml(lotRow.adminProductCode || lotRow.skuKey)}</small></td>
                        <td>${escapeHtml(lotRow.lotNo || "미지정")}</td>
                        <td>${escapeHtml(lotRow.expiryDate || "미지정")}${riskText}</td>
                        <td>${escapeHtml(lotRow.location || "미지정")}</td>
                        <td>${escapeHtml(lotRow.palletNo || "-")}</td>
                        <td>${formatMilkrunNumber(lotRow.quantity)}</td>
                        <td>${formatMilkrunNumber(lotRow.otherAllocatedQuantity)}</td>
                        <td>${formatMilkrunNumber(lotRow.maxQuantity)}</td>
                        <td>
                            <input class="order-management-allocation-quantity" type="number" min="0"
                                max="${lotRow.maxQuantity}" step="1" value="${lotRow.draftQuantity}"
                                data-order-allocation-lot-key="${encodedLotKey}" ${disabled ? "disabled" : ""}
                                aria-label="${escapeHtml(lotRow.productName || lotRow.skuKey)} ${escapeHtml(lotRow.lotNo || "LOT 미지정")} 할당 수량" />
                        </td>
                    </tr>
                `;
            }).join("");
        }
    }

    if (!preserveMessage) {
        if (!inventoryLedgerLoaded) {
            setOrderManagementAllocationMessage("재고 정보를 불러오는 중입니다.");
        } else if (!isMatched) {
            setOrderManagementAllocationMessage("먼저 주문 상품의 SKU 매칭을 완료해주세요.", "warning");
        } else if (isCancelled) {
            setOrderManagementAllocationMessage("취소 주문은 재고 할당 대상에서 제외됩니다.", "warning");
        } else if (isShipped) {
            setOrderManagementAllocationMessage("출고 완료 주문의 할당은 변경할 수 없습니다.", "warning");
        } else if (draftState.errors.length) {
            setOrderManagementAllocationMessage(draftState.errors[0], "error");
        } else if (draftState.shortageQuantity > 0) {
            setOrderManagementAllocationMessage(`실재고가 부족한 ${formatMilkrunNumber(draftState.shortageQuantity)}개는 입고대기 할당으로 저장됩니다.`, "warning");
        } else {
            setOrderManagementAllocationMessage("LOT·유통기한·로케이션별 수량을 확인한 뒤 할당 변경을 저장하세요.");
        }
    }

    if (orderManagementAllocationAutoBtn) {
        orderManagementAllocationAutoBtn.disabled = isLocked
            || !inventoryAllocationPolicyLoaded
            || orderManagementAllocationSaving;
    }
    if (orderManagementAllocationReleaseBtn) {
        orderManagementAllocationReleaseBtn.disabled = isLocked
            || orderManagementAllocationSaving
            || ![...orderManagementAllocationDraft.values()].some((quantity) => quantity > 0);
    }
    if (orderManagementAllocationSaveBtn) {
        orderManagementAllocationSaveBtn.disabled = isLocked || !draftState.isValid || orderManagementAllocationSaving;
        orderManagementAllocationSaveBtn.textContent = orderManagementAllocationSaving ? "저장 중..." : "할당 변경 저장";
    }
}

async function prepareOrderManagementAllocationEditor(rowId) {
    const row = orderManagementRows.find((item) => item.id === rowId);
    if (!row) return;
    initializeOrderManagementAllocationDraft(row);
    renderOrderManagementAllocationEditor();
    await Promise.all([
        ensureInventoryAllocationPolicyLoaded(),
        loadInventoryLedger(getCloudDataUserId(), { render: false, announce: false, preserveOnError: true }),
    ]);
    if (editingOrderManagementId !== rowId) return;
    const refreshedRow = orderManagementRows.find((item) => item.id === rowId);
    initializeOrderManagementAllocationDraft(refreshedRow);
    syncOrderManagementDetailStateControls();
}

function handleOrderManagementAllocationInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-order-allocation-lot-key]")) return;
    const lotKey = decodeURIComponent(target.getAttribute("data-order-allocation-lot-key") || "");
    if (!lotKey) return;
    const quantity = Math.max(0, Math.trunc(Number(target.value) || 0));
    orderManagementAllocationDraft.set(lotKey, quantity);
    renderOrderManagementAllocationEditor();
}

async function handleFillOrderManagementAllocationByPolicy() {
    const baseRow = orderManagementRows.find((row) => row.id === editingOrderManagementId);
    if (!baseRow) return;
    const row = getOrderManagementOperationalRows([baseRow])[0];
    await ensureInventoryAllocationPolicyLoaded();
    if (!inventoryAllocationPolicyLoaded) {
        setOrderManagementAllocationMessage("기본 할당 정책을 불러오지 못했습니다. 설정 화면을 확인한 뒤 다시 시도해주세요.", "error");
        return;
    }
    const lotRows = buildInventoryLotSnapshot(getInventorySnapshot().rows, inventoryTransactions).rows;
    const plan = buildAutomaticInventoryAllocationPlan(
        [row],
        lotRows,
        inventoryAllocations,
        inventoryAllocationPolicy,
    );
    orderManagementAllocationDraft = new Map();
    plan.allocations.forEach((allocation) => {
        if (allocation.allocationKind !== INVENTORY_ALLOCATION_KIND_STOCK) return;
        orderManagementAllocationDraft.set(
            allocation.lotKey,
            (orderManagementAllocationDraft.get(allocation.lotKey) || 0) + allocation.quantity,
        );
    });
    renderOrderManagementAllocationEditor();
    setOrderManagementAllocationMessage(
        plan.shortageQuantity > 0
            ? `기본 정책으로 실재고 ${formatMilkrunNumber(plan.allocatedQuantity)}개를 선택했습니다. 부족 ${formatMilkrunNumber(plan.shortageQuantity)}개는 저장 시 입고대기 할당됩니다.`
            : `기본 정책으로 필요수량 ${formatMilkrunNumber(plan.allocatedQuantity)}개를 모두 채웠습니다. 저장 버튼을 눌러 반영하세요.`,
        plan.shortageQuantity > 0 ? "warning" : "success",
    );
}

function handleReleaseOrderManagementAllocationDraft() {
    orderManagementAllocationDraft = new Map();
    renderOrderManagementAllocationEditor();
    setOrderManagementAllocationMessage("실재고 할당을 모두 해제했습니다. 저장하면 주문 필요수량 전체가 입고대기 할당됩니다.", "warning");
}

async function handleSaveOrderManagementAllocation() {
    if (orderManagementAllocationSaving || !editingOrderManagementId) return;
    const baseRow = orderManagementRows.find((row) => row.id === editingOrderManagementId);
    if (!baseRow) return;
    const row = getOrderManagementOperationalRows([baseRow])[0];
    const editorRows = getOrderManagementAllocationEditorRows(row);
    const draftState = getOrderManagementAllocationDraftState(row, editorRows);
    if (!draftState.isValid) {
        setOrderManagementAllocationMessage(draftState.errors[0] || "할당 수량을 확인해주세요.", "error");
        return;
    }
    if (normalizeShippingStatus(row.shippingStatus, row.status) === "picking") {
        if (draftState.shortageQuantity > 0) {
            window.alert("피킹중 주문은 실재고 완전 할당 상태를 유지해야 합니다. 부족수량을 모두 할당하거나 출고 상태를 출고대기로 변경해주세요.");
            return;
        }
        if (!window.confirm("피킹이 시작된 주문입니다. 실재고 완전 할당을 유지한 채 LOT 배정을 변경할까요?")) return;
    }

    const draftQuantities = new Map(
        [...orderManagementAllocationDraft.entries()]
            .map(([lotKey, quantity]) => [lotKey, Math.max(0, Math.trunc(Number(quantity) || 0))]),
    );
    orderManagementAllocationSaving = true;
    renderOrderManagementAllocationEditor();
    setOrderManagementAllocationMessage("최신 재고와 다른 주문의 할당을 확인하고 있습니다.");

    try {
        const result = await replaceOrderLineInventoryAllocations(
            [row],
            (context) => {
                const capacityRows = buildInventoryAllocationCapacityRows(
                    context.lotRows,
                    context.allocations,
                    { excludeOrderLineIds: [row.orderLineId] },
                );
                const capacityByLotKey = new Map(capacityRows.map((lotRow) => [lotRow.lotKey, lotRow]));
                const requirements = getOrderLineSkuRequirements(row);
                const requirementBySkuKey = new Map(requirements.map((item) => [item.skuKey, item]));
                const currentOwnByLotKey = new Map();
                getActiveAllocationsForOrderLine(row.orderLineId, context.allocations)
                    .filter((allocation) => allocation.allocationKind === INVENTORY_ALLOCATION_KIND_STOCK)
                    .forEach((allocation) => {
                    currentOwnByLotKey.set(
                        allocation.lotKey,
                        (currentOwnByLotKey.get(allocation.lotKey) || 0) + allocation.quantity,
                    );
                    });
                const allocations = [];
                draftQuantities.forEach((quantity, lotKey) => {
                    if (quantity <= 0) return;
                    const lotRow = capacityByLotKey.get(lotKey);
                    if (!lotRow) {
                        const error = new Error("선택한 보관재고가 이동되었습니다. 상세 화면을 다시 열어주세요.");
                        error.code = "inventory/allocation-lot-stale";
                        throw error;
                    }
                    const requirement = requirementBySkuKey.get(lotRow.skuKey);
                    if (!requirement) {
                        const error = new Error("주문의 SKU 구성이 변경되었습니다.");
                        error.code = "inventory/allocation-invalid";
                        throw error;
                    }
                    const currentOwnQuantity = currentOwnByLotKey.get(lotKey) || 0;
                    if (lotRow.expiryState === "expired" && quantity > currentOwnQuantity) {
                        const error = new Error("기한이 지난 재고는 새로 할당할 수 없습니다.");
                        error.code = "inventory/allocation-expired";
                        throw error;
                    }
                    allocations.push({
                        orderId: row.orderId || row.id,
                        orderCode: row.orderCode,
                        orderLineId: row.orderLineId,
                        skuKey: requirement.skuKey,
                        skuRowId: requirement.skuRowId || lotRow.skuRowId,
                        adminProductCode: requirement.adminProductCode || lotRow.adminProductCode,
                        productName: requirement.productName || lotRow.productName,
                        quantity,
                        allocationKind: INVENTORY_ALLOCATION_KIND_STOCK,
                        lotNo: lotRow.lotNo,
                        expiryDate: lotRow.expiryDate,
                        location: lotRow.location,
                        palletNo: lotRow.palletNo,
                        lotKey: lotRow.lotKey,
                    });
                });
                const stockAllocatedBySkuKey = new Map();
                allocations.forEach((allocation) => {
                    stockAllocatedBySkuKey.set(
                        allocation.skuKey,
                        (stockAllocatedBySkuKey.get(allocation.skuKey) || 0) + allocation.quantity,
                    );
                });
                requirements.forEach((requirement) => {
                    const shortageQuantity = Math.max(
                        0,
                        requirement.requiredQuantity - (stockAllocatedBySkuKey.get(requirement.skuKey) || 0),
                    );
                    if (shortageQuantity <= 0) return;
                    allocations.push({
                        orderId: row.orderId || row.id,
                        orderCode: row.orderCode,
                        orderLineId: row.orderLineId,
                        skuKey: requirement.skuKey,
                        skuRowId: requirement.skuRowId,
                        adminProductCode: requirement.adminProductCode,
                        productName: requirement.productName,
                        quantity: shortageQuantity,
                        allocationKind: INVENTORY_ALLOCATION_KIND_SHORTAGE,
                    });
                });
                const allocatedQuantity = [...stockAllocatedBySkuKey.values()]
                    .reduce((sum, quantity) => sum + quantity, 0);
                const requiredQuantity = requirements.reduce((sum, item) => sum + item.requiredQuantity, 0);
                return {
                    allocations,
                    requiredQuantity,
                    allocatedQuantity,
                    shortageAllocatedQuantity: Math.max(0, requiredQuantity - allocatedQuantity),
                    plannedAllocatedQuantity: requiredQuantity,
                    shortageQuantity: Math.max(0, requiredQuantity - allocatedQuantity),
                };
            },
            { source: "manual", releaseReason: "manual_reallocation" },
        );
        orderManagementAllocationSaving = false;
        initializeOrderManagementAllocationDraft(row);
        const refreshedRow = getOrderManagementOperationalRows([baseRow])[0];
        if (orderManagementDetailGridEl) {
            orderManagementDetailGridEl.innerHTML = getOrderManagementDetailItems(refreshedRow).map(([label, value]) => `
                <div class="order-management-detail-item">
                    <span>${escapeHtml(label)}</span>
                    <strong title="${escapeHtml(value || "")}">${escapeHtml(value || "-")}</strong>
                </div>
            `).join("");
        }
        if (orderManagementDetailAllocationStatusEl) {
            orderManagementDetailAllocationStatusEl.innerHTML = renderOrderAllocationStatus(refreshedRow);
        }
        syncOrderManagementDetailStateControls();
        renderOrderManagementAllocationEditor({ preserveMessage: true });
        setOrderManagementAllocationMessage(
            result.unchanged
                ? "기존 할당과 동일하여 별도 변경 없이 유지했습니다."
                : (result.shortageQuantity > 0
                    ? `할당 변경을 저장했습니다. 부족 ${formatMilkrunNumber(result.shortageQuantity)}개는 입고대기 할당으로 반영했습니다.`
                    : "할당 변경을 저장했습니다."),
            result.shortageQuantity > 0 ? "warning" : "success",
        );
    } catch (error) {
        console.error("주문 재고 할당 저장에 실패했습니다.", error);
        orderManagementAllocationSaving = false;
        renderOrderManagementAllocationEditor({ preserveMessage: true });
        setOrderManagementAllocationMessage(
            error?.code === "permission-denied"
                ? "재고 할당 저장 권한이 없습니다."
                : (error?.message || "할당을 저장하지 못했습니다. 최신 재고를 확인한 뒤 다시 시도해주세요."),
            "error",
        );
    }
}

function closeOrderManagementDetail() {
    editingOrderManagementId = "";
    orderManagementAllocationDraft = new Map();
    orderManagementAllocationSearch = "";
    if (orderManagementAllocationSearchInput) orderManagementAllocationSearchInput.value = "";
    if (orderManagementDetailSaveBtn) {
        orderManagementDetailSaveBtn.disabled = false;
        orderManagementDetailSaveBtn.textContent = "저장";
    }
    orderManagementDetailModal?.classList.add("is-hidden");
    orderManagementDetailModal?.setAttribute("aria-hidden", "true");
}

function syncOrderManagementDetailStateControls() {
    const isCancelled = orderManagementDetailOrderStatusSelect?.value === "cancelled";
    const baseRow = orderManagementRows.find((row) => row.id === editingOrderManagementId);
    const operationalRow = baseRow ? getOrderManagementOperationalRows([baseRow])[0] : null;
    const isFullyAllocated = isOrderManagementFullyAllocated(operationalRow);
    if (orderManagementDetailShippingStatusSelect) {
        if (isCancelled) orderManagementDetailShippingStatusSelect.value = "waiting";
        orderManagementDetailShippingStatusSelect.disabled = isCancelled;
        [...orderManagementDetailShippingStatusSelect.options].forEach((option) => {
            if (option.value === "waiting") return;
            option.disabled = !isFullyAllocated;
        });
        orderManagementDetailShippingStatusSelect.title = isCancelled
            ? "취소 주문은 출고 대상에서 제외됩니다."
            : (!isFullyAllocated
                ? "모든 SKU가 실재고로 완전히 할당되어야 피킹·출고할 수 있습니다."
                : "재고 할당이 완료되어 출고 상태를 변경할 수 있습니다.");
    }
    if (orderManagementDetailShippingHelpEl) {
        orderManagementDetailShippingHelpEl.textContent = isCancelled
            ? "취소 주문은 출고할 수 없습니다."
            : (isFullyAllocated
                ? "실재고 할당 완료 · 피킹 및 출고 가능"
                : "실재고 완전 할당 전에는 피킹·출고가 차단됩니다.");
        orderManagementDetailShippingHelpEl.className = `order-management-shipping-help ${
            !isCancelled && isFullyAllocated ? "is-ready" : "is-warning"
        }`;
    }
    renderOrderManagementAllocationEditor();
}

function getOrderManagementDetailItems(row) {
    const privacyExpired = isOrderManagementPrivacyExpired(row);
    const privacyStatus = privacyExpired
        ? `보관 만료${row.privacyPurgedAt ? ` (${formatOrderManagementDate(row.privacyPurgedAt)})` : ""}`
        : `보관 중 (~${row.privacyExpiresAt || "-"})`;

    return [
        ["판매처", row.channelName],
        ["주문번호", row.orderCode],
        ["상품명", row.productName],
        ["주문 상태", getOrderStatusMeta(row.orderStatus).label],
        ["재고 할당 상태", getAllocationStatusMeta(row.allocationState?.status).label],
        ["실재고 할당수량", row.allocationState?.requiredQuantity > 0
            ? `${getOrderManagementQuantityText(row.allocationState.allocatedQuantity)} / ${getOrderManagementQuantityText(row.allocationState.requiredQuantity)}`
            : "-"],
        ["입고대기 할당수량", row.allocationState?.requiredQuantity > 0
            ? getOrderManagementQuantityText(row.allocationState.shortageAllocatedQuantity)
            : "-"],
        ["출고 상태", getShippingStatusMeta(row.shippingStatus).label],
        ...(row.legacyStatus && row.legacyStatus !== row.status
            ? [["이전 통합 상태", row.legacyStatus]]
            : []),
        ["주문수량", getOrderManagementQuantityText(row.orderedQuantity)],
        ["할당대상수량", getOrderManagementQuantityText(row.allocatableQuantity)],
        ["SKU 연결 상태", getOrderLineMatchMeta(row.matchStatus).label],
        ["연결 SKU · 필요수량", getOrderLineSkuSummary(row)],
        ["총 필요 SKU 수량", getOrderManagementQuantityText(getOrderLineRequiredQuantity(row))],
        ["주문일", formatOrderManagementDate(getOrderManagementOrderDate(row))],
        ["수령자", row.recipientName || (privacyExpired ? "보관 만료" : "")],
        ["수령자 전화번호", row.recipientPhone || maskCrmKey(row.recipientKey)],
        ["수령자 주소", row.recipientAddress || (privacyExpired ? "보관 만료" : "")],
        ["배송메모", row.deliveryMemo],
        ["고객키", maskCrmKey(row.customerKey || row.recipientKey || row.ordererKey)],
        ["개인정보 상태", privacyStatus],
        ["원본파일명", row.sourceFileName],
    ];
}

function openOrderManagementDetail(rowId) {
    const baseRow = orderManagementRows.find((item) => item.id === rowId);
    const row = baseRow ? getOrderManagementOperationalRows([baseRow])[0] : null;
    if (!row || !orderManagementDetailModal) return;

    editingOrderManagementId = row.id;
    if (orderManagementDetailMetaEl) {
        orderManagementDetailMetaEl.textContent = `${row.channelName || "판매처 미지정"} · ${row.orderCode || "주문번호 없음"}`;
    }

    if (orderManagementDetailGridEl) {
        orderManagementDetailGridEl.innerHTML = getOrderManagementDetailItems(row).map(([label, value]) => `
            <div class="order-management-detail-item">
                <span>${escapeHtml(label)}</span>
                <strong title="${escapeHtml(value || "")}">${escapeHtml(value || "-")}</strong>
            </div>
        `).join("");
    }

    if (orderManagementDetailOrderStatusSelect) {
        orderManagementDetailOrderStatusSelect.value = normalizeOrderStatus(row.orderStatus, row.status);
    }
    if (orderManagementDetailShippingStatusSelect) {
        orderManagementDetailShippingStatusSelect.value = normalizeShippingStatus(row.shippingStatus, row.status);
    }
    syncOrderManagementDetailStateControls();
    if (orderManagementDetailAllocationStatusEl) {
        orderManagementDetailAllocationStatusEl.innerHTML = renderOrderAllocationStatus(row);
    }
    if (orderManagementDetailCourierInput) orderManagementDetailCourierInput.value = row.courierName || "";
    if (orderManagementDetailInvoiceInput) orderManagementDetailInvoiceInput.value = row.invoiceNo || "";
    if (orderManagementDetailCsInput) orderManagementDetailCsInput.value = row.cs || "";

    orderManagementDetailModal.classList.remove("is-hidden");
    orderManagementDetailModal.setAttribute("aria-hidden", "false");
    void prepareOrderManagementAllocationEditor(row.id);
}

async function handleSaveOrderManagementDetail() {
    if (!editingOrderManagementId) return;

    const rowIndex = orderManagementRows.findIndex((row) => row.id === editingOrderManagementId);
    if (rowIndex < 0) return;

    const currentRow = orderManagementRows[rowIndex];
    const nextOrderStatus = normalizeOrderStatus(
        orderManagementDetailOrderStatusSelect?.value || currentRow.orderStatus,
        currentRow.status,
    );
    const nextShippingStatus = normalizeShippingStatus(
        orderManagementDetailShippingStatusSelect?.value || currentRow.shippingStatus,
        currentRow.status,
    );
    const operationalRow = getOrderManagementOperationalRows([currentRow])[0];
    if (nextShippingStatus !== "waiting" && !isOrderManagementFullyAllocated(operationalRow)) {
        const state = operationalRow?.allocationState;
        const shortageText = state?.shortageQuantity > 0
            ? ` 부족수량 ${formatMilkrunNumber(state.shortageQuantity)}개가 남아 있습니다.`
            : " 재고 할당을 먼저 실행해주세요.";
        window.alert(`모든 SKU가 실재고로 완전히 할당된 주문만 피킹·출고할 수 있습니다.${shortageText}`);
        if (orderManagementDetailShippingStatusSelect) {
            orderManagementDetailShippingStatusSelect.value = "waiting";
        }
        syncOrderManagementDetailStateControls();
        return;
    }
    if (nextOrderStatus === "cancelled" && nextShippingStatus === "shipped") {
        window.alert("출고 완료된 주문은 바로 취소할 수 없습니다. 출고 상태를 출고대기로 변경한 뒤 저장해주세요.");
        return;
    }
    if (orderManagementDetailSaveBtn) {
        orderManagementDetailSaveBtn.disabled = true;
        orderManagementDetailSaveBtn.textContent = "저장 중...";
    }
    if (nextOrderStatus === "cancelled") {
        try {
            await releaseOrderLineInventoryAllocations([currentRow], "order_cancelled");
        } catch (error) {
            console.error("주문 취소 전 재고 할당 해제에 실패했습니다.", error);
            window.alert(`재고 할당을 해제하지 못해 주문 상태를 변경하지 않았습니다.\n\n${error?.message || "잠시 후 다시 시도해주세요."}`);
            if (orderManagementDetailSaveBtn) {
                orderManagementDetailSaveBtn.disabled = false;
                orderManagementDetailSaveBtn.textContent = "저장";
            }
            return;
        }
    }
    const nowIso = new Date().toISOString();
    const nextRow = {
        ...currentRow,
        orderStatus: nextOrderStatus,
        shippingStatus: nextShippingStatus,
        ...(nextOrderStatus !== currentRow.orderStatus ? { orderStatusUpdatedAt: nowIso } : {}),
        ...(nextShippingStatus !== currentRow.shippingStatus ? { shippingStatusUpdatedAt: nowIso } : {}),
        courierName: orderManagementDetailCourierInput?.value.trim() || "",
        invoiceNo: orderManagementDetailInvoiceInput?.value.trim() || "",
        cs: orderManagementDetailCsInput?.value.trim() || "",
        updatedAt: nowIso,
    };
    orderManagementRows[rowIndex] = standardizeOrderManagementRow(nextRow, rowIndex, {
        cancelledQuantity: nextOrderStatus === "cancelled" ? nextRow.orderedQuantity : 0,
    });
    const savedToCloud = await saveOrderManagementRowsToLocal();
    renderOrderManagement();
    closeOrderManagementDetail();
    if (!savedToCloud) {
        window.alert("주문 변경은 현재 브라우저에 저장했지만 서버 동기화에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 저장해주세요.");
    }
}

function getOrderManagementRowById(rowId) {
    const targetId = String(rowId ?? "");
    if (!targetId) return null;
    return orderManagementRows.find((row) => String(row.id) === targetId) || null;
}

function getComparableOrderIdentityValue(value) {
    return normalizeOrderProductName(value);
}

function getComparableOrderCustomerKey(row) {
    return String(row?.customerKey || row?.recipientKey || row?.ordererKey || "").trim();
}

function doesOrderUploadRowMatchManagedOrder(row, targetRow, index = 0) {
    if (!row || !targetRow) return false;

    const candidateRow = buildOrderManagementRow({
        ...row,
        channel: row.channel || targetRow.channel || "",
        channelName: row.channelName || targetRow.channelName || "",
        sourceFileName: row.sourceFileName || targetRow.sourceFileName || "",
    }, index);
    if (String(candidateRow.id) === String(targetRow.id)) return true;

    const sourceChannel = normalizeOrderChannel(candidateRow.channel)
        || getComparableOrderIdentityValue(candidateRow.channelName);
    const targetChannel = normalizeOrderChannel(targetRow.channel)
        || getComparableOrderIdentityValue(targetRow.channelName);
    const sameChannel = sourceChannel && targetChannel && sourceChannel === targetChannel;

    const sourceOrderCode = getComparableOrderIdentityValue(candidateRow.orderCode || candidateRow.managementId);
    const targetOrderCode = getComparableOrderIdentityValue(targetRow.orderCode || targetRow.managementId);
    const sameOrderCode = sourceOrderCode && targetOrderCode && sourceOrderCode === targetOrderCode;

    const sourceProduct = getComparableOrderIdentityValue(candidateRow.productName);
    const targetProduct = getComparableOrderIdentityValue(targetRow.productName);
    const sameProduct = sourceProduct && targetProduct && sourceProduct === targetProduct;

    const sourceRowId = String(candidateRow.sourceRowId || row.rowId || "").trim();
    const targetRowId = String(targetRow.sourceRowId || "").trim();
    const sameSourceRow = sourceRowId && targetRowId && sourceRowId === targetRowId;

    const sourceFile = getComparableOrderIdentityValue(candidateRow.sourceFileName);
    const targetFile = getComparableOrderIdentityValue(targetRow.sourceFileName);
    const sameFile = sourceFile && targetFile && sourceFile === targetFile;

    const sourceCustomerKey = getComparableOrderCustomerKey(candidateRow);
    const targetCustomerKey = getComparableOrderCustomerKey(targetRow);
    const sameCustomerKey = sourceCustomerKey && targetCustomerKey && sourceCustomerKey === targetCustomerKey;

    const sourceRecipientName = getComparableOrderIdentityValue(candidateRow.recipientName);
    const targetRecipientName = getComparableOrderIdentityValue(targetRow.recipientName);
    const sameRecipientName = sourceRecipientName && targetRecipientName && sourceRecipientName === targetRecipientName;
    const sameCustomer = sameCustomerKey || sameRecipientName || (!targetCustomerKey && !targetRecipientName);

    return Boolean(sameChannel
        && sameProduct
        && (sameSourceRow || sameOrderCode || sameFile)
        && (sameCustomer || sameSourceRow));
}

function removeOrderUploadRowsForManagedOrder(targetRow) {
    return removeOrderUploadRowsForManagedOrders([targetRow]);
}

function removeOrderUploadRowsForManagedOrders(targetRows) {
    const rowsToRemove = (targetRows ?? []).filter(Boolean);
    if (!rowsToRemove.length) return 0;

    const beforeCount = orderUploadRows.length;
    orderUploadRows = orderUploadRows.filter((row, index) => (
        !rowsToRemove.some((targetRow) => doesOrderUploadRowMatchManagedOrder(row, targetRow, index))
    ));
    const removedCount = beforeCount - orderUploadRows.length;
    if (removedCount > 0) invalidateOrderProductCandidateCache();
    return removedCount;
}

async function removeCrmRowsForManagedOrder(targetRow) {
    return removeCrmRowsForManagedOrders([targetRow]);
}

async function removeCrmRowsForManagedOrders(targetRows) {
    const rowsToRemove = (targetRows ?? []).filter(Boolean);
    if (!rowsToRemove.length) return 0;

    const previousRows = crmRows;
    rebuildCrmRowsFromSources();
    const removedCount = Math.max(0, previousRows.length - crmRows.length);
    renderCrmDashboard();
    return removedCount;
}

function getDerivedWorkspaceFileLabel(channelKey, fileName = "") {
    return channelKey === "kurly"
        ? getKurlyLabelWorkspaceLabel(fileName)
        : getMilkrunWorkspaceLabel(fileName);
}

function getManagedOrdersForDerivedWorkspaces(channelKey, workspaces = []) {
    const sourceFileNames = new Set();
    const workspaceLabels = new Set();

    workspaces.forEach((workspace) => {
        const sourceFileName = String(workspace?.sourceFileName || "").trim();
        const workspaceLabel = String(workspace?.title || "").trim();
        if (sourceFileName) sourceFileNames.add(sourceFileName);
        if (workspaceLabel) workspaceLabels.add(workspaceLabel);
    });

    return orderManagementRows.filter((row) => {
        if (row?.channel !== channelKey) return false;
        const sourceFileName = String(row?.sourceFileName || "").trim();
        if (!sourceFileName) return false;
        return sourceFileNames.has(sourceFileName)
            || workspaceLabels.has(getDerivedWorkspaceFileLabel(channelKey, sourceFileName));
    });
}

async function deleteManagedOrdersForDerivedWorkspaces(channelKey, workspaces = []) {
    const targetRows = getManagedOrdersForDerivedWorkspaces(channelKey, workspaces);
    if (!targetRows.length) {
        return {
            orderCount: 0,
            uploadRowCount: 0,
            crmCount: 0,
            crmDeleteFailed: false,
        };
    }

    try {
        await releaseOrderLineInventoryAllocations(targetRows, "order_deleted");
    } catch (error) {
        console.error("발주서 삭제 전 재고 할당 해제에 실패했습니다.", error);
        window.alert(`재고 할당을 해제하지 못해 발주서를 삭제하지 않았습니다.\n\n${error?.message || "잠시 후 다시 시도해주세요."}`);
        return {
            aborted: true,
            orderCount: 0,
            uploadRowCount: 0,
            crmCount: 0,
            crmDeleteFailed: false,
        };
    }

    const targetIds = new Set(targetRows.map((row) => String(row.id)));
    orderManagementRows = orderManagementRows.filter((row) => !targetIds.has(String(row.id)));
    targetIds.forEach((rowId) => selectedOrderManagementIds.delete(rowId));
    const uploadRowCount = removeOrderUploadRowsForManagedOrders(targetRows);
    await saveOrderManagementRowsToLocal();

    let crmCount = 0;
    let crmDeleteFailed = false;
    try {
        crmCount = await removeCrmRowsForManagedOrders(targetRows);
    } catch (error) {
        crmDeleteFailed = true;
        console.warn("Failed to delete CRM rows related to derived workspaces.", error);
        setCrmUploadStatus("CRM 자동 반영 데이터 정리 중 오류가 있었습니다.", "warning");
    }

    if (!orderManagementRows.some((row) => row.channel === channelKey)
        && !orderUploadRows.some((row) => row.channel === channelKey)) {
        setOrderUploadChannelStatus(channelKey, "대기 중", "idle", {
            sourceFileName: "",
            rowCount: 0,
            uploadedAt: "",
        });
        renderOrderUploadChannels();
    }

    if (targetIds.has(String(editingOrderManagementId))) closeOrderManagementDetail();
    renderOrderManagement();
    renderOrderMatchPanel();

    return {
        orderCount: targetRows.length,
        uploadRowCount,
        crmCount,
        crmDeleteFailed,
    };
}

async function handleDeleteOrderManagementRow(rowId) {
    const targetRow = getOrderManagementRowById(rowId);
    if (!targetRow) return;

    const message = [
        "\uC8FC\uBB38\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?",
        "",
        `${targetRow.channelName || "-"} / ${targetRow.orderCode || "-"}`,
        targetRow.productName || "-",
        "",
        "\uC8FC\uBB38\uAD00\uB9AC\uC640 \uC790\uB3D9 \uBC18\uC601\uB41C CRM \uB370\uC774\uD130\uC5D0\uC11C \uC81C\uAC70\uB429\uB2C8\uB2E4.",
    ].join("\n");

    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;

    try {
        await releaseOrderLineInventoryAllocations([targetRow], "order_deleted");
    } catch (error) {
        console.error("주문 삭제 전 재고 할당 해제에 실패했습니다.", error);
        window.alert(`재고 할당을 해제하지 못해 주문을 삭제하지 않았습니다.\n\n${error?.message || "잠시 후 다시 시도해주세요."}`);
        return;
    }

    orderManagementRows = orderManagementRows.filter((row) => String(row.id) !== String(targetRow.id));
    selectedOrderManagementIds.delete(String(targetRow.id));
    const removedUploadRows = removeOrderUploadRowsForManagedOrder(targetRow);
    saveOrderManagementRowsToLocal();

    let removedCrmRows = 0;
    let crmDeleteFailed = false;
    try {
        removedCrmRows = await removeCrmRowsForManagedOrder(targetRow);
    } catch (error) {
        crmDeleteFailed = true;
        console.warn("Failed to delete CRM rows related to order.", error);
        setCrmUploadStatus("CRM \uC790\uB3D9 \uBC18\uC601 \uB370\uC774\uD130 \uC815\uB9AC \uC911 \uC624\uB958\uAC00 \uC788\uC5C8\uC2B5\uB2C8\uB2E4.", "warning");
    }

    if (editingOrderManagementId === targetRow.id) closeOrderManagementDetail();
    renderOrderManagement();
    renderOrderMatchPanel();

    if (orderManagementStatusEl) {
        const resultParts = ["\uC8FC\uBB38 1\uAC74\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4."];
        if (removedUploadRows) {
            resultParts.push(`\uC5C5\uB85C\uB4DC \uC784\uC2DC \uB370\uC774\uD130 ${formatMilkrunNumber(removedUploadRows)}\uAC74\uB3C4 \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.`);
        }
        if (removedCrmRows) {
            resultParts.push(`CRM \uC790\uB3D9 \uBC18\uC601 \uB370\uC774\uD130 ${formatMilkrunNumber(removedCrmRows)}\uAC74\uB3C4 \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.`);
        }
        if (crmDeleteFailed) {
            resultParts.push("CRM \uC800\uC7A5\uC18C \uC815\uB9AC\uB294 \uB2E4\uC2DC \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4.");
        }
        orderManagementStatusEl.textContent = resultParts.join(" ");
    }
}

async function handleBulkDeleteOrderManagementRows({ skipConfirm = false } = {}) {
    const targetRows = getSelectedOrderManagementRows();
    if (!targetRows.length) {
        syncOrderManagementBulkControls(getFilteredOrderManagementRows());
        return;
    }

    const message = [
        `선택한 주문 ${formatMilkrunNumber(targetRows.length)}건을 삭제할까요?`,
        "",
        "주문관리와 자동 반영된 CRM 데이터에서 제거됩니다.",
        "CRM 과거데이터와 저장된 상품 매칭은 삭제하지 않습니다.",
    ].join("\n");

    if (!skipConfirm && typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;

    try {
        await releaseOrderLineInventoryAllocations(targetRows, "order_deleted");
    } catch (error) {
        console.error("주문 일괄 삭제 전 재고 할당 해제에 실패했습니다.", error);
        window.alert(`재고 할당을 해제하지 못해 주문을 삭제하지 않았습니다.\n\n${error?.message || "주문을 나누어 다시 시도해주세요."}`);
        return;
    }

    const targetIds = new Set(targetRows.map((row) => String(row.id)));
    orderManagementRows = orderManagementRows.filter((row) => !targetIds.has(String(row.id)));
    targetIds.forEach((rowId) => selectedOrderManagementIds.delete(rowId));
    const removedUploadRows = removeOrderUploadRowsForManagedOrders(targetRows);
    saveOrderManagementRowsToLocal();

    let removedCrmRows = 0;
    let crmDeleteFailed = false;
    try {
        removedCrmRows = await removeCrmRowsForManagedOrders(targetRows);
    } catch (error) {
        crmDeleteFailed = true;
        console.warn("Failed to delete CRM rows related to selected orders.", error);
        setCrmUploadStatus("CRM 자동 반영 데이터 정리 중 오류가 있었습니다.", "warning");
    }

    if (targetIds.has(String(editingOrderManagementId))) closeOrderManagementDetail();
    renderOrderManagement();
    renderOrderMatchPanel();

    if (orderManagementStatusEl) {
        const resultParts = [`주문 ${formatMilkrunNumber(targetRows.length)}건을 삭제했습니다.`];
        if (removedUploadRows) {
            resultParts.push(`업로드 임시 데이터 ${formatMilkrunNumber(removedUploadRows)}건도 정리했습니다.`);
        }
        if (removedCrmRows) {
            resultParts.push(`CRM 자동 반영 데이터 ${formatMilkrunNumber(removedCrmRows)}건도 정리했습니다.`);
        }
        if (crmDeleteFailed) {
            resultParts.push("CRM 저장소 정리는 다시 확인해야 합니다.");
        }
        orderManagementStatusEl.textContent = resultParts.join(" ");
    }
}

async function handleDeleteAllOrderManagementRows() {
    const totalCount = orderManagementRows.length;
    if (!totalCount) return;

    const message = [
        `\uC800\uC7A5\uB41C \uC8FC\uBB38 ${formatMilkrunNumber(totalCount)}\uAC74\uC744 \uC804\uCCB4 \uC0AD\uC81C\uD560\uAE4C\uC694?`,
        "",
        "\uD604\uC7AC \uAC80\uC0C9\uC5B4\uC640 \uD544\uD130 \uC870\uAC74\uACFC \uAD00\uACC4\uC5C6\uC774 \uC800\uC7A5\uB41C \uC8FC\uBB38\uC744 \uBAA8\uB450 \uC0AD\uC81C\uD569\uB2C8\uB2E4.",
        "\uC8FC\uBB38 \uAD00\uB9AC\uC640 \uC790\uB3D9 \uBC18\uC601\uB41C CRM \uB370\uC774\uD130\uC5D0\uC11C \uC81C\uAC70\uB429\uB2C8\uB2E4.",
        "CRM \uACFC\uAC70\uB370\uC774\uD130\uC640 \uC800\uC7A5\uB41C \uC0C1\uD488 \uB9E4\uCE6D\uC740 \uC0AD\uC81C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    ].join("\n");

    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;

    selectedOrderManagementIds = new Set(orderManagementRows.map((row) => String(row.id)));
    await handleBulkDeleteOrderManagementRows({ skipConfirm: true });
}
function parseCrmNumericValue(value) {
    const normalized = String(value ?? "")
        .replace(/,/g, "")
        .replace(/[^\d.-]/g, "");

    if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return Number.NaN;
    return Number(normalized);
}

function getOrderTimeTextForCrm(row) {
    const timeSource = String(row?.orderDateTime || row?.orderDate || "").trim();
    const timeMatch = timeSource.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!timeMatch) return "";

    const hour = String(timeMatch[1]).padStart(2, "0");
    const minute = String(timeMatch[2]).padStart(2, "0");
    const second = timeMatch[3] ? `:${String(timeMatch[3]).padStart(2, "0")}` : "";
    return `${hour}:${minute}${second}`;
}

function getCrmOrderDateFromOrderRow(row) {
    const orderDate = formatOrderManagementDate(row?.orderDateTime || row?.orderDate || "");
    return orderDate === "-" ? "" : orderDate;
}

function validateAutoCrmRow(row) {
    const errors = [];
    if (!row.orderDate) errors.push("주문일이 비어 있습니다.");
    if (!row.orderCode) errors.push("주문번호가 비어 있습니다.");
    if (!row.channelName) errors.push("판매처가 비어 있습니다.");
    if (!row.productName) errors.push("상품명이 비어 있습니다.");
    if (!row.recipientKey) errors.push("수령자 키가 비어 있습니다.");
    if (Number.isNaN(row.quantityNumber) || row.quantityNumber <= 0) {
        errors.push("수량이 올바르지 않습니다.");
    }
    return errors;
}

function buildCrmRowFromOrderRow(row, index = 0) {
    const orderRow = row?.id ? row : buildOrderManagementRow(row, index);
    const orderDate = getCrmOrderDateFromOrderRow(orderRow);
    const orderTime = getOrderTimeTextForCrm(orderRow);
    const quantity = String(orderRow.quantity ?? "").trim();
    const salePrice = String(orderRow.salePrice ?? "").trim();
    const paymentAmount = String(orderRow.paymentAmount ?? "").trim();
    const orderCode = String(orderRow.orderCode || orderRow.managementId || orderRow.id || "").trim();

    const crmRow = {
        rowId: orderRow.id || orderRow.rowId || orderRow.sourceRowId || `order-upload-${index + 1}`,
        orderDate,
        orderTime,
        orderDateTime: [orderDate, orderTime].filter(Boolean).join(" "),
        orderCode,
        productCode: orderRow.productCode || orderRow.marketplaceProductCode || orderRow.barcode || "",
        barcode: orderRow.barcode || "",
        channelName: orderRow.channelName || getOrderUploadChannelLabel(orderRow.channel || ""),
        status: orderRow.status || "",
        marketplaceProductName: orderRow.productName || "",
        marketplaceOption: "",
        productName: orderRow.productName || "",
        quantity,
        quantityNumber: parseCrmNumericValue(quantity),
        salePrice,
        salePriceNumber: parseCrmNumericValue(salePrice),
        paymentAmount,
        paymentAmountNumber: parseCrmNumericValue(paymentAmount),
        ordererId: "",
        ordererKey: orderRow.ordererKey || "",
        recipientKey: orderRow.recipientKey || orderRow.customerKey || "",
        sourceFileName: orderRow.sourceFileName || "발주서 업로드",
        sourceType: "order-upload",
    };
    const errors = validateAutoCrmRow(crmRow);

    return {
        ...crmRow,
        errors,
        isValid: errors.length === 0,
    };
}

function getCrmRowMergeKey(row, index = 0) {
    const customerKey = String(row?.recipientKey || "").trim();
    const orderKey = normalizeOrderProductName(row?.orderCode || row?.rowId || "");
    const productKey = normalizeOrderProductName(row?.productCode || row?.barcode || row?.productName || "");
    const dateKey = String(row?.orderDate || "").trim();
    const channelKey = normalizeOrderProductName(row?.channelName || "");

    if (customerKey && (orderKey || productKey || dateKey)) {
        return [customerKey, dateKey, channelKey, orderKey, productKey].join("|");
    }

    return `legacy:${index}:${normalizeOrderProductName(row?.sourceFileName || "")}:${normalizeOrderProductName(row?.rowId || "")}`;
}

function updateCrmAutoSourceLabel(sourceRows) {
    const sourceNames = [...new Set((sourceRows ?? [])
        .map((row) => String(row.sourceFileName || "").trim())
        .filter(Boolean))];
    const autoLabel = sourceNames.length
        ? `발주서 자동 반영: ${sourceNames.slice(0, 2).join(", ")}${sourceNames.length > 2 ? ` 외 ${sourceNames.length - 2}개` : ""}`
        : "발주서 자동 반영";

    if (!crmSourceFileName) {
        crmSourceFileName = autoLabel;
    } else if (!crmSourceFileName.includes("발주서 자동 반영")) {
        crmSourceFileName = `${crmSourceFileName} + 발주서 자동 반영`;
    }
    updateSelectedFileName({ name: crmSourceFileName }, crmFileNameEl);
}

async function syncCrmRowsFromOrderUpload(rows) {
    const sourceRows = (rows ?? []).filter((row) => row && row.isValid !== false);
    const hasCustomerIdentity = sourceRows.some((row) => row.recipientPhone || row.recipientKey || row.ordererPhone || row.ordererKey);
    if (!sourceRows.length || !hasCustomerIdentity) {
        return { saved: false, reflected: 0, skipped: sourceRows.length };
    }

    const nextCrmRows = sourceRows.map(buildCrmRowFromOrderRow);
    const validCrmRows = nextCrmRows.filter((row) => row.isValid);
    const skippedCount = nextCrmRows.length - validCrmRows.length;

    if (!validCrmRows.length) {
        setCrmUploadStatus(
            "발주서 주문은 들어왔지만 CRM 필수값이 부족해 반영하지 않았습니다. 주문일·주문번호·판매처·상품명·수량·수령자 전화번호를 확인해주세요.",
            "warning",
        );
        return { saved: false, reflected: 0, skipped: skippedCount };
    }

    rebuildCrmRowsFromSources();
    updateCrmAutoSourceLabel(validCrmRows);
    renderCrmDashboard();
    const saved = true;
    setCrmUploadStatus(
        `발주서 주문 ${formatMilkrunNumber(validCrmRows.length)}건을 CRM에 자동 반영했습니다.${skippedCount ? ` 제외 ${formatMilkrunNumber(skippedCount)}건` : ""}`,
        saved ? "success" : "warning",
    );

    return {
        saved,
        reflected: validCrmRows.length,
        skipped: skippedCount,
    };
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

        crmHistoricalRows = parsedRows.map((row) => ({ ...row, sourceType: "historical" }));
        rebuildCrmRowsFromSources();
        crmSourceFileName = getCrmFileSelectionLabel(selectedFiles);
        renderCrmDashboard();
        renderOrderMatchPanel();
        const saved = await persistCrmOrders();
        const statusTone = nextAnalytics.invalidRows || failedFiles.length ? "warning" : "success";
        const saveText = saved ? "저장 완료" : "화면 반영 완료";
        const failedText = failedFiles.length ? ` 실패 파일 ${formatMilkrunNumber(failedFiles.length)}개.` : "";
        const matchText = getCrmOrderMatchStatusText();
        setCrmUploadStatus(
            `${saveText}: 파일 ${formatMilkrunNumber(selectedFiles.length)}개, 정상 ${formatMilkrunNumber(nextAnalytics.validRows)}건, 오류 ${formatMilkrunNumber(nextAnalytics.invalidRows)}건.${failedText}${matchText} 대/중/소/용량 컬럼은 반영하지 않았습니다.`,
            statusTone,
        );
    } catch (error) {
        console.error(error);
        setCrmUploadStatus(error.message || "CRM 파일 처리 중 오류가 발생했습니다.", "error");
        window.alert("CRM 엑셀을 업로드할 수 없습니다.\n파일 형식과 필수 헤더를 확인해주세요.");
    }
}

function resetCrmDataState() {
    crmHistoricalRows = [];
    rebuildCrmRowsFromSources();
    crmSourceFileName = "";
    if (crmFileInput instanceof HTMLInputElement) crmFileInput.value = "";
    updateSelectedFileName(null, crmFileNameEl);
    renderCrmDashboard();
    renderOrderMatchPanel();
}

async function handleDeleteCrmData() {
    const hasData = crmHistoricalRows.length > 0;
    if (!hasData) {
        setCrmUploadStatus("삭제할 CRM 과거데이터가 없습니다.", "info");
        return;
    }

    const confirmed = window.confirm(
        "CRM 과거데이터를 삭제할까요?\n\n과거데이터 기반 CRM 요약과 상품 매칭 후보가 비워집니다. 발주서에서 자동 반영된 주문은 주문관리 데이터를 기준으로 계속 표시됩니다. SKU와 저장된 상품 매칭은 삭제되지 않습니다.",
    );
    if (!confirmed) return;

    try {
        resetCrmDataState();
        const saved = await persistCrmOrders();
        if (!saved) throw new Error("CRM 데이터를 서버에서 삭제하지 못했습니다.");
        setCrmUploadStatus("CRM 과거데이터를 삭제했습니다. 발주서 자동 반영 주문은 그대로 유지됩니다.", "success");
    } catch (error) {
        console.error(error);
        setCrmUploadStatus(error?.message || "CRM 과거데이터를 삭제하지 못했습니다.", "error");
        window.alert("CRM 과거데이터 삭제 중 오류가 발생했습니다.");
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

function isFixedOrderUploadChannel(channelKey) {
    return channelKey === "coupang" || channelKey === "kurly";
}

function canConfigureOrderHeaderMap(channelKey) {
    return !isFixedOrderUploadChannel(channelKey);
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
    const dataDeleteButton = [...document.querySelectorAll("[data-order-upload-channel-data-delete]")]
        .find((element) => element.getAttribute("data-order-upload-channel-data-delete") === channel) || null;
    const failureEl = [...document.querySelectorAll("[data-order-upload-failure]")]
        .find((element) => element.getAttribute("data-order-upload-failure") === channel) || null;
    return { statusEl, dataDeleteButton, failureEl };
}

function getOrderUploadFailureMarkup(state = {}) {
    const failureMessage = String(state.failureMessage || "").trim();
    if (!failureMessage) return "";

    const failureRows = Array.isArray(state.failureRows) ? state.failureRows : [];
    const remainingCount = Math.max(0, Number(state.failureRemainingCount) || 0);
    const failureRowsMarkup = failureRows.length
        ? `
            <details class="order-upload-failure-rows">
                <summary>상세 오류 ${formatMilkrunNumber(failureRows.length + remainingCount)}건 보기</summary>
                <ul>
                    ${failureRows.map((row) => `
                        <li><strong>${escapeHtml(row.rowId || "행 정보 없음")}</strong><span>${escapeHtml(row.message || "오류 내용을 확인할 수 없습니다.")}</span></li>
                    `).join("")}
                </ul>
                ${remainingCount > 0 ? `<p class="order-upload-failure-more">외 ${formatMilkrunNumber(remainingCount)}건의 오류가 있습니다.</p>` : ""}
            </details>
        `
        : "";
    const failureGuide = String(state.failureGuide || "").trim();

    return `
        <div class="order-upload-failure-content" role="alert">
            <strong>업로드 실패 이유</strong>
            <p>${escapeHtml(failureMessage)}</p>
            ${failureRowsMarkup}
            ${failureGuide ? `<p class="order-upload-failure-guide">${escapeHtml(failureGuide)}</p>` : ""}
        </div>
    `;
}

function setOrderUploadChannelStatus(channel, message, tone = "idle", details = {}) {
    const shouldShowFailure = tone === "error" || (tone === "warning" && Boolean(details.failureMessage));
    const resetFailureDetails = shouldShowFailure
        ? {}
        : {
            failureMessage: "",
            failureRows: [],
            failureRemainingCount: 0,
            failureGuide: "",
        };
    const nextState = {
        ...(orderUploadChannelStates[channel] || {}),
        message: message ?? "",
        tone,
        ...resetFailureDetails,
        ...details,
    };
    orderUploadChannelStates[channel] = nextState;

    const { statusEl, dataDeleteButton, failureEl } = getOrderUploadChannelElements(channel);

    if (statusEl) {
        const displayMessage = tone === "error" ? "실패" : (message ?? "");
        statusEl.textContent = displayMessage;
        statusEl.title = message ?? "";
        statusEl.className = `order-upload-simple-status is-${tone}`;
    }

    if (dataDeleteButton instanceof HTMLButtonElement) {
        const dataCounts = getOrderUploadChannelDataCounts(channel);
        const hasUploadedData = dataCounts.uploadedRows > 0 || dataCounts.managedRows > 0;
        const channelLabel = getOrderUploadChannelLabel(channel);
        dataDeleteButton.disabled = !hasUploadedData;
        dataDeleteButton.title = hasUploadedData
            ? `${channelLabel} 업로드 발주서 삭제`
            : "삭제할 업로드 발주서가 없습니다.";
    }

    if (failureEl) {
        const markup = getOrderUploadFailureMarkup(nextState);
        failureEl.hidden = !markup;
        failureEl.innerHTML = markup;
    }
}

function getOrderUploadChannelDataCounts(channelKey) {
    return {
        uploadedRows: orderUploadRows.filter((row) => row.channel === channelKey).length,
        managedRows: orderManagementRows.filter((row) => row.channel === channelKey).length,
    };
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
        const canConfigureFormat = canConfigureOrderHeaderMap(channel.key);
        const dataCounts = getOrderUploadChannelDataCounts(channel.key);
        const hasUploadedData = dataCounts.uploadedRows > 0 || dataCounts.managedRows > 0;
        const deleteTitle = hasUploadedData
            ? `${channel.label} 업로드 발주서 삭제`
            : "삭제할 업로드 발주서가 없습니다.";
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
                    ${canConfigureFormat ? `
                    <button
                        class="order-upload-simple-btn order-upload-format-btn"
                        data-order-header-map-open="${escapeHtml(channel.key)}"
                        type="button"
                        aria-label="${escapeHtml(channel.label)} 엑셀 양식 설정"
                    >엑셀 양식 설정</button>
                    ` : ""}
                    <label for="order-upload-file-${escapeHtml(channel.key)}" class="order-upload-simple-btn">업로드</label>
                    <button
                        class="order-upload-order-delete-btn"
                        data-order-upload-channel-data-delete="${escapeHtml(channel.key)}"
                        type="button"
                        ${hasUploadedData ? "" : "disabled"}
                        title="${escapeHtml(deleteTitle)}"
                        aria-label="${escapeHtml(channel.label)} 업로드 발주서 삭제"
                    >발주서 삭제</button>
                    ${isCustom ? `
                        <button
                            class="order-upload-channel-remove-btn"
                            data-order-upload-channel-remove="${escapeHtml(channel.key)}"
                            type="button"
                            aria-label="${escapeHtml(channel.label)} 삭제"
                        >삭제</button>
                    ` : ""}
                </div>
                <div
                    class="order-upload-failure"
                    data-order-upload-failure="${escapeHtml(channel.key)}"
                    ${state.failureMessage ? "" : "hidden"}
                >${getOrderUploadFailureMarkup(state)}</div>
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
    if (!canConfigureOrderHeaderMap(channelKey)) {
        window.alert("컬리와 쿠팡(밀크런)은 고정 발주서 양식으로 업로드됩니다.");
        return;
    }
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
    renderOrderManagement();
}

function handleRemoveOrderUploadChannel(channelKey) {
    const channel = orderUploadCustomChannels.find((item) => item.key === channelKey);
    if (!channel) return;

    const hasRows = orderUploadRows.some((row) => row.channel === channelKey);
    if (hasRows && !window.confirm(`${channel.label} 업로드 데이터도 함께 비울까요?`)) return;

    orderUploadCustomChannels = orderUploadCustomChannels.filter((item) => item.key !== channelKey);
    orderUploadChannelOrder = orderUploadChannelOrder.filter((item) => item !== channelKey);
    orderUploadRows = orderUploadRows.filter((row) => row.channel !== channelKey);
    invalidateOrderProductCandidateCache();
    delete orderUploadChannelStates[channelKey];
    if (orderHeaderMaps[channelKey]) {
        delete orderHeaderMaps[channelKey];
        saveOrderHeaderMaps();
    }
    clearOrderManagementRowsForChannel(channelKey);
    clearOrderMatchDraftsForChannel(channelKey);
    saveOrderUploadCustomChannels();
    renderOrderUploadChannels();
    renderOrderMatchPanel();
}

function removeDerivedOrderUploadWorkspaces(channelKey, sourceFileName = "") {
    const fileName = String(sourceFileName || "").trim();
    if (!fileName) return 0;

    let removedCount = 0;
    if (channelKey === "coupang") {
        const workspaceId = buildMilkrunWorkspaceId(fileName);
        const beforeCount = milkrunWorkspaces.length;
        milkrunWorkspaces = milkrunWorkspaces.filter((workspace) => workspace.id !== workspaceId);
        removedCount += beforeCount - milkrunWorkspaces.length;
        selectedMilkrunWorkspaceIds.delete(workspaceId);
        milkrunWorkspaceSourceRows.delete(workspaceId);
        if (activeMilkrunWorkspaceId === workspaceId) {
            clearPendingMilkrunLoadingListDownload();
            activeMilkrunWorkspaceId = "";
            milkrunRows = [];
        }
        if (removedCount) {
            saveMilkrunWorkspacesToLocal();
            renderMilkrunWorkspaceList();
            renderMilkrunDashboard();
        }
    }

    if (channelKey === "kurly") {
        const workspaceId = buildKurlyLabelWorkspaceId(fileName);
        const beforeCount = kurlyLabelWorkspaces.length;
        kurlyLabelWorkspaces = kurlyLabelWorkspaces.filter((workspace) => workspace.id !== workspaceId);
        const channelRemovedCount = beforeCount - kurlyLabelWorkspaces.length;
        removedCount += channelRemovedCount;
        selectedKurlyLabelWorkspaceIds.delete(workspaceId);
        if (activeKurlyLabelWorkspaceId === workspaceId) {
            activeKurlyLabelWorkspaceId = "";
            kurlyRows = [];
            kurlyParsedFileName = "";
        }
        if (channelRemovedCount) {
            saveKurlyLabelWorkspacesToLocal();
            renderKurlyLabelWorkspaceList();
            renderKurlyLabelWorkspaceDetail();
        }
    }

    return removedCount;
}

async function handleDeleteOrderUploadChannelData(channelKey) {
    if (!channelKey) return;

    const channelLabel = getOrderUploadChannelLabel(channelKey);
    const dataCounts = getOrderUploadChannelDataCounts(channelKey);
    const targetOrderRows = orderManagementRows.filter((row) => row.channel === channelKey);
    const state = orderUploadChannelStates[channelKey] || {};
    const hasUploadedData = dataCounts.uploadedRows > 0 || dataCounts.managedRows > 0;

    if (!hasUploadedData) {
        window.alert(`${channelLabel}에 삭제할 업로드 발주서가 없습니다.`);
        return;
    }

    const message = [
        `${channelLabel}에 업로드한 발주서를 삭제할까요?`,
        "",
        `업로드 행 ${formatMilkrunNumber(dataCounts.uploadedRows)}건 · 주문관리 ${formatMilkrunNumber(dataCounts.managedRows)}건`,
        "매칭 후보와 CRM 자동 반영 데이터도 함께 정리됩니다.",
        "저장된 상품 매칭 규칙은 삭제하지 않습니다.",
    ].join("\n");
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) return;

    try {
        await releaseOrderLineInventoryAllocations(targetOrderRows, "order_deleted");
    } catch (error) {
        console.error("업로드 발주서 삭제 전 재고 할당 해제에 실패했습니다.", error);
        window.alert(`재고 할당을 해제하지 못해 발주서를 삭제하지 않았습니다.\n\n${error?.message || "잠시 후 다시 시도해주세요."}`);
        return;
    }

    orderUploadRows = orderUploadRows.filter((row) => row.channel !== channelKey);
    invalidateOrderProductCandidateCache();
    clearOrderMatchDraftsForChannel(channelKey);

    const targetOrderIds = new Set(targetOrderRows.map((row) => String(row.id)));
    orderManagementRows = orderManagementRows.filter((row) => row.channel !== channelKey);
    targetOrderIds.forEach((rowId) => selectedOrderManagementIds.delete(rowId));
    saveOrderManagementRowsToLocal();

    let removedCrmRows = 0;
    let crmDeleteFailed = false;
    try {
        removedCrmRows = await removeCrmRowsForManagedOrders(targetOrderRows);
    } catch (error) {
        crmDeleteFailed = true;
        console.warn("Failed to delete CRM rows related to uploaded orders.", error);
        setCrmUploadStatus("CRM 자동 반영 데이터 정리 중 오류가 있었습니다.", "warning");
    }

    const removedDerivedWorkspaces = removeDerivedOrderUploadWorkspaces(channelKey, state.sourceFileName || "");
    if (removedDerivedWorkspaces) {
        void persistSkuWorkspace();
    }

    setOrderUploadChannelStatus(channelKey, "대기 중", "idle", {
        sourceFileName: "",
        rowCount: 0,
        uploadedAt: "",
    });
    renderOrderUploadChannels();
    renderOrderManagement();
    renderOrderMatchPanel();

    if (orderManagementStatusEl) {
        const resultParts = [`${channelLabel} 발주서 업로드 데이터를 삭제했습니다.`];
        if (removedCrmRows) {
            resultParts.push(`CRM 자동 반영 데이터 ${formatMilkrunNumber(removedCrmRows)}건도 정리했습니다.`);
        }
        if (removedDerivedWorkspaces) {
            resultParts.push(`연결된 작업판 ${formatMilkrunNumber(removedDerivedWorkspaces)}개도 정리했습니다.`);
        }
        if (crmDeleteFailed) {
            resultParts.push("CRM 저장소 정리는 다시 확인해야 합니다.");
        }
        orderManagementStatusEl.textContent = resultParts.join(" ");
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

function invalidateOrderProductCandidateCache() {
    orderProductCandidateCache = null;
}

function setOrderProductCandidateCache(products) {
    const productList = Array.isArray(products) ? products : [];
    orderProductCandidateCache = {
        products: productList,
        byKey: new Map(productList
            .map((item) => [item.matchKey, item])
            .filter(([matchKey]) => matchKey)),
    };
}

function getOrderMatchChannelFromLabel(channelName) {
    const normalizedLabel = normalizeOrderProductName(channelName);
    if (!normalizedLabel) return "";

    const matchedChannel = getAllOrderUploadChannels().find((channel) => {
        const optionLabel = normalizeOrderProductName(channel.label);
        return optionLabel && (
            optionLabel === normalizedLabel ||
            normalizedLabel.includes(optionLabel) ||
            optionLabel.includes(normalizedLabel)
        );
    });

    return matchedChannel?.key || `crm-${normalizedLabel}`;
}

function getOrderMatchChannelFromRow(row) {
    const channel = normalizeOrderChannel(row?.channel);
    if (channel) return channel;
    return getOrderMatchChannelFromLabel(row?.channelName);
}

function getOrderMatchChannelLabelFromRow(row) {
    const channelName = String(row?.channelName || "").trim();
    if (channelName) return channelName;
    return getOrderUploadChannelLabel(getOrderMatchChannelFromRow(row));
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

function migrateOrderMatchSkuReferences(previousRow, nextRow) {
    const previousSkuKey = getSkuMatchKey(previousRow);
    const nextSkuKey = getSkuMatchKey(nextRow);
    const nextSkuName = String(nextRow?.productName || "").trim();
    if (!previousSkuKey || !nextSkuKey) return false;
    if (previousSkuKey === nextSkuKey && String(previousRow?.productName || "").trim() === nextSkuName) {
        return false;
    }

    let changed = false;
    const migrateComponents = (components) => (components ?? []).map((component) => {
        if (String(component?.skuKey || "").trim() !== previousSkuKey) return component;
        changed = true;
        return { ...component, skuKey: nextSkuKey, skuName: nextSkuName };
    });

    Object.values(orderProductMatches).forEach((matchRecord) => {
        if (!matchRecord || typeof matchRecord !== "object") return;
        if (Array.isArray(matchRecord.components)) {
            matchRecord.components = migrateComponents(matchRecord.components);
        }
        if (String(matchRecord.skuKey || "").trim() === previousSkuKey) {
            matchRecord.skuKey = nextSkuKey;
            matchRecord.skuName = nextSkuName;
            changed = true;
        }
    });

    Object.keys(orderMatchDraftComponents).forEach((matchKey) => {
        orderMatchDraftComponents[matchKey] = migrateComponents(orderMatchDraftComponents[matchKey]);
    });

    return changed;
}

function getSkuDisplayLabel(row) {
    const productName = String(row?.productName ?? "").trim();
    const adminCode = String(row?.adminProductCode ?? "").trim();
    return adminCode ? `${productName} · ${adminCode}` : productName;
}

function setFirstSkuLookupValue(map, key, row) {
    const safeKey = String(key ?? "").trim();
    if (!safeKey || map.has(safeKey)) return;
    map.set(safeKey, row);
}

function getSkuLookupCache() {
    if (skuLookupCache?.sourceRows === skuRows) return skuLookupCache;

    const matchableRows = (skuRows ?? []).filter((row) => String(row?.productName ?? "").trim());
    const byMatchKey = new Map();
    const byNormalizedProductName = new Map();
    const byBarcode = new Map();
    const byProductCode = new Map();

    matchableRows.forEach((row) => {
        setFirstSkuLookupValue(byMatchKey, getSkuMatchKey(row), row);
        setFirstSkuLookupValue(byNormalizedProductName, normalizeOrderProductName(row.productName), row);
        setFirstSkuLookupValue(byBarcode, normalizeBarcode(row?.barcode), row);

        [row?.adminProductCode, row?.selfProductCode, row?.manufacturerProductCode].forEach((codeValue) => {
            getSkuProductCodeCandidates(codeValue).forEach((code) => {
                setFirstSkuLookupValue(byProductCode, code, row);
            });
        });
    });

    skuLookupCache = {
        sourceRows: skuRows,
        matchableRows,
        byMatchKey,
        byNormalizedProductName,
        byBarcode,
        byProductCode,
    };
    return skuLookupCache;
}

function getMatchableSkuRows() {
    return getSkuLookupCache().matchableRows;
}

function getSkuByMatchKey(matchKey) {
    const safeKey = String(matchKey ?? "").trim();
    if (!safeKey) return null;
    return getSkuLookupCache().byMatchKey.get(safeKey) || null;
}

function getExactSkuNameMatch(productName) {
    const normalizedName = normalizeOrderProductName(productName);
    if (!normalizedName) return null;
    return getSkuLookupCache().byNormalizedProductName.get(normalizedName) || null;
}

function getOrderProductByMatchKey(matchKey) {
    const matchKeyText = String(matchKey ?? "");
    if (!matchKeyText) return null;
    if (!orderProductCandidateCache?.byKey) {
        getUniqueOrderProducts();
    }
    return orderProductCandidateCache?.byKey?.get(matchKeyText) || null;
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
    return getSkuLookupCache().byNormalizedProductName.get(normalizedName) || null;
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
    return getSkuLookupCache().byBarcode.get(normalizedBarcode) || null;
}

function findSkuByProductCode(productCode) {
    const codeCandidates = getSkuProductCodeCandidates(productCode);
    if (!codeCandidates.length) return null;
    const lookup = getSkuLookupCache().byProductCode;
    return codeCandidates.map((code) => lookup.get(code)).find(Boolean) || null;
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

function getAutoOrderComponents(productName, barcode = "", productCode = "") {
    const productNameText = String(productName ?? "").trim();
    if (!productNameText) return [];

    const barcodeSkuRow = findSkuByBarcode(barcode);
    if (barcodeSkuRow) {
        return [createOrderMatchComponent(barcodeSkuRow, 1)];
    }

    const productCodeSkuRow = findSkuByProductCode(productCode);
    if (productCodeSkuRow) {
        return [createOrderMatchComponent(productCodeSkuRow, 1)];
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
    const autoComponents = getAutoOrderComponents(productName, orderProduct?.barcode || "", orderProduct?.productCode || "");
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
    return getAutoOrderComponents(productName, orderProduct?.barcode || "", orderProduct?.productCode || "");
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

function stageOrderMatchComponents(matchKey, components) {
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
        return false;
    }

    orderProductMatches[matchKey] = {
        channel,
        channelName,
        orderProductName,
        components: cleanComponents,
        matchedAt: new Date().toISOString(),
    };
    orderMatchDraftComponents[matchKey] = cleanComponents;
    return true;
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

    const matchedByKey = getSkuLookupCache().byMatchKey.get(safeValue);
    if (matchedByKey) return matchedByKey;

    return getMatchableSkuRows().find((row) => (
        getSkuDisplayLabel(row) === safeValue
    )) || null;
}

function addOrderProductCandidate(productMap, row, sourceLabel) {
    if (!row?.isValid || !row.productName) return;

    const productName = String(row.productName ?? "").trim();
    const channel = getOrderMatchChannelFromRow(row);
    const channelName = getOrderMatchChannelLabelFromRow(row);
    const matchKey = getOrderProductMatchKey(channel, productName);
    if (!matchKey) return;

    if (!productMap.has(matchKey)) {
        productMap.set(matchKey, {
            channel,
            channelName,
            matchKey,
            productName,
            barcode: normalizeBarcode(row.barcode),
            productCode: row.productCode || row.marketplaceProductCode || "",
            rowCount: 0,
            channels: new Set(),
            sources: new Set(),
        });
    }

    const item = productMap.get(matchKey);
    item.rowCount += 1;
    if (!item.barcode) item.barcode = normalizeBarcode(row.barcode);
    if (!item.productCode) item.productCode = row.productCode || row.marketplaceProductCode || "";
    item.channels.add(channelName);
    item.sources.add(sourceLabel);
}

function getUniqueOrderProducts() {
    if (Array.isArray(orderProductCandidateCache?.products)) {
        return orderProductCandidateCache.products;
    }

    const productMap = new Map();

    orderUploadRows.forEach((row) => addOrderProductCandidate(productMap, row, "발주서"));
    crmRows.forEach((row) => addOrderProductCandidate(productMap, row, "CRM"));

    const products = [...productMap.values()].sort((left, right) => (
        left.channelName.localeCompare(right.channelName, "ko") ||
        left.productName.localeCompare(right.productName, "ko")
    ));
    setOrderProductCandidateCache(products);
    return products;
}

function shouldShowOrderMatchProduct(item) {
    if (!item?.matchKey || confirmedOrderMatchKeys.has(item.matchKey)) return false;
    return !hasSavedOrderProductMatch(item.matchKey);
}

function renderOrderMatchPanel({ force = false } = {}) {
    if (!orderMatchStatusEl || !orderMatchListEl) return;
    if (!force && !isCurrentDashboardView("order-upload")) {
        syncOrderMatchDeleteButton();
        return;
    }

    closeOrderSkuPicker({ restoreFocus: false });
    syncOrderMatchDeleteButton();

    const products = getUniqueOrderProducts();
    if (!products.length) {
        orderMatchStatusEl.textContent = "발주서나 CRM 과거데이터를 업로드하면 매칭이 필요한 상품이 표시됩니다.";
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
    orderMatchStatusEl.textContent = `총 ${formatMilkrunNumber(products.length)}개 상품 중 ${formatMilkrunNumber(matchedCount)}개 매칭 · 확인 대상 ${formatMilkrunNumber(openProducts.length)}개`;

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
        const sourceText = item.sources?.size ? ` · ${[...item.sources].join("+")}` : "";
        return `
        <div class="order-match-item${hasCompleteMatch ? " is-matched" : ""}"
            data-order-match-item-key="${escapeHtml(item.matchKey)}">
            <div class="order-match-product">
                <strong>${escapeHtml(item.productName)}</strong>
                <span>${escapeHtml([...item.channels].join(", "))}${escapeHtml(sourceText)} · ${item.rowCount}행 · ${matchStateText}</span>
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

    if (!stageOrderMatchComponents(item.matchKey, components)) return false;
    confirmedOrderMatchKeys.add(item.matchKey);
    return true;
}

async function handleConfirmAllOrderMatches() {
    const products = getUniqueOrderProducts();
    const openProducts = products.filter(shouldShowOrderMatchProduct);
    const unmatchedProducts = openProducts.filter((item) => !hasCompleteOrderMatch(item.matchKey));

    if (!openProducts.length) return;

    if (unmatchedProducts.length) {
        window.alert(`아직 매칭되지 않은 상품이 ${unmatchedProducts.length}개 있습니다.`);
        return;
    }

    const originalButtonText = orderMatchConfirmBtn?.textContent || "전체 확인";
    if (orderMatchConfirmBtn) {
        orderMatchConfirmBtn.disabled = true;
        orderMatchConfirmBtn.textContent = "저장 중...";
    }

    try {
        openProducts.forEach((item) => {
            persistConfirmedOrderMatchIfNeeded(item);
        });

        const savedToCloud = await saveOrderProductMatches();
        standardizeOrderManagementRows({ persist: false, render: true });
        const orderRowsSaved = await saveOrderManagementRowsToLocal();
        rebuildMilkrunWorkspacesFromSkuData();
        renderOrderMatchPanel();

        if (!savedToCloud || !orderRowsSaved) {
            window.alert("상품 매칭은 현재 브라우저에 저장했지만 서버 동기화에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.");
            return;
        }

        if (orderManagementStatusEl) {
            orderManagementStatusEl.textContent = "SKU 매칭을 저장했습니다. 주문관리에서 주문을 선택한 뒤 ‘재고 할당’을 실행해주세요.";
        }
    } finally {
        if (orderMatchConfirmBtn) {
            orderMatchConfirmBtn.textContent = originalButtonText;
        }
    }
}

function getFilteredOrderMatchDeleteEntries(entries = getSavedOrderMatchEntries()) {
    const rawTerm = String(orderMatchDeleteSearchInput?.value || "").trim().toLowerCase();
    const normalizedTerm = normalizeOrderProductName(rawTerm);
    return entries.filter((entry) => {
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
}

function pruneSelectedOrderMatchDeleteKeys() {
    const existingKeys = new Set(getSavedOrderMatchEntries().map((entry) => entry.matchKey));
    selectedOrderMatchDeleteKeys = new Set([...selectedOrderMatchDeleteKeys]
        .filter((matchKey) => existingKeys.has(matchKey)));
}

function syncOrderMatchDeleteSelectionControls(filteredEntries = getFilteredOrderMatchDeleteEntries()) {
    pruneSelectedOrderMatchDeleteKeys();

    const filteredKeys = filteredEntries.map((entry) => entry.matchKey);
    const selectedVisibleCount = filteredKeys.filter((matchKey) => selectedOrderMatchDeleteKeys.has(matchKey)).length;
    const selectedCount = selectedOrderMatchDeleteKeys.size;
    const hasFilteredEntries = filteredKeys.length > 0;
    const allFilteredSelected = hasFilteredEntries && selectedVisibleCount === filteredKeys.length;

    if (orderMatchDeleteSelectAllBtn instanceof HTMLButtonElement) {
        orderMatchDeleteSelectAllBtn.disabled = !hasFilteredEntries;
        orderMatchDeleteSelectAllBtn.textContent = allFilteredSelected ? "전체 해제" : "전체 선택";
    }

    if (orderMatchDeleteSelectedBtn instanceof HTMLButtonElement) {
        orderMatchDeleteSelectedBtn.disabled = selectedCount === 0;
        orderMatchDeleteSelectedBtn.textContent = selectedCount
            ? `선택 ${formatMilkrunNumber(selectedCount)}개 삭제`
            : "선택 삭제";
    }

    if (orderMatchDeleteSelectedCountEl) {
        orderMatchDeleteSelectedCountEl.textContent = selectedCount
            ? `선택 ${formatMilkrunNumber(selectedCount)}개`
            : "선택 0개";
    }
}

function renderOrderMatchDeleteList() {
    syncOrderMatchDeleteButton();
    if (!orderMatchDeleteListEl) return;

    const entries = getSavedOrderMatchEntries();
    const filteredEntries = getFilteredOrderMatchDeleteEntries(entries);

    if (!entries.length) {
        selectedOrderMatchDeleteKeys = new Set();
        orderMatchDeleteListEl.innerHTML = '<div class="order-match-delete-empty">저장된 매칭이 없습니다.</div>';
        syncOrderMatchDeleteSelectionControls([]);
        return;
    }

    if (!filteredEntries.length) {
        orderMatchDeleteListEl.innerHTML = '<div class="order-match-delete-empty">검색 결과가 없습니다.</div>';
        syncOrderMatchDeleteSelectionControls([]);
        return;
    }

    orderMatchDeleteListEl.innerHTML = filteredEntries.map((entry) => {
        const checkedAttr = selectedOrderMatchDeleteKeys.has(entry.matchKey) ? " checked" : "";
        return `
        <div class="order-match-delete-item${checkedAttr ? " is-selected" : ""}">
            <label class="order-match-delete-check">
                <input
                    type="checkbox"
                    data-order-match-delete-select-key="${escapeHtml(entry.matchKey)}"
                    aria-label="${escapeHtml(entry.orderProductName)} 매칭 선택"
                    ${checkedAttr}
                />
            </label>
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
    `;
    }).join("");
    syncOrderMatchDeleteSelectionControls(filteredEntries);
}

function openOrderMatchDeleteModal() {
    if (!orderMatchDeleteModal) return;

    selectedOrderMatchDeleteKeys = new Set();
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

    selectedOrderMatchDeleteKeys = new Set();
    orderMatchDeleteModal.classList.add("is-hidden");
    orderMatchDeleteModal.setAttribute("aria-hidden", "true");
}

function deleteOrderProductMatchKeys(matchKeys = []) {
    const keys = [...new Set((matchKeys ?? []).map((key) => String(key || "").trim()).filter(Boolean))];
    let deletedCount = 0;

    keys.forEach((matchKey) => {
        if (!orderProductMatches[matchKey]) return;
        delete orderProductMatches[matchKey];
        delete orderMatchDraftComponents[matchKey];
        confirmedOrderMatchKeys.delete(matchKey);
        selectedOrderMatchDeleteKeys.delete(matchKey);
        deletedCount += 1;
    });

    if (!deletedCount) return 0;

    void saveOrderProductMatches();
    standardizeOrderManagementRows({ persist: true, render: true });
    renderOrderMatchDeleteList();
    renderOrderMatchPanel();
    rebuildMilkrunWorkspacesFromSkuData();
    return deletedCount;
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

    deleteOrderProductMatchKeys([matchKey]);
}

function handleOrderMatchDeleteSelectionChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-order-match-delete-select-key]")) return;

    const matchKey = target.getAttribute("data-order-match-delete-select-key") || "";
    if (!matchKey) return;

    if (target.checked) {
        selectedOrderMatchDeleteKeys.add(matchKey);
    } else {
        selectedOrderMatchDeleteKeys.delete(matchKey);
    }

    target.closest(".order-match-delete-item")?.classList.toggle("is-selected", target.checked);
    syncOrderMatchDeleteSelectionControls();
}

function handleOrderMatchDeleteSelectAll() {
    const filteredEntries = getFilteredOrderMatchDeleteEntries();
    if (!filteredEntries.length) return;

    const allSelected = filteredEntries.every((entry) => selectedOrderMatchDeleteKeys.has(entry.matchKey));
    filteredEntries.forEach((entry) => {
        if (allSelected) {
            selectedOrderMatchDeleteKeys.delete(entry.matchKey);
        } else {
            selectedOrderMatchDeleteKeys.add(entry.matchKey);
        }
    });
    renderOrderMatchDeleteList();
}

function handleDeleteSelectedOrderMatches() {
    pruneSelectedOrderMatchDeleteKeys();
    const selectedKeys = [...selectedOrderMatchDeleteKeys];
    if (!selectedKeys.length) {
        syncOrderMatchDeleteSelectionControls();
        return;
    }

    if (!window.confirm(`선택한 매칭 ${formatMilkrunNumber(selectedKeys.length)}개를 삭제할까요?`)) return;
    deleteOrderProductMatchKeys(selectedKeys);
}

function getOrderUploadValidationFailureDetails(rows) {
    const invalidRows = (rows ?? []).filter((row) => !row.isValid);
    const previewRows = invalidRows.slice(0, 5).map((row) => ({
        rowId: `${row.rowId || "행 정보 없음"}행`,
        message: (row.errors ?? []).join(" / ") || "필수값을 확인해주세요.",
    }));

    return {
        failureMessage: `총 ${formatMilkrunNumber(rows?.length || 0)}건 중 ${formatMilkrunNumber(invalidRows.length)}건에 오류가 있습니다.`,
        failureRows: previewRows,
        failureRemainingCount: Math.max(0, invalidRows.length - previewRows.length),
        failureGuide: "표시된 행과 필수 헤더를 수정한 뒤 같은 파일을 다시 업로드해주세요.",
    };
}

function getOrderUploadFailureGuide(message = "") {
    const normalizedMessage = String(message || "").toLowerCase();
    if (normalizedMessage.includes("고객 식별키") || normalizedMessage.includes("generatecustomerkeys")) {
        return "고객 식별키 생성 서버에 연결하지 못했습니다. 로그인 상태와 네트워크를 확인한 뒤 다시 시도해주세요.";
    }
    if (normalizedMessage.includes("주문관리") || normalizedMessage.includes("crm") || normalizedMessage.includes("firestore")) {
        return "주문관리 또는 CRM 저장에 실패했습니다. 네트워크와 권한 설정을 확인한 뒤 다시 업로드해주세요.";
    }
    if (normalizedMessage.includes("헤더") || normalizedMessage.includes("필수") || normalizedMessage.includes("엑셀")) {
        return "엑셀 양식 설정에서 필수 헤더가 정확히 연결됐는지 확인해주세요.";
    }
    return "파일 형식과 입력값을 확인한 뒤 다시 업로드해주세요. 문제가 반복되면 표시된 오류 문구를 관리자에게 전달해주세요.";
}

function getOrderUploadExceptionFailureDetails(error) {
    const failureMessage = String(error?.message || "파일 처리 중 오류가 발생했습니다.").trim();
    return {
        failureMessage,
        failureRows: [],
        failureRemainingCount: 0,
        failureGuide: getOrderUploadFailureGuide(failureMessage),
    };
}

function buildUploadHistoryErrors(rows = []) {
    const invalidRows = (rows ?? []).filter((row) => row && !row.isValid);
    const errors = invalidRows.slice(0, UPLOAD_HISTORY_ERROR_LIMIT).map((row) => {
        const messages = Array.isArray(row.errors)
            ? row.errors
            : (row.errors ? [row.errors] : []);
        return {
            rowId: `${row.rowId || "행 정보 없음"}행`,
            message: messages.join(" / ") || "필수값을 확인해주세요.",
        };
    });

    return {
        errors,
        errorTruncatedCount: Math.max(0, invalidRows.length - errors.length),
    };
}

function normalizeUploadHistoryRow(row = {}, documentId = "") {
    const status = ["success", "failed", "duplicate"].includes(row.status)
        ? row.status
        : "failed";
    const errors = Array.isArray(row.errors)
        ? row.errors
            .slice(0, UPLOAD_HISTORY_ERROR_LIMIT)
            .map((error) => ({
                rowId: String(error?.rowId || "행 정보 없음").trim(),
                message: String(error?.message || "오류 내용을 확인할 수 없습니다.").trim(),
            }))
        : [];

    return {
        id: String(row.id || documentId || "").trim(),
        schemaVersion: String(row.schemaVersion || UPLOAD_HISTORY_SCHEMA_VERSION),
        channel: String(row.channel || "").trim(),
        channelLabel: String(row.channelLabel || row.channel || "판매처").trim(),
        fileName: String(row.fileName || "파일명 없음").trim(),
        fileSize: Math.max(0, Number(row.fileSize) || 0),
        fileHash: String(row.fileHash || "").trim(),
        sourceImportHash: String(row.sourceImportHash || "").trim(),
        status,
        totalRows: Math.max(0, Number(row.totalRows) || 0),
        validRows: Math.max(0, Number(row.validRows) || 0),
        invalidRows: Math.max(0, Number(row.invalidRows) || 0),
        orderManagementCount: Math.max(0, Number(row.orderManagementCount) || 0),
        crmCount: Math.max(0, Number(row.crmCount) || 0),
        crmSkippedCount: Math.max(0, Number(row.crmSkippedCount) || 0),
        duplicateOrderCount: Math.max(0, Number(row.duplicateOrderCount) || 0),
        failureMessage: String(row.failureMessage || "").trim(),
        failureGuide: String(row.failureGuide || "").trim(),
        errors,
        errorTruncatedCount: Math.max(0, Number(row.errorTruncatedCount) || 0),
        uploadedAt: String(row.uploadedAt || new Date().toISOString()).trim(),
        uploadedBy: String(row.uploadedBy || "").trim(),
    };
}

function getUploadHistoryStatusMeta(status) {
    const statusMap = {
        success: { label: "정상 완료", className: "is-success" },
        failed: { label: "수정 필요", className: "is-failed" },
        duplicate: { label: "중복 감지", className: "is-duplicate" },
    };
    return statusMap[status] || statusMap.failed;
}

function formatUploadHistoryDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function formatUploadHistoryFileSize(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    if (!size) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function sortUploadHistoryRows(rows = uploadHistoryRows) {
    return [...rows].sort((left, right) => (
        String(right.uploadedAt || "").localeCompare(String(left.uploadedAt || ""))
    ));
}

async function saveUploadHistoryRecord(record = {}) {
    const userId = getCloudDataUserId();
    const historyCollection = getCloudDataCollection(userId, "uploadHistory");
    if (!historyCollection) return false;

    const historyRef = doc(historyCollection);
    const normalizedRecord = normalizeUploadHistoryRow({
        ...record,
        id: historyRef.id,
        uploadedAt: record.uploadedAt || new Date().toISOString(),
        uploadedBy: record.uploadedBy || currentUserEmail || auth.currentUser?.email || "",
    }, historyRef.id);

    try {
        await setDoc(historyRef, {
            ...sanitizeFirestoreValue(normalizedRecord),
            createdAt: serverTimestamp(),
        });
        uploadHistoryRows = sortUploadHistoryRows([
            normalizedRecord,
            ...uploadHistoryRows.filter((row) => row.id !== normalizedRecord.id),
        ]);
        renderUploadHistory();
        return true;
    } catch (error) {
        console.warn("업로드 이력을 서버에 저장하지 못했습니다.", error);
        return false;
    }
}

async function loadUploadHistory() {
    const userId = getCloudDataUserId();
    const historyCollection = getCloudDataCollection(userId, "uploadHistory");
    if (!historyCollection) {
        uploadHistoryRows = [];
        renderUploadHistory();
        return false;
    }

    uploadHistoryLoading = true;
    renderUploadHistory();
    try {
        const snapshot = await getDocs(historyCollection);
        uploadHistoryRows = sortUploadHistoryRows(
            snapshot.docs.map((historyDoc) => normalizeUploadHistoryRow(historyDoc.data(), historyDoc.id)),
        );
        if (selectedUploadHistoryId && !uploadHistoryRows.some((row) => row.id === selectedUploadHistoryId)) {
            selectedUploadHistoryId = "";
        }
        return true;
    } catch (error) {
        console.warn("업로드 이력을 불러오지 못했습니다.", error);
        if (uploadHistoryStatusEl) {
            uploadHistoryStatusEl.textContent = "업로드 이력을 불러오지 못했습니다. 네트워크와 권한을 확인해주세요.";
        }
        return false;
    } finally {
        uploadHistoryLoading = false;
        renderUploadHistory();
    }
}

function getFilteredUploadHistoryRows() {
    const queryText = normalizeOrderProductName(uploadHistoryFilters.query);
    return uploadHistoryRows.filter((row) => {
        if (uploadHistoryFilters.status !== "all" && row.status !== uploadHistoryFilters.status) return false;
        if (uploadHistoryFilters.channel !== "all" && row.channel !== uploadHistoryFilters.channel) return false;
        if (!queryText) return true;

        const searchText = normalizeOrderProductName([
            row.fileName,
            row.channelLabel,
            row.uploadedBy,
        ].join(" "));
        return searchText.includes(queryText);
    });
}

function renderUploadHistoryChannelOptions() {
    if (!(uploadHistoryChannelFilter instanceof HTMLSelectElement)) return;

    const channelMap = new Map();
    uploadHistoryRows.forEach((row) => {
        if (row.channel) channelMap.set(row.channel, row.channelLabel || row.channel);
    });
    getAllOrderUploadChannels().forEach((channel) => {
        if (channel.key) channelMap.set(channel.key, channel.label || channel.key);
    });

    uploadHistoryChannelFilter.innerHTML = [
        '<option value="all">전체 판매처</option>',
        ...[...channelMap.entries()]
            .sort((left, right) => left[1].localeCompare(right[1], "ko"))
            .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`),
    ].join("");
    uploadHistoryChannelFilter.value = channelMap.has(uploadHistoryFilters.channel)
        ? uploadHistoryFilters.channel
        : "all";
    if (uploadHistoryChannelFilter.value === "all") uploadHistoryFilters.channel = "all";
}

function renderUploadHistorySummary() {
    const total = uploadHistoryRows.length;
    const success = uploadHistoryRows.filter((row) => row.status === "success").length;
    const failed = uploadHistoryRows.filter((row) => row.status === "failed").length;
    const duplicate = uploadHistoryRows.filter((row) => row.status === "duplicate").length;

    if (uploadHistorySummaryTotalEl) uploadHistorySummaryTotalEl.textContent = formatMilkrunNumber(total);
    if (uploadHistorySummarySuccessEl) uploadHistorySummarySuccessEl.textContent = formatMilkrunNumber(success);
    if (uploadHistorySummaryFailedEl) uploadHistorySummaryFailedEl.textContent = formatMilkrunNumber(failed);
    if (uploadHistorySummaryDuplicateEl) uploadHistorySummaryDuplicateEl.textContent = formatMilkrunNumber(duplicate);
}

function renderUploadHistoryDetail() {
    if (!uploadHistoryDetailEl) return;
    const row = uploadHistoryRows.find((item) => item.id === selectedUploadHistoryId);
    if (!row) {
        uploadHistoryDetailEl.hidden = true;
        return;
    }

    const statusMeta = getUploadHistoryStatusMeta(row.status);
    uploadHistoryDetailEl.hidden = false;
    if (uploadHistoryDetailStatusEl) {
        uploadHistoryDetailStatusEl.textContent = statusMeta.label;
        uploadHistoryDetailStatusEl.className = `upload-history-status-badge ${statusMeta.className}`;
    }
    if (uploadHistoryDetailTitleEl) uploadHistoryDetailTitleEl.textContent = row.fileName;
    if (uploadHistoryDetailMetaEl) {
        const metaParts = [
            formatUploadHistoryDate(row.uploadedAt),
            row.channelLabel,
            row.uploadedBy,
            formatUploadHistoryFileSize(row.fileSize),
        ].filter(Boolean);
        uploadHistoryDetailMetaEl.textContent = metaParts.join(" · ");
    }
    if (uploadHistoryDetailSummaryEl) {
        uploadHistoryDetailSummaryEl.innerHTML = [
            ["전체 행", row.totalRows],
            ["정상 행", row.validRows],
            ["주문관리 저장", row.orderManagementCount],
            ["CRM 저장", row.crmCount],
        ].map(([label, value]) => `
            <div class="upload-history-detail-metric">
                <span>${escapeHtml(label)}</span>
                <strong>${formatMilkrunNumber(value)}건</strong>
            </div>
        `).join("");
    }

    if (uploadHistoryDetailMessageEl) {
        const message = row.failureMessage;
        uploadHistoryDetailMessageEl.innerHTML = message
            ? `
                <div class="upload-history-message-card${row.status === "duplicate" ? " is-duplicate" : ""}">
                    <strong>${escapeHtml(message)}</strong>
                    ${row.failureGuide ? `<span>${escapeHtml(row.failureGuide)}</span>` : ""}
                </div>
            `
            : "";
    }

    if (uploadHistoryErrorListEl) {
        uploadHistoryErrorListEl.innerHTML = [
            ...row.errors.map((error) => `
                <div class="upload-history-error-item">
                    <strong>${escapeHtml(error.rowId)}</strong>
                    <span>${escapeHtml(error.message)}</span>
                </div>
            `),
            row.errorTruncatedCount
                ? `<p class="upload-history-error-more">외 ${formatMilkrunNumber(row.errorTruncatedCount)}건의 오류가 있습니다.</p>`
                : "",
        ].join("");
    }
    if (uploadHistoryErrorDownloadBtn instanceof HTMLButtonElement) {
        uploadHistoryErrorDownloadBtn.hidden = row.errors.length === 0;
    }
    if (uploadHistoryUploadLinkBtn instanceof HTMLButtonElement) {
        uploadHistoryUploadLinkBtn.hidden = row.status !== "failed";
    }
}

function renderUploadHistory() {
    renderUploadHistorySummary();
    renderUploadHistoryChannelOptions();
    if (uploadHistoryRefreshBtn instanceof HTMLButtonElement) {
        uploadHistoryRefreshBtn.disabled = uploadHistoryLoading;
        uploadHistoryRefreshBtn.textContent = uploadHistoryLoading ? "불러오는 중" : "새로고침";
    }
    if (uploadHistoryStatusFilter instanceof HTMLSelectElement) {
        uploadHistoryStatusFilter.value = uploadHistoryFilters.status;
    }
    if (uploadHistorySearchInput instanceof HTMLInputElement) {
        uploadHistorySearchInput.value = uploadHistoryFilters.query;
    }

    const filteredRows = getFilteredUploadHistoryRows();
    if (uploadHistoryCountEl) uploadHistoryCountEl.textContent = `${formatMilkrunNumber(filteredRows.length)}건`;
    if (uploadHistoryStatusEl) {
        uploadHistoryStatusEl.textContent = uploadHistoryLoading
            ? "업로드 이력을 불러오는 중입니다."
            : (
                uploadHistoryRows.length
                    ? `전체 ${formatMilkrunNumber(uploadHistoryRows.length)}건 중 ${formatMilkrunNumber(filteredRows.length)}건을 표시합니다.`
                    : "발주서를 업로드하면 성공·오류·중복 결과가 이곳에 기록됩니다."
            );
    }

    if (uploadHistoryBodyEl) {
        uploadHistoryBodyEl.innerHTML = filteredRows.length
            ? filteredRows.map((row) => {
                const statusMeta = getUploadHistoryStatusMeta(row.status);
                const errorCount = row.invalidRows || row.errors.length + row.errorTruncatedCount;
                const fileSize = formatUploadHistoryFileSize(row.fileSize);
                return `
                    <tr>
                        <td>${escapeHtml(formatUploadHistoryDate(row.uploadedAt))}</td>
                        <td>${escapeHtml(row.channelLabel)}</td>
                        <td>
                            <span class="upload-history-file-name" title="${escapeHtml(row.fileName)}">${escapeHtml(row.fileName)}</span>
                            ${fileSize ? `<span class="upload-history-file-size">${escapeHtml(fileSize)}</span>` : ""}
                        </td>
                        <td><span class="upload-history-status-badge ${statusMeta.className}">${statusMeta.label}</span></td>
                        <td>${formatMilkrunNumber(row.totalRows)}</td>
                        <td>${formatMilkrunNumber(row.orderManagementCount)}</td>
                        <td>${row.status === "duplicate" ? "-" : formatMilkrunNumber(row.crmCount)}</td>
                        <td>${errorCount ? `${formatMilkrunNumber(errorCount)}건` : "-"}</td>
                        <td>
                            <button class="upload-history-detail-btn" data-upload-history-detail="${escapeHtml(row.id)}" type="button">
                                상세 보기
                            </button>
                        </td>
                    </tr>
                `;
            }).join("")
            : `
                <tr class="tracking-empty-row">
                    <td colspan="9">${uploadHistoryRows.length ? "조건에 맞는 업로드 이력이 없습니다." : "아직 업로드 이력이 없습니다."}</td>
                </tr>
            `;
    }
    renderUploadHistoryDetail();
}

function handleUploadHistoryFilterChange() {
    uploadHistoryFilters = {
        status: uploadHistoryStatusFilter?.value || "all",
        channel: uploadHistoryChannelFilter?.value || "all",
        query: uploadHistorySearchInput?.value || "",
    };
    renderUploadHistory();
}

function closeUploadHistoryDetail() {
    selectedUploadHistoryId = "";
    renderUploadHistoryDetail();
}

function downloadSelectedUploadHistoryErrors() {
    const row = uploadHistoryRows.find((item) => item.id === selectedUploadHistoryId);
    if (!row?.errors?.length) return;

    const escapeCsvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [
        ["행", "오류 원인"].map(escapeCsvCell).join(","),
        ...row.errors.map((error) => [error.rowId, error.message].map(escapeCsvCell).join(",")),
        ...(row.errorTruncatedCount
            ? [["안내", `화면 저장 한도를 초과한 오류 ${formatMilkrunNumber(row.errorTruncatedCount)}건은 포함되지 않았습니다.`]
                .map(escapeCsvCell).join(",")]
            : []),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = row.fileName.replace(/\.[^.]+$/, "") || "upload-errors";
    link.href = url;
    link.download = `${baseName}-오류.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    const sourceFileName = String(file?.name || "").trim();
    milkrunWorkspaceSourceRows.set(workspaceId, sourceRows);
    selectedMilkrunWorkspaceIds.delete(workspaceId);

    milkrunWorkspaces = [
        ...milkrunWorkspaces.filter((item) => item.id !== workspaceId),
        {
            id: workspaceId,
            title: workspaceTitle,
            sourceFileName,
            rows: nextRows,
            sourceRows,
            updatedAt: new Date().toISOString(),
        },
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
    const sourceFileName = String(file?.name || "").trim();
    selectedKurlyLabelWorkspaceIds.delete(workspaceId);

    kurlyLabelWorkspaces = [
        ...kurlyLabelWorkspaces.filter((item) => item.id !== workspaceId),
        {
            id: workspaceId,
            title: workspaceTitle,
            sourceFileName,
            rows: validRows,
            updatedAt: new Date().toISOString(),
        },
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

async function getOrderUploadFileHash(file) {
    if (typeof File === "undefined" || !(file instanceof File) || !window.crypto?.subtle) return "";

    const buffer = await file.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function getOrderUploadImportHash(channel, fileHash) {
    if (!fileHash) return "";

    const headerMap = getSavedOrderHeaderMap(channel);
    return getCloudSyncHash({
        schemaVersion: ORDER_UPLOAD_IMPORT_SCHEMA_VERSION,
        channel,
        fileHash,
        headerRowIndex: headerMap?.headerRowIndex || 0,
        fields: Array.isArray(headerMap?.fields) ? headerMap.fields : [],
    });
}

function getSavedOrderUploadRowsForImport(channel, sourceImportHash) {
    if (!sourceImportHash) return [];
    const savedRows = orderManagementRows.filter((row) => (
        row.channel === channel && row.sourceImportHash === sourceImportHash
    ));
    const expectedRowCount = Number(savedRows[0]?.sourceImportRowCount) || 0;

    return expectedRowCount > 0
        && savedRows.length === expectedRowCount
        && savedRows.every((row) => Number(row?.sourceImportRowCount) === expectedRowCount)
        ? savedRows
        : [];
}

async function setOrderUploadFileSelectedState(channel, file, fileInput = null) {
    const channelLabel = getOrderUploadChannelLabel(channel);
    let sourceFileHash = "";
    let sourceImportHash = "";
    let normalizedRows = [];
    let validationRows = [];
    let total = 0;
    let invalid = 0;
    let valid = 0;
    let orderManagementCount = 0;
    let crmResult = { reflected: 0, skipped: 0 };
    let duplicateRows = [];

    if (!file) {
        orderUploadRows = orderUploadRows.filter((row) => row.channel !== channel);
        invalidateOrderProductCandidateCache();
        clearOrderManagementRowsForChannel(channel);
        setOrderUploadChannelStatus(channel, "대기 중", "idle", {
            sourceFileName: "",
            rowCount: 0,
            uploadedAt: "",
        });
        renderOrderMatchPanel();
        return;
    }

    try {
        setOrderUploadChannelStatus(channel, "파일 확인 중", "loading", {
            sourceFileName: file.name || "",
            rowCount: 0,
            uploadedAt: "",
        });
        sourceFileHash = await getOrderUploadFileHash(file);
        sourceImportHash = getOrderUploadImportHash(channel, sourceFileHash);
        duplicateRows = getSavedOrderUploadRowsForImport(channel, sourceImportHash);
        if (duplicateRows.length && !isFixedOrderUploadChannel(channel)) {
            setOrderUploadChannelStatus(channel, `이미 저장됨 ${formatMilkrunNumber(duplicateRows.length)}건`, "success", {
                sourceFileName: file.name || "",
                rowCount: duplicateRows.length,
                uploadedAt: "",
            });
            await saveUploadHistoryRecord({
                channel,
                channelLabel,
                fileName: file.name || "",
                fileSize: file.size || 0,
                fileHash: sourceFileHash,
                sourceImportHash,
                status: "duplicate",
                totalRows: duplicateRows.length,
                validRows: duplicateRows.length,
                invalidRows: 0,
                orderManagementCount: duplicateRows.length,
                crmCount: 0,
                crmSkippedCount: 0,
                duplicateOrderCount: duplicateRows.length,
                failureMessage: "이미 저장된 동일한 파일입니다.",
                failureGuide: "기존 주문은 그대로 유지했으며 중복 저장하지 않았습니다.",
                errors: [],
                errorTruncatedCount: 0,
            });
            return;
        }

        setOrderUploadChannelStatus(channel, "읽는 중", "loading", {
            sourceFileName: "",
            rowCount: 0,
            uploadedAt: "",
        });

        let customerKeysGenerated = false;

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
            const keyResult = await attachCustomerKeysToOrderRows(normalizedRows);
            normalizedRows = keyResult.rows;
            customerKeysGenerated = keyResult.generated;
            validationRows = normalizedRows;
        }


        total = normalizedRows.length;
        invalid = normalizedRows.filter((row) => !row.isValid).length;
        valid = total - invalid;

        if (!total) {
            const failureDetails = {
                failureMessage: "등록할 주문 행을 찾지 못했습니다.",
                failureRows: [],
                failureRemainingCount: 0,
                failureGuide: "빈 파일이 아닌지, 첫 행이 헤더로 인식되는지, 엑셀 양식 설정이 맞는지 확인해주세요.",
            };
            setOrderUploadChannelStatus(channel, "데이터 없음", "warning", failureDetails);
            await saveUploadHistoryRecord({
                channel,
                channelLabel,
                fileName: file.name || "",
                fileSize: file.size || 0,
                fileHash: sourceFileHash,
                sourceImportHash,
                status: "failed",
                totalRows: 0,
                validRows: 0,
                invalidRows: 0,
                orderManagementCount: 0,
                crmCount: 0,
                crmSkippedCount: 0,
                failureMessage: failureDetails.failureMessage,
                failureGuide: failureDetails.failureGuide,
                errors: [],
                errorTruncatedCount: 0,
            });
            return;
        }

        if (invalid > 0) {
            const failureDetails = getOrderUploadValidationFailureDetails(normalizedRows);
            const historyErrorDetails = buildUploadHistoryErrors(normalizedRows);
            setOrderUploadChannelStatus(channel, `확인 필요 ${invalid}건`, "warning", failureDetails);
            await saveUploadHistoryRecord({
                channel,
                channelLabel,
                fileName: file.name || "",
                fileSize: file.size || 0,
                fileHash: sourceFileHash,
                sourceImportHash,
                status: "failed",
                totalRows: total,
                validRows: valid,
                invalidRows: invalid,
                orderManagementCount: 0,
                crmCount: 0,
                crmSkippedCount: 0,
                failureMessage: failureDetails.failureMessage,
                failureGuide: failureDetails.failureGuide,
                ...historyErrorDetails,
            });
            return;
        }

        if (duplicateRows.length && isFixedOrderUploadChannel(channel)) {
            if (channel === "coupang") {
                await applyCoupangOrdersToMilkrun(normalizedRows, file);
            } else {
                await applyKurlyOrdersToLabel(validationRows, file);
            }

            const uploadedAt = new Date().toISOString();
            const helperLabel = channel === "coupang" ? "밀크런 준비 완료" : "라벨 준비 완료";
            setOrderUploadChannelStatus(
                channel,
                `기존 주문 유지 · ${helperLabel} ${formatMilkrunNumber(valid)}건`,
                "success",
                {
                    sourceFileName: file.name || "",
                    rowCount: valid,
                    uploadedAt,
                },
            );
            await saveUploadHistoryRecord({
                channel,
                channelLabel,
                fileName: file.name || "",
                fileSize: file.size || 0,
                fileHash: sourceFileHash,
                sourceImportHash,
                status: "duplicate",
                totalRows: total,
                validRows: valid,
                invalidRows: 0,
                orderManagementCount: duplicateRows.length,
                crmCount: 0,
                crmSkippedCount: 0,
                duplicateOrderCount: duplicateRows.length,
                failureMessage: "이미 저장된 주문은 유지하고 전용 도우미 데이터를 다시 구성했습니다.",
                failureGuide: channel === "coupang"
                    ? "쿠팡 밀크런에서 발주서 작업판을 확인할 수 있습니다."
                    : "컬리 라벨 생성에서 발주서를 선택해 출력할 수 있습니다.",
                errors: [],
                errorTruncatedCount: 0,
                uploadedAt,
            });
            return;
        }

        orderUploadRows = [
            ...orderUploadRows.filter((row) => row.channel !== channel),
            ...normalizedRows,
        ];
        invalidateOrderProductCandidateCache();
        clearOrderMatchDraftsForChannel(channel);
        normalizedRows.forEach((row) => {
            const matchKey = getOrderProductMatchKey(row.channel, row.productName);
            if (matchKey) confirmedOrderMatchKeys.delete(matchKey);
        });
        renderOrderMatchPanel();

        const syncedOrderRows = normalizedRows.map((row) => ({
            ...row,
            sourceFileName: row.sourceFileName || file.name || "",
            sourceImportHash,
            sourceImportRowCount: valid,
        }));
        await syncOrderManagementRowsFromUpload(channel, syncedOrderRows);
        orderManagementCount = syncedOrderRows.length;
        crmResult = await syncCrmRowsFromOrderUpload(syncedOrderRows);

        if (channel === "coupang") {
            await applyCoupangOrdersToMilkrun(normalizedRows, file);
        } else if (channel === "kurly") {
            await applyKurlyOrdersToLabel(validationRows, file);
        }
        const uploadedAt = new Date().toISOString();
        const keyStatusText = customerKeysGenerated
            ? " · 서버 고객키 생성"
            : "";
        setOrderUploadChannelStatus(channel, `완료 ${valid}건${keyStatusText}`, "success", {
            sourceFileName: file.name || "",
            rowCount: valid,
            uploadedAt,
        });
        await saveUploadHistoryRecord({
            channel,
            channelLabel,
            fileName: file.name || "",
            fileSize: file.size || 0,
            fileHash: sourceFileHash,
            sourceImportHash,
            status: "success",
            totalRows: total,
            validRows: valid,
            invalidRows: 0,
            orderManagementCount,
            crmCount: crmResult?.reflected || 0,
            crmSkippedCount: crmResult?.skipped || 0,
            failureMessage: "",
            failureGuide: "",
            errors: [],
            errorTruncatedCount: 0,
            uploadedAt,
        });
    } catch (error) {
        console.error(error);
        renderOrderMatchPanel();
        const failureDetails = getOrderUploadExceptionFailureDetails(error);
        const historyErrorDetails = buildUploadHistoryErrors(normalizedRows);
        setOrderUploadChannelStatus(channel, "실패", "error", failureDetails);
        await saveUploadHistoryRecord({
            channel,
            channelLabel,
            fileName: file.name || "",
            fileSize: file.size || 0,
            fileHash: sourceFileHash,
            sourceImportHash,
            status: "failed",
            totalRows: total || normalizedRows.length,
            validRows: valid,
            invalidRows: invalid,
            orderManagementCount,
            crmCount: crmResult?.reflected || 0,
            crmSkippedCount: crmResult?.skipped || 0,
            failureMessage: failureDetails.failureMessage,
            failureGuide: failureDetails.failureGuide,
            ...historyErrorDetails,
        });
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

    const workspaceRows = kurlyLabelWorkspaces.map((workspace) => {
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
                    aria-label="${escapeHtml(workspace.title || workspace.id)} 라벨 작업 열기"
                >
                    <span class="milkrun-session-title" title="${escapeHtml(workspace.title || workspace.id)}">${escapeHtml(workspace.title || workspace.id)}</span>
                    <span class="milkrun-session-cell" data-label="상품">${formatMilkrunNumber(summary.rowCount)}행</span>
                    <span class="milkrun-session-cell" data-label="라벨">${formatMilkrunNumber(summary.labelCount)}장</span>
                    <span class="milkrun-session-cell" data-label="센터">${formatMilkrunNumber(summary.centerCount)}개</span>
                    <span class="milkrun-session-cell milkrun-session-updated" data-label="업데이트">${updatedAt ? escapeHtml(updatedAt) : "-"}</span>
                    <span class="milkrun-session-open" aria-hidden="true">열기</span>
                </button>
            </article>
        `;
    }).join("");

    kurlyLabelSessionListEl.innerHTML = `
        <div class="milkrun-session-table-head" aria-hidden="true">
            <span>선택</span>
            <span>발주서명</span>
            <span>상품</span>
            <span>라벨</span>
            <span>센터</span>
            <span>업데이트</span>
            <span>관리</span>
        </div>
        ${workspaceRows}
    `;

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

async function handleDeleteSelectedKurlyLabelWorkspaces() {
    syncSelectedKurlyLabelWorkspaceIds();
    const selectedCount = selectedKurlyLabelWorkspaceIds.size;
    if (!selectedCount) {
        window.alert("삭제할 컬리 발주서를 먼저 선택해주세요.");
        return;
    }

    const message = [
        `선택한 컬리 발주서 ${selectedCount}개를 삭제할까요?`,
        "",
        "해당 발주서와 관련된 주문은 모두 삭제됩니다.",
        "주문에서 자동 반영된 CRM 데이터도 함께 삭제됩니다.",
        "별도로 업로드한 CRM 과거 데이터와 상품 매칭 규칙은 유지됩니다.",
    ].join("\n");
    if (!window.confirm(message)) return;

    const selectedIds = new Set(selectedKurlyLabelWorkspaceIds);
    const selectedWorkspaces = kurlyLabelWorkspaces.filter((workspace) => selectedIds.has(workspace.id));
    const deleteResult = await deleteManagedOrdersForDerivedWorkspaces("kurly", selectedWorkspaces);
    if (deleteResult.aborted) return;
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
    await persistSkuWorkspace();

    const resultParts = [`컬리 발주서 ${selectedCount}개를 삭제했습니다.`];
    if (deleteResult.orderCount) {
        resultParts.push(`관련 주문 ${formatMilkrunNumber(deleteResult.orderCount)}건도 삭제했습니다.`);
    }
    if (deleteResult.crmCount) {
        resultParts.push(`CRM 자동 반영 데이터 ${formatMilkrunNumber(deleteResult.crmCount)}건도 정리했습니다.`);
    }
    if (deleteResult.crmDeleteFailed) {
        resultParts.push("CRM 데이터 정리는 다시 확인해주세요.");
    }
    setKurlyLabelResult(resultParts.join(" "));
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

function getSkuWorkspaceDocRefByUser(userId) {
    if (!userId) return null;
    return doc(db, "users", userId, "preferences", "skuWorkspace");
}

function getSkuWorkspaceDocRef() {
    return getSkuWorkspaceDocRefByUser(skuWorkspaceUserId);
}

function normalizeSkuCategoryLabels(labels = {}) {
    const source = labels && typeof labels === "object" ? labels : {};

    return SKU_CATEGORY_FIELD_KEYS.reduce((accumulator, key) => {
        const fallback = SKU_CATEGORY_LABEL_DEFAULTS[key] ?? key;
        const value = String(source[key] ?? "")
            .trim()
            .slice(0, 20);

        accumulator[key] = value || fallback;
        return accumulator;
    }, {});
}

function normalizeSkuCategoryName(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
}

function normalizeSkuCategoryOptions(options = [], rows = []) {
    const normalizedOptions = [];
    const seenKeys = new Set();
    const appendOption = (value) => {
        const name = normalizeSkuCategoryName(value);
        if (!name) return;
        const compareKey = name.toLocaleLowerCase("ko-KR");
        if (seenKeys.has(compareKey)) return;
        seenKeys.add(compareKey);
        normalizedOptions.push(name);
    };

    SKU_CATEGORY_DEFAULT_OPTIONS.forEach(appendOption);
    (Array.isArray(options) ? options : []).forEach(appendOption);
    (Array.isArray(rows) ? rows : []).forEach((row) => appendOption(row?.category));
    return normalizedOptions;
}

function syncSkuCategoryOptionsFromRows() {
    skuCategoryOptions = normalizeSkuCategoryOptions(skuCategoryOptions, skuRows);
    return skuCategoryOptions;
}

function getSkuCategoryOptions() {
    return syncSkuCategoryOptionsFromRows();
}

function getSkuCategoryLabelInputValues() {
    return SKU_CATEGORY_FIELD_KEYS.reduce((accumulator, key, index) => {
        const input = skuCategoryLabelInputs[index];
        accumulator[key] = input instanceof HTMLInputElement ? input.value : "";
        return accumulator;
    }, {});
}

function setSkuCategoryLabelStatus(message = "", tone = "info") {
    if (!skuCategoryLabelStatusEl) return;

    skuCategoryLabelStatusEl.textContent = message;
    skuCategoryLabelStatusEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") {
        skuCategoryLabelStatusEl.classList.add("is-success");
    } else if (tone === "warning") {
        skuCategoryLabelStatusEl.classList.add("is-warning");
    } else if (tone === "error") {
        skuCategoryLabelStatusEl.classList.add("is-error");
    }
}

function renderSkuCategoryLabelSettingsUi() {
    const normalizedLabels = normalizeSkuCategoryLabels(skuCategoryLabels);

    SKU_CATEGORY_FIELD_KEYS.forEach((key, index) => {
        const input = skuCategoryLabelInputs[index];
        if (input instanceof HTMLInputElement) {
            input.value = normalizedLabels[key] ?? "";
        }
    });
}

function getSkuFieldLabel(key) {
    if (SKU_CATEGORY_FIELD_KEYS.includes(key)) {
        return skuCategoryLabels[key] || SKU_CATEGORY_LABEL_DEFAULTS[key] || key;
    }

    return getFieldByKey(key)?.label ?? key;
}

function buildSkuCustomHeaderAliases() {
    return SKU_CATEGORY_FIELD_KEYS.reduce((accumulator, key) => {
        const label = getSkuFieldLabel(key);
        accumulator[key] = label ? [label] : [];
        return accumulator;
    }, {});
}

function refreshSkuCategoryLabelDependentUi({ renderRows = true } = {}) {
    skuCategoryLabels = normalizeSkuCategoryLabels(skuCategoryLabels);
    renderSkuCategoryLabelSettingsUi();
    renderSkuSearchFieldOptions();
    renderSkuTableHead();

    if (skuHeaderModal && !skuHeaderModal.classList.contains("is-hidden")) {
        renderSkuHeaderCheckboxes(getSkuHeaderConfigOrderKeys(), selectedSkuHeaderKeys);
    }

    if (editingSkuRowId !== null && skuEditModal && !skuEditModal.classList.contains("is-hidden")) {
        openSkuEditModal(editingSkuRowId);
    }

    if (renderRows && skuRows.length) {
        renderCurrentSkuRows();
    } else if (!skuRows.length) {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
    }
    renderCrmDashboard();
}

async function handleSaveSkuCategoryLabels() {
    skuCategoryLabels = normalizeSkuCategoryLabels(getSkuCategoryLabelInputValues());
    refreshSkuCategoryLabelDependentUi({ renderRows: true });
    setSkuCategoryLabelStatus("SKU 분류명을 저장하는 중입니다...", "info");

    const saved = await persistSkuWorkspace();
    setSkuCategoryLabelStatus(
        saved ? "SKU 분류명을 저장했습니다." : "SKU 분류명을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
        saved ? "success" : "error",
    );
}

async function handleResetSkuCategoryLabels() {
    skuCategoryLabels = { ...SKU_CATEGORY_LABEL_DEFAULTS };
    refreshSkuCategoryLabelDependentUi({ renderRows: true });
    setSkuCategoryLabelStatus("SKU 분류명을 기본값으로 되돌리는 중입니다...", "info");

    const saved = await persistSkuWorkspace();
    setSkuCategoryLabelStatus(
        saved ? "SKU 분류명을 기본값으로 되돌렸습니다." : "기본값 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
        saved ? "success" : "error",
    );
}

async function persistSkuWorkspace() {
    const workspaceDocRef = getSkuWorkspaceDocRef();
    if (!workspaceDocRef) return false;

    try {
        syncSkuCategoryOptionsFromRows();
        await setDoc(
            workspaceDocRef,
            {
                schemaVersion: SKU_WORKSPACE_SCHEMA_VERSION,
                selectedSkuHeaderKeys,
                skuColumnWidths: normalizeSkuColumnWidths(skuColumnWidths),
                skuCategoryLabels: normalizeSkuCategoryLabels(skuCategoryLabels),
                skuCategoryOptions,
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

function formatSkuDisplaySummary(summary = {}, displayCount = 0, renderedCount = displayCount) {
    const baseSummary = formatSkuValidationSummary(summary);
    const total = Number(summary.total) || 0;
    const hasFilter = Boolean(skuSearchQuery.trim()) || skuTypeFilterKey !== SKU_TYPE_ALL_KEY;
    if (!hasFilter && displayCount === total && renderedCount === displayCount) return baseSummary;
    if (renderedCount < displayCount) {
        return `${baseSummary}, ${formatMilkrunNumber(displayCount)}건 중 먼저 ${formatMilkrunNumber(renderedCount)}건 표시`;
    }
    const filterLabel = skuTypeFilterKey === SKU_TYPE_ALL_KEY
        ? "검색 결과"
        : ({
            [SKU_TYPE_ACTIVE_KEY]: "전체(단종 제외)",
            [SKU_TYPE_DISCONTINUED_KEY]: "단종",
        }[skuTypeFilterKey] ?? skuTypeFilterKey);
    return `${baseSummary}, ${filterLabel} ${formatMilkrunNumber(displayCount)}건 표시`;
}

function getNormalizedSkuType(value, { preserveUnknown = false } = {}) {
    const text = String(value ?? "").trim();
    if (!text) return SKU_TYPE_DEFAULT;

    const normalizedType = normalizeSkuTypeValue(text, {
        fallback: SKU_TYPE_DEFAULT,
        preserveUnknown: true,
    });
    if (SKU_TYPE_OPTIONS.includes(normalizedType)) return normalizedType;
    return preserveUnknown ? normalizedType : "기타";
}

function shouldMigrateSkuTypeFromCategory(row) {
    const categorySkuType = getSkuTypeFromCategory(row?.category);
    if (!categorySkuType) return false;

    const rawSkuType = String(row?.skuType ?? "").trim();
    const currentSkuType = getNormalizedSkuType(rawSkuType);
    return !rawSkuType
        || (currentSkuType === SKU_TYPE_DEFAULT && categorySkuType !== SKU_TYPE_DEFAULT);
}

function isDiscontinuedSku(row) {
    return normalizeSkuCategoryName(row?.category) === "단종";
}

function skuInlineChangesAffectTypeFilter(changes = []) {
    return changes.some((change) => (
        change.key === "skuType"
        || (
            change.key === "category"
            && (normalizeSkuCategoryName(change.previousValue) === "단종")
                !== (normalizeSkuCategoryName(change.nextValue) === "단종")
        )
    ));
}

function getSkuTypeCounts(rows = skuRows) {
    const counts = Object.fromEntries([
        [SKU_TYPE_ALL_KEY, 0],
        [SKU_TYPE_ACTIVE_KEY, 0],
        ...SKU_TYPE_OPTIONS.map((type) => [type, 0]),
        [SKU_TYPE_DISCONTINUED_KEY, 0],
    ]);

    (rows ?? []).forEach((row) => {
        counts[SKU_TYPE_ALL_KEY] += 1;
        if (isDiscontinuedSku(row)) {
            counts[SKU_TYPE_DISCONTINUED_KEY] += 1;
            return;
        }

        const type = getNormalizedSkuType(row?.skuType);
        counts[SKU_TYPE_ACTIVE_KEY] += 1;
        counts[type] = (counts[type] ?? 0) + 1;
    });
    return counts;
}

function renderSkuTypeTabs() {
    if (!skuTypeTabs) return;

    const counts = getSkuTypeCounts();
    skuTypeTabs.querySelectorAll("[data-sku-type-filter]").forEach((tab) => {
        if (!(tab instanceof HTMLButtonElement)) return;
        const type = tab.getAttribute("data-sku-type-filter") || SKU_TYPE_ALL_KEY;
        const isActive = type === skuTypeFilterKey;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
    });
    skuTypeTabs.querySelectorAll("[data-sku-type-count]").forEach((countEl) => {
        const type = countEl.getAttribute("data-sku-type-count") || SKU_TYPE_ALL_KEY;
        countEl.textContent = formatMilkrunNumber(counts[type] ?? 0);
    });
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

function filterSkuRowsByType(rows) {
    if (skuTypeFilterKey === SKU_TYPE_ALL_KEY) return rows;
    if (skuTypeFilterKey === SKU_TYPE_ACTIVE_KEY) {
        return rows.filter((row) => !isDiscontinuedSku(row));
    }
    if (skuTypeFilterKey === SKU_TYPE_DISCONTINUED_KEY) {
        return rows.filter(isDiscontinuedSku);
    }
    return rows.filter((row) => (
        !isDiscontinuedSku(row)
        && getNormalizedSkuType(row?.skuType) === skuTypeFilterKey
    ));
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
    return sortSkuRowsForDisplay(filterSkuRowsBySearch(filterSkuRowsByType(rows)));
}

function hasExplicitSkuExportFilter() {
    return Boolean(skuSearchQuery.trim()) || skuTypeFilterKey !== SKU_TYPE_ACTIVE_KEY;
}

function getSkuExportSelection() {
    const validationResult = validateSkuRows(skuRows);
    const filtered = hasExplicitSkuExportFilter();
    const rows = filtered
        ? getSkuDisplayRows(validationResult.rows)
        : sortSkuRowsForDisplay(validationResult.rows);
    return { rows, filtered };
}

function getSkuExportFields() {
    const fieldsByKey = new Map(SKU_FIELDS.map((field) => [field.key, field]));
    return selectedSkuHeaderKeys
        .map((key) => fieldsByKey.get(key))
        .filter(Boolean);
}

function updateSkuExportButtonState({
    rowCount = 0,
    filtered = hasExplicitSkuExportFilter(),
    waitingForSearch = !skuSearchHasSubmitted,
} = {}) {
    if (!(skuExportBtn instanceof HTMLButtonElement)) return;

    const exportRowCount = Number.isFinite(Number(rowCount)) ? Number(rowCount) : 0;
    skuExportBtn.disabled = skuExportRunning
        || !skuRows.length
        || waitingForSearch
        || exportRowCount <= 0;
    skuExportBtn.textContent = skuExportRunning
        ? "엑셀 생성 중..."
        : filtered
            ? "현재 결과 엑셀 다운로드"
            : "SKU 엑셀 다운로드";

    if (skuExportRunning) {
        skuExportBtn.title = "엑셀 파일을 만들고 있습니다.";
    } else if (!skuRows.length) {
        skuExportBtn.title = "등록된 SKU가 없습니다.";
    } else if (waitingForSearch) {
        skuExportBtn.title = "검색 버튼을 눌러 결과를 확정해주세요.";
    } else if (exportRowCount <= 0) {
        skuExportBtn.title = "다운로드할 SKU가 없습니다.";
    } else {
        skuExportBtn.title = `${formatMilkrunNumber(exportRowCount)}건을 엑셀로 다운로드합니다.`;
    }
}

async function handleSkuExportDownload() {
    if (skuExportRunning) return;
    if (!skuSearchHasSubmitted) {
        window.alert("검색 버튼을 눌러 결과를 확정한 뒤 다운로드해주세요.");
        return;
    }
    if (activeSkuInlineEdit && !commitSkuInlineEdit()) return;

    const { rows, filtered } = getSkuExportSelection();
    if (!rows.length) {
        updateSkuExportButtonState({ rowCount: 0, filtered, waitingForSearch: false });
        window.alert("다운로드할 SKU가 없습니다.");
        return;
    }
    if (!window.XLSX) {
        window.alert("엑셀 기능을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.");
        return;
    }

    skuExportRunning = true;
    updateSkuExportButtonState({ rowCount: rows.length, filtered, waitingForSearch: false });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    try {
        const filename = downloadSkuExportWorkbook(rows, getSkuExportFields(), window.XLSX, {
            filtered,
            getFieldLabel: (field) => getSkuFieldLabel(field.key),
        });
        skuExportBtn.title = `${formatMilkrunNumber(rows.length)}건 다운로드를 시작했습니다: ${filename}`;
    } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : "SKU 엑셀 다운로드 중 오류가 발생했습니다.");
    } finally {
        skuExportRunning = false;
        updateSkuExportButtonState({ rowCount: rows.length, filtered, waitingForSearch: false });
    }
}

function renderSkuSearchFieldOptions() {
    if (!skuSearchFieldSelect) return;

    const currentValue = getFieldByKey(skuSearchFieldKey) ? skuSearchFieldKey : SKU_SEARCH_ALL_KEY;
    skuSearchFieldSelect.innerHTML = [
        `<option value="${SKU_SEARCH_ALL_KEY}">전체</option>`,
        ...SKU_FIELDS.map((field) => (
            `<option value="${escapeHtml(field.key)}">${escapeHtml(getSkuFieldLabel(field.key))}</option>`
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
    skuSearchHasSubmitted = true;
    skuTypeFilterKey = SKU_TYPE_ACTIVE_KEY;
    skuSortKey = "";
    skuSortDirection = "asc";
    syncSkuSearchControls();
    renderSkuTypeTabs();
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
    syncSkuSelectionControls([]);
}

function setSkuSearchIdleState() {
    if (!skuRows.length) {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 SKU 데이터가 없습니다.");
        return;
    }

    setSkuEmptyTable(`등록된 SKU ${formatMilkrunNumber(skuRows.length)}건이 있습니다. 검색어를 입력하고 검색 버튼을 눌러주세요.`);
    setSkuResult(`SKU ${formatMilkrunNumber(skuRows.length)}건 등록됨 · 검색 버튼을 누르면 결과를 표시합니다.`);
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
    if (key === "skuType") {
        classNames.push("sku-column-type");
    } else if (isSkuImageField(key)) {
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

function getDefaultSkuColumnWidth(key) {
    if (key === "skuType") return 112;
    if (isSkuImageField(key)) return 98;
    if (isSkuNumericField(key)) return 116;
    if (isSkuCodeLikeField(key)) return 166;
    if (isSkuWideTextField(key)) return 240;
    return 150;
}

function clampSkuColumnWidth(value) {
    return Math.round(Math.max(SKU_COLUMN_MIN_WIDTH, Math.min(SKU_COLUMN_MAX_WIDTH, Number(value) || 0)));
}

function normalizeSkuColumnWidths(widths = {}) {
    const source = widths && typeof widths === "object" && !Array.isArray(widths) ? widths : {};
    return SKU_FIELDS.reduce((result, field) => {
        const width = Number(source[field.key]);
        if (Number.isFinite(width) && width > 0) result[field.key] = clampSkuColumnWidth(width);
        return result;
    }, {});
}

function getSkuColumnWidth(key) {
    return skuColumnWidths[key] ?? getDefaultSkuColumnWidth(key);
}

function getSkuColumnInlineStyle(key) {
    const width = getSkuColumnWidth(key);
    return `width:${width}px;min-width:${width}px;max-width:${width}px;`;
}

function updateSkuTableMinWidth() {
    const skuTable = skuTableHead?.closest("table");
    if (!(skuTable instanceof HTMLTableElement)) return;
    const dataColumnWidth = selectedSkuHeaderKeys.reduce((sum, key) => sum + getSkuColumnWidth(key), 0);
    const estimatedWidth = 660 + dataColumnWidth;
    skuTable.style.minWidth = `${Math.max(estimatedWidth, 980)}px`;
}

function applySkuColumnWidth(key, width) {
    const normalizedWidth = clampSkuColumnWidth(width);
    skuColumnWidths = { ...skuColumnWidths, [key]: normalizedWidth };
    const applyWidth = (cell) => {
        if (!(cell instanceof HTMLTableCellElement)) return;
        const widthText = `${normalizedWidth}px`;
        cell.style.width = widthText;
        cell.style.minWidth = widthText;
        cell.style.maxWidth = widthText;
    };

    skuTableHead?.querySelectorAll(`[data-sku-header-key="${key}"]`).forEach((cell) => {
        applyWidth(cell);
    });
    skuTableBody?.querySelectorAll(`[data-sku-inline-key="${key}"]`).forEach((cell) => {
        applyWidth(cell);
    });
    updateSkuTableMinWidth();
    return normalizedWidth;
}

function scheduleSkuColumnWidthPersist() {
    window.clearTimeout(skuColumnWidthPersistTimer);
    skuColumnWidthPersistTimer = window.setTimeout(() => {
        void persistSkuWorkspace();
    }, 300);
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

function normalizeSkuMergeKey(value) {
    return String(value ?? "").trim().toLowerCase();
}

function getNextSkuRowId(rows = []) {
    return (rows ?? []).reduce((maxRowId, row) => {
        const rowId = Number(row?.rowId);
        return Number.isFinite(rowId) ? Math.max(maxRowId, rowId) : maxRowId;
    }, 0) + 1;
}

function normalizePersistableSkuRow(row, rowId) {
    const normalizedRow = { rowId };
    SKU_FIELDS.forEach((field) => {
        const rawValue = String(row?.[field.key] ?? "").trim();
        normalizedRow[field.key] = field.key === "skuType"
            ? getNormalizedSkuType(rawValue, { preserveUnknown: true })
            : (field.key === "category" ? normalizeSkuCategoryName(rawValue) : rawValue);
    });
    return normalizedRow;
}

function mergeSkuRowsFromUpload(existingRows = [], uploadRows = []) {
    const mergedRows = (existingRows ?? []).map((row, index) => (
        normalizePersistableSkuRow(row, Number(row?.rowId) || index + 1)
    ));
    const indexByAdminCode = new Map();

    mergedRows.forEach((row, index) => {
        const mergeKey = normalizeSkuMergeKey(row.adminProductCode);
        if (mergeKey && !indexByAdminCode.has(mergeKey)) {
            indexByAdminCode.set(mergeKey, index);
        }
    });

    let nextRowId = getNextSkuRowId(mergedRows);
    let addedCount = 0;
    let updatedCount = 0;

    (uploadRows ?? []).forEach((uploadRow) => {
        const mergeKey = normalizeSkuMergeKey(uploadRow?.adminProductCode);
        if (!mergeKey) return;

        if (indexByAdminCode.has(mergeKey)) {
            const rowIndex = indexByAdminCode.get(mergeKey);
            const previousRow = mergedRows[rowIndex];
            const nextRow = { ...previousRow };

            SKU_FIELDS.forEach((field) => {
                if (field.key === "skuType" && uploadRow?.__skuTypeProvided === false) return;
                const uploadValue = String(uploadRow?.[field.key] ?? "").trim();
                if (uploadValue) nextRow[field.key] = uploadValue;
            });

            if (uploadRow?.__skuTypeProvided === false) {
                const categorySkuType = getSkuTypeFromCategory(uploadRow?.category);
                if (categorySkuType) nextRow.skuType = categorySkuType;
            }

            mergedRows[rowIndex] = normalizePersistableSkuRow(nextRow, previousRow.rowId);
            updatedCount += 1;
            return;
        }

        const nextRow = normalizePersistableSkuRow(uploadRow, nextRowId);
        mergedRows.push(nextRow);
        indexByAdminCode.set(mergeKey, mergedRows.length - 1);
        nextRowId += 1;
        addedCount += 1;
    });

    return {
        rows: mergedRows,
        addedCount,
        updatedCount,
    };
}

function getDefaultSkuHeaderKeys() {
    return ensureSkuHeaderSelection([
        "skuType",
        "adminProductCode",
        "productName",
        "brand",
        "category",
        "category1",
        "category2",
        "category3",
        "productImageUrl",
    ]);
}

function shouldMigrateSkuCategoryHeaders(savedHeaders = [], savedSchemaVersion = "") {
    if (!savedHeaders.length) return false;
    if (savedSchemaVersion === SKU_WORKSPACE_SCHEMA_VERSION) return false;
    return !SKU_CATEGORY_FIELD_KEYS.some((key) => savedHeaders.includes(key));
}

function addSkuCategoryHeadersAfterCategory(savedHeaders = []) {
    const nextKeys = [...savedHeaders];
    const insertAfterKey = nextKeys.includes("category")
        ? "category"
        : (nextKeys.includes("brand") ? "brand" : "");
    const insertIndex = insertAfterKey ? nextKeys.indexOf(insertAfterKey) + 1 : nextKeys.length;

    nextKeys.splice(insertIndex, 0, ...SKU_CATEGORY_FIELD_KEYS);
    return nextKeys;
}

function getSavedSkuHeaderKeysForCurrentSchema(savedHeaders = [], savedSchemaVersion = "") {
    if (!savedHeaders.length) return getDefaultSkuHeaderKeys();

    let nextHeaders = shouldMigrateSkuCategoryHeaders(savedHeaders, savedSchemaVersion)
        ? addSkuCategoryHeadersAfterCategory(savedHeaders)
        : savedHeaders;

    if (!nextHeaders.includes("skuType")) {
        nextHeaders = ["skuType", ...nextHeaders];
    }

    return ensureSkuHeaderSelection(nextHeaders);
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

function pruneSelectedSkuRowIds() {
    const existingIds = new Set(skuRows.map((row) => row.rowId));
    selectedSkuRowIds = new Set([...selectedSkuRowIds].filter((rowId) => existingIds.has(rowId)));
}

function getCurrentSkuDisplayRows() {
    if (!skuRows.length) return [];
    return getSkuDisplayRows(validateSkuRows(skuRows).rows);
}

function syncSkuSelectionControls(visibleRows = getCurrentSkuDisplayRows()) {
    pruneSelectedSkuRowIds();
    const visibleIds = visibleRows.map((row) => row.rowId).filter((rowId) => Number.isFinite(Number(rowId)));
    const selectedVisibleCount = visibleIds.filter((rowId) => selectedSkuRowIds.has(rowId)).length;
    const selectedCount = selectedSkuRowIds.size;
    const selectAllCheckbox = skuTableHead?.querySelector("[data-sku-select-all]");

    if (selectAllCheckbox instanceof HTMLInputElement) {
        selectAllCheckbox.checked = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
        selectAllCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
        selectAllCheckbox.disabled = !visibleIds.length;
    }

    if (skuDeleteSelectedBtn instanceof HTMLButtonElement) {
        skuDeleteSelectedBtn.disabled = selectedCount === 0;
        skuDeleteSelectedBtn.textContent = selectedCount
            ? `선택 ${formatMilkrunNumber(selectedCount)}개 삭제`
            : "선택 SKU 삭제";
    }
}

function renderSkuTableHead() {
    if (!skuTableHead) return;

    const headerHtml = selectedSkuHeaderKeys
        .map((key) => {
            const fieldLabel = getSkuFieldLabel(key);
            const isSorted = skuSortKey === key;
            const sortDirectionLabel = isSorted && skuSortDirection === "desc" ? "내림차순" : "오름차순";
            const ariaSort = isSorted
                ? (skuSortDirection === "desc" ? "descending" : "ascending")
                : "none";
            const sortIndicator = isSorted
                ? (skuSortDirection === "desc" ? "▼" : "▲")
                : "↕";
            return `
              <th class="sku-draggable-header ${getSkuColumnClassNames(key)}${isSorted ? " is-sorted" : ""}" draggable="true" data-sku-header-key="${key}" aria-sort="${ariaSort}" title="${escapeHtml(fieldLabel)} ${sortDirectionLabel} 정렬" style="${getSkuColumnInlineStyle(key)}">
                <span class="sku-draggable-header-label">${escapeHtml(fieldLabel)}</span>
                <span class="sku-sort-indicator" aria-hidden="true">${sortIndicator}</span>
                <span class="sku-column-resizer" data-sku-column-resizer="${key}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="${escapeHtml(fieldLabel)} 열 너비 조절" title="드래그하여 너비 조절 · 더블클릭하여 기본값 복원"></span>
              </th>
            `;
        })
        .join("");

    skuTableHead.innerHTML = `
    <tr>
      <th class="sku-select-column">
        <input type="checkbox" data-sku-select-all aria-label="표시된 SKU 전체 선택" />
      </th>
      <th class="sku-row-number-column">행</th>
      ${headerHtml}
      <th class="sku-status-column">상태</th>
      <th class="sku-validation-column">오류/주의</th>
      <th class="sku-action-column">수정</th>
      <th class="sku-print-column">라벨 출력</th>
    </tr>
  `;

    updateSkuTableMinWidth();
    syncSkuSelectionControls();
}

function renderSkuTable(rows, emptyMessage = "검증 가능한 데이터가 없습니다.") {
    if (!skuTableBody) return;
    closeSkuCategoryPicker({ restoreFocus: false });
    pruneSelectedSkuRowIds();

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
            .map((key) => {
                const field = getFieldByKey(key);
                const usesCategoryPicker = key === "category";
                const isInlineEditable = !usesCategoryPicker && !Array.isArray(field?.options);
                return `
                  <td class="${getSkuColumnClassNames(key)}${isInlineEditable ? " sku-inline-editable-cell" : ""}${usesCategoryPicker ? " sku-category-picker-cell" : ""}"
                      ${isInlineEditable ? `data-sku-inline-row-id="${row.rowId}"` : ""}
                      ${usesCategoryPicker ? `data-sku-category-row-id="${row.rowId}" role="button" tabindex="0" aria-haspopup="listbox" aria-expanded="false"` : ""}
                      data-sku-inline-key="${key}"
                      style="${getSkuColumnInlineStyle(key)}"
                      title="${isInlineEditable ? "더블클릭하여 수정" : (usesCategoryPicker ? "더블클릭하여 카테고리 선택" : "수정 버튼에서 유형 변경")}">${buildSkuCellMarkup(key, row[key])}</td>
                `;
            })
            .join("");

        return `
      <tr data-sku-rendered-row-id="${row.rowId}" class="${[
            warnings.length && row.isValid ? "is-warning" : "",
            selectedSkuRowIds.has(row.rowId) ? "is-selected" : "",
        ].filter(Boolean).join(" ")}">
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
    syncSkuSelectionControls(rows);
}

function isLikelyImageUrl(value) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    return /^https?:\/\//i.test(text) || /^data:image\//i.test(text) || /^blob:/i.test(text);
}

function buildSkuCellMarkup(key, value) {
    const safeValue = String(value ?? "");
    if (key === "skuType") {
        const skuType = getNormalizedSkuType(safeValue);
        const badgeClass = skuType === "부자재"
            ? "is-material"
            : (skuType === "사은품"
                ? "is-gift"
                : (skuType === "세트상품" ? "is-set" : (skuType === "기타" ? "is-other" : "is-product")));
        return `<span class="sku-type-badge ${badgeClass}">${escapeHtml(skuType)}</span>`;
    }
    if (key === "category") {
        return `
          <span class="sku-category-picker-value${safeValue.trim() ? "" : " is-empty"}">${escapeHtml(safeValue.trim() || "미분류")}</span>
          <span class="milkrun-center-trigger-chev" aria-hidden="true"></span>
        `;
    }
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
        <span>${escapeHtml(getSkuFieldLabel(field.key))}${requiredBadge}</span>
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

function renderCurrentSkuRows({ syncOrderMatches = false, force = false } = {}) {
    if (!force && !isCurrentDashboardView("sku")) {
        if (syncOrderMatches) renderOrderMatchPanel();
        return;
    }

    renderSkuTypeTabs();

    if (!skuRows.length) {
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 SKU 데이터가 없습니다.");
        updateSkuExportButtonState({ rowCount: 0, waitingForSearch: false });
        if (syncOrderMatches) renderOrderMatchPanel();
        return;
    }

    if (!skuSearchHasSubmitted) {
        setSkuSearchIdleState();
        updateSkuExportButtonState({ rowCount: 0, waitingForSearch: true });
        if (syncOrderMatches) renderOrderMatchPanel();
        return;
    }

    const validationResult = validateSkuRows(skuRows);
    const displayRows = getSkuDisplayRows(validationResult.rows);
    const renderedRows = displayRows.slice(0, SKU_TABLE_RENDER_LIMIT);
    renderSkuTable(renderedRows, skuSearchQuery.trim() ? "검색 결과가 없습니다." : "검증 가능한 데이터가 없습니다.");
    setSkuResult(formatSkuDisplaySummary(validationResult.summary, displayRows.length, renderedRows.length));
    const exportFiltered = hasExplicitSkuExportFilter();
    updateSkuExportButtonState({
        rowCount: exportFiltered ? displayRows.length : validationResult.rows.length,
        filtered: exportFiltered,
        waitingForSearch: false,
    });
    if (syncOrderMatches) renderOrderMatchPanel();
}

function handleSkuSearchFieldChange() {
    skuSearchFieldKey = skuSearchFieldSelect?.value || SKU_SEARCH_ALL_KEY;
    skuSearchHasSubmitted = false;
    renderCurrentSkuRows();
}

function handleSkuSearchInput() {
    skuSearchQuery = skuSearchInput instanceof HTMLInputElement ? skuSearchInput.value : "";
    skuSearchHasSubmitted = false;
    renderCurrentSkuRows();
}

function handleRunSkuSearch() {
    skuSearchFieldKey = skuSearchFieldSelect?.value || SKU_SEARCH_ALL_KEY;
    skuSearchQuery = skuSearchInput instanceof HTMLInputElement ? skuSearchInput.value : "";
    skuSearchHasSubmitted = true;
    syncSkuSearchControls();
    renderCurrentSkuRows();
}

function activateSkuTypeFilter(type) {
    const nextType = SKU_TYPE_FILTER_KEYS.includes(type)
        ? type
        : SKU_TYPE_ACTIVE_KEY;
    if (activeSkuInlineEdit && !commitSkuInlineEdit()) return;

    skuTypeFilterKey = nextType;
    skuSearchHasSubmitted = true;
    renderSkuTypeTabs();
    renderCurrentSkuRows();
}

function handleSkuTypeTabClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest("[data-sku-type-filter]");
    if (!(tab instanceof HTMLButtonElement)) return;
    activateSkuTypeFilter(tab.getAttribute("data-sku-type-filter") || SKU_TYPE_ALL_KEY);
}

function handleSkuTypeTabKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...(skuTypeTabs?.querySelectorAll("[data-sku-type-filter]") ?? [])]
        .filter((tab) => tab instanceof HTMLButtonElement);
    const currentTab = event.target instanceof HTMLElement
        ? event.target.closest("[data-sku-type-filter]")
        : null;
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex < 0 || !tabs.length) return;

    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;

    const nextTab = tabs[nextIndex];
    nextTab.focus();
    activateSkuTypeFilter(nextTab.getAttribute("data-sku-type-filter") || SKU_TYPE_ALL_KEY);
}

function getSkuColumnResizeHandle(target) {
    if (!(target instanceof HTMLElement)) return null;
    const handle = target.closest("[data-sku-column-resizer]");
    return handle instanceof HTMLElement ? handle : null;
}

function handleSkuColumnResizePointerDown(event) {
    const handle = getSkuColumnResizeHandle(event.target);
    if (!handle) return;
    const key = handle.getAttribute("data-sku-column-resizer") || "";
    const headerCell = handle.closest("th[data-sku-header-key]");
    if (!key || !(headerCell instanceof HTMLTableCellElement)) return;

    event.preventDefault();
    event.stopPropagation();
    draggingSkuHeaderKey = "";
    clearSkuHeaderDragClasses();

    skuColumnResizeState = {
        pointerId: event.pointerId,
        key,
        startX: event.clientX,
        startWidth: headerCell.getBoundingClientRect().width,
        currentWidth: getSkuColumnWidth(key),
        handle,
        headerCell,
    };
    headerCell.draggable = false;
    handle.classList.add("is-resizing");
    document.body.classList.add("is-sku-column-resizing");
    try {
        handle.setPointerCapture(event.pointerId);
    } catch (error) {
        console.debug("SKU 열 너비 포인터 캡처를 사용할 수 없습니다.", error);
    }
}

function handleSkuColumnResizePointerMove(event) {
    const state = skuColumnResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextWidth = applySkuColumnWidth(state.key, state.startWidth + event.clientX - state.startX);
    state.currentWidth = nextWidth;
    state.handle.setAttribute("aria-valuenow", String(nextWidth));
}

function finishSkuColumnResize(event) {
    const state = skuColumnResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
        if (state.handle.hasPointerCapture(event.pointerId)) state.handle.releasePointerCapture(event.pointerId);
    } catch (error) {
        console.debug("SKU 열 너비 포인터 캡처 해제를 건너뜁니다.", error);
    }
    state.headerCell.draggable = true;
    state.handle.classList.remove("is-resizing");
    document.body.classList.remove("is-sku-column-resizing");
    skuColumnResizeState = null;
    lastSkuHeaderDragEndedAt = Date.now();
    scheduleSkuColumnWidthPersist();
}

function handleSkuColumnResizeDoubleClick(event) {
    const handle = getSkuColumnResizeHandle(event.target);
    if (!handle) return;
    const key = handle.getAttribute("data-sku-column-resizer") || "";
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    const defaultWidth = applySkuColumnWidth(key, getDefaultSkuColumnWidth(key));
    handle.setAttribute("aria-valuenow", String(defaultWidth));
    lastSkuHeaderDragEndedAt = Date.now();
    scheduleSkuColumnWidthPersist();
    showSkuInlineToast(`${getSkuFieldLabel(key)} 열 너비를 기본값으로 복원했습니다.`, { duration: 3000 });
}

function handleSkuColumnResizeKeyDown(event) {
    const handle = getSkuColumnResizeHandle(event.target);
    if (!handle) return;
    const key = handle.getAttribute("data-sku-column-resizer") || "";
    if (!key) return;

    let nextWidth = getSkuColumnWidth(key);
    if (event.key === "ArrowLeft") {
        nextWidth -= event.shiftKey ? 24 : 8;
    } else if (event.key === "ArrowRight") {
        nextWidth += event.shiftKey ? 24 : 8;
    } else if (event.key === "Home") {
        nextWidth = getDefaultSkuColumnWidth(key);
    } else {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    nextWidth = applySkuColumnWidth(key, nextWidth);
    handle.setAttribute("aria-valuenow", String(nextWidth));
    lastSkuHeaderDragEndedAt = Date.now();
    scheduleSkuColumnWidthPersist();
}

function handleSkuHeaderSortClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (getSkuColumnResizeHandle(target)) return;

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
    target.closest("tr")?.classList.toggle("is-selected", target.checked);
    syncSkuSelectionControls();
}

function handleSkuSelectAllChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-sku-select-all]")) return;

    const visibleRows = getCurrentSkuDisplayRows();
    visibleRows.forEach((row) => {
        if (target.checked) {
            selectedSkuRowIds.add(row.rowId);
        } else {
            selectedSkuRowIds.delete(row.rowId);
        }
    });
    renderCurrentSkuRows();
}

function handleDeleteSelectedSkuRows() {
    if (!selectedSkuRowIds.size) {
        window.alert("삭제할 SKU를 먼저 선택해주세요.");
        return;
    }

    skuRows = skuRows.filter((row) => !selectedSkuRowIds.has(row.rowId));
    selectedSkuRowIds = new Set();
    standardizeOrderManagementRows({ persist: true, render: true });

    if (!skuRows.length) {
        updateSelectedFileName(null, skuFileNameEl);
        renderSkuTypeTabs();
        setSkuEmptyTable("선택한 SKU를 모두 삭제했습니다. 새 파일을 업로드해주세요.");
        setSkuResult("SKU 목록이 비어 있습니다.");
        syncSkuSelectionControls([]);
        renderOrderMatchPanel();
        rebuildMilkrunWorkspacesFromSkuData({ persist: false });
        void persistSkuWorkspace();
        return;
    }

    renderCurrentSkuRows({ syncOrderMatches: true });
    rebuildMilkrunWorkspacesFromSkuData({ persist: false });
    void persistSkuWorkspace();
}

function openSkuEditModal(rowId) {
    const targetRow = skuRows.find((row) => row.rowId === rowId);
    if (!targetRow || !skuEditModal || !skuEditForm) return;

    editingSkuRowId = rowId;
    const editableKeys = ensureSkuHeaderSelection([...selectedSkuHeaderKeys, ...SKU_REQUIRED_KEYS]);

    skuEditForm.innerHTML = editableKeys.map((key) => {
        const value = escapeHtml(targetRow[key] ?? "");
        const field = getFieldByKey(key);
        const fieldLabel = getSkuFieldLabel(key);
        const editOptions = key === "category"
            ? ["", ...getSkuCategoryOptions()]
            : (Array.isArray(field?.options) ? field.options : null);
        const selectedValue = key === "skuType"
            ? getNormalizedSkuType(targetRow[key])
            : String(targetRow[key] ?? "");
        const editControl = Array.isArray(editOptions)
            ? `
              <select data-sku-edit-key="${key}">
                ${editOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${selectedValue === option ? "selected" : ""}>${escapeHtml(option || "카테고리 없음")}</option>
                `).join("")}
              </select>
            `
            : `<input type="text" data-sku-edit-key="${key}" value="${value}" />`;
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
        <label>${escapeHtml(fieldLabel)}</label>
        ${editControl}
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
        lookup.set(normalizeLookupToken(getSkuFieldLabel(field.key)), fieldValue);
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

    if (activeSkuInlineEdit && !activeSkuInlineEdit.cell.contains(target)) {
        if (!commitSkuInlineEdit()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

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

function getSkuCategoryPickerItems(searchTerm = "") {
    const options = getSkuCategoryOptions();
    const normalizedSearch = normalizeSkuCategoryName(searchTerm);
    const compareSearch = normalizedSearch.toLocaleLowerCase("ko-KR");
    const matchedOptions = compareSearch
        ? options.filter((category) => category.toLocaleLowerCase("ko-KR").includes(compareSearch))
        : options;
    const items = matchedOptions.map((category) => ({
        type: "option",
        value: category,
    }));

    if (!compareSearch) {
        items.unshift({ type: "clear", value: "" });
    } else {
        const hasExactMatch = options.some((category) => (
            category.toLocaleLowerCase("ko-KR") === compareSearch
        ));
        if (!hasExactMatch) {
            items.push({
                type: "create",
                value: normalizedSearch,
            });
        }
    }

    return {
        items,
        matchedCount: matchedOptions.length,
        totalCount: options.length,
    };
}

function getSkuCategoryPickerPopover() {
    let popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);
    if (popover) return popover;

    popover = document.createElement("div");
    popover.id = SKU_CATEGORY_PICKER_POPOVER_ID;
    popover.className = "milkrun-center-picker-popover sku-category-picker-popover";
    popover.setAttribute("role", "dialog");
    popover.addEventListener("input", handleSkuCategoryPickerInput);
    popover.addEventListener("compositionstart", handleSkuCategoryPickerCompositionStart);
    popover.addEventListener("compositionend", handleSkuCategoryPickerCompositionEnd);
    popover.addEventListener("click", handleSkuCategoryPickerClick);
    popover.addEventListener("keydown", handleSkuCategoryPickerKeydown);
    document.body.appendChild(popover);
    return popover;
}

function closeSkuCategoryPicker(options = {}) {
    const { restoreFocus = true } = options;
    const previousPicker = activeSkuCategoryPicker;
    const popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);

    if (previousPicker?.anchorEl) {
        previousPicker.anchorEl.classList.remove("is-open");
        previousPicker.anchorEl.setAttribute("aria-expanded", "false");
        if (restoreFocus && previousPicker.anchorEl.isConnected) {
            previousPicker.anchorEl.focus();
        }
    }
    popover?.remove();
    activeSkuCategoryPicker = null;
}

function positionSkuCategoryPicker() {
    if (!activeSkuCategoryPicker?.anchorEl?.isConnected) {
        closeSkuCategoryPicker({ restoreFocus: false });
        return;
    }

    const popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);
    if (!popover) return;

    const anchorRect = activeSkuCategoryPicker.anchorEl.getBoundingClientRect();
    if (anchorRect.width === 0 || anchorRect.height === 0) {
        closeSkuCategoryPicker({ restoreFocus: false });
        return;
    }

    const margin = 10;
    const width = Math.min(340, Math.max(280, anchorRect.width + 110));
    const availableBelow = window.innerHeight - anchorRect.bottom - margin;
    const availableAbove = anchorRect.top - margin;
    const openAbove = availableBelow < 250 && availableAbove > availableBelow;
    const availableHeight = Math.max(168, Math.min(340, openAbove ? availableAbove : availableBelow));

    popover.style.width = `${width}px`;
    popover.style.setProperty("--milkrun-picker-list-max", `${Math.max(88, availableHeight - 100)}px`);

    const adjustedLeft = Math.min(
        Math.max(anchorRect.left, margin),
        window.innerWidth - width - margin,
    );
    popover.style.left = `${adjustedLeft}px`;

    const popoverRect = popover.getBoundingClientRect();
    const adjustedTop = openAbove
        ? Math.max(margin, anchorRect.top - popoverRect.height - 6)
        : Math.min(anchorRect.bottom + 6, window.innerHeight - popoverRect.height - margin);

    popover.style.top = `${adjustedTop}px`;
    popover.classList.toggle("is-above", openAbove);
}

function getSkuCategoryPickerOptionList(row, items) {
    if (!items.length) {
        return '<div class="milkrun-center-picker-empty">등록된 카테고리가 없습니다.</div>';
    }

    const currentCategory = normalizeSkuCategoryName(row?.category);
    return items.map((item, index) => {
        const selected = item.type !== "create" && item.value === currentCategory;
        const highlighted = index === activeSkuCategoryPicker?.highlightedIndex;
        const label = item.type === "clear" ? "카테고리 없음" : item.value;
        const tag = item.type === "create"
            ? "새로 추가"
            : (selected ? "선택됨" : (item.type === "clear" ? "미지정" : ""));

        return `
          <button
              class="milkrun-center-picker-option${selected ? " is-selected" : ""}${highlighted ? " is-active" : ""}"
              data-sku-category-option-index="${index}"
              type="button"
              role="option"
              aria-selected="${selected ? "true" : "false"}"
          >
              <span class="milkrun-center-picker-option-name">${escapeHtml(label)}</span>
              ${tag ? `<span class="milkrun-center-picker-option-tag">${tag}</span>` : ""}
          </button>
        `;
    }).join("");
}

function updateSkuCategoryPickerResults() {
    if (!activeSkuCategoryPicker) return;

    const popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);
    const row = skuRows.find((item) => Number(item.rowId) === Number(activeSkuCategoryPicker.rowId));
    if (!popover || !row) {
        closeSkuCategoryPicker({ restoreFocus: false });
        return;
    }

    const pickerData = getSkuCategoryPickerItems(activeSkuCategoryPicker.searchTerm);
    if (activeSkuCategoryPicker.highlightedIndex >= pickerData.items.length) {
        activeSkuCategoryPicker.highlightedIndex = Math.max(0, pickerData.items.length - 1);
    }

    const countEl = popover.querySelector("[data-sku-category-picker-count]");
    if (countEl) {
        countEl.textContent = `${pickerData.matchedCount} / ${pickerData.totalCount}`;
    }

    const listEl = popover.querySelector("[data-sku-category-picker-list]");
    if (listEl) {
        listEl.innerHTML = getSkuCategoryPickerOptionList(row, pickerData.items);
    }

    positionSkuCategoryPicker();
    popover.querySelector(".milkrun-center-picker-option.is-active")?.scrollIntoView({ block: "nearest" });
}

function renderSkuCategoryPicker() {
    if (!activeSkuCategoryPicker) return;

    const popover = getSkuCategoryPickerPopover();
    const row = skuRows.find((item) => Number(item.rowId) === Number(activeSkuCategoryPicker.rowId));
    if (!row) {
        closeSkuCategoryPicker({ restoreFocus: false });
        return;
    }

    popover.innerHTML = `
      <div class="milkrun-center-picker-head">
        <strong>카테고리 선택</strong>
        <span data-sku-category-picker-count></span>
      </div>
      <input
          class="milkrun-center-picker-search"
          data-sku-category-picker-search
          type="search"
          value="${escapeHtml(activeSkuCategoryPicker.searchTerm)}"
          placeholder="카테고리 검색 또는 추가"
          autocomplete="off"
      />
      <div class="milkrun-center-picker-list" data-sku-category-picker-list role="listbox"></div>
    `;

    updateSkuCategoryPickerResults();

    const searchInput = popover.querySelector("[data-sku-category-picker-search]");
    if (searchInput instanceof HTMLInputElement) {
        searchInput.focus({ preventScroll: true });
        const caretPosition = searchInput.value.length;
        searchInput.setSelectionRange(caretPosition, caretPosition);
    }
}

function openSkuCategoryPicker(cell) {
    if (!(cell instanceof HTMLTableCellElement)) return;
    const rowId = Number(cell.getAttribute("data-sku-category-row-id"));
    const row = skuRows.find((item) => Number(item.rowId) === rowId);
    if (!row) return;

    if (activeSkuInlineEdit && !commitSkuInlineEdit()) return;
    if (activeSkuCategoryPicker?.rowId === rowId) {
        closeSkuCategoryPicker();
        return;
    }

    closeOrderSkuPicker({ restoreFocus: false });
    closeMilkrunCenterPicker({ restoreFocus: false });
    closeSkuCategoryPicker({ restoreFocus: false });

    const options = getSkuCategoryOptions();
    const selectedIndex = options.findIndex((category) => category === normalizeSkuCategoryName(row.category));
    activeSkuCategoryPicker = {
        anchorEl: cell,
        highlightedIndex: selectedIndex >= 0 ? selectedIndex + 1 : 0,
        isComposing: false,
        rowId,
        searchTerm: "",
    };
    cell.classList.add("is-open");
    cell.setAttribute("aria-expanded", "true");
    renderSkuCategoryPicker();
}

function selectSkuCategoryForRow(rowId, nextCategory) {
    const normalizedCategory = normalizeSkuCategoryName(nextCategory);
    const row = skuRows.find((item) => Number(item.rowId) === Number(rowId));
    if (!row) return;

    const previousValue = normalizeSkuCategoryName(row.category);
    const previousSkuType = getNormalizedSkuType(row.skuType);
    const categorySkuType = getSkuTypeFromCategory(normalizedCategory);
    if (normalizedCategory) {
        skuCategoryOptions = normalizeSkuCategoryOptions(
            [...skuCategoryOptions, normalizedCategory],
            skuRows,
        );
    }

    closeSkuCategoryPicker({ restoreFocus: false });
    const changes = [];
    if (normalizedCategory !== previousValue) {
        changes.push({
            key: "category",
            previousValue,
            nextValue: normalizedCategory,
        });
    }
    if (categorySkuType && categorySkuType !== previousSkuType) {
        changes.push({
            key: "skuType",
            previousValue: previousSkuType,
            nextValue: categorySkuType,
        });
    }
    if (!changes.length) return;

    const nextValues = Object.fromEntries(changes.map((change) => [change.key, change.nextValue]));
    const validationRow = applySkuInlineValues(rowId, nextValues);
    if (skuInlineChangesAffectTypeFilter(changes)) {
        renderCurrentSkuRows();
    } else {
        const cell = getSkuRenderedRow(rowId)?.querySelector('[data-sku-inline-key="category"]');
        if (cell instanceof HTMLTableCellElement) {
            renderSkuInlineCellValue(cell, "category", normalizedCategory, { saved: true });
        }
        updateSkuRenderedRowValidation(validationRow);
    }

    const token = `${Date.now()}-${rowId}-category`;
    const editRecord = {
        token,
        rowId,
        key: "category",
        previousValue,
        nextValue: normalizedCategory,
        changes,
    };
    lastSkuInlineEdit = editRecord;
    showSkuInlineToast(
        categorySkuType && categorySkuType !== previousSkuType
            ? "카테고리와 SKU 유형 저장 완료"
            : "카테고리 저장 완료",
        { undoRecord: editRecord },
    );
    void persistSkuInlineUpdate(editRecord);
}

function handleSkuCategoryPickerInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-sku-category-picker-search]")) return;
    if (!activeSkuCategoryPicker) return;
    if (event.isComposing || activeSkuCategoryPicker.isComposing) return;

    activeSkuCategoryPicker.searchTerm = target.value;
    activeSkuCategoryPicker.highlightedIndex = 0;
    updateSkuCategoryPickerResults();
}

function handleSkuCategoryPickerCompositionStart(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-sku-category-picker-search]")) return;
    if (!activeSkuCategoryPicker) return;
    activeSkuCategoryPicker.isComposing = true;
}

function handleSkuCategoryPickerCompositionEnd(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches("[data-sku-category-picker-search]")) return;
    if (!activeSkuCategoryPicker) return;

    activeSkuCategoryPicker.isComposing = false;
    activeSkuCategoryPicker.searchTerm = target.value;
    activeSkuCategoryPicker.highlightedIndex = 0;
    updateSkuCategoryPickerResults();
}

function handleSkuCategoryPickerClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !activeSkuCategoryPicker) return;
    const option = target.closest("[data-sku-category-option-index]");
    if (!(option instanceof HTMLButtonElement)) return;

    const optionIndex = Number(option.getAttribute("data-sku-category-option-index"));
    const pickerData = getSkuCategoryPickerItems(activeSkuCategoryPicker.searchTerm);
    const nextItem = pickerData.items[optionIndex];
    if (!nextItem) return;
    selectSkuCategoryForRow(activeSkuCategoryPicker.rowId, nextItem.value);
}

function handleSkuCategoryPickerKeydown(event) {
    if (!activeSkuCategoryPicker) return;

    const pickerData = getSkuCategoryPickerItems(activeSkuCategoryPicker.searchTerm);
    if (event.key === "Escape") {
        event.preventDefault();
        closeSkuCategoryPicker();
        return;
    }
    if (event.key === "ArrowDown") {
        event.preventDefault();
        activeSkuCategoryPicker.highlightedIndex = pickerData.items.length
            ? (activeSkuCategoryPicker.highlightedIndex + 1) % pickerData.items.length
            : 0;
        updateSkuCategoryPickerResults();
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        activeSkuCategoryPicker.highlightedIndex = pickerData.items.length
            ? (activeSkuCategoryPicker.highlightedIndex - 1 + pickerData.items.length) % pickerData.items.length
            : 0;
        updateSkuCategoryPickerResults();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        const nextItem = pickerData.items[activeSkuCategoryPicker.highlightedIndex];
        if (nextItem) {
            selectSkuCategoryForRow(activeSkuCategoryPicker.rowId, nextItem.value);
        }
    }
}

function handleSkuCategoryPickerOutsideClick(event) {
    if (!activeSkuCategoryPicker) return;
    const target = event.target;
    if (!(target instanceof Node)) return;

    const popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);
    if (popover?.contains(target)) return;
    if (target instanceof HTMLElement && target.closest("[data-sku-category-row-id]")) return;
    closeSkuCategoryPicker({ restoreFocus: false });
}

function handleSkuCategoryPickerViewportChange(event) {
    if (!activeSkuCategoryPicker) return;
    const target = event?.target;
    const popover = document.getElementById(SKU_CATEGORY_PICKER_POPOVER_ID);
    if (target instanceof Node && popover?.contains(target)) return;
    positionSkuCategoryPicker();
}

function ensureSkuInlineToast() {
    let toast = document.getElementById("sku-inline-edit-toast");
    if (toast instanceof HTMLElement) return toast;

    toast = document.createElement("div");
    toast.id = "sku-inline-edit-toast";
    toast.className = "sku-inline-edit-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
}

function hideSkuInlineToast() {
    if (skuInlineToastTimer) {
        window.clearTimeout(skuInlineToastTimer);
        skuInlineToastTimer = null;
    }
    const toast = document.getElementById("sku-inline-edit-toast");
    toast?.classList.remove("is-visible", "is-error");
}

function showSkuInlineToast(message, { undoRecord = null, tone = "success", duration = 5000 } = {}) {
    const toast = ensureSkuInlineToast();
    if (skuInlineToastTimer) window.clearTimeout(skuInlineToastTimer);

    const undoToken = undoRecord?.token || "";
    toast.classList.toggle("is-error", tone === "error");
    toast.innerHTML = `
      <span class="sku-inline-edit-toast-message">${escapeHtml(message)}</span>
      ${undoToken ? `<button type="button" data-sku-inline-undo="${escapeHtml(undoToken)}">실행 취소</button>` : ""}
    `;
    const undoButton = toast.querySelector("button[data-sku-inline-undo]");
    if (undoButton instanceof HTMLButtonElement) {
        undoButton.addEventListener("click", (event) => {
            event.preventDefault();
            handleUndoSkuInlineEdit(undoRecord);
        });
    }
    toast.classList.add("is-visible");
    skuInlineToastTimer = window.setTimeout(hideSkuInlineToast, duration);
}

function getSkuRenderedRow(rowId) {
    return skuTableBody?.querySelector(`[data-sku-rendered-row-id="${rowId}"]`) ?? null;
}

function updateSkuRenderedRowValidation(validationRow) {
    if (!validationRow) return;
    const rowEl = getSkuRenderedRow(validationRow.rowId);
    if (!(rowEl instanceof HTMLTableRowElement)) return;

    const errors = Array.isArray(validationRow.errors) ? validationRow.errors : [];
    const warnings = Array.isArray(validationRow.warnings) ? validationRow.warnings : [];
    const status = validationRow.isValid ? (warnings.length ? "주의" : "정상") : "오류";
    const statusClass = validationRow.isValid ? (warnings.length ? "is-warning" : "is-normal") : "is-error";
    const validationMessages = [
        ...errors.map((message) => `[오류] ${message}`),
        ...warnings.map((message) => `[주의] ${message}`),
    ];

    rowEl.classList.toggle("is-warning", Boolean(warnings.length && validationRow.isValid));
    const statusCell = rowEl.querySelector(".sku-status-column");
    if (statusCell instanceof HTMLTableCellElement) {
        statusCell.innerHTML = `<span class="sku-status-badge ${statusClass}">${status}</span>`;
    }
    const validationCell = rowEl.querySelector(".sku-validation-column");
    if (validationCell instanceof HTMLTableCellElement) {
        validationCell.textContent = validationMessages.length ? validationMessages.join("; ") : "-";
    }
}

function renderSkuInlineCellValue(cell, key, value, { saved = false } = {}) {
    if (!(cell instanceof HTMLTableCellElement)) return;
    cell.classList.remove("is-inline-editing", "is-inline-invalid");
    cell.removeAttribute("aria-invalid");
    cell.innerHTML = buildSkuCellMarkup(key, value);
    if (saved) {
        cell.classList.remove("is-inline-saved");
        window.requestAnimationFrame(() => cell.classList.add("is-inline-saved"));
        window.setTimeout(() => cell.classList.remove("is-inline-saved"), 1100);
    }
}

function cancelSkuInlineEdit() {
    const edit = activeSkuInlineEdit;
    if (!edit) return;
    activeSkuInlineEdit = null;
    renderSkuInlineCellValue(edit.cell, edit.key, edit.originalValue);
}

function getSkuInlineUpdateError(nextRows, rowId, key, nextValue) {
    if (key === "adminProductCode" && nextValue) {
        const normalizedCode = normalizeSkuMergeKey(nextValue);
        const duplicateRow = skuRows.find((row) => (
            Number(row.rowId) !== Number(rowId)
            && normalizeSkuMergeKey(row.adminProductCode) === normalizedCode
        ));
        if (duplicateRow) {
            return `이미 ${duplicateRow.rowId}행에서 사용 중인 어드민 상품코드입니다.`;
        }
    }

    const validationResult = validateSkuRows(nextRows);
    const validationRow = validationResult.rows.find((row) => Number(row.rowId) === Number(rowId));
    return validationRow && !validationRow.isValid
        ? (validationRow.errors ?? []).join(" ")
        : "";
}

function showSkuInlineInputError(edit, message) {
    if (!edit || !(edit.cell instanceof HTMLTableCellElement)) return;
    edit.cell.classList.add("is-inline-invalid");
    edit.cell.setAttribute("aria-invalid", "true");
    let errorEl = edit.cell.querySelector(".sku-inline-edit-error");
    if (!(errorEl instanceof HTMLElement)) {
        errorEl = document.createElement("div");
        errorEl.className = "sku-inline-edit-error";
        edit.cell.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.id = "sku-inline-current-error";
    edit.input.setAttribute("aria-invalid", "true");
    edit.input.setAttribute("aria-describedby", errorEl.id);
    window.setTimeout(() => edit.input.focus(), 0);
}

function clearSkuInlineInputError(edit = activeSkuInlineEdit) {
    if (!edit) return;
    edit.cell.classList.remove("is-inline-invalid");
    edit.cell.removeAttribute("aria-invalid");
    edit.cell.querySelector(".sku-inline-edit-error")?.remove();
    edit.input.removeAttribute("aria-invalid");
    edit.input.removeAttribute("aria-describedby");
}

function queueSkuInlinePersist() {
    skuInlinePersistQueue = skuInlinePersistQueue
        .catch(() => false)
        .then(() => persistSkuWorkspace());
    return skuInlinePersistQueue;
}

function applySkuInlineValues(rowId, values = {}) {
    const rowIndex = skuRows.findIndex((row) => Number(row.rowId) === Number(rowId));
    if (rowIndex < 0) return null;

    const previousRow = skuRows[rowIndex];
    const nextRows = [...skuRows];
    nextRows[rowIndex] = { ...nextRows[rowIndex], ...values };
    const migratedOrderMatches = migrateOrderMatchSkuReferences(previousRow, nextRows[rowIndex]);
    skuRows = nextRows;
    if (migratedOrderMatches) void saveOrderProductMatches();
    standardizeOrderManagementRows({ persist: true, render: true });
    const validationResult = validateSkuRows(skuRows);
    const validationRow = validationResult.rows.find((row) => Number(row.rowId) === Number(rowId));
    updateSkuRenderedRowValidation(validationRow);
    rebuildMilkrunWorkspacesFromSkuData({ persist: false });
    renderOrderMatchPanel();
    return validationRow;
}

function applySkuInlineValue(rowId, key, value) {
    return applySkuInlineValues(rowId, { [key]: value });
}

function getSkuInlineEditChanges(editRecord) {
    if (Array.isArray(editRecord?.changes) && editRecord.changes.length) {
        return editRecord.changes;
    }
    if (!editRecord?.key) return [];
    return [{
        key: editRecord.key,
        previousValue: editRecord.previousValue,
        nextValue: editRecord.nextValue,
    }];
}

function skuRowMatchesInlineEditValues(row, changes, valueKey) {
    return changes.every((change) => (
        String(row?.[change.key] ?? "") === String(change?.[valueKey] ?? "")
    ));
}

function renderSkuInlineEditChanges(editRecord, valueKey, validationRow) {
    const changes = getSkuInlineEditChanges(editRecord);
    if (skuInlineChangesAffectTypeFilter(changes)) {
        renderCurrentSkuRows();
        return;
    }

    changes.forEach((change) => {
        const cell = getSkuRenderedRow(editRecord.rowId)
            ?.querySelector(`[data-sku-inline-key="${change.key}"]`);
        if (cell instanceof HTMLTableCellElement && activeSkuInlineEdit?.cell !== cell) {
            renderSkuInlineCellValue(cell, change.key, change[valueKey]);
        }
    });
    updateSkuRenderedRowValidation(validationRow);
}

async function persistSkuInlineUpdate(editRecord) {
    const saved = await queueSkuInlinePersist();
    if (saved) return;

    const changes = getSkuInlineEditChanges(editRecord);
    const currentRow = skuRows.find((row) => Number(row.rowId) === Number(editRecord.rowId));
    if (skuRowMatchesInlineEditValues(currentRow, changes, "nextValue")) {
        const previousValues = Object.fromEntries(
            changes.map((change) => [change.key, change.previousValue]),
        );
        const validationRow = applySkuInlineValues(editRecord.rowId, previousValues);
        renderSkuInlineEditChanges(editRecord, "previousValue", validationRow);
    }
    if (lastSkuInlineEdit?.token === editRecord.token) lastSkuInlineEdit = null;
    showSkuInlineToast("저장하지 못해 이전 값으로 복원했습니다.", { tone: "error", duration: 6500 });
}

function commitSkuInlineEdit() {
    const edit = activeSkuInlineEdit;
    if (!edit) return true;

    const nextValue = edit.input.value.trim();
    if (nextValue === edit.originalValue) {
        activeSkuInlineEdit = null;
        renderSkuInlineCellValue(edit.cell, edit.key, edit.originalValue);
        return true;
    }

    const rowIndex = skuRows.findIndex((row) => Number(row.rowId) === Number(edit.rowId));
    if (rowIndex < 0) {
        cancelSkuInlineEdit();
        return false;
    }
    const nextRows = [...skuRows];
    nextRows[rowIndex] = { ...nextRows[rowIndex], [edit.key]: nextValue };
    const errorMessage = getSkuInlineUpdateError(nextRows, edit.rowId, edit.key, nextValue);
    if (errorMessage) {
        showSkuInlineInputError(edit, errorMessage);
        return false;
    }

    activeSkuInlineEdit = null;
    const validationRow = applySkuInlineValue(edit.rowId, edit.key, nextValue);
    renderSkuInlineCellValue(edit.cell, edit.key, nextValue, { saved: true });
    updateSkuRenderedRowValidation(validationRow);

    const token = `${Date.now()}-${edit.rowId}-${edit.key}`;
    const editRecord = {
        token,
        rowId: edit.rowId,
        key: edit.key,
        previousValue: edit.originalValue,
        nextValue,
    };
    lastSkuInlineEdit = editRecord;
    showSkuInlineToast(`${getSkuFieldLabel(edit.key)} 저장 완료`, { undoRecord: editRecord });
    void persistSkuInlineUpdate(editRecord);
    return true;
}

function startSkuInlineEdit(cell) {
    if (!(cell instanceof HTMLTableCellElement)) return;
    const rowId = Number(cell.dataset.skuInlineRowId);
    const key = cell.dataset.skuInlineKey || "";
    const row = skuRows.find((item) => Number(item.rowId) === rowId);
    if (!row || !getFieldByKey(key)) return;

    if (activeSkuInlineEdit?.cell === cell) return;
    if (activeSkuInlineEdit && !commitSkuInlineEdit()) return;

    hideSkuInlineToast();
    const originalValue = String(row[key] ?? "");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sku-inline-edit-input";
    input.value = originalValue;
    input.autocomplete = "off";
    input.setAttribute("aria-label", `${getSkuFieldLabel(key)} 수정`);
    if (isSkuNumericField(key)) input.inputMode = "decimal";
    if (isSkuCodeLikeField(key)) input.spellcheck = false;

    cell.classList.add("is-inline-editing");
    cell.innerHTML = "";
    cell.appendChild(input);
    activeSkuInlineEdit = { cell, input, rowId, key, originalValue };
    input.focus();
    input.select();
}

function handleSkuTableDoubleClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const categoryCell = target.closest("td[data-sku-category-row-id]");
    if (categoryCell instanceof HTMLTableCellElement) {
        event.preventDefault();
        openSkuCategoryPicker(categoryCell);
        return;
    }
    const cell = target.closest("td[data-sku-inline-row-id][data-sku-inline-key]");
    if (cell instanceof HTMLTableCellElement) startSkuInlineEdit(cell);
}

function handleSkuInlineFocusOut(event) {
    if (!(event.target instanceof HTMLInputElement) || event.target !== activeSkuInlineEdit?.input) return;
    commitSkuInlineEdit();
}

function moveSkuInlineEditVertically(direction) {
    const edit = activeSkuInlineEdit;
    if (!edit || !skuTableBody) return;

    const columnCells = [...skuTableBody.querySelectorAll("td[data-sku-inline-row-id][data-sku-inline-key]")]
        .filter((cell) => cell instanceof HTMLTableCellElement && cell.dataset.skuInlineKey === edit.key);
    const currentIndex = columnCells.indexOf(edit.cell);
    const targetCell = columnCells[currentIndex + direction];

    if (!commitSkuInlineEdit()) return;
    if (!(targetCell instanceof HTMLTableCellElement)) return;

    targetCell.scrollIntoView({ block: "nearest", inline: "nearest" });
    startSkuInlineEdit(targetCell);
}

function handleSkuInlineKeyDown(event) {
    if (event.target instanceof HTMLTableCellElement && event.target.matches("[data-sku-category-row-id]")) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            openSkuCategoryPicker(event.target);
        }
        return;
    }
    if (!(event.target instanceof HTMLInputElement) || event.target !== activeSkuInlineEdit?.input) return;
    if (event.isComposing) return;
    if (event.key === "Escape") {
        event.preventDefault();
        cancelSkuInlineEdit();
        return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        moveSkuInlineEditVertically(event.key === "ArrowUp" ? -1 : 1);
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        moveSkuInlineEditVertically(1);
    }
}

function handleSkuInlineInput(event) {
    if (event.target === activeSkuInlineEdit?.input) clearSkuInlineInputError();
}

function handleUndoSkuInlineEdit(editRecord) {
    if (!editRecord) return;

    const changes = getSkuInlineEditChanges(editRecord);
    const currentRow = skuRows.find((row) => Number(row.rowId) === Number(editRecord.rowId));
    if (!skuRowMatchesInlineEditValues(currentRow, changes, "nextValue")) {
        lastSkuInlineEdit = null;
        hideSkuInlineToast();
        return;
    }

    const previousValues = Object.fromEntries(
        changes.map((change) => [change.key, change.previousValue]),
    );
    const validationRow = applySkuInlineValues(editRecord.rowId, previousValues);
    renderSkuInlineEditChanges(editRecord, "previousValue", validationRow);
    lastSkuInlineEdit = null;
    showSkuInlineToast("수정을 취소하고 이전 값으로 되돌렸습니다.", { duration: 3500 });
    void queueSkuInlinePersist();
}

function handleSaveSkuEdit() {
    if (!skuEditForm || editingSkuRowId === null) return;

    const rowIndex = skuRows.findIndex((row) => row.rowId === editingSkuRowId);
    if (rowIndex < 0) return;

    const previousRow = skuRows[rowIndex];
    const nextRow = { ...previousRow };
    const inputNodes = skuEditForm.querySelectorAll("input[data-sku-edit-key], select[data-sku-edit-key]");
    inputNodes.forEach((node) => {
        if (!(node instanceof HTMLInputElement) && !(node instanceof HTMLSelectElement)) return;
        const key = node.getAttribute("data-sku-edit-key") || "";
        if (!key) return;
        nextRow[key] = key === "skuType"
            ? getNormalizedSkuType(node.value)
            : node.value.trim();
    });

    const categoryChanged = normalizeSkuCategoryName(nextRow.category)
        !== normalizeSkuCategoryName(previousRow.category);
    const skuTypeChanged = getNormalizedSkuType(nextRow.skuType)
        !== getNormalizedSkuType(previousRow.skuType);
    const categorySkuType = getSkuTypeFromCategory(nextRow.category);
    if (categoryChanged && !skuTypeChanged && categorySkuType) {
        nextRow.skuType = categorySkuType;
    }

    const nextRows = [...skuRows];
    nextRows[rowIndex] = nextRow;

    const validationResult = validateSkuRows(nextRows);
    const editedRowValidation = validationResult.rows.find((row) => row.rowId === editingSkuRowId);
    if (editedRowValidation && !editedRowValidation.isValid) {
        window.alert(`수정한 SKU에 오류가 있습니다.\n${(editedRowValidation.errors ?? []).join("\n")}`);
        return;
    }

    const migratedOrderMatches = migrateOrderMatchSkuReferences(previousRow, nextRow);
    skuRows = nextRows;
    syncSkuCategoryOptionsFromRows();
    if (migratedOrderMatches) void saveOrderProductMatches();
    standardizeOrderManagementRows({ persist: true, render: true });
    renderCurrentSkuRows({ syncOrderMatches: true });
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
    if (getSkuColumnResizeHandle(target) || skuColumnResizeState) {
        event.preventDefault();
        return;
    }

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

function getInventoryTodayValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function buildInventoryOccurredAt(dateValue) {
    const now = new Date();
    const dateText = String(dateValue || getInventoryTodayValue());
    const [year, month, day] = dateText.split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return now.toISOString();
    return new Date(
        year,
        month - 1,
        day,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
    ).toISOString();
}

function formatInventoryDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

function getInventoryDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getInventorySnapshot() {
    const snapshot = buildInventorySnapshot(skuRows, inventoryBalances, inventoryTransactions);
    const allocationSnapshot = buildInventoryAllocationSnapshot(inventoryAllocations);
    return {
        ...snapshot,
        rows: snapshot.rows.map((row) => {
            const totalAvailability = getInventoryAvailability(
                row.currentStock,
                allocationSnapshot.allocatedBySkuKey.get(row.skuKey) || 0,
            );
            const stockAllocatedQuantity = allocationSnapshot.stockAllocatedBySkuKey.get(row.skuKey) || 0;
            const shortageAllocatedQuantity = allocationSnapshot.shortageAllocatedBySkuKey.get(row.skuKey) || 0;
            return {
                ...row,
                ...totalAvailability,
                stockAllocatedQuantity,
                shortageAllocatedQuantity,
                physicalAvailableQuantity: row.currentStock - stockAllocatedQuantity,
            };
        }),
        allocationSnapshot,
    };
}

function setInventoryPageStatus(message, tone = "info") {
    if (!inventoryPageStatusEl) return;
    inventoryPageStatusEl.textContent = message || "";
    inventoryPageStatusEl.className = `inventory-page-status is-${tone}`;
}

function isInventoryDiscontinuedSku(row) {
    return normalizeSkuCategoryName(row?.category) === "단종";
}

function getInventorySkuTypeBadgeClass(skuType) {
    const normalizedType = getNormalizedSkuType(skuType);
    if (normalizedType === "부자재") return "is-material";
    if (normalizedType === "사은품") return "is-gift";
    if (normalizedType === "세트상품") return "is-set";
    if (normalizedType === "기타") return "is-other";
    return "is-product";
}

function createInventorySortStates() {
    return Object.fromEntries(
        Object.entries(INVENTORY_DEFAULT_SORT_STATES)
            .map(([viewName, state]) => [viewName, { ...state }]),
    );
}

function getDisplayedInventoryTransactionCode(row = {}) {
    return row.sourceType === "storage_adjustment"
        ? (row.sourceCode || row.transactionCode || "")
        : (row.transactionCode || "");
}

function getInventoryTransactionReasonText(row = {}) {
    return [row.reason, row.memo].filter(Boolean).join(" · ");
}

function getInventoryStorageManualMemo(row = {}) {
    const memo = String(row.memo || "").trim();
    const hasStructuredStorageDetails = row.sourceType === "storage_adjustment"
        || Boolean(row.adjustmentGroupId)
        || Boolean(row.lotNo || row.expiryDate || row.location || row.palletNo);
    if (!memo || !hasStructuredStorageDetails) return memo;
    return memo
        .split(" · ")
        .filter((part) => !/^(LOT|유통기한|로케이션|PLT)(?:\s|$)/.test(part.trim()))
        .join(" · ");
}

function getInventoryReasonPresentation(row = {}) {
    const typeMeta = getInventoryTransactionTypeMeta(row.transactionType);
    const isStorageAdjustment = row.sourceType === "storage_adjustment"
        || Boolean(row.adjustmentGroupId);
    const hasStorageDetails = isStorageAdjustment
        || Boolean(row.lotNo || row.expiryDate || row.location || row.palletNo);
    const reason = String(row.reason || "").trim() || typeMeta.label;
    const memo = getInventoryStorageManualMemo(row);
    if (!hasStorageDetails) {
        return { reason, memo, stage: "", stageTone: "", storageDetails: [] };
    }

    let stage = isStorageAdjustment ? "조정 대상" : "보관 정보";
    let stageTone = "adjustment";
    if (row.transactionType === "reclassification_out") {
        stage = "변경 전";
        stageTone = "before";
    } else if (row.transactionType === "reclassification_in") {
        stage = "변경 후";
        stageTone = "after";
    } else if (row.transactionType === "receipt") {
        stage = "입고 정보";
        stageTone = "after";
    } else if (row.transactionType === "shipment") {
        stage = "출고 정보";
        stageTone = "before";
    } else if (row.transactionType === "opening") {
        stage = "기초 정보";
    }

    return {
        reason,
        memo,
        stage,
        stageTone,
        storageDetails: [
            { label: "LOT", value: row.lotNo || "미지정" },
            { label: "기한", value: row.expiryDate || "미지정" },
            { label: "위치", value: row.location || "미지정" },
            { label: "PLT", value: row.palletNo || "미지정" },
        ],
    };
}

function renderInventoryReasonCell(row = {}) {
    const presentation = getInventoryReasonPresentation(row);
    const storageSummary = presentation.storageDetails
        .map((detail) => `${detail.label}: ${detail.value}`)
        .join(" · ");
    const storageDetailsHtml = presentation.storageDetails.length
        ? `
          <div class="inventory-reason-storage" title="${escapeHtml(storageSummary)}">
            <span class="inventory-reason-stage is-${escapeHtml(presentation.stageTone)}">
              ${escapeHtml(presentation.stage)}
            </span>
            <span class="inventory-reason-values">
              ${presentation.storageDetails.map((detail) => `
                <span class="inventory-reason-value">
                  <b>${escapeHtml(detail.label)}</b>${escapeHtml(detail.value)}
                </span>
              `).join("")}
            </span>
          </div>
        `
        : "";
    const memoHtml = presentation.memo && presentation.memo !== presentation.reason
        ? `<small class="inventory-reason-memo" title="${escapeHtml(presentation.memo)}">메모 · ${escapeHtml(presentation.memo)}</small>`
        : "";
    return `
      <div class="inventory-reason-content">
        <strong class="inventory-reason-title" title="${escapeHtml(presentation.reason)}">
          ${escapeHtml(presentation.reason)}
        </strong>
        ${storageDetailsHtml}
        ${memoHtml}
      </div>
    `;
}

const INVENTORY_SORT_DESCRIPTORS = Object.freeze({
    stock: Object.freeze({
        product: Object.freeze({ type: "text", getValue: (row) => row.productName }),
        skuType: Object.freeze({ type: "text", getValue: (row) => getNormalizedSkuType(row.skuType) }),
        category: Object.freeze({ type: "text", getValue: (row) => normalizeSkuCategoryName(row.category) }),
        quantity: Object.freeze({ type: "number", getValue: (row) => row.currentStock }),
        allocatedQuantity: Object.freeze({ type: "number", getValue: (row) => row.allocatedQuantity }),
        availableQuantity: Object.freeze({ type: "number", getValue: (row) => row.availableQuantity }),
        latest: Object.freeze({ type: "date", getValue: (row) => row.latestTransaction?.occurredAt }),
    }),
    lot: Object.freeze({
        product: Object.freeze({ type: "text", getValue: (row) => row.productName }),
        lotNo: Object.freeze({ type: "text", getValue: (row) => row.lotNo }),
        expiryDate: Object.freeze({ type: "date", getValue: (row) => row.expiryDate }),
        expiryState: Object.freeze({ type: "number", getValue: (row) => row.daysUntilExpiry }),
        location: Object.freeze({ type: "text", getValue: (row) => row.location }),
        palletNo: Object.freeze({ type: "text", getValue: (row) => row.palletNo }),
        quantity: Object.freeze({ type: "number", getValue: (row) => row.quantity }),
        allocatedQuantity: Object.freeze({ type: "number", getValue: (row) => row.allocatedQuantity }),
        availableQuantity: Object.freeze({ type: "number", getValue: (row) => row.availableQuantity }),
        latest: Object.freeze({ type: "date", getValue: (row) => row.latestOccurredAt }),
    }),
    ledger: Object.freeze({
        occurredAt: Object.freeze({ type: "date", getValue: (row) => row.occurredAt }),
        transactionCode: Object.freeze({ type: "text", getValue: getDisplayedInventoryTransactionCode }),
        transactionType: Object.freeze({
            type: "text",
            getValue: (row) => getInventoryTransactionTypeMeta(row.transactionType).label,
        }),
        product: Object.freeze({ type: "text", getValue: (row) => row.productName }),
        inQuantity: Object.freeze({
            type: "number",
            getValue: (row) => (row.quantityDelta > 0 ? row.quantityDelta : null),
        }),
        outQuantity: Object.freeze({
            type: "number",
            getValue: (row) => (row.quantityDelta < 0 ? Math.abs(row.quantityDelta) : null),
        }),
        balanceAfter: Object.freeze({ type: "number", getValue: (row) => row.balanceAfter }),
        reason: Object.freeze({ type: "text", getValue: getInventoryTransactionReasonText }),
        createdBy: Object.freeze({ type: "text", getValue: (row) => row.createdBy }),
    }),
});

function getInventorySortComparable(value, type) {
    if (value === null || value === undefined || value === "") {
        return { missing: true, value: null };
    }
    if (type === "number") {
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
            ? { missing: false, value: numericValue }
            : { missing: true, value: null };
    }
    if (type === "date") {
        const timestamp = Date.parse(String(value));
        return Number.isFinite(timestamp)
            ? { missing: false, value: timestamp }
            : { missing: true, value: null };
    }
    const textValue = String(value).trim();
    return textValue
        ? { missing: false, value: textValue }
        : { missing: true, value: null };
}

function compareInventorySortValues(leftValue, rightValue, type, direction) {
    const left = getInventorySortComparable(leftValue, type);
    const right = getInventorySortComparable(rightValue, type);
    if (left.missing !== right.missing) return left.missing ? 1 : -1;
    if (left.missing && right.missing) return 0;

    const comparison = type === "text"
        ? String(left.value).localeCompare(String(right.value), "ko-KR", {
            numeric: true,
            sensitivity: "base",
        })
        : left.value - right.value;
    return direction === "desc" ? -comparison : comparison;
}

function sortInventoryRows(rows = [], viewName = inventoryActiveView) {
    const sortState = inventorySortStates[viewName] || INVENTORY_DEFAULT_SORT_STATES[viewName];
    const descriptor = INVENTORY_SORT_DESCRIPTORS[viewName]?.[sortState?.key];
    if (!descriptor) return [...rows];
    return [...rows]
        .map((row, index) => ({ row, index }))
        .sort((left, right) => (
            compareInventorySortValues(
                descriptor.getValue(left.row),
                descriptor.getValue(right.row),
                descriptor.type,
                sortState.direction,
            ) || left.index - right.index
        ))
        .map((item) => item.row);
}

function syncInventorySortHeaders() {
    document.querySelectorAll("[data-inventory-sort-view][data-inventory-sort-key]")
        .forEach((button) => {
            if (!(button instanceof HTMLButtonElement)) return;
            const viewName = button.dataset.inventorySortView || "";
            const sortKey = button.dataset.inventorySortKey || "";
            const label = button.dataset.inventorySortLabel || button.textContent.trim();
            const sortState = inventorySortStates[viewName];
            const isActive = sortState?.key === sortKey;
            const direction = isActive ? sortState.direction : "";
            const header = button.closest("th");
            const indicator = button.querySelector(".inventory-sort-indicator");

            button.classList.toggle("is-active", isActive);
            button.dataset.sortDirection = direction;
            button.title = `${label} ${isActive && direction === "asc" ? "내림차순" : "오름차순"} 정렬`;
            button.setAttribute(
                "aria-label",
                `${label} ${isActive && direction === "asc" ? "내림차순" : "오름차순"}으로 정렬`,
            );
            if (indicator) indicator.textContent = !isActive ? "↕" : (direction === "asc" ? "↑" : "↓");
            header?.setAttribute(
                "aria-sort",
                !isActive ? "none" : (direction === "asc" ? "ascending" : "descending"),
            );
        });
}

function toggleInventorySort(viewName, sortKey) {
    if (!INVENTORY_SORT_DESCRIPTORS[viewName]?.[sortKey]) return;
    const current = inventorySortStates[viewName] || { key: "", direction: "asc" };
    inventorySortStates[viewName] = current.key === sortKey
        ? { key: sortKey, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: sortKey, direction: "asc" };
    renderInventoryLedger({ force: true });
}

function resetInventorySort(viewName) {
    const defaultState = INVENTORY_DEFAULT_SORT_STATES[viewName];
    if (defaultState) inventorySortStates[viewName] = { ...defaultState };
    syncInventorySortHeaders();
}

function getInventoryColumnDefinition(viewName, columnKey) {
    return INVENTORY_COLUMN_DEFINITIONS[viewName]?.[columnKey] || null;
}

function clampInventoryColumnWidth(viewName, columnKey, value) {
    const definition = getInventoryColumnDefinition(viewName, columnKey);
    if (!definition) return 0;
    const minWidth = Number(definition.minWidth) || 64;
    const maxWidth = Number(definition.maxWidth) || INVENTORY_COLUMN_MAX_WIDTH;
    const numericValue = Number(value);
    const fallbackWidth = Number(definition.defaultWidth) || minWidth;
    return Math.round(Math.max(minWidth, Math.min(maxWidth, Number.isFinite(numericValue)
        ? numericValue
        : fallbackWidth)));
}

function normalizeInventoryColumnWidths(widths = {}) {
    const source = widths && typeof widths === "object" && !Array.isArray(widths) ? widths : {};
    return Object.entries(INVENTORY_COLUMN_DEFINITIONS).reduce((result, [viewName, definitions]) => {
        const viewSource = source[viewName] && typeof source[viewName] === "object"
            && !Array.isArray(source[viewName])
            ? source[viewName]
            : {};
        const normalizedView = Object.entries(definitions).reduce((viewResult, [columnKey]) => {
            const width = Number(viewSource[columnKey]);
            if (Number.isFinite(width) && width > 0) {
                viewResult[columnKey] = clampInventoryColumnWidth(viewName, columnKey, width);
            }
            return viewResult;
        }, {});
        if (Object.keys(normalizedView).length) result[viewName] = normalizedView;
        return result;
    }, {});
}

function getInventoryColumnWidth(viewName, columnKey) {
    const definition = getInventoryColumnDefinition(viewName, columnKey);
    if (!definition) return 0;
    return clampInventoryColumnWidth(
        viewName,
        columnKey,
        inventoryColumnWidths[viewName]?.[columnKey] ?? definition.defaultWidth,
    );
}

function getInventoryResizableTable(viewName) {
    const table = document.querySelector(`[data-inventory-resizable-view="${viewName}"]`);
    return table instanceof HTMLTableElement ? table : null;
}

function setInventoryColumnCellWidth(cell, width) {
    if (!(cell instanceof HTMLTableCellElement) || cell.colSpan > 1) return;
    const widthText = `${width}px`;
    cell.style.width = widthText;
    cell.style.minWidth = widthText;
    cell.style.maxWidth = widthText;
}

function updateInventoryTableMinWidth(viewName) {
    const table = getInventoryResizableTable(viewName);
    if (!table) return;
    const totalWidth = [...table.querySelectorAll("thead th[data-inventory-column-key]")]
        .reduce((sum, header) => (
            sum + getInventoryColumnWidth(
                header.getAttribute("data-inventory-column-view") || viewName,
                header.getAttribute("data-inventory-column-key") || "",
            )
        ), 0);
    if (totalWidth > 0) table.style.minWidth = `${totalWidth}px`;
}

function applyInventoryColumnWidth(viewName, columnKey, width) {
    const table = getInventoryResizableTable(viewName);
    const definition = getInventoryColumnDefinition(viewName, columnKey);
    if (!table || !definition) return 0;

    const normalizedWidth = clampInventoryColumnWidth(viewName, columnKey, width);
    inventoryColumnWidths = {
        ...inventoryColumnWidths,
        [viewName]: {
            ...(inventoryColumnWidths[viewName] || {}),
            [columnKey]: normalizedWidth,
        },
    };

    const header = [...table.querySelectorAll("thead th[data-inventory-column-key]")]
        .find((cell) => cell.getAttribute("data-inventory-column-key") === columnKey);
    if (!(header instanceof HTMLTableCellElement)) return normalizedWidth;

    setInventoryColumnCellWidth(header, normalizedWidth);
    const columnIndex = header.cellIndex;
    [...table.tBodies].forEach((body) => {
        [...body.rows].forEach((row) => {
            setInventoryColumnCellWidth(row.cells[columnIndex], normalizedWidth);
        });
    });

    const handle = header.querySelector("[data-inventory-column-resizer]");
    if (handle instanceof HTMLElement) {
        handle.setAttribute("aria-valuenow", String(normalizedWidth));
        handle.setAttribute("aria-valuetext", `${normalizedWidth}px`);
    }
    updateInventoryTableMinWidth(viewName);
    return normalizedWidth;
}

function applyInventoryColumnWidths(viewName = "") {
    const viewNames = viewName ? [viewName] : Object.keys(INVENTORY_COLUMN_DEFINITIONS);
    viewNames.forEach((currentViewName) => {
        Object.keys(INVENTORY_COLUMN_DEFINITIONS[currentViewName] || {}).forEach((columnKey) => {
            applyInventoryColumnWidth(
                currentViewName,
                columnKey,
                getInventoryColumnWidth(currentViewName, columnKey),
            );
        });
    });
}

function initializeInventoryColumnResizeUi() {
    Object.entries(INVENTORY_COLUMN_DEFINITIONS).forEach(([viewName]) => {
        const sortButton = document.querySelector(`[data-inventory-sort-view="${viewName}"]`);
        const table = sortButton?.closest("table");
        if (!(table instanceof HTMLTableElement)) return;

        table.dataset.inventoryResizableView = viewName;
        table.classList.add("is-column-resizable");
        [...table.querySelectorAll("thead tr:first-child > th")].forEach((header) => {
            if (!(header instanceof HTMLTableCellElement)) return;
            const headerSortButton = header.querySelector(".inventory-sort-button");
            const columnKey = headerSortButton?.getAttribute("data-inventory-sort-key") || "action";
            const definition = getInventoryColumnDefinition(viewName, columnKey);
            if (!definition) return;

            header.dataset.inventoryColumnView = viewName;
            header.dataset.inventoryColumnKey = columnKey;
            let handle = header.querySelector("[data-inventory-column-resizer]");
            if (!(handle instanceof HTMLElement)) {
                handle = document.createElement("span");
                handle.className = "inventory-column-resizer";
                handle.dataset.inventoryColumnResizer = columnKey;
                handle.dataset.inventoryColumnView = viewName;
                handle.setAttribute("role", "separator");
                handle.setAttribute("tabindex", "0");
                handle.setAttribute("aria-orientation", "vertical");
                handle.setAttribute("aria-label", `${definition.label} 열 너비 조절`);
                handle.title = "드래그하여 너비 조절 · 더블클릭하여 기본값 복원";
                header.append(handle);
            }
            handle.setAttribute("aria-valuemin", String(definition.minWidth || 64));
            handle.setAttribute("aria-valuemax", String(definition.maxWidth || INVENTORY_COLUMN_MAX_WIDTH));
        });
        applyInventoryColumnWidths(viewName);
    });
}

function getInventoryColumnResizeHandle(target) {
    if (!(target instanceof HTMLElement)) return null;
    const handle = target.closest("[data-inventory-column-resizer]");
    return handle instanceof HTMLElement ? handle : null;
}

function handleInventoryColumnResizePointerDown(event) {
    const handle = getInventoryColumnResizeHandle(event.target);
    if (!handle) return;
    const viewName = handle.dataset.inventoryColumnView || "";
    const columnKey = handle.dataset.inventoryColumnResizer || "";
    const headerCell = handle.closest("th[data-inventory-column-key]");
    if (!getInventoryColumnDefinition(viewName, columnKey)
        || !(headerCell instanceof HTMLTableCellElement)) return;

    event.preventDefault();
    event.stopPropagation();
    inventoryColumnResizeState = {
        pointerId: event.pointerId,
        viewName,
        columnKey,
        startX: event.clientX,
        startWidth: getInventoryColumnWidth(viewName, columnKey),
        handle,
    };
    handle.classList.add("is-resizing");
    document.body.classList.add("is-inventory-column-resizing");
    try {
        handle.setPointerCapture(event.pointerId);
    } catch (error) {
        console.debug("재고 열 너비 포인터 캡처를 사용할 수 없습니다.", error);
    }
}

function handleInventoryColumnResizePointerMove(event) {
    const state = inventoryColumnResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyInventoryColumnWidth(
        state.viewName,
        state.columnKey,
        state.startWidth + event.clientX - state.startX,
    );
}

function finishInventoryColumnResize(event) {
    const state = inventoryColumnResizeState;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
        if (state.handle.hasPointerCapture(event.pointerId)) {
            state.handle.releasePointerCapture(event.pointerId);
        }
    } catch (error) {
        console.debug("재고 열 너비 포인터 캡처 해제를 건너뜁니다.", error);
    }
    state.handle.classList.remove("is-resizing");
    document.body.classList.remove("is-inventory-column-resizing");
    inventoryColumnResizeState = null;
    scheduleInventoryColumnWidthPersist();
}

function handleInventoryColumnResizeDoubleClick(event) {
    const handle = getInventoryColumnResizeHandle(event.target);
    if (!handle) return;
    const viewName = handle.dataset.inventoryColumnView || "";
    const columnKey = handle.dataset.inventoryColumnResizer || "";
    const definition = getInventoryColumnDefinition(viewName, columnKey);
    if (!definition) return;

    event.preventDefault();
    event.stopPropagation();
    applyInventoryColumnWidth(viewName, columnKey, definition.defaultWidth);
    scheduleInventoryColumnWidthPersist();
}

function handleInventoryColumnResizeKeyDown(event) {
    const handle = getInventoryColumnResizeHandle(event.target);
    if (!handle) return;
    const viewName = handle.dataset.inventoryColumnView || "";
    const columnKey = handle.dataset.inventoryColumnResizer || "";
    const definition = getInventoryColumnDefinition(viewName, columnKey);
    if (!definition) return;

    let nextWidth = getInventoryColumnWidth(viewName, columnKey);
    if (event.key === "ArrowLeft") {
        nextWidth -= event.shiftKey ? 24 : 8;
    } else if (event.key === "ArrowRight") {
        nextWidth += event.shiftKey ? 24 : 8;
    } else if (event.key === "Home") {
        nextWidth = definition.defaultWidth;
    } else {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyInventoryColumnWidth(viewName, columnKey, nextWidth);
    scheduleInventoryColumnWidthPersist();
}

function renderInventorySummary(snapshot = getInventorySnapshot()) {
    const activeRows = snapshot.rows.filter((row) => !isInventoryDiscontinuedSku(row));
    const totalStock = activeRows.reduce((sum, row) => sum + Math.max(0, Number(row.currentStock) || 0), 0);
    const zeroStockCount = activeRows.filter((row) => Number(row.currentStock) <= 0).length;
    const todayKey = getInventoryDateKey();
    const todayTransactions = snapshot.transactions.filter((row) => (
        getInventoryDateKey(row.occurredAt) === todayKey
        && !row.transactionType.startsWith("reclassification_")
    ));
    const todayIn = todayTransactions.reduce(
        (sum, row) => sum + (row.quantityDelta > 0 ? row.quantityDelta : 0),
        0,
    );
    const todayOut = todayTransactions.reduce(
        (sum, row) => sum + (row.quantityDelta < 0 ? Math.abs(row.quantityDelta) : 0),
        0,
    );

    if (inventorySummarySkuCountEl) {
        inventorySummarySkuCountEl.textContent = formatMilkrunNumber(activeRows.length);
    }
    if (inventorySummaryTotalStockEl) {
        inventorySummaryTotalStockEl.textContent = formatMilkrunNumber(totalStock);
    }
    if (inventorySummaryZeroStockEl) {
        inventorySummaryZeroStockEl.textContent = formatMilkrunNumber(zeroStockCount);
    }
    if (inventorySummaryTodayMovementEl) {
        inventorySummaryTodayMovementEl.textContent = `+${formatMilkrunNumber(todayIn)} / -${formatMilkrunNumber(todayOut)}`;
    }
}

function syncInventoryStockFilterControls() {
    if (inventoryStockSearchInput instanceof HTMLInputElement) {
        inventoryStockSearchInput.value = inventoryStockFilters.query;
    }
    if (inventoryStockTypeFilter instanceof HTMLSelectElement) {
        inventoryStockTypeFilter.value = inventoryStockFilters.skuType;
    }
    if (inventoryStockStateFilter instanceof HTMLSelectElement) {
        inventoryStockStateFilter.value = inventoryStockFilters.stockState;
    }
}

function getFilteredInventoryStockRows(snapshot = getInventorySnapshot()) {
    const query = normalizeSkuSearchToken(inventoryStockFilters.query);
    const rows = snapshot.rows
        .filter((row) => {
            if (!query) return true;
            return [
                row.productName,
                row.adminProductCode,
                row.brand,
                row.category,
            ].some((value) => normalizeSkuSearchToken(value).includes(query));
        })
        .filter((row) => (
            inventoryStockFilters.skuType === "all"
            || getNormalizedSkuType(row.skuType) === inventoryStockFilters.skuType
        ))
        .filter((row) => {
            const discontinued = isInventoryDiscontinuedSku(row);
            const availableStock = Number(row.availableQuantity) || 0;
            if (inventoryStockFilters.stockState === "all") return true;
            if (inventoryStockFilters.stockState === "active") return !discontinued;
            if (inventoryStockFilters.stockState === "discontinued") return discontinued;
            if (inventoryStockFilters.stockState === "in-stock") return !discontinued && availableStock > 0;
            if (inventoryStockFilters.stockState === "zero") return !discontinued && availableStock <= 0;
            return true;
        });
    return sortInventoryRows(rows, "stock");
}

function renderInventoryStockRows(snapshot = getInventorySnapshot()) {
    if (!inventoryStockBodyEl) return;

    const rows = getFilteredInventoryStockRows(snapshot);
    if (inventoryStockCountEl) {
        const totalAllocated = rows.reduce(
            (sum, row) => sum + Math.max(0, Number(row.allocatedQuantity) || 0),
            0,
        );
        const totalAvailable = rows.reduce(
            (sum, row) => sum + (Number(row.availableQuantity) || 0),
            0,
        );
        inventoryStockCountEl.textContent = [
            `${formatMilkrunNumber(rows.length)}개 SKU`,
            `할당 ${formatMilkrunNumber(totalAllocated)}`,
            `가용 ${formatMilkrunNumber(totalAvailable)}`,
        ].join(" · ");
    }

    if (!skuRows.length) {
        inventoryStockBodyEl.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="8">
              <div class="inventory-empty-state">
                <strong>등록된 SKU가 없습니다.</strong>
                <span>SKU 관리에서 상품 마스터를 먼저 등록해주세요.</span>
                <button class="secondary-btn" type="button" data-inventory-go-sku>SKU 관리로 이동</button>
              </div>
            </td>
          </tr>
        `;
        return;
    }

    if (!rows.length) {
        inventoryStockBodyEl.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="8">조건에 맞는 SKU가 없습니다.</td>
          </tr>
        `;
        return;
    }

    inventoryStockBodyEl.innerHTML = rows.map((row) => {
        const currentStock = Math.max(0, Number(row.currentStock) || 0);
        const allocatedQuantity = Math.max(0, Number(row.allocatedQuantity) || 0);
        const stockAllocatedQuantity = Math.max(0, Number(row.stockAllocatedQuantity) || 0);
        const shortageAllocatedQuantity = Math.max(0, Number(row.shortageAllocatedQuantity) || 0);
        const availableQuantity = Number(row.availableQuantity) || 0;
        const latestTransaction = row.latestTransaction;
        const latestMeta = latestTransaction
            ? getInventoryTransactionTypeMeta(latestTransaction.transactionType)
            : null;
        const discontinued = isInventoryDiscontinuedSku(row);
        const category = normalizeSkuCategoryName(row.category) || "미분류";
        const productMeta = [row.adminProductCode, row.brand].filter(Boolean).join(" · ");

        return `
          <tr>
            <td>
              <div class="inventory-product-cell">
                <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
                <span>${escapeHtml(productMeta || "-")}</span>
              </div>
            </td>
            <td>
              <span class="sku-type-badge ${getInventorySkuTypeBadgeClass(row.skuType)}">
                ${escapeHtml(getNormalizedSkuType(row.skuType))}
              </span>
            </td>
            <td>
              <span class="inventory-category-pill${discontinued ? " is-discontinued" : ""}">
                ${escapeHtml(category)}
              </span>
            </td>
            <td class="inventory-number-cell">
              <strong class="inventory-stock-value${currentStock <= 0 ? " is-zero" : ""}">
                ${formatMilkrunNumber(currentStock)}
              </strong>
            </td>
            <td class="inventory-number-cell" title="실재고 할당과 입고대기 할당을 합한 수량">
              <strong class="inventory-allocation-value${allocatedQuantity <= 0 ? " is-zero" : ""}">
                ${formatMilkrunNumber(allocatedQuantity)}
              </strong>
              ${shortageAllocatedQuantity > 0 ? `
                <span class="inventory-allocation-breakdown">
                  실재고 ${formatMilkrunNumber(stockAllocatedQuantity)} · 입고대기 ${formatMilkrunNumber(shortageAllocatedQuantity)}
                </span>
              ` : ""}
            </td>
            <td class="inventory-number-cell" title="현재고에서 할당재고를 제외한 수량">
              <strong class="inventory-available-value${availableQuantity < 0 ? " is-negative" : (availableQuantity === 0 ? " is-zero" : "")}">
                ${formatMilkrunNumber(availableQuantity)}
              </strong>
            </td>
            <td>
              <div class="inventory-latest-cell">
                <strong>${latestMeta ? escapeHtml(latestMeta.label) : "변동 없음"}</strong>
                <span>${latestTransaction ? escapeHtml(formatInventoryDateTime(latestTransaction.occurredAt)) : "기초재고를 등록해주세요."}</span>
              </div>
            </td>
            <td class="inventory-action-cell">
              <button class="inventory-row-action" type="button"
                  data-inventory-adjust-sku="${escapeHtml(row.skuKey)}">
                조정
              </button>
            </td>
          </tr>
        `;
    }).join("");
}

function syncInventoryLotFilterControls() {
    if (inventoryLotSearchInput instanceof HTMLInputElement) {
        inventoryLotSearchInput.value = inventoryLotFilters.query;
    }
    if (inventoryLotExpiryFilter instanceof HTMLSelectElement) {
        inventoryLotExpiryFilter.value = inventoryLotFilters.expiryState;
    }
    if (inventoryLotStockFilter instanceof HTMLSelectElement) {
        inventoryLotStockFilter.value = inventoryLotFilters.stockState;
    }
}

function getInventoryLotExpiryMeta(row) {
    if (row.expiryState === "expired") {
        return { label: "기한 경과", tone: "expired" };
    }
    if (row.expiryState === "expiring") {
        return {
            label: row.daysUntilExpiry === 0 ? "오늘 만료" : `D-${formatMilkrunNumber(row.daysUntilExpiry)}`,
            tone: "expiring",
        };
    }
    if (row.expiryState === "normal") {
        return {
            label: `D-${formatMilkrunNumber(row.daysUntilExpiry)}`,
            tone: "normal",
        };
    }
    return { label: "미지정", tone: "none" };
}

function getFilteredInventoryLotRows(lotSnapshot) {
    const query = normalizeSkuSearchToken(inventoryLotFilters.query);
    const rows = lotSnapshot.rows
        .filter((row) => {
            if (!query) return true;
            return [
                row.productName,
                row.adminProductCode,
                row.brand,
                row.skuType,
                row.category,
                row.lotNo,
                row.expiryDate,
                row.location,
                row.palletNo,
            ].some((value) => normalizeSkuSearchToken(value).includes(query));
        })
        .filter((row) => {
            if (inventoryLotFilters.expiryState === "all") return true;
            if (inventoryLotFilters.expiryState === "risk") {
                return row.expiryState === "expired" || row.expiryState === "expiring";
            }
            return row.expiryState === inventoryLotFilters.expiryState;
        })
        .filter((row) => {
            if (inventoryLotFilters.stockState === "all") return true;
            if (inventoryLotFilters.stockState === "zero") return row.availableQuantity <= 0;
            return row.availableQuantity > 0;
        });
    return sortInventoryRows(rows, "lot");
}

function getCachedInventoryLotSnapshot(snapshot) {
    const dateKey = getInventoryTodayValue();
    if (
        inventoryLotSnapshotCache
        && inventoryLotSnapshotCache.skuRows === skuRows
        && inventoryLotSnapshotCache.transactions === inventoryTransactions
        && inventoryLotSnapshotCache.balances === inventoryBalances
        && inventoryLotSnapshotCache.allocations === inventoryAllocations
        && inventoryLotSnapshotCache.dateKey === dateKey
    ) {
        return inventoryLotSnapshotCache.snapshot;
    }
    const baseLotSnapshot = buildInventoryLotSnapshot(snapshot.rows, inventoryTransactions);
    const allocationSnapshot = snapshot.allocationSnapshot
        || buildInventoryAllocationSnapshot(inventoryAllocations);
    const lotSnapshot = {
        ...baseLotSnapshot,
        rows: baseLotSnapshot.rows.map((row) => ({
            ...row,
            ...getInventoryAvailability(
                row.quantity,
                allocationSnapshot.allocatedByLotKey.get(row.lotKey) || 0,
            ),
        })),
    };
    inventoryLotSnapshotCache = {
        skuRows,
        transactions: inventoryTransactions,
        balances: inventoryBalances,
        allocations: inventoryAllocations,
        dateKey,
        snapshot: lotSnapshot,
    };
    return lotSnapshot;
}
function renderInventoryLotRows(snapshot = getInventorySnapshot()) {
    if (!inventoryLotBodyEl) return;
    const lotSnapshot = getCachedInventoryLotSnapshot(snapshot);
    const filteredRows = getFilteredInventoryLotRows(lotSnapshot);
    const renderLimit = 250;
    const rows = filteredRows.slice(0, renderLimit);
    const filteredQuantity = filteredRows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
    const filteredAllocatedQuantity = filteredRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.allocatedQuantity) || 0),
        0,
    );
    const filteredAvailableQuantity = filteredRows.reduce(
        (sum, row) => sum + (Number(row.availableQuantity) || 0),
        0,
    );
    const riskRows = lotSnapshot.rows.filter((row) => (
        row.quantity > 0
        && (row.expiryState === "expired" || row.expiryState === "expiring")
    ));

    if (inventoryLotCountEl) {
        const limitedText = filteredRows.length > renderLimit
            ? ` · 상위 ${formatMilkrunNumber(renderLimit)}개 표시`
            : "";
        inventoryLotCountEl.textContent = [
            `${formatMilkrunNumber(filteredRows.length)}개 보관단위`,
            `현재 ${formatMilkrunNumber(filteredQuantity)}`,
            `할당 ${formatMilkrunNumber(filteredAllocatedQuantity)}`,
            `가용 ${formatMilkrunNumber(filteredAvailableQuantity)}`,
        ].join(" · ") + limitedText;
    }
    if (inventoryLotAlertEl instanceof HTMLElement) {
        const notices = [];
        if (filteredRows.length > renderLimit) {
            notices.push(`검색 결과가 많아 상위 ${formatMilkrunNumber(renderLimit)}개만 표시합니다`);
        }
        if (riskRows.length) {
            notices.push(`유통기한 임박·경과 ${formatMilkrunNumber(riskRows.length)}개 보관단위`);
        }
        if (lotSnapshot.unassignedLocationQuantity > 0) {
            notices.push(`로케이션 미지정 재고 ${formatMilkrunNumber(lotSnapshot.unassignedLocationQuantity)}개`);
        }
        const overAllocatedRows = lotSnapshot.rows.filter((row) => row.isOverAllocated);
        if (overAllocatedRows.length) {
            notices.push(`할당재고가 현재고를 초과한 보관단위 ${formatMilkrunNumber(overAllocatedRows.length)}개`);
        }
        inventoryLotAlertEl.hidden = notices.length === 0;
        inventoryLotAlertEl.textContent = notices.join(" · ");
        inventoryLotAlertEl.classList.toggle("has-risk", riskRows.length > 0 || overAllocatedRows.length > 0);
    }

    if (!rows.length) {
        inventoryLotBodyEl.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="11">${lotSnapshot.rows.length ? "조건에 맞는 보관단위가 없습니다." : "수불 내역에 LOT·로케이션 재고가 없습니다."}</td>
          </tr>
        `;
        return;
    }

    inventoryLotBodyEl.innerHTML = rows.map((row) => {
        const expiryMeta = getInventoryLotExpiryMeta(row);
        const latestTypeMeta = getInventoryTransactionTypeMeta(row.latestTransactionType);
        const quantityClass = row.quantity < 0
            ? " is-negative"
            : (row.quantity === 0 ? " is-zero" : "");
        const allocatedQuantity = Math.max(0, Number(row.allocatedQuantity) || 0);
        const availableQuantity = Number(row.availableQuantity) || 0;
        return `
          <tr>
            <td>
              <div class="inventory-product-cell">
                <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
                <span>${escapeHtml(row.adminProductCode || "-")} · ${escapeHtml(getNormalizedSkuType(row.skuType))}</span>
              </div>
            </td>
            <td><span class="inventory-lot-value${row.lotNo ? "" : " is-unassigned"}">${escapeHtml(row.lotNo || "미지정")}</span></td>
            <td class="inventory-date-cell">${escapeHtml(row.expiryDate || "미지정")}</td>
            <td><span class="inventory-expiry-badge is-${expiryMeta.tone}">${escapeHtml(expiryMeta.label)}</span></td>
            <td><span class="inventory-location-value${row.location ? "" : " is-unassigned"}">${escapeHtml(row.location || "미지정")}</span></td>
            <td>${escapeHtml(row.palletNo || "미지정")}</td>
            <td class="inventory-number-cell"><strong class="inventory-stock-value${quantityClass}">${formatMilkrunNumber(row.quantity)}</strong></td>
            <td class="inventory-number-cell" title="이 보관재고에서 주문에 할당된 수량">
              <strong class="inventory-allocation-value${allocatedQuantity <= 0 ? " is-zero" : ""}">
                ${formatMilkrunNumber(allocatedQuantity)}
              </strong>
            </td>
            <td class="inventory-number-cell" title="현재고에서 할당재고를 제외한 수량">
              <strong class="inventory-available-value${availableQuantity < 0 ? " is-negative" : (availableQuantity === 0 ? " is-zero" : "")}">
                ${formatMilkrunNumber(availableQuantity)}
              </strong>
            </td>
            <td>
              <div class="inventory-latest-cell">
                <strong>${escapeHtml(row.latestOccurredAt ? latestTypeMeta.label : "이관 재고")}</strong>
                <span>${escapeHtml(formatInventoryDateTime(row.latestOccurredAt))}</span>
              </div>
            </td>
            <td class="inventory-action-cell">
              ${row.quantity > 0 ? `
                <button class="inventory-row-action" type="button"
                    data-inventory-adjust-storage="${escapeHtml(row.skuKey)}"
                    data-inventory-adjust-lot-key="${escapeHtml(row.lotKey)}">
                  조정
                </button>
              ` : "-"}
            </td>
          </tr>
        `;
    }).join("");
}
function syncInventoryLedgerFilterControls() {
    if (inventoryLedgerSearchInput instanceof HTMLInputElement) {
        inventoryLedgerSearchInput.value = inventoryLedgerFilters.query;
    }
    if (inventoryLedgerTypeFilter instanceof HTMLSelectElement) {
        inventoryLedgerTypeFilter.value = inventoryLedgerFilters.transactionType;
    }
    if (inventoryLedgerPeriodFilter instanceof HTMLSelectElement) {
        inventoryLedgerPeriodFilter.value = inventoryLedgerFilters.period;
    }
}

function getFilteredInventoryTransactions(snapshot = getInventorySnapshot()) {
    const query = normalizeSkuSearchToken(inventoryLedgerFilters.query);
    const periodDays = Number(inventoryLedgerFilters.period);
    const periodStart = Number.isFinite(periodDays)
        ? Date.now() - periodDays * 24 * 60 * 60 * 1000
        : 0;

    const rows = snapshot.transactions.filter((row) => {
        if (
            inventoryLedgerFilters.transactionType !== "all"
            && row.transactionType !== inventoryLedgerFilters.transactionType
        ) {
            return false;
        }
        if (periodStart && (Date.parse(row.occurredAt) || 0) < periodStart) return false;
        if (!query) return true;
        return [
            row.productName,
            row.adminProductCode,
            row.transactionCode,
            row.sourceCode,
            row.reason,
            row.memo,
            row.palletNo,
            row.lotNo,
            row.expiryDate,
            row.location,
            row.createdBy,
        ].some((value) => normalizeSkuSearchToken(value).includes(query));
    });
    return sortInventoryRows(rows, "ledger");
}

function renderInventoryLedgerRows(snapshot = getInventorySnapshot()) {
    if (!inventoryLedgerBodyEl) return;

    const rows = getFilteredInventoryTransactions(snapshot);
    if (inventoryLedgerCountEl) {
        inventoryLedgerCountEl.textContent = `${formatMilkrunNumber(rows.length)}건`;
    }

    if (!rows.length) {
        inventoryLedgerBodyEl.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="9">조건에 맞는 수불 내역이 없습니다.</td>
          </tr>
        `;
        return;
    }

    inventoryLedgerBodyEl.innerHTML = rows.map((row) => {
        const typeMeta = getInventoryTransactionTypeMeta(row.transactionType);
        const inQuantity = row.quantityDelta > 0 ? row.quantityDelta : 0;
        const outQuantity = row.quantityDelta < 0 ? Math.abs(row.quantityDelta) : 0;
        return `
          <tr>
            <td class="inventory-date-cell">${escapeHtml(formatInventoryDateTime(row.occurredAt))}</td>
            <td><span class="inventory-transaction-code">${escapeHtml(
                getDisplayedInventoryTransactionCode(row) || "-"
            )}</span></td>
            <td>
              <span class="inventory-transaction-badge is-${escapeHtml(typeMeta.tone)}">
                ${escapeHtml(typeMeta.label)}
              </span>
            </td>
            <td>
              <div class="inventory-product-cell">
                <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
                <span>${escapeHtml(row.adminProductCode || "-")}</span>
              </div>
            </td>
            <td class="inventory-number-cell inventory-in-quantity">
              ${inQuantity ? `+${formatMilkrunNumber(inQuantity)}` : "-"}
            </td>
            <td class="inventory-number-cell inventory-out-quantity">
              ${outQuantity ? `-${formatMilkrunNumber(outQuantity)}` : "-"}
            </td>
            <td class="inventory-number-cell">
              ${row.balanceAfter === null ? "-" : formatMilkrunNumber(row.balanceAfter)}
            </td>
            <td class="inventory-reason-cell">${renderInventoryReasonCell(row)}</td>
            <td>${escapeHtml(row.createdBy || "-")}</td>
          </tr>
        `;
    }).join("");
}

function renderInventoryViewTabs() {
    document.querySelectorAll("[data-inventory-view-tab]").forEach((tab) => {
        if (!(tab instanceof HTMLButtonElement)) return;
        const isActive = tab.dataset.inventoryViewTab === inventoryActiveView;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
    });
    inventoryViewPanels.forEach((panel) => {
        const isVisible = panel.getAttribute("data-inventory-view-panel") === inventoryActiveView;
        panel.classList.toggle("is-visible", isVisible);
        panel.hidden = !isVisible;
    });
    syncInventorySortHeaders();
}

function setInventoryEntryActionsEnabled(enabled) {
    if (inventoryOpeningOpenBtn instanceof HTMLButtonElement) {
        inventoryOpeningOpenBtn.disabled = !enabled;
    }
    if (inventoryAdjustmentOpenBtn instanceof HTMLButtonElement) {
        inventoryAdjustmentOpenBtn.disabled = !enabled;
    }
}

function renderInventorySummaryPending() {
    [
        inventorySummarySkuCountEl,
        inventorySummaryTotalStockEl,
        inventorySummaryZeroStockEl,
        inventorySummaryTodayMovementEl,
    ].forEach((element) => {
        if (element) element.textContent = "-";
    });
}

function getInventorySearchViewConfig(viewName) {
    if (viewName === "lot") {
        return {
            body: inventoryLotBodyEl,
            count: inventoryLotCountEl,
            colspan: 11,
        };
    }
    if (viewName === "ledger") {
        return {
            body: inventoryLedgerBodyEl,
            count: inventoryLedgerCountEl,
            colspan: 9,
        };
    }
    return {
        body: inventoryStockBodyEl,
        count: inventoryStockCountEl,
        colspan: 8,
    };
}

function renderInventorySearchPrompt(
    viewName = inventoryActiveView,
    message = "조회 조건을 선택한 뒤 검색을 눌러주세요.",
) {
    const config = getInventorySearchViewConfig(viewName);
    renderInventorySummaryPending();
    setInventoryEntryActionsEnabled(false);
    if (config.count) config.count.textContent = "검색 전";
    if (config.body) {
        config.body.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="${config.colspan}">${escapeHtml(message)}</td>
          </tr>
        `;
    }
    if (viewName === "lot" && inventoryLotAlertEl) {
        inventoryLotAlertEl.hidden = true;
        inventoryLotAlertEl.className = "inventory-lot-alert";
        inventoryLotAlertEl.textContent = "";
    }
}

function setInventorySearchLoading(loading, viewName = inventoryActiveView) {
    inventorySearchLoading = Boolean(loading);
    if (inventorySearchLoadingEl) inventorySearchLoadingEl.hidden = !inventorySearchLoading;

    const searchButtons = [
        ["stock", inventoryStockSearchBtn],
        ["lot", inventoryLotSearchBtn],
        ["ledger", inventoryLedgerSearchBtn],
    ];
    searchButtons.forEach(([buttonView, button]) => {
        if (!(button instanceof HTMLButtonElement)) return;
        button.disabled = inventorySearchLoading;
        button.textContent = inventorySearchLoading && buttonView === viewName ? "검색 중..." : "검색";
    });

    inventoryViewTabsEl?.querySelectorAll("[data-inventory-view-tab]").forEach((tab) => {
        if (tab instanceof HTMLButtonElement) tab.disabled = inventorySearchLoading;
    });
    inventoryViewPanels.forEach((panel) => {
        const isLoadingPanel = inventorySearchLoading
            && panel.getAttribute("data-inventory-view-panel") === viewName;
        panel.setAttribute("aria-busy", String(isLoadingPanel));
        panel.querySelectorAll(".inventory-filter-bar input, .inventory-filter-bar select, .inventory-filter-bar button").forEach((control) => {
            if (control instanceof HTMLInputElement
                || control instanceof HTMLSelectElement
                || control instanceof HTMLButtonElement) {
                control.disabled = inventorySearchLoading;
            }
        });
    });
}

function syncInventoryFiltersFromControls(viewName = inventoryActiveView) {
    if (viewName === "lot") {
        inventoryLotFilters = {
            query: inventoryLotSearchInput?.value || "",
            expiryState: inventoryLotExpiryFilter?.value || "all",
            stockState: inventoryLotStockFilter?.value || "available",
        };
        return;
    }
    if (viewName === "ledger") {
        inventoryLedgerFilters = {
            query: inventoryLedgerSearchInput?.value || "",
            transactionType: inventoryLedgerTypeFilter?.value || "all",
            period: inventoryLedgerPeriodFilter?.value || "30",
        };
        return;
    }
    inventoryStockFilters = {
        query: inventoryStockSearchInput?.value || "",
        skuType: inventoryStockTypeFilter?.value || "all",
        stockState: inventoryStockStateFilter?.value || "active",
    };
}

function invalidateInventoryViewSearch(viewName = inventoryActiveView) {
    if (!(viewName in inventoryViewSearchStates)) return;
    inventoryViewSearchStates[viewName] = false;
    if (viewName === inventoryActiveView && isCurrentDashboardView("inventory-ledger")) {
        renderInventorySearchPrompt(viewName);
        setInventoryPageStatus("검색 조건이 변경되었습니다. 검색을 눌러 조회해주세요.", "info");
    }
}

async function searchInventoryView(viewName = inventoryActiveView) {
    const targetView = ["stock", "lot", "ledger"].includes(viewName) ? viewName : "stock";
    if (inventorySearchLoading) return;

    syncInventoryFiltersFromControls(targetView);
    const userId = getCloudDataUserId();
    if (!userId) {
        inventoryViewSearchStates[targetView] = false;
        renderInventorySearchPrompt(targetView, "로그인 정보를 확인한 뒤 다시 검색해주세요.");
        setInventoryPageStatus("재고 데이터를 조회할 계정 정보를 확인할 수 없습니다.", "error");
        return;
    }

    inventoryViewSearchStates[targetView] = false;
    renderInventorySearchPrompt(targetView, "최신 재고 데이터를 조회하고 있습니다.");
    setInventorySearchLoading(true, targetView);
    setInventoryPageStatus("최신 재고 데이터를 불러오고 있습니다. 잠시만 기다려주세요.", "info");

    await new Promise((resolve) => {
        if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => resolve());
            return;
        }
        window.setTimeout(resolve, 0);
    });

    const result = await loadInventoryLedger(userId, {
        render: false,
        announce: false,
        preserveOnError: true,
    });
    setInventorySearchLoading(false, targetView);

    if (!result.ok) {
        renderInventorySearchPrompt(targetView, "재고 데이터를 불러오지 못했습니다. 다시 검색해주세요.");
        setInventoryPageStatus(
            result.error?.code === "permission-denied"
                ? "재고수불부 조회 권한이 없습니다."
                : "재고수불부를 불러오지 못했습니다. 잠시 후 다시 검색해주세요.",
            "error",
        );
        return;
    }

    inventoryViewSearchStates[targetView] = true;
    renderInventoryLedger({ force: isCurrentDashboardView("inventory-ledger") });
    const viewLabel = targetView === "lot"
        ? "LOT·로케이션 재고"
        : targetView === "ledger"
            ? "수불 내역"
            : "재고 현황";
    setInventoryPageStatus(
        `${viewLabel}을(를) 최신 데이터로 조회했습니다. 검색을 다시 누르면 새로고침됩니다.`,
        "success",
    );
}

function renderInventoryLedger({ force = false } = {}) {
    if (!force && !isCurrentDashboardView("inventory-ledger")) return;
    renderInventoryViewTabs();
    if (!inventoryViewSearchStates[inventoryActiveView]) {
        renderInventorySearchPrompt(inventoryActiveView);
        applyInventoryColumnWidths(inventoryActiveView);
        return;
    }

    const snapshot = getInventorySnapshot();
    renderInventorySummary(snapshot);
    setInventoryEntryActionsEnabled(true);
    if (inventoryActiveView === "lot") {
        renderInventoryLotRows(snapshot);
    } else if (inventoryActiveView === "ledger") {
        renderInventoryLedgerRows(snapshot);
    } else {
        renderInventoryStockRows(snapshot);
    }
    applyInventoryColumnWidths(inventoryActiveView);
}

function activateInventoryView(viewName) {
    inventoryActiveView = ["stock", "lot", "ledger"].includes(viewName) ? viewName : "stock";
    renderInventoryLedger({ force: true });
    if (!inventoryViewSearchStates[inventoryActiveView]) {
        setInventoryPageStatus("조회 조건을 선택한 뒤 검색을 눌러 최신 재고 데이터를 확인하세요.", "info");
    }
}

function getSelectedInventorySku() {
    return getInventorySnapshot().rows.find((row) => row.skuKey === selectedInventorySkuKey) || null;
}

function getSelectedInventoryStorageSku() {
    return getInventorySnapshot().rows
        .find((row) => row.skuKey === selectedInventoryStorageSkuKey) || null;
}

function createInventoryStorageDraftRow(row = {}) {
    inventoryStorageRowSequence += 1;
    return {
        draftId: `inventory-storage-row-${inventoryStorageRowSequence}`,
        ...normalizeInventoryStorageRow({
            ...row,
            skuKey: row.skuKey || selectedInventoryStorageSkuKey,
        }),
    };
}

function getInventoryStorageDraftValidation() {
    const errors = [];
    const duplicateKeys = new Set();
    const seenKeys = new Set();

    inventoryStorageDraftRows.forEach((row, index) => {
        const quantity = Number(row.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            errors.push(`${index + 1}행 수량은 1개 이상의 정수로 입력해주세요.`);
        }
        if (row.expiryDate && !isValidReceivingExpiryDate(row.expiryDate)) {
            errors.push(`${index + 1}행 유통기한을 실제 날짜로 입력해주세요.`);
        }
        if (Number.isInteger(quantity) && quantity > 0) {
            const key = getInventoryLotGroupKey(row);
            if (seenKeys.has(key)) duplicateKeys.add(key);
            seenKeys.add(key);
        }
    });

    if (duplicateKeys.size) {
        errors.push("LOT·유통기한·로케이션·PLT가 모두 같은 행은 하나로 합쳐주세요.");
    }

    const plan = buildInventoryStorageAdjustmentPlan(
        inventoryStorageBaselineRows,
        inventoryStorageDraftRows,
    );
    if (plan.legs.length > 450) {
        errors.push("한 번에 변경할 보관행이 너무 많습니다. 조정을 여러 번으로 나눠 저장해주세요.");
    }
    return {
        errors,
        duplicateKeys,
        plan,
        isValid: errors.length === 0,
    };
}

function setInventoryStorageStatus(message = "", tone = "error") {
    if (!inventoryStorageStatusEl) return;
    inventoryStorageStatusEl.textContent = message;
    inventoryStorageStatusEl.className = message
        ? `inventory-entry-status is-${tone}`
        : "inventory-entry-status";
}

function renderInventoryStorageRows() {
    if (!inventoryStorageRowsEl) return;
    if (!inventoryStorageDraftRows.length) {
        inventoryStorageRowsEl.innerHTML = `
          <tr class="inventory-storage-empty-row">
            <td colspan="6">
              <strong>조정 후 보관재고가 없습니다.</strong>
              <span>전체 재고를 0으로 조정하려는 경우 그대로 저장하거나, 보관행을 추가해주세요.</span>
            </td>
          </tr>
        `;
        renderInventoryStoragePreview();
        return;
    }

    inventoryStorageRowsEl.innerHTML = inventoryStorageDraftRows.map((row, index) => `
      <tr data-inventory-storage-row-id="${escapeHtml(row.draftId)}">
        <td data-label="LOT">
          <input type="text" maxlength="80" autocomplete="off"
              value="${escapeHtml(row.lotNo)}" placeholder="미지정"
              aria-label="${index + 1}행 LOT"
              data-inventory-storage-field="lotNo" />
        </td>
        <td data-label="유통기한">
          <input class="receiving-expiry-input" type="text" inputmode="numeric"
              maxlength="10" autocomplete="off"
              value="${escapeHtml(formatReceivingExpiryDateInput(row.expiryDate))}"
              placeholder="YYYY-MM-DD"
              aria-label="${index + 1}행 유통기한"
              data-inventory-storage-field="expiryDate" />
        </td>
        <td data-label="로케이션">
          <input type="text" maxlength="80" autocomplete="off"
              value="${escapeHtml(row.location)}" placeholder="예: A-01-01"
              aria-label="${index + 1}행 로케이션"
              data-inventory-storage-field="location" />
        </td>
        <td data-label="PLT">
          <input type="text" maxlength="50" autocomplete="off"
              value="${escapeHtml(row.palletNo)}" placeholder="미지정"
              aria-label="${index + 1}행 PLT"
              data-inventory-storage-field="palletNo" />
        </td>
        <td data-label="수량">
          <input class="inventory-storage-quantity-input" type="number" min="1" step="1"
              inputmode="numeric" value="${escapeHtml(row.quantity)}"
              aria-label="${index + 1}행 수량"
              data-inventory-storage-field="quantity" />
        </td>
        <td data-label="작업">
          <div class="inventory-storage-row-actions">
            <button type="button" data-inventory-storage-clone="${escapeHtml(row.draftId)}"
                aria-label="${index + 1}행을 복제해 재고 분할">복제</button>
            <button class="is-danger" type="button"
                data-inventory-storage-remove="${escapeHtml(row.draftId)}"
                aria-label="${index + 1}행 삭제">삭제</button>
          </div>
        </td>
      </tr>
    `).join("");
    renderInventoryStoragePreview();
}

function renderInventoryStoragePreview() {
    const { errors, duplicateKeys, plan, isValid } = getInventoryStorageDraftValidation();
    if (inventoryStorageBeforeTotalEl) {
        inventoryStorageBeforeTotalEl.textContent = formatMilkrunNumber(plan.beforeTotal);
    }
    if (inventoryStorageAfterTotalEl) {
        inventoryStorageAfterTotalEl.textContent = formatMilkrunNumber(plan.afterTotal);
    }
    if (inventoryStorageDifferenceEl) {
        const prefix = plan.difference > 0 ? "+" : "";
        inventoryStorageDifferenceEl.textContent = `${prefix}${formatMilkrunNumber(plan.difference)}`;
    }
    if (inventoryStorageDifferenceCardEl) {
        inventoryStorageDifferenceCardEl.className = "inventory-storage-difference-card";
        if (plan.difference > 0) inventoryStorageDifferenceCardEl.classList.add("is-positive");
        if (plan.difference < 0) inventoryStorageDifferenceCardEl.classList.add("is-negative");
    }

    inventoryStorageRowsEl?.querySelectorAll("[data-inventory-storage-row-id]").forEach((rowEl) => {
        const row = inventoryStorageDraftRows.find(
            (item) => item.draftId === rowEl.getAttribute("data-inventory-storage-row-id"),
        );
        rowEl.classList.toggle("is-duplicate", Boolean(row && duplicateKeys.has(getInventoryLotGroupKey(row))));
    });

    if (inventoryStorageChangePreviewEl) {
        inventoryStorageChangePreviewEl.className = "inventory-storage-change-preview";
        if (errors.length) {
            inventoryStorageChangePreviewEl.classList.add("is-warning");
            inventoryStorageChangePreviewEl.innerHTML = `
              <strong>입력 내용을 확인해주세요.</strong>
              <span>${escapeHtml(errors[0])}</span>
            `;
        } else if (!plan.hasChanges) {
            inventoryStorageChangePreviewEl.innerHTML = `
              <strong>아직 변경된 내용이 없습니다.</strong>
              <span>행의 정보나 수량을 수정하면 저장될 수불을 미리 보여드립니다.</span>
            `;
        } else if (plan.reclassifiedQuantity > 0 && plan.adjustmentQuantity > 0) {
            inventoryStorageChangePreviewEl.classList.add("is-warning");
            inventoryStorageChangePreviewEl.innerHTML = `
              <strong>${formatMilkrunNumber(plan.reclassifiedQuantity)}개 보관정보 변경 · 총재고 ${plan.difference > 0 ? "증가" : "감소"} ${formatMilkrunNumber(Math.abs(plan.difference))}개</strong>
              <span>보관재고 이동 수불과 수량 조정 수불이 함께 기록됩니다.</span>
            `;
        } else if (plan.reclassifiedQuantity > 0) {
            inventoryStorageChangePreviewEl.classList.add("is-success");
            inventoryStorageChangePreviewEl.innerHTML = `
              <strong>${formatMilkrunNumber(plan.reclassifiedQuantity)}개 보관정보 변경 · 총재고 유지</strong>
              <span>기존 보관행에서 차감하고 변경된 보관행에 더하는 수불이 기록됩니다.</span>
            `;
        } else {
            inventoryStorageChangePreviewEl.classList.add("is-warning");
            inventoryStorageChangePreviewEl.innerHTML = `
              <strong>총재고 ${plan.difference > 0 ? "증가" : "감소"} ${formatMilkrunNumber(Math.abs(plan.difference))}개</strong>
              <span>SKU 현재고가 ${formatMilkrunNumber(plan.beforeTotal)}개에서 ${formatMilkrunNumber(plan.afterTotal)}개로 변경됩니다.</span>
            `;
        }
    }

    if (inventoryStorageSaveBtn instanceof HTMLButtonElement) {
        inventoryStorageSaveBtn.disabled = inventoryStorageSaving
            || !isValid
            || !plan.hasChanges;
        inventoryStorageSaveBtn.textContent = inventoryStorageSaving ? "저장 중..." : "변경사항 저장";
    }
}

function openInventoryStorageModal(skuKey, focusLotKey = "", trigger = null) {
    const snapshot = getInventorySnapshot();
    const sku = snapshot.rows.find((row) => row.skuKey === skuKey);
    if (!sku) {
        setInventoryPageStatus("조정할 SKU를 찾지 못했습니다. 재고를 다시 조회해주세요.", "error");
        return;
    }
    const lotSnapshot = getCachedInventoryLotSnapshot(snapshot);
    const sourceRows = lotSnapshot.rows
        .filter((row) => row.skuKey === skuKey && row.quantity > 0)
        .map((row) => normalizeInventoryStorageRow(row));

    selectedInventoryStorageSkuKey = skuKey;
    inventoryStorageBaselineRows = sourceRows;
    inventoryStorageDraftRows = sourceRows.map(createInventoryStorageDraftRow);
    inventoryStorageBaselineRevision = snapshot.balanceBySku.get(skuKey)?.storageRevision || 0;
    inventoryStorageSaving = false;
    inventoryStorageReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;

    if (inventoryStorageProductNameEl) {
        inventoryStorageProductNameEl.textContent = sku.productName || "상품명 없음";
    }
    if (inventoryStorageProductMetaEl) {
        inventoryStorageProductMetaEl.textContent = [
            sku.adminProductCode || "상품코드 없음",
            getNormalizedSkuType(sku.skuType),
            sku.brand,
        ].filter(Boolean).join(" · ");
    }
    if (inventoryStorageCurrentTotalEl) {
        inventoryStorageCurrentTotalEl.textContent = `${formatMilkrunNumber(sku.currentStock)}개`;
    }
    if (inventoryStorageReasonSelect instanceof HTMLSelectElement) inventoryStorageReasonSelect.value = "";
    if (inventoryStorageDateInput instanceof HTMLInputElement) inventoryStorageDateInput.value = getInventoryTodayValue();
    if (inventoryStorageMemoInput instanceof HTMLTextAreaElement) inventoryStorageMemoInput.value = "";
    setInventoryStorageStatus("");
    renderInventoryStorageRows();
    inventoryStorageModal?.classList.remove("is-hidden");
    inventoryStorageModal?.setAttribute("aria-hidden", "false");

    window.setTimeout(() => {
        const targetRow = focusLotKey
            ? inventoryStorageDraftRows.find((row) => getInventoryLotGroupKey(row) === focusLotKey)
            : inventoryStorageDraftRows[0];
        const targetEl = targetRow
            ? inventoryStorageRowsEl?.querySelector(`[data-inventory-storage-row-id="${targetRow.draftId}"]`)
            : null;
        const input = targetEl?.querySelector('[data-inventory-storage-field="location"]')
            || inventoryStorageAddRowBtn;
        input?.focus();
        targetEl?.scrollIntoView({ block: "nearest" });
    }, 0);
}

function closeInventoryStorageModal({ force = false } = {}) {
    const plan = buildInventoryStorageAdjustmentPlan(
        inventoryStorageBaselineRows,
        inventoryStorageDraftRows,
    );
    if (!force && plan.hasChanges && !window.confirm("저장하지 않은 보관재고 변경사항을 취소할까요?")) {
        return;
    }
    inventoryStorageModal?.classList.add("is-hidden");
    inventoryStorageModal?.setAttribute("aria-hidden", "true");
    selectedInventoryStorageSkuKey = "";
    inventoryStorageBaselineRows = [];
    inventoryStorageDraftRows = [];
    inventoryStorageBaselineRevision = 0;
    inventoryStorageSaving = false;
    if (inventoryStorageRowsEl) inventoryStorageRowsEl.innerHTML = "";
    const returnFocus = inventoryStorageReturnFocus;
    inventoryStorageReturnFocus = null;
    if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
}

function buildInventoryStorageAdjustmentGroupId(now = new Date()) {
    const datePart = getInventoryDateKey(now).replaceAll("-", "");
    const timePart = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((value) => String(value).padStart(2, "0"))
        .join("");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
    return `ADJ-${datePart}-${timePart}-${suffix}`;
}

function formatInventoryStorageRowMemo(row, memo = "") {
    return [
        row.lotNo ? `LOT ${row.lotNo}` : "LOT 미지정",
        row.expiryDate ? `유통기한 ${row.expiryDate}` : "유통기한 미지정",
        row.location ? `로케이션 ${row.location}` : "로케이션 미지정",
        row.palletNo ? `PLT ${row.palletNo}` : "PLT 미지정",
        String(memo || "").trim(),
    ].filter(Boolean).join(" · ");
}

async function saveInventoryStorageAdjustment() {
    if (inventoryStorageSaving) return;
    const userId = getCloudDataUserId();
    const sku = getSelectedInventoryStorageSku();
    const reason = String(inventoryStorageReasonSelect?.value || "").trim();
    const memo = String(inventoryStorageMemoInput?.value || "").trim();
    const occurredAt = buildInventoryOccurredAt(inventoryStorageDateInput?.value);
    const validation = getInventoryStorageDraftValidation();

    if (!userId || !sku) {
        setInventoryStorageStatus("로그인 또는 SKU 정보를 확인할 수 없습니다. 재고를 다시 조회해주세요.");
        return;
    }
    if (!validation.isValid) {
        setInventoryStorageStatus(validation.errors[0] || "입력 내용을 확인해주세요.");
        return;
    }
    if (!validation.plan.hasChanges) {
        setInventoryStorageStatus("변경된 보관재고가 없습니다.");
        return;
    }
    if (!reason) {
        setInventoryStorageStatus("조정 사유를 선택해주세요.");
        inventoryStorageReasonSelect?.focus();
        return;
    }
    if (!inventoryStorageDateInput?.value) {
        setInventoryStorageStatus("조정일자를 입력해주세요.");
        inventoryStorageDateInput?.focus();
        return;
    }
    if (reason === "기타" && !memo) {
        setInventoryStorageStatus("기타 사유를 선택한 경우 메모에 조정 근거를 입력해주세요.");
        inventoryStorageMemoInput?.focus();
        return;
    }

    const balanceCollection = getCloudDataCollection(userId, INVENTORY_BALANCE_COLLECTION);
    const transactionCollection = getCloudDataCollection(userId, INVENTORY_TRANSACTION_COLLECTION);
    if (!balanceCollection || !transactionCollection) {
        setInventoryStorageStatus("재고 저장소를 찾지 못했습니다.");
        return;
    }

    const plan = validation.plan;
    const balanceRef = doc(balanceCollection, getInventoryDocumentId(sku.skuKey));
    const transactionEntries = plan.legs.map((leg) => ({ leg, ref: doc(transactionCollection) }));
    const adjustmentGroupId = buildInventoryStorageAdjustmentGroupId();
    let savedBalance = null;
    let savedTransactions = [];
    inventoryStorageSaving = true;
    setInventoryStorageStatus("");
    renderInventoryStoragePreview();

    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const balanceSnapshot = await firestoreTransaction.get(balanceRef);
            const liveBalance = balanceSnapshot.exists()
                ? normalizeInventoryBalance(balanceSnapshot.data())
                : normalizeInventoryBalance({
                    ...sku,
                    skuRowId: sku.rowId,
                    quantity: sku.currentStock,
                });
            if (
                liveBalance.quantity !== plan.beforeTotal
                || liveBalance.storageRevision !== inventoryStorageBaselineRevision
            ) {
                const staleError = new Error("재고가 다른 작업에서 변경되었습니다.");
                staleError.code = "inventory/storage-stale";
                throw staleError;
            }

            const savedAt = new Date().toISOString();
            savedBalance = normalizeInventoryBalance({
                ...liveBalance,
                skuKey: sku.skuKey,
                skuRowId: sku.rowId,
                adminProductCode: sku.adminProductCode,
                productName: sku.productName,
                skuType: sku.skuType,
                category: sku.category,
                quantity: plan.afterTotal,
                storageRevision: liveBalance.storageRevision + 1,
                updatedAt: savedAt,
            });
            firestoreTransaction.set(balanceRef, {
                ...savedBalance,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            let runningBalance = liveBalance.quantity;
            let ledgerSequence = 0;
            savedTransactions = transactionEntries.map(({ leg, ref }) => {
                if (leg.kind === "quantity_adjustment") {
                    runningBalance += leg.transactionType === "adjustment_out"
                        ? -leg.quantity
                        : leg.quantity;
                }
                const ledgerRow = buildInventoryTransactionDraft({
                    id: ref.id,
                    transactionType: leg.transactionType,
                    sku,
                    quantity: leg.quantity,
                    balanceAfter: leg.kind === "reclassification" ? liveBalance.quantity : runningBalance,
                    occurredAt: new Date(Date.parse(occurredAt) + ledgerSequence).toISOString(),
                    reason,
                    memo: formatInventoryStorageRowMemo(leg.row, memo),
                    createdBy: currentUserEmail || auth.currentUser?.email || "",
                    sourceType: "storage_adjustment",
                    sourceId: adjustmentGroupId,
                    sourceCode: adjustmentGroupId,
                    adjustmentGroupId,
                    operationType: plan.operationType,
                    counterpartKey: leg.counterpartKey,
                    palletNo: leg.row.palletNo,
                    lotNo: leg.row.lotNo,
                    expiryDate: leg.row.expiryDate,
                    location: leg.row.location,
                });
                ledgerSequence += 1;
                firestoreTransaction.set(ref, {
                    ...ledgerRow,
                    createdAt: serverTimestamp(),
                });
                return ledgerRow;
            });
        });

        inventoryBalances = [
            savedBalance,
            ...inventoryBalances.filter((row) => row.skuKey !== savedBalance.skuKey),
        ];
        inventoryTransactions = [
            ...savedTransactions.map(normalizeInventoryTransaction),
            ...inventoryTransactions,
        ];
        inventoryLotSnapshotCache = null;
        closeInventoryStorageModal({ force: true });
        renderInventoryLedger({ force: true });
        const quantityChangeText = plan.difference
            ? ` · 총재고 ${plan.difference > 0 ? "증가" : "감소"} ${formatMilkrunNumber(Math.abs(plan.difference))}개`
            : " · 총재고 유지";
        setInventoryPageStatus(
            `${sku.productName || sku.adminProductCode}의 보관재고를 조정했습니다${quantityChangeText}.`,
            "success",
        );
    } catch (error) {
        console.error("보관재고 상세 조정에 실패했습니다.", error);
        inventoryStorageSaving = false;
        renderInventoryStoragePreview();
        if (error?.code === "inventory/storage-stale") {
            setInventoryStorageStatus("다른 작업으로 재고가 변경되었습니다. 창을 닫고 최신 재고를 다시 조회해주세요.");
        } else if (error?.code === "permission-denied") {
            setInventoryStorageStatus("재고 조정 권한이 없습니다.");
        } else {
            setInventoryStorageStatus("보관재고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}

function getInventoryAdjustmentDirection() {
    const checkedInput = [...inventoryAdjustmentDirectionInputs]
        .find((input) => input instanceof HTMLInputElement && input.checked);
    return checkedInput?.value === "out" ? "out" : "in";
}

function setInventoryEntryStatus(message = "", tone = "error") {
    if (!inventoryEntryStatusEl) return;
    inventoryEntryStatusEl.textContent = message;
    inventoryEntryStatusEl.className = message
        ? `inventory-entry-status is-${tone}`
        : "inventory-entry-status";
}

function renderInventoryAdjustmentReasons() {
    if (!(inventoryEntryReasonSelect instanceof HTMLSelectElement)) return;
    const direction = getInventoryAdjustmentDirection();
    const reasons = INVENTORY_ADJUSTMENT_REASONS[direction] ?? [];
    const previousValue = inventoryEntryReasonSelect.value;
    inventoryEntryReasonSelect.innerHTML = `
      <option value="">사유를 선택해주세요.</option>
      ${reasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("")}
    `;
    if (reasons.includes(previousValue)) inventoryEntryReasonSelect.value = previousValue;
}

function renderInventorySelectedSku() {
    if (!inventoryEntrySelectedSkuEl) return;
    const row = getSelectedInventorySku();
    if (!row) {
        inventoryEntrySelectedSkuEl.className = "inventory-selected-sku is-empty";
        inventoryEntrySelectedSkuEl.textContent = "SKU를 선택해주세요.";
        return;
    }

    const discontinued = isInventoryDiscontinuedSku(row);
    inventoryEntrySelectedSkuEl.className = "inventory-selected-sku";
    inventoryEntrySelectedSkuEl.innerHTML = `
      <div>
        <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
        <span>${escapeHtml(row.adminProductCode || "-")} · ${escapeHtml(getNormalizedSkuType(row.skuType))}</span>
      </div>
      <div class="inventory-selected-stock">
        <span>현재고</span>
        <strong>${formatMilkrunNumber(row.currentStock)}</strong>
      </div>
      ${discontinued ? '<span class="inventory-selected-warning">단종 SKU</span>' : ""}
    `;
}

function renderInventorySkuSearchResults() {
    if (!inventoryEntrySkuResultsEl) return;
    const snapshot = getInventorySnapshot();
    const query = normalizeSkuSearchToken(inventoryEntrySkuSearchInput?.value);
    const rows = snapshot.rows
        .filter((row) => {
            if (!query) return true;
            return [row.productName, row.adminProductCode, row.brand]
                .some((value) => normalizeSkuSearchToken(value).includes(query));
        })
        .sort((left, right) => (
            String(left.productName || "").localeCompare(String(right.productName || ""), "ko-KR")
        ))
        .slice(0, 8);

    if (!rows.length) {
        inventoryEntrySkuResultsEl.innerHTML = '<div class="inventory-sku-results-empty">검색 결과가 없습니다.</div>';
        return;
    }

    inventoryEntrySkuResultsEl.innerHTML = rows.map((row) => {
        const isSelected = row.skuKey === selectedInventorySkuKey;
        const openingUnavailable = inventoryEntryMode === "opening" && row.hasTransactions;
        const status = openingUnavailable
            ? "이미 등록됨"
            : `현재고 ${formatMilkrunNumber(row.currentStock)}`;
        return `
          <button class="inventory-sku-result${isSelected ? " is-selected" : ""}"
              type="button" role="option" aria-selected="${isSelected ? "true" : "false"}"
              data-inventory-select-sku="${escapeHtml(row.skuKey)}"
              ${openingUnavailable ? "disabled" : ""}>
            <span>
              <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
              <small>${escapeHtml(row.adminProductCode || "-")} · ${escapeHtml(getNormalizedSkuType(row.skuType))}</small>
            </span>
            <em>${escapeHtml(status)}</em>
          </button>
        `;
    }).join("");
}

function renderInventoryEntryPreview() {
    if (!inventoryEntryPreviewEl) return;
    const row = getSelectedInventorySku();
    const quantity = Math.max(0, Math.trunc(Number(inventoryEntryQuantityInput?.value) || 0));
    const currentStock = Math.max(0, Number(row?.currentStock) || 0);
    const direction = inventoryEntryMode === "opening" ? "in" : getInventoryAdjustmentDirection();
    const nextStock = inventoryEntryMode === "opening"
        ? quantity
        : currentStock + (direction === "out" ? -quantity : quantity);

    if (!row || !quantity) {
        inventoryEntryPreviewEl.innerHTML = `
          <span>변경 후 재고</span>
          <strong>SKU와 수량을 선택해주세요.</strong>
        `;
        if (inventoryEntrySaveBtn instanceof HTMLButtonElement) inventoryEntrySaveBtn.disabled = true;
        return;
    }

    const isInvalid = nextStock < 0;
    inventoryEntryPreviewEl.innerHTML = `
      <span>변경 후 재고</span>
      <strong class="${isInvalid ? "is-negative" : ""}">
        ${formatMilkrunNumber(currentStock)}
        <i aria-hidden="true">→</i>
        ${formatMilkrunNumber(nextStock)}
      </strong>
    `;
    if (inventoryEntrySaveBtn instanceof HTMLButtonElement) {
        inventoryEntrySaveBtn.disabled = isInvalid || inventoryEntrySaving;
    }
    if (isInvalid) {
        setInventoryEntryStatus("현재고보다 많은 수량은 차감할 수 없습니다.");
    } else if (inventoryEntryStatusEl?.textContent === "현재고보다 많은 수량은 차감할 수 없습니다.") {
        setInventoryEntryStatus("");
    }
}

function syncInventoryDirectionControl() {
    const direction = getInventoryAdjustmentDirection();
    inventoryAdjustmentDirectionEl?.querySelectorAll(".inventory-direction-option").forEach((label) => {
        const input = label.querySelector("input");
        label.classList.toggle("is-selected", input instanceof HTMLInputElement && input.value === direction);
    });
    renderInventoryAdjustmentReasons();
    renderInventoryEntryPreview();
}

function closeInventoryEntryModal() {
    inventoryEntryModal?.classList.add("is-hidden");
    inventoryEntryModal?.setAttribute("aria-hidden", "true");
    inventoryEntrySaving = false;
}

function openInventoryEntryModal(mode = "opening", skuKey = "") {
    if (!skuRows.length) {
        setInventoryPageStatus("SKU 관리에서 상품을 먼저 등록해주세요.", "warning");
        showView("sku");
        return;
    }

    inventoryEntryMode = mode === "adjustment" ? "adjustment" : "opening";
    selectedInventorySkuKey = skuKey;
    inventoryEntrySaving = false;
    if (inventoryEntrySkuSearchInput instanceof HTMLInputElement) {
        inventoryEntrySkuSearchInput.value = "";
    }
    if (inventoryEntryQuantityInput instanceof HTMLInputElement) {
        inventoryEntryQuantityInput.value = "";
    }
    if (inventoryEntryDateInput instanceof HTMLInputElement) {
        inventoryEntryDateInput.value = getInventoryTodayValue();
    }
    if (inventoryEntryMemoInput instanceof HTMLTextAreaElement) {
        inventoryEntryMemoInput.value = "";
    }
    setInventoryEntryStatus("");

    const isAdjustment = inventoryEntryMode === "adjustment";
    if (inventoryEntryModalTitleEl) {
        inventoryEntryModalTitleEl.textContent = isAdjustment ? "재고 조정" : "기초재고 등록";
    }
    if (inventoryEntryModalDescEl) {
        inventoryEntryModalDescEl.textContent = isAdjustment
            ? "실사 차이, 파손, 분실 등 실제 재고 변동을 기록합니다."
            : "재고 관리를 시작할 SKU의 현재 보유 수량을 등록합니다.";
    }
    if (inventoryEntryQuantityHelpEl) {
        inventoryEntryQuantityHelpEl.textContent = isAdjustment
            ? "증가 또는 감소할 수량을 입력합니다."
            : "현재 보유한 기초재고를 입력합니다.";
    }
    if (inventoryAdjustmentDirectionEl) inventoryAdjustmentDirectionEl.hidden = !isAdjustment;
    if (inventoryEntryReasonField) inventoryEntryReasonField.hidden = !isAdjustment;
    if (inventoryEntrySaveBtn instanceof HTMLButtonElement) {
        inventoryEntrySaveBtn.textContent = isAdjustment ? "재고 조정 저장" : "기초재고 저장";
        inventoryEntrySaveBtn.disabled = true;
    }

    const firstDirectionInput = [...inventoryAdjustmentDirectionInputs]
        .find((input) => input instanceof HTMLInputElement && input.value === "in");
    if (firstDirectionInput instanceof HTMLInputElement) firstDirectionInput.checked = true;
    renderInventoryAdjustmentReasons();
    renderInventorySkuSearchResults();
    renderInventorySelectedSku();
    renderInventoryEntryPreview();

    inventoryEntryModal?.classList.remove("is-hidden");
    inventoryEntryModal?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => {
        if (selectedInventorySkuKey) {
            inventoryEntryQuantityInput?.focus();
        } else {
            inventoryEntrySkuSearchInput?.focus();
        }
    }, 0);
}

function selectInventorySku(skuKey) {
    selectedInventorySkuKey = skuKey;
    setInventoryEntryStatus("");
    renderInventorySkuSearchResults();
    renderInventorySelectedSku();
    renderInventoryEntryPreview();
    inventoryEntryQuantityInput?.focus();
}

async function saveInventoryEntry() {
    if (inventoryEntrySaving) return;
    const userId = getCloudDataUserId();
    const sku = getSelectedInventorySku();
    const quantity = Math.max(0, Math.trunc(Number(inventoryEntryQuantityInput?.value) || 0));
    const occurredAt = buildInventoryOccurredAt(inventoryEntryDateInput?.value);
    const direction = getInventoryAdjustmentDirection();
    const reason = inventoryEntryMode === "adjustment"
        ? String(inventoryEntryReasonSelect?.value || "").trim()
        : "최초 재고 등록";
    const memo = String(inventoryEntryMemoInput?.value || "").trim();

    if (!userId) {
        setInventoryEntryStatus("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
        return;
    }
    if (!sku) {
        setInventoryEntryStatus("재고를 등록할 SKU를 선택해주세요.");
        return;
    }
    if (quantity <= 0) {
        setInventoryEntryStatus("수량은 1개 이상 입력해주세요.");
        inventoryEntryQuantityInput?.focus();
        return;
    }
    if (inventoryEntryMode === "adjustment" && !reason) {
        setInventoryEntryStatus("재고 조정 사유를 선택해주세요.");
        inventoryEntryReasonSelect?.focus();
        return;
    }

    const transactionType = inventoryEntryMode === "opening"
        ? "opening"
        : (direction === "out" ? "adjustment_out" : "adjustment_in");
    const transactionCollection = getCloudDataCollection(userId, INVENTORY_TRANSACTION_COLLECTION);
    const balanceCollection = getCloudDataCollection(userId, INVENTORY_BALANCE_COLLECTION);
    if (!transactionCollection || !balanceCollection) {
        setInventoryEntryStatus("재고 저장소를 찾지 못했습니다.");
        return;
    }

    const transactionRef = doc(transactionCollection);
    const balanceRef = doc(balanceCollection, getInventoryDocumentId(sku.skuKey));
    const localCurrentStock = Math.max(0, Number(sku.currentStock) || 0);
    const localHasTransactions = getInventorySnapshot().transactions
        .some((row) => row.skuKey === sku.skuKey);
    let savedRecord = null;
    let savedBalance = null;

    inventoryEntrySaving = true;
    if (inventoryEntrySaveBtn instanceof HTMLButtonElement) {
        inventoryEntrySaveBtn.disabled = true;
        inventoryEntrySaveBtn.textContent = "저장 중...";
    }
    setInventoryEntryStatus("");

    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const balanceSnapshot = await firestoreTransaction.get(balanceRef);
            const storedBalanceRow = balanceSnapshot.exists()
                ? normalizeInventoryBalance(balanceSnapshot.data())
                : normalizeInventoryBalance({
                    ...sku,
                    skuRowId: sku.rowId,
                    quantity: localCurrentStock,
                });
            const storedBalance = storedBalanceRow.quantity;

            if (inventoryEntryMode === "opening" && (balanceSnapshot.exists() || localHasTransactions)) {
                const duplicateError = new Error("이미 수불 내역이 있는 SKU입니다.");
                duplicateError.code = "inventory/opening-exists";
                throw duplicateError;
            }

            const nextBalance = inventoryEntryMode === "opening"
                ? quantity
                : storedBalance + (direction === "out" ? -quantity : quantity);
            if (nextBalance < 0) {
                const negativeError = new Error("현재고보다 많은 수량은 차감할 수 없습니다.");
                negativeError.code = "inventory/negative-stock";
                throw negativeError;
            }

            savedRecord = buildInventoryTransactionDraft({
                id: transactionRef.id,
                transactionType,
                sku,
                quantity,
                balanceAfter: nextBalance,
                occurredAt,
                reason,
                memo,
                createdBy: currentUserEmail || auth.currentUser?.email || "",
            });
            savedBalance = normalizeInventoryBalance({
                skuKey: sku.skuKey,
                skuRowId: sku.rowId,
                adminProductCode: sku.adminProductCode,
                productName: sku.productName,
                skuType: sku.skuType,
                category: sku.category,
                warehouseId: "main",
                warehouseName: "기본 창고",
                quantity: nextBalance,
                storageRevision: storedBalanceRow.storageRevision + 1,
                updatedAt: new Date().toISOString(),
            });

            firestoreTransaction.set(balanceRef, {
                ...savedBalance,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            firestoreTransaction.set(transactionRef, {
                ...savedRecord,
                createdAt: serverTimestamp(),
            });
        });

        inventoryTransactions = [
            normalizeInventoryTransaction(savedRecord),
            ...inventoryTransactions.filter((row) => row.id !== savedRecord.id),
        ];
        inventoryBalances = [
            savedBalance,
            ...inventoryBalances.filter((row) => row.skuKey !== savedBalance.skuKey),
        ];
        closeInventoryEntryModal();
        renderInventoryLedger({ force: true });
        setInventoryPageStatus(
            `${savedRecord.productName || savedRecord.adminProductCode}의 ${getInventoryTransactionTypeMeta(savedRecord.transactionType).label} ${formatMilkrunNumber(savedRecord.quantity)}개를 저장했습니다.`,
            "success",
        );
    } catch (error) {
        console.error("재고수불 저장에 실패했습니다.", error);
        inventoryEntrySaving = false;
        if (inventoryEntrySaveBtn instanceof HTMLButtonElement) {
            inventoryEntrySaveBtn.textContent = inventoryEntryMode === "adjustment"
                ? "재고 조정 저장"
                : "기초재고 저장";
        }
        if (error?.code === "inventory/opening-exists") {
            setInventoryEntryStatus("이미 재고 변동이 있는 SKU입니다. 재고 조정을 이용해주세요.");
        } else if (error?.code === "inventory/negative-stock") {
            setInventoryEntryStatus("현재고보다 많은 수량은 차감할 수 없습니다.");
        } else if (error?.code === "permission-denied") {
            setInventoryEntryStatus("재고 저장 권한이 없습니다. 잠시 후 다시 시도해주세요.");
        } else {
            setInventoryEntryStatus("재고를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        }
        renderInventoryEntryPreview();
    }
}

async function loadInventoryLedger(
    userId,
    { render = true, announce = true, preserveOnError = false } = {},
) {
    if (!userId) return { ok: false, error: new Error("missing-user-id") };
    try {
        const [savedTransactions, savedBalances, savedAllocations] = await Promise.all([
            loadCloudRows(userId, INVENTORY_TRANSACTION_COLLECTION),
            loadCloudRows(userId, INVENTORY_BALANCE_COLLECTION),
            loadCloudRows(userId, INVENTORY_ALLOCATION_COLLECTION),
        ]);
        inventoryTransactions = (savedTransactions ?? []).map(normalizeInventoryTransaction);
        inventoryBalances = (savedBalances ?? []).map(normalizeInventoryBalance);
        inventoryAllocations = (savedAllocations ?? []).map(normalizeInventoryAllocation);
        inventoryLedgerLoaded = true;
        inventoryLotSnapshotCache = null;
        renderOrderManagement();
        if (render) {
            renderInventoryLedger({ force: isCurrentDashboardView("inventory-ledger") });
        }
        if (announce) {
            setInventoryPageStatus(
                inventoryTransactions.length
                    ? `저장된 수불 내역 ${formatMilkrunNumber(inventoryTransactions.length)}건을 불러왔습니다.`
                    : "SKU를 선택해 기초재고를 등록하면 재고 관리가 시작됩니다.",
                "info",
            );
        }
        return { ok: true };
    } catch (error) {
        console.error("재고수불부를 불러오지 못했습니다.", error);
        if (!preserveOnError) {
            inventoryTransactions = [];
            inventoryBalances = [];
            inventoryAllocations = [];
            inventoryLedgerLoaded = false;
            inventoryLotSnapshotCache = null;
        }
        if (render) {
            renderInventoryLedger({ force: isCurrentDashboardView("inventory-ledger") });
        }
        if (announce) {
            setInventoryPageStatus(
                error?.code === "permission-denied"
                    ? "재고수불부 조회 권한이 없습니다."
                    : "재고수불부를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
                "error",
            );
        }
        return { ok: false, error };
    }
}

function setReceivingPageStatus(message, tone = "info") {
    if (!receivingPageStatusEl) return;
    receivingPageStatusEl.textContent = message || "";
    receivingPageStatusEl.className = `receiving-page-status is-${tone}`;
}

function setReceivingCreateStatus(message = "", tone = "error") {
    if (!receivingCreateStatusEl) return;
    receivingCreateStatusEl.textContent = message;
    receivingCreateStatusEl.className = message
        ? `receiving-create-status is-${tone}`
        : "receiving-create-status";
}

function setReceivingDetailStatus(message = "", tone = "error") {
    if (!receivingDetailStatusEl) return;
    receivingDetailStatusEl.textContent = message;
    receivingDetailStatusEl.className = message
        ? `receiving-create-status is-${tone}`
        : "receiving-create-status";
}

function setReceivingUploadStatus(message = "", tone = "error") {
    if (!receivingUploadStatusEl) return;
    receivingUploadStatusEl.textContent = message;
    receivingUploadStatusEl.className = message
        ? `receiving-create-status is-${tone}`
        : "receiving-create-status";
}

function setReceivingCompletionStatus(message = "", tone = "error") {
    if (!receivingCompletionStatusEl) return;
    receivingCompletionStatusEl.textContent = message;
    receivingCompletionStatusEl.className = message
        ? `receiving-create-status is-${tone}`
        : "receiving-create-status";
}

function closeReceivingCompletionModal({ force = false } = {}) {
    if (receivingCompletionBusy && !force) return;
    receivingCompletionModal?.classList.add("is-hidden");
    receivingCompletionModal?.setAttribute("aria-hidden", "true");
    receivingCompletionParsed = null;
    receivingCompletionPreview = null;
    receivingCompletionBusy = false;
    if (receivingCompletionFileInput instanceof HTMLInputElement) {
        receivingCompletionFileInput.value = "";
    }
    setReceivingCompletionStatus("");
}

function getReceivingCompletionVarianceMeta(varianceQuantity) {
    const variance = Number(varianceQuantity) || 0;
    if (variance === 0) return { tone: "matched", label: "수량 일치" };
    if (variance < 0) {
        return {
            tone: "shortage",
            label: `${formatMilkrunNumber(Math.abs(variance))}개 부족`,
        };
    }
    return {
        tone: "excess",
        label: `+${formatMilkrunNumber(variance)}개`,
    };
}

function renderReceivingCompletionPreview() {
    const preview = receivingCompletionPreview;
    if (!preview) return;
    if (receivingCompletionFileNameEl) {
        receivingCompletionFileNameEl.textContent = receivingCompletionParsed?.fileName || "선택된 파일";
    }
    if (receivingCompletionSummaryEl) {
        receivingCompletionSummaryEl.innerHTML = `
          <div class="receiving-upload-stat"><span>엑셀 데이터</span><strong>${formatMilkrunNumber(preview.rowCount)}행</strong></div>
          <div class="receiving-upload-stat"><span>매칭 SKU</span><strong>${formatMilkrunNumber(preview.itemCount)}개</strong></div>
          <div class="receiving-upload-stat"><span>이번 실입고</span><strong>${formatMilkrunNumber(preview.importedTotalQuantity)}개</strong></div>
          <div class="receiving-upload-stat${preview.errors.length ? " is-error" : ""}"><span>오류</span><strong>${formatMilkrunNumber(preview.errors.length)}건</strong></div>
        `;
    }
    if (receivingCompletionIssuesEl) {
        const issues = [
            ...preview.errors.map((message) => ({ message, tone: "error" })),
            ...preview.warnings.map((message) => ({ message, tone: "warning" })),
        ];
        receivingCompletionIssuesEl.innerHTML = issues.length
            ? issues.slice(0, 80).map((issue) => `
              <div class="receiving-upload-issue is-${issue.tone}">${escapeHtml(issue.message)}</div>
            `).join("") + (issues.length > 80
                ? `<div class="receiving-upload-issue is-warning">외 ${formatMilkrunNumber(issues.length - 80)}건의 확인 항목이 있습니다.</div>`
                : "")
            : '<div class="receiving-upload-empty">오류 없이 현재 입고 내용에 적용할 수 있습니다.</div>';
    }
    if (receivingCompletionItemsBodyEl) {
        receivingCompletionItemsBodyEl.innerHTML = preview.groups.length
            ? preview.groups.map((group) => {
                const varianceMeta = getReceivingCompletionVarianceMeta(group.varianceQuantity);
                return `
                  <tr>
                    <td>
                      <div class="receiving-completion-product">
                        <strong>${escapeHtml(group.productName || "상품명 없음")}</strong>
                        <span>${escapeHtml(group.adminProductCode || group.barcode || "-")} · 엑셀 ${formatMilkrunNumber(group.sourceRowCount)}행</span>
                      </div>
                    </td>
                    <td>${formatMilkrunNumber(group.plannedQuantity)}개</td>
                    <td>${formatMilkrunNumber(group.postedQuantity)}개</td>
                    <td>${formatMilkrunNumber(group.importedQuantity)}개</td>
                    <td>${formatMilkrunNumber(group.resultingQuantity)}개</td>
                    <td><span class="receiving-completion-variance is-${varianceMeta.tone}">${escapeHtml(varianceMeta.label)}</span></td>
                  </tr>
                `;
            }).join("")
            : '<tr class="tracking-empty-row"><td colspan="6">적용 가능한 SKU가 없습니다.</td></tr>';
    }
    if (receivingCompletionApplyBtn instanceof HTMLButtonElement) {
        receivingCompletionApplyBtn.disabled = receivingCompletionBusy || !preview.isValid;
        receivingCompletionApplyBtn.textContent = receivingCompletionBusy
            ? "적용 중..."
            : `검증된 ${formatMilkrunNumber(preview.itemCount)}개 SKU 적용`;
    }
}

function downloadReceivingCompletionTemplate() {
    const receipt = getSelectedInventoryReceipt();
    if (!receipt || !isInventoryReceiptEditableStatus(receipt.status)) return;
    if (receivingScanDraft) {
        setReceivingDetailStatus("스캔 중인 상품 입력을 완료하거나 취소한 뒤 양식을 다운로드해주세요.");
        return;
    }
    if (!window.XLSX) {
        setReceivingDetailStatus("엑셀 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.");
        return;
    }

    const matrix = buildReceivingCompletionTemplateMatrix(receivingDetailDraftItems);
    if (matrix.length <= 1) {
        setReceivingDetailStatus("엑셀로 입력할 미완료 SKU가 없습니다.");
        return;
    }
    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.aoa_to_sheet(matrix, { cellStyles: true });
    worksheet["!autofilter"] = {
        ref: window.XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: matrix.length - 1, c: matrix[0].length - 1 },
        }),
    };
    worksheet["!cols"] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 44 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 14 },
        { wch: 18 },
        { wch: 32 },
    ];
    worksheet["!rows"] = [{ hpt: 24 }];
    matrix[0].forEach((header, columnIndex) => {
        const address = window.XLSX.utils.encode_cell({ r: 0, c: columnIndex });
        if (!worksheet[address]) return;
        worksheet[address].s = {
            fill: { patternType: "solid", fgColor: { rgb: "E8EFFF" } },
            font: { bold: true, color: { rgb: "2446A8" } },
            alignment: { horizontal: "center", vertical: "center" },
        };
    });
    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        [0, 1].forEach((columnIndex) => {
            const address = window.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
            if (!worksheet[address]) return;
            worksheet[address].t = "s";
            worksheet[address].z = "@";
        });
        const quantityAddress = window.XLSX.utils.encode_cell({ r: rowIndex, c: 3 });
        if (worksheet[quantityAddress]) worksheet[quantityAddress].z = "#,##0";
    }
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "입고완료");
    workbook.Props = {
        Title: `${receipt.receiptCode} 입고 완료 양식`,
        Subject: "FlowButler receiving completion import",
        Author: "FlowButler",
        CreatedDate: new Date(),
    };
    const safeReceiptCode = sanitizeDownloadFileNamePart(receipt.receiptCode || "Inbound");
    window.XLSX.writeFile(
        workbook,
        `Inbound_Completion_${safeReceiptCode}.xlsx`,
        { cellStyles: true, compression: true },
    );
    setReceivingDetailStatus(
        "미완료 SKU의 남은 예정수량을 실입고수량에 채운 양식을 다운로드했습니다. 수량 차이가 있으면 사유를 함께 입력해주세요.",
        "success",
    );
}

async function handleReceivingCompletionFile(file) {
    if (!file || receivingCompletionBusy) return;
    const receipt = getSelectedInventoryReceipt();
    if (!receipt || !isInventoryReceiptEditableStatus(receipt.status)) return;
    if (receivingScanDraft) {
        setReceivingDetailStatus("스캔 중인 상품 입력을 완료하거나 취소한 뒤 엑셀을 업로드해주세요.");
        if (receivingCompletionFileInput instanceof HTMLInputElement) {
            receivingCompletionFileInput.value = "";
        }
        return;
    }

    receivingCompletionBusy = true;
    setReceivingDetailStatus("입고 완료 엑셀을 검증하고 있습니다.", "info");
    try {
        receivingCompletionParsed = await parseReceivingCompletionFile(file);
    } catch (error) {
        receivingCompletionParsed = {
            fileName: file.name || "선택된 파일",
            rows: [],
            headerErrors: [error?.message || "엑셀 파일을 읽지 못했습니다."],
        };
    }
    receivingCompletionPreview = buildReceivingCompletionImportPreview(
        receivingCompletionParsed,
        receipt,
        receivingDetailDraftItems,
    );
    receivingCompletionBusy = false;
    setReceivingCompletionStatus("");
    renderReceivingCompletionPreview();
    receivingCompletionModal?.classList.remove("is-hidden");
    receivingCompletionModal?.setAttribute("aria-hidden", "false");
    setReceivingDetailStatus("");
}

function applyReceivingCompletionPreview() {
    if (receivingCompletionBusy || !receivingCompletionParsed) return;
    const receipt = getSelectedInventoryReceipt();
    if (!receipt || !isInventoryReceiptEditableStatus(receipt.status)) return;
    receivingCompletionPreview = buildReceivingCompletionImportPreview(
        receivingCompletionParsed,
        receipt,
        receivingDetailDraftItems,
    );
    if (!receivingCompletionPreview.isValid) {
        renderReceivingCompletionPreview();
        setReceivingCompletionStatus("입고 내용이 변경되었습니다. 검증 결과를 다시 확인해주세요.");
        return;
    }
    if (
        receivingCompletionPreview.replacedUnpostedQuantity > 0
        && !window.confirm(
            `현재 미반영 수기 입력 ${formatMilkrunNumber(receivingCompletionPreview.replacedUnpostedQuantity)}개를 엑셀 내용으로 교체할까요?\n이미 재고에 반영된 수량은 유지됩니다.`,
        )
    ) {
        return;
    }

    const appliedItemCount = receivingCompletionPreview.itemCount;
    const appliedQuantity = receivingCompletionPreview.importedTotalQuantity;
    receivingCompletionBusy = true;
    renderReceivingCompletionPreview();
    receivingDetailDraftItems = applyReceivingCompletionImport(
        receivingDetailDraftItems,
        receivingCompletionPreview,
        { idPrefix: `excel-${Date.now()}` },
    );
    receivingDetailDirty = true;
    receivingScanDraft = null;
    closeReceivingCompletionModal({ force: true });
    renderReceivingDetail();
    setReceivingDetailStatus(
        `엑셀에서 SKU ${formatMilkrunNumber(appliedItemCount)}개 · 실입고 ${formatMilkrunNumber(appliedQuantity)}개를 적용했습니다. 재고에는 아직 반영되지 않았습니다. 내용을 확인한 뒤 입고 완료를 눌러주세요.`,
        "success",
    );
}

function closeReceivingUploadModal({ force = false } = {}) {
    if (receivingUploadSaving && !force) return;
    receivingUploadModal?.classList.add("is-hidden");
    receivingUploadModal?.setAttribute("aria-hidden", "true");
    receivingUploadParsed = null;
    receivingUploadPreview = null;
    receivingUploadSaving = false;
    if (receivingUploadFileInput instanceof HTMLInputElement) receivingUploadFileInput.value = "";
}

function renderReceivingUploadPreview() {
    const preview = receivingUploadPreview;
    if (!preview) return;
    if (receivingUploadFileNameEl) {
        receivingUploadFileNameEl.textContent = receivingUploadParsed?.fileName || "선택된 파일";
    }
    if (receivingUploadSummaryEl) {
        receivingUploadSummaryEl.innerHTML = `
          <div class="receiving-upload-stat"><span>엑셀 데이터</span><strong>${formatMilkrunNumber(preview.rowCount)}행</strong></div>
          <div class="receiving-upload-stat"><span>입고 예정</span><strong>${formatMilkrunNumber(preview.groupCount)}건</strong></div>
          <div class="receiving-upload-stat"><span>예정수량</span><strong>${formatMilkrunNumber(preview.totalQuantity)}개</strong></div>
          <div class="receiving-upload-stat${preview.errors.length ? " is-error" : ""}"><span>오류</span><strong>${formatMilkrunNumber(preview.errors.length)}건</strong></div>
        `;
    }
    if (receivingUploadIssuesEl) {
        const issues = [
            ...preview.errors.map((message) => ({ message, tone: "error" })),
            ...preview.warnings.map((message) => ({ message, tone: "warning" })),
        ];
        receivingUploadIssuesEl.innerHTML = issues.length
            ? issues.slice(0, 50).map((issue) => `
              <div class="receiving-upload-issue is-${issue.tone}">${escapeHtml(issue.message)}</div>
            `).join("") + (issues.length > 50
                ? `<div class="receiving-upload-issue is-warning">외 ${formatMilkrunNumber(issues.length - 50)}건의 확인 항목이 있습니다.</div>`
                : "")
            : '<div class="receiving-upload-empty">오류 없이 등록할 수 있습니다.</div>';
    }
    if (receivingUploadGroupsBodyEl) {
        receivingUploadGroupsBodyEl.innerHTML = preview.groups.length
            ? preview.groups.map((group) => `
              <tr>
                <td><span class="receiving-code">${escapeHtml(group.receiptNumber || "자동 생성")}</span></td>
                <td>${escapeHtml(group.supplier)}</td>
                <td>${escapeHtml(formatReceivingDate(group.expectedDate))}</td>
                <td>${formatMilkrunNumber(group.items.length)}개</td>
                <td>${formatMilkrunNumber(group.totalQuantity)}개</td>
              </tr>
            `).join("")
            : '<tr class="tracking-empty-row"><td colspan="5">등록 가능한 입고 예정 건이 없습니다.</td></tr>';
    }
    if (receivingUploadSaveBtn instanceof HTMLButtonElement) {
        receivingUploadSaveBtn.disabled = receivingUploadSaving || !preview.isValid;
        receivingUploadSaveBtn.textContent = receivingUploadSaving
            ? "등록 중..."
            : `검증된 입고 예정 ${formatMilkrunNumber(preview.groupCount)}건 등록`;
    }
}

async function handleReceivingUploadFile(file) {
    if (!file) return;
    setReceivingPageStatus("입고 예정 엑셀을 검증하고 있습니다.", "info");
    try {
        receivingUploadParsed = await parseInboundPlanFile(file);
    } catch (error) {
        receivingUploadParsed = {
            fileName: file.name || "선택된 파일",
            rows: [],
            headerErrors: [error?.message || "엑셀 파일을 읽지 못했습니다."],
        };
    }
    receivingUploadPreview = buildInboundPlanImportPreview(
        receivingUploadParsed,
        getInventorySnapshot().rows,
        inventoryReceipts,
    );
    receivingUploadSaving = false;
    setReceivingUploadStatus("");
    renderReceivingUploadPreview();
    receivingUploadModal?.classList.remove("is-hidden");
    receivingUploadModal?.setAttribute("aria-hidden", "false");
    setReceivingPageStatus(
        receivingUploadPreview.isValid
            ? `${formatMilkrunNumber(receivingUploadPreview.groupCount)}건의 입고 예정을 등록할 수 있습니다.`
            : `엑셀에서 오류 ${formatMilkrunNumber(receivingUploadPreview.errors.length)}건을 확인했습니다.`,
        receivingUploadPreview.isValid ? "success" : "warning",
    );
}

async function saveReceivingUploadPreview() {
    if (receivingUploadSaving || !receivingUploadParsed) return;
    const userId = getCloudDataUserId();
    if (!userId) {
        setReceivingUploadStatus("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
        return;
    }
    receivingUploadPreview = buildInboundPlanImportPreview(
        receivingUploadParsed,
        getInventorySnapshot().rows,
        inventoryReceipts,
    );
    if (!receivingUploadPreview.isValid) {
        renderReceivingUploadPreview();
        setReceivingUploadStatus("SKU 또는 입고 정보가 변경되었습니다. 검증 결과를 다시 확인해주세요.");
        return;
    }
    const receiptCollection = getCloudDataCollection(userId, INVENTORY_RECEIPT_COLLECTION);
    if (!receiptCollection) {
        setReceivingUploadStatus("입고 저장소를 찾지 못했습니다.");
        return;
    }

    receivingUploadSaving = true;
    renderReceivingUploadPreview();
    setReceivingUploadStatus("");
    try {
        const batch = writeBatch(db);
        const createdBy = currentUserEmail || auth.currentUser?.email || "";
        const createdReceipts = receivingUploadPreview.groups.map((group) => {
            const receiptRef = doc(receiptCollection);
            const receipt = buildInventoryReceiptDraft({
                id: receiptRef.id,
                receiptCode: group.receiptNumber,
                supplier: group.supplier,
                expectedDate: group.expectedDate,
                items: group.items,
                memo: group.memo,
                createdBy,
            });
            batch.set(receiptRef, {
                ...receipt,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            return receipt;
        });
        await batch.commit();
        const importedGroupCount = createdReceipts.length;
        const importedItemCount = createdReceipts.reduce((sum, receipt) => sum + receipt.itemCount, 0);
        const importedQuantity = createdReceipts.reduce((sum, receipt) => sum + receipt.totalQuantity, 0);
        inventoryReceipts = [...createdReceipts, ...inventoryReceipts].sort(compareInventoryReceiptsDesc);
        closeReceivingUploadModal({ force: true });
        renderReceivingPage({ force: true });
        setReceivingPageStatus(
            `입고 예정 ${formatMilkrunNumber(importedGroupCount)}건 · SKU ${formatMilkrunNumber(importedItemCount)}개 · 예정수량 ${formatMilkrunNumber(importedQuantity)}개를 등록했습니다.`,
            "success",
        );
    } catch (error) {
        console.error("입고 예정 엑셀 업로드에 실패했습니다.", error);
        receivingUploadSaving = false;
        renderReceivingUploadPreview();
        setReceivingUploadStatus(
            error?.code === "permission-denied"
                ? "입고 저장 권한이 없습니다."
                : "입고 예정을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.",
        );
    }
}

function formatReceivingDate(value) {
    const text = String(value || "").trim();
    if (!text) return "-";
    const [year, month, day] = text.split("-");
    return [year, month, day].filter(Boolean).join(".");
}

function getSelectedInventoryReceipt() {
    return inventoryReceipts.find((receipt) => receipt.id === selectedReceivingId) || null;
}

function getReceivingPlanEditSignature(receipt) {
    const normalizedReceipt = normalizeInventoryReceipt(receipt);
    return JSON.stringify({
        status: normalizedReceipt.status,
        supplier: normalizedReceipt.supplier,
        expectedDate: normalizedReceipt.expectedDate,
        memo: normalizedReceipt.memo,
        items: normalizedReceipt.items,
    });
}

function syncReceivingFilterControls() {
    if (receivingSearchInput instanceof HTMLInputElement) {
        receivingSearchInput.value = receivingFilters.query;
    }
    if (receivingStatusFilter instanceof HTMLSelectElement) {
        receivingStatusFilter.value = receivingFilters.status;
    }
    if (receivingPeriodFilter instanceof HTMLSelectElement) {
        receivingPeriodFilter.value = receivingFilters.period;
    }
}

function getFilteredInventoryReceipts() {
    const query = normalizeSkuSearchToken(receivingFilters.query);
    const periodDays = Number(receivingFilters.period);
    const periodStart = Number.isFinite(periodDays)
        ? Date.now() - periodDays * 24 * 60 * 60 * 1000
        : 0;

    return inventoryReceipts
        .filter((receipt) => {
            if (receivingFilters.status !== "all" && receipt.status !== receivingFilters.status) {
                return false;
            }
            if (periodStart && (Date.parse(receipt.createdAtText) || 0) < periodStart) {
                return false;
            }
            if (!query) return true;
            return [
                receipt.receiptCode,
                receipt.supplier,
                receipt.memo,
                receipt.createdBy,
                receipt.reopenedBy,
                receipt.cancelledBy,
                ...receipt.items.flatMap((item) => [
                    item.productName,
                    item.adminProductCode,
                    item.barcode,
                    item.brand,
                    item.discrepancyReason,
                    ...item.allocations.flatMap((allocation) => [
                        allocation.palletNo,
                        allocation.lotNo,
                        allocation.expiryDate,
                        allocation.location,
                    ]),
                ]),
            ].some((value) => normalizeSkuSearchToken(value).includes(query));
        })
        .sort(compareInventoryReceiptsDesc);
}

function renderReceivingSummary() {
    const total = inventoryReceipts.length;
    const planned = inventoryReceipts.filter(
        (receipt) => isInventoryReceiptEditableStatus(receipt.status),
    ).length;
    const completed = inventoryReceipts.filter((receipt) => receipt.status === "completed").length;
    const todayKey = getInventoryDateKey();
    const todayQuantity = inventoryReceipts.reduce((receiptSum, receipt) => {
        const postedAllocations = receipt.items.flatMap((item) => item.allocations)
            .filter((allocation) => allocation.postedQuantity > 0);
        if (postedAllocations.length) {
            return receiptSum + postedAllocations
                .filter((allocation) => getInventoryDateKey(allocation.postedAt) === todayKey)
                .reduce((sum, allocation) => sum + allocation.postedQuantity, 0);
        }
        if (
            receipt.status === "completed"
            && getInventoryDateKey(receipt.completedAt) === todayKey
        ) {
            return receiptSum + receipt.receivedTotalQuantity;
        }
        return receiptSum;
    }, 0);

    if (receivingSummaryTotalEl) receivingSummaryTotalEl.textContent = formatMilkrunNumber(total);
    if (receivingSummaryPlannedEl) receivingSummaryPlannedEl.textContent = formatMilkrunNumber(planned);
    if (receivingSummaryCompletedEl) receivingSummaryCompletedEl.textContent = formatMilkrunNumber(completed);
    if (receivingSummaryTodayQuantityEl) {
        receivingSummaryTodayQuantityEl.textContent = formatMilkrunNumber(todayQuantity);
    }
}

function renderReceivingList() {
    if (!receivingListBodyEl) return;
    const rows = getFilteredInventoryReceipts();
    if (receivingListCountEl) {
        receivingListCountEl.textContent = `${formatMilkrunNumber(rows.length)}건`;
    }

    if (!rows.length) {
        receivingListBodyEl.innerHTML = `
          <tr class="tracking-empty-row">
            <td colspan="8">
              ${inventoryReceipts.length ? "조건에 맞는 입고 건이 없습니다." : "아직 등록된 입고 건이 없습니다."}
            </td>
          </tr>
        `;
        return;
    }

    receivingListBodyEl.innerHTML = rows.map((receipt) => {
        const statusMeta = getInventoryReceiptStatusMeta(receipt.status);
        const statusLabel = receipt.status === "completed" && receipt.mismatchItemCount > 0
            ? "완료 · 수량 차이"
            : statusMeta.label;
        const firstItem = receipt.items[0];
        const itemLabel = firstItem
            ? `${firstItem.productName || firstItem.adminProductCode}${receipt.itemCount > 1 ? ` 외 ${receipt.itemCount - 1}개` : ""}`
            : "-";
        return `
          <tr>
            <td>
              <span class="receiving-status-badge is-${escapeHtml(statusMeta.tone)}">
                ${escapeHtml(statusLabel)}
              </span>
            </td>
            <td><span class="receiving-code">${escapeHtml(receipt.receiptCode || "-")}</span></td>
            <td>${escapeHtml(formatReceivingDate(receipt.expectedDate))}</td>
            <td>${escapeHtml(receipt.supplier || "-")}</td>
            <td>
              <div class="receiving-item-summary-cell">
                <strong>${escapeHtml(itemLabel)}</strong>
                <span>${formatMilkrunNumber(receipt.itemCount)}개 SKU</span>
              </div>
            </td>
            <td class="receiving-number-cell">${formatMilkrunNumber(receipt.totalQuantity)}</td>
            <td>${escapeHtml(receipt.createdBy || "-")}</td>
            <td class="receiving-action-cell">
              <button class="receiving-row-action" type="button"
                  data-receiving-detail-id="${escapeHtml(receipt.id)}">상세</button>
            </td>
          </tr>
        `;
    }).join("");
}

function renderReceivingPage({ force = false } = {}) {
    if (!force && !isCurrentDashboardView("receiving")) return;
    renderReceivingSummary();
    renderReceivingList();
}

function closeReceivingCreateModal({
    force = false,
    returnToDetail = receivingCreateReturnToDetail,
} = {}) {
    if (receivingSaving && !force) return;
    const editReceiptId = receivingEditReceiptId;
    receivingCreateModal?.classList.add("is-hidden");
    receivingCreateModal?.setAttribute("aria-hidden", "true");
    receivingSaving = false;
    receivingEditReceiptId = "";
    receivingEditBaselineSignature = "";
    receivingCreateReturnToDetail = false;

    if (returnToDetail && editReceiptId && selectedReceivingId === editReceiptId) {
        const receipt = getSelectedInventoryReceipt();
        receivingDetailDraftItems = receipt ? buildReceivingDetailDraftItems(receipt) : [];
        receivingDetailDirty = false;
        receivingScanDraft = null;
        renderReceivingDetail();
        receivingDetailModal?.classList.remove("is-hidden");
        receivingDetailModal?.setAttribute("aria-hidden", "false");
    }
}

function closeReceivingDetailModal({ force = false } = {}) {
    if ((receivingActionPending || receivingDetailSaving) && !force) return;
    if (
        (receivingDetailDirty || receivingScanDraft)
        && !force
        && !window.confirm("입력 중이거나 저장하지 않은 입고 내용이 있습니다. 상세 화면을 닫을까요?")
    ) {
        return;
    }
    closeReceivingCompletionModal({ force: true });
    receivingDetailModal?.classList.add("is-hidden");
    receivingDetailModal?.setAttribute("aria-hidden", "true");
    selectedReceivingId = "";
    receivingActionPending = false;
    receivingDetailSaving = false;
    receivingDetailDirty = false;
    receivingDetailDraftItems = [];
    receivingScanDraft = null;
    receivingScanFeedback = {
        message: "상품 바코드를 스캔해주세요.",
        tone: "info",
    };
}

function closeReceivingModals() {
    closeReceivingUploadModal({ force: true });
    closeReceivingCompletionModal({ force: true });
    closeReceivingCreateModal({ force: true, returnToDetail: false });
    closeReceivingDetailModal({ force: true });
}

function getReceivingDraftTotals() {
    return {
        itemCount: receivingDraftItems.length,
        totalQuantity: receivingDraftItems.reduce(
            (sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)),
            0,
        ),
    };
}

function renderReceivingSkuSearchResults() {
    if (!receivingSkuSearchResultsEl) return;
    const query = String(receivingSkuSearchInput?.value || "").trim();
    const selectedKeys = new Set(receivingDraftItems.map((item) => item.skuKey));
    const inventoryRows = getInventorySnapshot().rows;
    const rows = filterReceivingSkuRowsBySearch(inventoryRows, query)
        .sort((left, right) => (
            String(left.productName || "").localeCompare(String(right.productName || ""), "ko-KR")
        ));

    if (receivingSkuSearchCountEl) {
        receivingSkuSearchCountEl.textContent = query
            ? `검색 결과 ${formatMilkrunNumber(rows.length)}개 / 전체 ${formatMilkrunNumber(inventoryRows.length)}개`
            : `전체 ${formatMilkrunNumber(inventoryRows.length)}개 SKU`;
    }

    if (!rows.length) {
        receivingSkuSearchResultsEl.innerHTML = query
            ? '<div class="receiving-sku-results-empty">검색 결과가 없습니다.</div>'
            : '<div class="receiving-sku-results-empty">등록된 SKU가 없습니다.</div>';
        return;
    }

    receivingSkuSearchResultsEl.innerHTML = rows.map((row) => {
        const discontinued = isInventoryDiscontinuedSku(row);
        const selected = selectedKeys.has(row.skuKey);
        return `
          <button class="receiving-sku-result${selected ? " is-selected" : ""}"
              type="button" role="option"
              data-receiving-add-sku="${escapeHtml(row.skuKey)}"
              ${discontinued || selected ? "disabled" : ""}>
            <span>
              <strong>${escapeHtml(row.productName || "상품명 없음")}</strong>
              <small>${escapeHtml(row.adminProductCode || "-")} · ${escapeHtml(getNormalizedSkuType(row.skuType))}</small>
            </span>
            <em>${discontinued ? "단종" : (selected ? "추가됨" : "추가")}</em>
          </button>
        `;
    }).join("");
}

function renderReceivingDraftItems() {
    if (!receivingItemsBodyEl) return;
    const totals = getReceivingDraftTotals();
    if (receivingItemsSummaryEl) {
        receivingItemsSummaryEl.textContent = `${formatMilkrunNumber(totals.itemCount)}개 SKU · 총 ${formatMilkrunNumber(totals.totalQuantity)}개`;
    }

    if (!receivingDraftItems.length) {
        receivingItemsBodyEl.innerHTML = `
          <tr class="receiving-items-empty">
            <td colspan="4">입고할 SKU를 검색해 추가해주세요.</td>
          </tr>
        `;
        if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
            receivingCreateSaveBtn.disabled = true;
        }
        return;
    }

    receivingItemsBodyEl.innerHTML = receivingDraftItems.map((item) => `
      <tr>
        <td>
          <div class="receiving-draft-product">
            <strong>${escapeHtml(item.productName || "상품명 없음")}</strong>
            <span>${escapeHtml(item.adminProductCode || "-")}</span>
          </div>
        </td>
        <td>
          <span class="sku-type-badge ${getInventorySkuTypeBadgeClass(item.skuType)}">
            ${escapeHtml(getNormalizedSkuType(item.skuType))}
          </span>
        </td>
        <td>
          <input class="receiving-quantity-input" type="number" min="1" step="1"
              inputmode="numeric" value="${item.quantity}"
              data-receiving-item-quantity="${escapeHtml(item.skuKey)}"
              aria-label="${escapeHtml(item.productName || item.adminProductCode)} 입고 예정 수량" />
        </td>
        <td>
          <button class="receiving-item-remove" type="button"
              data-receiving-remove-sku="${escapeHtml(item.skuKey)}"
              aria-label="${escapeHtml(item.productName || item.adminProductCode)} 삭제">×</button>
        </td>
      </tr>
    `).join("");
    if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
        receivingCreateSaveBtn.disabled = receivingSaving;
    }
}

function addReceivingDraftSku(skuKey) {
    if (receivingDraftItems.length >= 50) {
        setReceivingCreateStatus("한 입고 건에는 최대 50개 SKU까지 등록할 수 있습니다.");
        return;
    }
    if (receivingDraftItems.some((item) => item.skuKey === skuKey)) return;
    const sku = getInventorySnapshot().rows.find((row) => row.skuKey === skuKey);
    if (!sku || isInventoryDiscontinuedSku(sku)) return;

    receivingDraftItems.push(normalizeInventoryReceiptItem({
        lineId: `line-${Date.now()}-${receivingDraftItems.length + 1}`,
        skuKey: sku.skuKey,
        skuRowId: sku.rowId,
        adminProductCode: sku.adminProductCode,
        barcode: sku.barcode,
        productName: sku.productName,
        brand: sku.brand,
        skuType: sku.skuType,
        category: sku.category,
        quantity: 1,
    }));
    setReceivingCreateStatus("");
    renderReceivingSkuSearchResults();
    renderReceivingDraftItems();
}

function openReceivingCreateModal() {
    if (!skuRows.length) {
        setReceivingPageStatus("SKU 관리에서 상품을 먼저 등록해주세요.", "warning");
        showView("sku");
        return;
    }

    receivingDraftItems = [];
    receivingUploadParsed = null;
    receivingUploadPreview = null;
    receivingUploadSaving = false;
    receivingEditReceiptId = "";
    receivingEditBaselineSignature = "";
    receivingCreateReturnToDetail = false;
    receivingSaving = false;
    if (receivingCreateTitleEl) receivingCreateTitleEl.textContent = "입고 예정 등록";
    if (receivingCreateDescriptionEl) {
        receivingCreateDescriptionEl.textContent = "입고할 상품과 예정 수량을 등록합니다.";
    }
    if (receivingSupplierInput instanceof HTMLInputElement) receivingSupplierInput.value = "";
    if (receivingExpectedDateInput instanceof HTMLInputElement) {
        receivingExpectedDateInput.value = getInventoryTodayValue();
    }
    if (receivingMemoInput instanceof HTMLInputElement) receivingMemoInput.value = "";
    if (receivingSkuSearchInput instanceof HTMLInputElement) receivingSkuSearchInput.value = "";
    if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
        receivingCreateSaveBtn.textContent = "입고 예정 저장";
        receivingCreateSaveBtn.disabled = true;
    }
    setReceivingCreateStatus("");
    renderReceivingSkuSearchResults();
    renderReceivingDraftItems();
    receivingCreateModal?.classList.remove("is-hidden");
    receivingCreateModal?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => receivingSupplierInput?.focus(), 0);
}

function openReceivingEditModal() {
    const receipt = getSelectedInventoryReceipt();
    if (!receipt || receipt.status !== "planned") {
        setReceivingDetailStatus("입고 예정 상태에서만 예정 정보를 수정할 수 있습니다.");
        return;
    }
    if (receivingDetailDirty || receivingScanDraft) {
        setReceivingDetailStatus("입고 내용을 먼저 저장하거나 취소한 뒤 예정 정보를 수정해주세요.");
        return;
    }

    receivingDraftItems = receipt.items.map((item, index) => (
        normalizeInventoryReceiptItem(item, index, { receiptStatus: receipt.status })
    ));
    receivingEditReceiptId = receipt.id;
    receivingEditBaselineSignature = getReceivingPlanEditSignature(receipt);
    receivingCreateReturnToDetail = true;
    receivingSaving = false;
    if (receivingCreateTitleEl) receivingCreateTitleEl.textContent = "입고 예정 수정";
    if (receivingCreateDescriptionEl) {
        receivingCreateDescriptionEl.textContent = "공급처와 예정일, SKU 및 예정수량을 수정합니다.";
    }
    if (receivingSupplierInput instanceof HTMLInputElement) {
        receivingSupplierInput.value = receipt.supplier;
    }
    if (receivingExpectedDateInput instanceof HTMLInputElement) {
        receivingExpectedDateInput.value = receipt.expectedDate;
    }
    if (receivingMemoInput instanceof HTMLInputElement) receivingMemoInput.value = receipt.memo;
    if (receivingSkuSearchInput instanceof HTMLInputElement) receivingSkuSearchInput.value = "";
    if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
        receivingCreateSaveBtn.textContent = "수정 내용 저장";
        receivingCreateSaveBtn.disabled = !receivingDraftItems.length;
    }
    setReceivingCreateStatus("");
    renderReceivingSkuSearchResults();
    renderReceivingDraftItems();
    receivingDetailModal?.classList.add("is-hidden");
    receivingDetailModal?.setAttribute("aria-hidden", "true");
    receivingCreateModal?.classList.remove("is-hidden");
    receivingCreateModal?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => receivingSupplierInput?.focus(), 0);
}

async function saveInventoryReceiptDraft() {
    if (receivingSaving) return;
    const userId = getCloudDataUserId();
    const editingReceipt = receivingEditReceiptId
        ? inventoryReceipts.find((receipt) => receipt.id === receivingEditReceiptId)
        : null;
    const supplier = String(receivingSupplierInput?.value || "").trim();
    const expectedDate = String(receivingExpectedDateInput?.value || "").trim();
    const memo = String(receivingMemoInput?.value || "").trim();
    const normalizedItems = receivingDraftItems
        .map(normalizeInventoryReceiptItem)
        .filter((item) => item.skuKey && item.quantity > 0);

    if (!userId) {
        setReceivingCreateStatus("로그인 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
        return;
    }
    if (receivingEditReceiptId && (!editingReceipt || editingReceipt.status !== "planned")) {
        setReceivingCreateStatus("입고 예정 상태가 변경되었습니다. 상세 화면에서 다시 확인해주세요.");
        return;
    }
    if (!supplier) {
        setReceivingCreateStatus("공급처를 입력해주세요.");
        receivingSupplierInput?.focus();
        return;
    }
    if (!expectedDate) {
        setReceivingCreateStatus("입고예정일을 선택해주세요.");
        receivingExpectedDateInput?.focus();
        return;
    }
    if (!normalizedItems.length || normalizedItems.length !== receivingDraftItems.length) {
        setReceivingCreateStatus("모든 입고 품목의 수량을 1개 이상 입력해주세요.");
        return;
    }

    const receiptCollection = getCloudDataCollection(userId, INVENTORY_RECEIPT_COLLECTION);
    if (!receiptCollection) {
        setReceivingCreateStatus("입고 저장소를 찾지 못했습니다.");
        return;
    }

    const receiptRef = editingReceipt
        ? doc(receiptCollection, editingReceipt.id)
        : doc(receiptCollection);
    let savedReceipt = editingReceipt
        ? null
        : buildInventoryReceiptDraft({
            id: receiptRef.id,
            supplier,
            expectedDate,
            items: normalizedItems,
            memo,
            createdBy: currentUserEmail || auth.currentUser?.email || "",
        });

    receivingSaving = true;
    if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
        receivingCreateSaveBtn.disabled = true;
        receivingCreateSaveBtn.textContent = "저장 중...";
    }
    setReceivingCreateStatus("");

    try {
        if (editingReceipt) {
            await runTransaction(db, async (firestoreTransaction) => {
                const receiptSnapshot = await firestoreTransaction.get(receiptRef);
                if (!receiptSnapshot.exists()) {
                    const missingError = new Error("입고 건을 찾을 수 없습니다.");
                    missingError.code = "receiving/not-found";
                    throw missingError;
                }
                const liveReceipt = normalizeInventoryReceipt({
                    id: receiptSnapshot.id,
                    ...receiptSnapshot.data(),
                });
                if (liveReceipt.status !== "planned") {
                    const statusError = new Error("이미 입고 처리가 시작된 입고 건입니다.");
                    statusError.code = "receiving/already-processed";
                    throw statusError;
                }
                if (getReceivingPlanEditSignature(liveReceipt) !== receivingEditBaselineSignature) {
                    const staleError = new Error("다른 화면에서 입고 예정 정보가 변경되었습니다.");
                    staleError.code = "receiving/stale-plan";
                    throw staleError;
                }
                if (liveReceipt.postedTotalQuantity > 0) {
                    const postedError = new Error("이미 재고에 반영된 수량이 있습니다.");
                    postedError.code = "receiving/already-processed";
                    throw postedError;
                }

                savedReceipt = buildUpdatedInventoryReceiptPlan(liveReceipt, {
                    supplier,
                    expectedDate,
                    items: normalizedItems,
                    memo,
                });
                firestoreTransaction.set(receiptRef, {
                    supplier: savedReceipt.supplier,
                    expectedDate: savedReceipt.expectedDate,
                    items: savedReceipt.items,
                    itemCount: savedReceipt.itemCount,
                    totalQuantity: savedReceipt.totalQuantity,
                    receivedTotalQuantity: savedReceipt.receivedTotalQuantity,
                    postedTotalQuantity: savedReceipt.postedTotalQuantity,
                    varianceQuantity: savedReceipt.varianceQuantity,
                    matchedItemCount: savedReceipt.matchedItemCount,
                    mismatchItemCount: savedReceipt.mismatchItemCount,
                    memo: savedReceipt.memo,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            });

            inventoryReceipts = inventoryReceipts.map((receipt) => (
                receipt.id === savedReceipt.id ? savedReceipt : receipt
            )).sort(compareInventoryReceiptsDesc);
            closeReceivingCreateModal({ force: true, returnToDetail: true });
            renderReceivingPage({ force: true });
            setReceivingDetailStatus(
                `${savedReceipt.receiptCode} 입고 예정 정보를 수정했습니다.`,
                "success",
            );
        } else {
            await setDoc(receiptRef, {
                ...savedReceipt,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            inventoryReceipts = [savedReceipt, ...inventoryReceipts]
                .sort(compareInventoryReceiptsDesc);
            closeReceivingCreateModal({ force: true, returnToDetail: false });
            renderReceivingPage({ force: true });
            setReceivingPageStatus(
                `${savedReceipt.receiptCode} 입고 예정 ${formatMilkrunNumber(savedReceipt.totalQuantity)}개를 등록했습니다.`,
                "success",
            );
        }
    } catch (error) {
        console.error("입고 예정 저장에 실패했습니다.", error);
        receivingSaving = false;
        if (receivingCreateSaveBtn instanceof HTMLButtonElement) {
            receivingCreateSaveBtn.disabled = false;
            receivingCreateSaveBtn.textContent = editingReceipt ? "수정 내용 저장" : "입고 예정 저장";
        }
        setReceivingCreateStatus(
            error?.code === "permission-denied"
                ? "입고 저장 권한이 없습니다."
                : (error?.code === "receiving/stale-plan"
                    ? "다른 화면에서 입고 예정 정보가 변경되었습니다. 취소 후 다시 열어주세요."
                    : (["receiving/already-processed", "receiving/not-found"].includes(error?.code)
                        ? "입고 상태가 변경되어 수정할 수 없습니다. 취소 후 상세 화면에서 확인해주세요."
                        : "입고 예정 건을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.")),
        );
    }
}

function buildReceivingAllocationDraft() {
    receivingAllocationSequence += 1;
    return normalizeInventoryReceiptAllocation({
        allocationId: `allocation-${Date.now()}-${receivingAllocationSequence}`,
    });
}

function getReceivingDisplayAllocations(item, { editable = false } = {}) {
    const allocations = (Array.isArray(item?.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation);
    if (allocations.length) return allocations;
    if (editable) return [buildReceivingAllocationDraft()];

    const progress = getInventoryReceiptItemProgress(item);
    return progress.receivedQuantity > 0
        ? [normalizeInventoryReceiptAllocation({
            allocationId: `${item.lineId}-legacy`,
            quantity: progress.receivedQuantity,
        })]
        : [];
}

function buildReceivingDetailDraftItems(receipt) {
    const editable = isInventoryReceiptEditableStatus(receipt?.status);
    return (Array.isArray(receipt?.items) ? receipt.items : []).map((item, index) => {
        const normalizedItem = normalizeInventoryReceiptItem(item, index, {
            receiptStatus: receipt?.status,
        });
        const itemEditable = editable && !normalizedItem.receivingClosed;
        const allocations = getReceivingDisplayAllocations(normalizedItem, { editable: itemEditable });
        if (
            itemEditable
            && allocations.length
            && allocations.every((allocation) => allocation.postedQuantity >= allocation.quantity)
        ) {
            allocations.push(buildReceivingAllocationDraft());
        }
        return {
            ...normalizedItem,
            allocations,
        };
    });
}

function getReceivingVarianceText(progress) {
    if (progress.status === "matched") return "수량 일치";
    if (progress.status === "pending") {
        return `${formatMilkrunNumber(progress.plannedQuantity)}개 미입고`;
    }
    if (progress.status === "shortage") {
        return `${formatMilkrunNumber(Math.abs(progress.varianceQuantity))}개 부족`;
    }
    return `${formatMilkrunNumber(progress.varianceQuantity)}개 초과`;
}

function getReceivingSkuRowForItem(item) {
    const inventoryRows = getInventorySnapshot().rows;
    return inventoryRows.find((row) => row.skuKey === item?.skuKey)
        || inventoryRows.find((row) => (
            String(row.adminProductCode || "").trim()
            && String(row.adminProductCode || "").trim()
                === String(item?.adminProductCode || "").trim()
        ))
        || null;
}

function getReceivingScanItem() {
    if (!receivingScanDraft?.lineId) return null;
    return receivingDetailDraftItems.find((item) => item.lineId === receivingScanDraft.lineId) || null;
}

function setReceivingScanFeedback(message = "", tone = "info") {
    receivingScanFeedback = {
        message: String(message || ""),
        tone: ["success", "warning", "error"].includes(tone) ? tone : "info",
    };
    if (!receivingScanFeedbackEl) return;
    receivingScanFeedbackEl.textContent = receivingScanFeedback.message;
    receivingScanFeedbackEl.className = `receiving-scan-feedback is-${receivingScanFeedback.tone}`;
}

function focusReceivingBarcodeInput() {
    window.setTimeout(() => {
        if (
            receivingDetailBarcodeInput instanceof HTMLInputElement
            && !receivingDetailBarcodeInput.disabled
        ) {
            receivingDetailBarcodeInput.focus();
            receivingDetailBarcodeInput.select();
        }
    }, 0);
}

function focusReceivingScanField(field, allocationId = "") {
    window.setTimeout(() => {
        const inputs = [...(receivingScanProductPanelEl?.querySelectorAll(
            `[data-receiving-scan-field="${field}"]`,
        ) || [])];
        const input = allocationId
            ? inputs.find((row) => (
                row.getAttribute("data-receiving-scan-allocation-id") === allocationId
            ))
            : inputs[0];
        if (input instanceof HTMLInputElement) {
            input.focus();
            if (input.type !== "date") input.select();
        }
    }, 0);
}

function formatReceivingExpiryInputElement(input) {
    if (!(input instanceof HTMLInputElement)) return "";
    const formatted = formatReceivingExpiryDateInput(input.value);
    if (input.value !== formatted) input.value = formatted;
    return formatted;
}

function handleReceivingExpiryBackspace(event) {
    const input = event.target;
    if (
        event.key !== "Backspace"
        || !(input instanceof HTMLInputElement)
        || !input.classList.contains("receiving-expiry-input")
    ) {
        return false;
    }
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    if (
        selectionStart === null
        || selectionEnd === null
        || selectionStart !== selectionEnd
        || selectionStart <= 0
        || input.value[selectionStart - 1] !== "-"
    ) {
        return false;
    }

    event.preventDefault();
    const digitIndex = Math.max(0, selectionStart - 2);
    input.value = formatReceivingExpiryDateInput(
        input.value.slice(0, digitIndex) + input.value.slice(selectionStart),
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const nextCaret = Math.min(digitIndex, input.value.length);
    input.setSelectionRange(nextCaret, nextCaret);
    return true;
}

function renderReceivingScanAllocationRow(allocation, index, totalRows) {
    const normalized = normalizeInventoryReceiptAllocation(allocation, index);
    return `
      <div class="receiving-scan-entry-row"
          data-receiving-scan-row-id="${escapeHtml(normalized.allocationId)}">
        <span class="receiving-scan-row-number" aria-label="${index + 1}번째 입고 행">
          ${index + 1}
        </span>
        <label class="receiving-scan-entry-field">
          <span>PLT 번호 <em>선택</em></span>
          <input type="text" maxlength="50" autocomplete="off"
              value="${escapeHtml(normalized.palletNo)}"
              placeholder="예: PLT-01"
              data-receiving-scan-allocation-id="${escapeHtml(normalized.allocationId)}"
              data-receiving-scan-field="palletNo" />
        </label>
        <label class="receiving-scan-entry-field">
          <span>LOT 번호 <em>선택</em></span>
          <input type="text" maxlength="80" autocomplete="off"
              value="${escapeHtml(normalized.lotNo)}"
              placeholder="예: LOT-A"
              data-receiving-scan-allocation-id="${escapeHtml(normalized.allocationId)}"
              data-receiving-scan-field="lotNo" />
        </label>
        <label class="receiving-scan-entry-field">
          <span>유통기한 <em>선택</em></span>
          <input class="receiving-expiry-input" type="text" inputmode="numeric"
              maxlength="10" autocomplete="off"
              value="${escapeHtml(formatReceivingExpiryDateInput(normalized.expiryDate))}"
              placeholder="YYYY-MM-DD"
              data-receiving-scan-allocation-id="${escapeHtml(normalized.allocationId)}"
              data-receiving-scan-field="expiryDate" />
        </label>
        <label class="receiving-scan-entry-field">
          <span>보관 로케이션 <em>선택</em></span>
          <input type="text" maxlength="80" autocomplete="off"
              value="${escapeHtml(normalized.location)}"
              placeholder="예: A-01-01"
              data-receiving-scan-allocation-id="${escapeHtml(normalized.allocationId)}"
              data-receiving-scan-field="location" />
        </label>
        <label class="receiving-scan-entry-field is-quantity">
          <span>실입고수량 <b>*</b></span>
          <input type="number" min="1" step="1" inputmode="numeric" required
              value="${normalized.quantity > 0 ? normalized.quantity : ""}"
              placeholder="0"
              data-receiving-scan-allocation-id="${escapeHtml(normalized.allocationId)}"
              data-receiving-scan-field="quantity" />
        </label>
        ${totalRows > 1 ? `
          <button class="receiving-scan-row-remove" type="button"
              data-receiving-scan-remove-row="${escapeHtml(normalized.allocationId)}"
              aria-label="${index + 1}번째 입고 행 삭제">×</button>
        ` : '<span class="receiving-scan-row-remove-placeholder" aria-hidden="true"></span>'}
      </div>
    `;
}

function renderReceivingScanWorkspace() {
    const receipt = getSelectedInventoryReceipt();
    const editable = isInventoryReceiptEditableStatus(receipt?.status);
    if (receivingScanWorkspaceEl instanceof HTMLElement) {
        receivingScanWorkspaceEl.hidden = !editable;
    }
    if (!editable) {
        if (receivingScanProductPanelEl) receivingScanProductPanelEl.innerHTML = "";
        return;
    }

    const item = getReceivingScanItem();
    const scanEntryActive = Boolean(item && receivingScanDraft);
    if (receivingScanStepEl) {
        receivingScanStepEl.textContent = scanEntryActive
            ? "2. 입고정보 입력"
            : "1. 상품 스캔";
        receivingScanStepEl.className = scanEntryActive
            ? "receiving-scan-step is-entry"
            : "receiving-scan-step";
    }
    if (receivingDetailBarcodeInput instanceof HTMLInputElement) {
        receivingDetailBarcodeInput.disabled = scanEntryActive
            || receivingActionPending
            || receivingDetailSaving;
        if (scanEntryActive) receivingDetailBarcodeInput.value = "";
    }
    if (receivingDetailBarcodeSubmitBtn instanceof HTMLButtonElement) {
        receivingDetailBarcodeSubmitBtn.disabled = scanEntryActive
            || receivingActionPending
            || receivingDetailSaving;
    }
    setReceivingScanFeedback(receivingScanFeedback.message, receivingScanFeedback.tone);

    if (!receivingScanProductPanelEl) return;
    if (!scanEntryActive) {
        receivingScanProductPanelEl.innerHTML = "";
        return;
    }

    const progress = getInventoryReceiptItemProgress(item);
    const skuRow = getReceivingSkuRowForItem(item);
    const barcode = item.barcode || skuRow?.barcode || receivingScanDraft.barcode || "-";
    const remainingQuantity = Math.max(0, progress.plannedQuantity - progress.receivedQuantity);
    receivingScanProductPanelEl.innerHTML = `
      <form id="receiving-scan-entry-form" class="receiving-scan-entry" novalidate>
        <div class="receiving-scan-product-head">
          <div class="receiving-scan-product-name">
            <strong>${escapeHtml(item.productName || "상품명 없음")}</strong>
            <span>${escapeHtml(item.adminProductCode || "-")} · 바코드 ${escapeHtml(barcode)}</span>
          </div>
          <span class="receiving-scan-match-badge">입고 예정 상품 일치</span>
        </div>
        <div class="receiving-scan-product-metrics">
          <div><span>예정수량</span><strong>${formatMilkrunNumber(progress.plannedQuantity)}개</strong></div>
          <div><span>현재 실입고</span><strong>${formatMilkrunNumber(progress.receivedQuantity)}개</strong></div>
          <div><span>남은 예정수량</span><strong>${formatMilkrunNumber(remainingQuantity)}개</strong></div>
          <div><span>SKU 유형</span><strong>${escapeHtml(getNormalizedSkuType(item.skuType))}</strong></div>
        </div>
        <div class="receiving-scan-entry-rows">
          ${(receivingScanDraft.allocations || [])
              .map((allocation, index, rows) => (
                  renderReceivingScanAllocationRow(allocation, index, rows.length)
              ))
              .join("")}
        </div>
        <div class="receiving-scan-row-toolbar">
          <span>PLT·LOT·유통기한·로케이션이 다르면 행을 추가해주세요.</span>
          <button class="secondary-btn receiving-scan-row-add" type="button"
              data-receiving-scan-add-row>+ 행 추가</button>
        </div>
        <div class="receiving-scan-entry-actions">
          <button class="secondary-btn" type="button"
              data-receiving-scan-cancel>다시 스캔</button>
          <button class="primary-btn" type="submit">이 상품 입력 완료</button>
        </div>
      </form>
    `;
}

function handleReceivingBarcodeScan() {
    const receipt = getSelectedInventoryReceipt();
    if (!receipt || !isInventoryReceiptEditableStatus(receipt.status)) return;
    if (receivingScanDraft) {
        setReceivingScanFeedback(
            "현재 상품의 입고정보를 완료하거나 ‘다시 스캔’을 눌러주세요.",
            "warning",
        );
        focusReceivingScanField("palletNo");
        return;
    }

    const barcode = normalizeReceivingBarcode(receivingDetailBarcodeInput?.value);
    if (!barcode) {
        setReceivingScanFeedback("상품 바코드를 스캔하거나 입력해주세요.", "warning");
        focusReceivingBarcodeInput();
        return;
    }

    const inventoryRows = getInventorySnapshot().rows;
    const inventoryMatches = findInventoryReceiptItemsByBarcode(
        inventoryRows,
        inventoryRows,
        barcode,
    );
    const matchedInventorySkuKeys = new Set(
        inventoryMatches.map((row) => row.skuKey).filter(Boolean),
    );
    if (matchedInventorySkuKeys.size > 1) {
        setReceivingScanFeedback(
            "동일한 바코드가 여러 SKU에 등록되어 있습니다. 잘못된 입고를 막기 위해 스캔을 중단했습니다.",
            "error",
        );
        if (receivingDetailBarcodeInput instanceof HTMLInputElement) {
            receivingDetailBarcodeInput.select();
        }
        return;
    }
    const matches = findInventoryReceiptItemsByBarcode(
        receivingDetailDraftItems,
        inventoryRows,
        barcode,
    );
    if (matches.length > 1) {
        setReceivingScanFeedback(
            "동일한 바코드가 여러 입고 예정 SKU에 등록되어 있습니다. SKU 관리에서 바코드를 확인해주세요.",
            "error",
        );
        if (receivingDetailBarcodeInput instanceof HTMLInputElement) {
            receivingDetailBarcodeInput.select();
        }
        return;
    }
    if (!matches.length) {
        setReceivingScanFeedback(
            inventoryMatches.length
                ? `${inventoryMatches[0].productName || "해당 상품"}은(는) 현재 입고 예정에 없는 상품입니다.`
                : "등록되지 않은 바코드입니다. SKU 관리에서 상품 바코드를 확인해주세요.",
            "error",
        );
        if (receivingDetailBarcodeInput instanceof HTMLInputElement) {
            receivingDetailBarcodeInput.select();
        }
        return;
    }

    const item = matches[0];
    if (item.receivingClosed) {
        setReceivingScanFeedback(
            `${item.productName || item.adminProductCode}은(는) 이미 입고 처리가 종료된 상품입니다.`,
            "warning",
        );
        if (receivingDetailBarcodeInput instanceof HTMLInputElement) {
            receivingDetailBarcodeInput.select();
        }
        return;
    }

    receivingScanDraft = {
        lineId: item.lineId,
        barcode,
        allocations: [buildReceivingAllocationDraft()],
    };
    setReceivingScanFeedback(
        `${item.productName || item.adminProductCode} 상품이 입고 예정과 일치합니다. 입고정보를 입력해주세요.`,
        "success",
    );
    renderReceivingDetail();
    focusReceivingScanField("palletNo");
}

function completeReceivingScanEntry() {
    const item = getReceivingScanItem();
    if (!item || !receivingScanDraft) return;
    const draftAllocations = (receivingScanDraft.allocations || [])
        .map(normalizeInventoryReceiptAllocation);
    if (!draftAllocations.length) {
        setReceivingScanFeedback("입고정보 행을 1개 이상 추가해주세요.", "warning");
        return;
    }

    for (let index = 0; index < draftAllocations.length; index += 1) {
        const allocation = draftAllocations[index];
        if (allocation.quantity <= 0) {
            setReceivingScanFeedback(
                `${index + 1}행의 실입고수량을 1개 이상 입력해주세요.`,
                "warning",
            );
            focusReceivingScanField("quantity", allocation.allocationId);
            return;
        }
        if (!isValidReceivingExpiryDate(allocation.expiryDate)) {
            setReceivingScanFeedback(
                `${index + 1}행의 유통기한을 YYYY-MM-DD 형식의 실제 날짜로 입력해주세요.`,
                "warning",
            );
            focusReceivingScanField("expiryDate", allocation.allocationId);
            return;
        }
    }

    let updatedItem = item;
    let accumulatedRowCount = 0;
    draftAllocations.forEach((incomingAllocation) => {
        const sameGroupExists = updatedItem.allocations.some((allocation) => (
            allocation.postedQuantity <= 0
            && allocation.quantity > 0
            && ["palletNo", "lotNo", "expiryDate", "location"].every((key) => (
                String(allocation[key] || "").trim().toLocaleLowerCase("ko-KR")
                === String(incomingAllocation[key] || "").trim().toLocaleLowerCase("ko-KR")
            ))
        ));
        if (sameGroupExists) accumulatedRowCount += 1;
        updatedItem = mergeInventoryReceiptAllocation(updatedItem, incomingAllocation);
    });
    receivingDetailDraftItems = receivingDetailDraftItems.map((row) => (
        row.lineId === item.lineId ? updatedItem : row
    ));
    receivingDetailDirty = true;
    receivingScanDraft = null;

    const progress = getInventoryReceiptItemProgress(updatedItem);
    const totalQuantity = draftAllocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
    );
    const remainingQuantity = Math.max(0, progress.plannedQuantity - progress.receivedQuantity);
    const varianceMessage = progress.receivedQuantity > progress.plannedQuantity
        ? ` 예정수량보다 ${formatMilkrunNumber(progress.receivedQuantity - progress.plannedQuantity)}개 초과했습니다.`
        : ` 남은 예정수량은 ${formatMilkrunNumber(remainingQuantity)}개입니다.`;
    setReceivingScanFeedback(
        `${item.productName || item.adminProductCode} ${formatMilkrunNumber(draftAllocations.length)}개 행, `
        + `총 ${formatMilkrunNumber(totalQuantity)}개를 입력했습니다.`
        + `${accumulatedRowCount > 0 ? ` 기존 조합 ${formatMilkrunNumber(accumulatedRowCount)}개 행은 수량을 누적했습니다.` : ""}`
        + varianceMessage,
        progress.receivedQuantity > progress.plannedQuantity ? "warning" : "success",
    );
    renderReceivingDetail();
    focusReceivingBarcodeInput();
}

function cancelReceivingScanEntry() {
    receivingScanDraft = null;
    setReceivingScanFeedback("상품 입력을 취소했습니다. 다음 상품 바코드를 스캔해주세요.", "info");
    renderReceivingDetail();
    focusReceivingBarcodeInput();
}

function getReceivingPalletBreakdown(item) {
    const palletMap = new Map();
    (Array.isArray(item?.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation)
        .filter((row) => row.quantity > 0)
        .forEach((row) => {
            const palletLabel = row.palletNo || "PLT 미입력";
            const palletKey = palletLabel.toLocaleLowerCase("ko-KR");
            const previous = palletMap.get(palletKey) || { label: palletLabel, quantity: 0 };
            previous.quantity += row.quantity;
            palletMap.set(palletKey, previous);
        });
    return [...palletMap.values()];
}

function renderReceivingPalletBreakdown(item) {
    const rows = getReceivingPalletBreakdown(item);
    if (!rows.length) {
        return '<span class="receiving-pallet-empty">입고 수량을 입력하면 PLT별 합계가 표시됩니다.</span>';
    }
    return rows.map((row) => `
      <span class="receiving-pallet-chip">
        ${escapeHtml(row.label)}
        <strong>${formatMilkrunNumber(row.quantity)}개</strong>
      </span>
    `).join("");
}

function renderReceivingDetailProgress() {
    const progress = getInventoryReceiptProgress(receivingDetailDraftItems);
    const varianceTone = progress.varianceQuantity === 0
        ? "matched"
        : (progress.varianceQuantity < 0 ? "shortage" : "excess");
    const varianceText = progress.varianceQuantity === 0
        ? "일치"
        : `${progress.varianceQuantity > 0 ? "+" : "-"}${formatMilkrunNumber(Math.abs(progress.varianceQuantity))}개`;

    if (receivingDetailProgressEl) {
        receivingDetailProgressEl.innerHTML = `
          <div class="receiving-detail-progress-card">
            <span>예정수량</span>
            <strong>${formatMilkrunNumber(progress.plannedTotalQuantity)}개</strong>
          </div>
          <div class="receiving-detail-progress-card">
            <span>실입고수량</span>
            <strong>${formatMilkrunNumber(progress.receivedTotalQuantity)}개</strong>
          </div>
          <div class="receiving-detail-progress-card is-${varianceTone}">
            <span>전체 차이</span>
            <strong>${varianceText}</strong>
          </div>
          <div class="receiving-detail-progress-card">
            <span>SKU 상태</span>
            <strong>${formatMilkrunNumber(progress.matchedItemCount)}개 일치 · ${formatMilkrunNumber(progress.mismatchItemCount)}개 차이</strong>
          </div>
        `;
    }
    if (receivingDetailItemsSummaryEl) {
        receivingDetailItemsSummaryEl.textContent = `${formatMilkrunNumber(progress.itemCount)}개 SKU · 예정 ${formatMilkrunNumber(progress.plannedTotalQuantity)}개 · 실입고 ${formatMilkrunNumber(progress.receivedTotalQuantity)}개`;
    }
    return progress;
}

function renderReceivingAllocationInput(item, allocation, field, { editable = false } = {}) {
    const fieldMeta = {
        palletNo: { type: "text", placeholder: "예: PLT-01", label: "PLT 번호" },
        lotNo: { type: "text", placeholder: "예: LOT-A", label: "LOT 번호" },
        expiryDate: { type: "text", placeholder: "YYYY-MM-DD", label: "유통기한" },
        location: { type: "text", placeholder: "예: A-01-01", label: "로케이션" },
        quantity: { type: "number", placeholder: "0", label: "입고수량" },
    }[field];
    const rawValue = allocation?.[field] ?? "";
    const value = field === "expiryDate"
        ? formatReceivingExpiryDateInput(rawValue)
        : rawValue;

    if (!editable) {
        return `<span class="receiving-allocation-value">${escapeHtml(value || "-")}</span>`;
    }
    const numberAttrs = field === "quantity"
        ? ' min="0" step="1" inputmode="numeric"'
        : (field === "expiryDate"
            ? ' inputmode="numeric" maxlength="10" autocomplete="off"'
            : "");
    return `
      <input class="receiving-allocation-input${field === "expiryDate" ? " receiving-expiry-input" : ""}"
          type="${fieldMeta.type}"
          value="${escapeHtml(value)}" placeholder="${escapeHtml(fieldMeta.placeholder)}"${numberAttrs}
          aria-label="${escapeHtml(`${item.productName || item.adminProductCode || "SKU"} ${fieldMeta.label}`)}"
          data-receiving-detail-line="${escapeHtml(item.lineId)}"
          data-receiving-allocation-id="${escapeHtml(allocation.allocationId)}"
          data-receiving-allocation-field="${escapeHtml(field)}" />
    `;
}

function renderReceivingAllocationRows(item, { editable = false } = {}) {
    const allocations = getReceivingDisplayAllocations(item, { editable });
    if (!allocations.length) {
        return '<tr class="receiving-allocation-empty"><td colspan="6">등록된 실입고 내역이 없습니다.</td></tr>';
    }

    return allocations.map((allocation) => {
        const rowEditable = editable && allocation.postedQuantity <= 0;
        return `
      <tr>
        <td>${renderReceivingAllocationInput(item, allocation, "palletNo", { editable: rowEditable })}</td>
        <td>${renderReceivingAllocationInput(item, allocation, "lotNo", { editable: rowEditable })}</td>
        <td>${renderReceivingAllocationInput(item, allocation, "expiryDate", { editable: rowEditable })}</td>
        <td>${renderReceivingAllocationInput(item, allocation, "location", { editable: rowEditable })}</td>
        <td class="receiving-allocation-quantity">
          ${renderReceivingAllocationInput(item, allocation, "quantity", { editable: rowEditable })}
          ${allocation.postedQuantity > 0 ? '<small class="receiving-allocation-posted">반영됨</small>' : ""}
        </td>
        <td class="receiving-allocation-action">
          ${rowEditable ? `
            <button class="receiving-allocation-remove-btn" type="button"
                data-receiving-remove-allocation="${escapeHtml(allocation.allocationId)}"
                data-receiving-detail-line="${escapeHtml(item.lineId)}"
                aria-label="입고 행 삭제">×</button>
          ` : ""}
        </td>
      </tr>
    `;
    }).join("");
}

function renderReceivingDetailSkuCard(item, { editable = false } = {}) {
    const progress = getInventoryReceiptItemProgress(item);
    const statusMeta = getInventoryReceiptItemStatusMeta(progress.status);
    const showDiscrepancy = progress.status !== "matched";

    return `
      <article class="receiving-detail-sku-card is-${escapeHtml(statusMeta.tone)}"
          ${receivingScanDraft?.lineId === item.lineId ? 'data-receiving-scan-active="true"' : ""}
          data-receiving-detail-line-id="${escapeHtml(item.lineId)}">
        <div class="receiving-detail-sku-head">
          <div class="receiving-detail-product">
            <div>
              <strong>${escapeHtml(item.productName || "상품명 없음")}</strong>
              <span>${escapeHtml(item.adminProductCode || "-")}</span>
            </div>
            <span class="sku-type-badge ${getInventorySkuTypeBadgeClass(item.skuType)}">
              ${escapeHtml(getNormalizedSkuType(item.skuType))}
            </span>
          </div>
          <span class="receiving-item-status is-${escapeHtml(statusMeta.tone)}"
              data-receiving-item-status>${escapeHtml(statusMeta.label)}</span>
        </div>

        <div class="receiving-detail-sku-metrics">
          <div><span>예정</span><strong>${formatMilkrunNumber(progress.plannedQuantity)}개</strong></div>
          <div><span>실입고</span><strong data-receiving-item-received>${formatMilkrunNumber(progress.receivedQuantity)}개</strong></div>
          <div><span>차이</span><strong data-receiving-item-variance>${escapeHtml(getReceivingVarianceText(progress))}</strong></div>
          <div><span>PLT</span><strong data-receiving-item-pallets>${formatMilkrunNumber(progress.palletCount)}개</strong></div>
        </div>

        <div class="receiving-pallet-breakdown" data-receiving-pallet-breakdown>
          ${renderReceivingPalletBreakdown(item)}
        </div>

        <div class="receiving-allocation-table-wrap">
          <table class="receiving-allocation-table">
            <thead>
              <tr>
                <th>PLT 번호</th>
                <th>LOT 번호</th>
                <th>유통기한</th>
                <th>로케이션</th>
                <th>입고수량</th>
                <th aria-label="행 삭제"></th>
              </tr>
            </thead>
            <tbody>${renderReceivingAllocationRows(item, { editable })}</tbody>
          </table>
        </div>

        ${editable ? `
          <div class="receiving-detail-sku-actions">
            <button class="secondary-btn receiving-allocation-add-btn" type="button"
                data-receiving-add-allocation="${escapeHtml(item.lineId)}">+ 행 추가</button>
          </div>
          <label class="receiving-discrepancy-field${showDiscrepancy ? "" : " is-hidden"}"
              data-receiving-discrepancy-wrap>
            <span>수량 차이 사유 <em>최종 완료 시 필수</em></span>
            <input type="text" maxlength="120" value="${escapeHtml(item.discrepancyReason || "")}"
                placeholder="미입고·부족·초과 사유를 입력해주세요."
                data-receiving-discrepancy-reason="${escapeHtml(item.lineId)}" />
          </label>
        ` : (showDiscrepancy && item.discrepancyReason ? `
          <div class="receiving-discrepancy-readonly">
            <span>수량 차이 사유</span>
            <strong>${escapeHtml(item.discrepancyReason)}</strong>
          </div>
        ` : "")}
      </article>
    `;
}

function syncReceivingDetailProgressUi() {
    const receipt = getSelectedInventoryReceipt();
    if (!receipt) return;
    const progress = renderReceivingDetailProgress();

    receivingDetailDraftItems.forEach((item) => {
        const itemProgress = getInventoryReceiptItemProgress(item);
        const statusMeta = getInventoryReceiptItemStatusMeta(itemProgress.status);
        const card = [...document.querySelectorAll("[data-receiving-detail-line-id]")]
            .find((row) => row.getAttribute("data-receiving-detail-line-id") === item.lineId);
        if (!(card instanceof HTMLElement)) return;

        card.classList.remove("is-pending", "is-matched", "is-shortage", "is-excess");
        card.classList.add(`is-${statusMeta.tone}`);
        card.classList.toggle("is-scan-active", receivingScanDraft?.lineId === item.lineId);
        const statusEl = card.querySelector("[data-receiving-item-status]");
        if (statusEl) {
            statusEl.textContent = statusMeta.label;
            statusEl.className = `receiving-item-status is-${statusMeta.tone}`;
        }
        const receivedEl = card.querySelector("[data-receiving-item-received]");
        if (receivedEl) receivedEl.textContent = `${formatMilkrunNumber(itemProgress.receivedQuantity)}개`;
        const varianceEl = card.querySelector("[data-receiving-item-variance]");
        if (varianceEl) varianceEl.textContent = getReceivingVarianceText(itemProgress);
        const palletsEl = card.querySelector("[data-receiving-item-pallets]");
        if (palletsEl) palletsEl.textContent = `${formatMilkrunNumber(itemProgress.palletCount)}개`;
        const breakdownEl = card.querySelector("[data-receiving-pallet-breakdown]");
        if (breakdownEl) breakdownEl.innerHTML = renderReceivingPalletBreakdown(item);
        const discrepancyWrap = card.querySelector("[data-receiving-discrepancy-wrap]");
        discrepancyWrap?.classList.toggle("is-hidden", itemProgress.status === "matched");
    });

    const editable = isInventoryReceiptEditableStatus(receipt.status);
    const unpostedTotalQuantity = receivingDetailDraftItems.reduce(
        (sum, item) => sum + getInventoryReceiptItemProgress(item).unpostedQuantity,
        0,
    );
    if (receivingDetailSaveBtn instanceof HTMLButtonElement) {
        receivingDetailSaveBtn.hidden = !editable;
        receivingDetailSaveBtn.disabled = !receivingDetailDirty
            || receivingDetailSaving
            || receivingActionPending
            || Boolean(receivingScanDraft);
        receivingDetailSaveBtn.textContent = receivingDetailSaving ? "저장 중..." : "임시 저장";
    }
    if (receivingDetailCompleteBtn instanceof HTMLButtonElement) {
        receivingDetailCompleteBtn.hidden = !editable;
        receivingDetailCompleteBtn.disabled = receivingDetailSaving
            || receivingActionPending
            || Boolean(receivingScanDraft)
            || progress.receivedTotalQuantity <= 0;
        receivingDetailCompleteBtn.textContent = receivingActionPending
            ? "처리 중..."
            : (receipt.status === "reopened" ? "입고 다시 완료" : "입고 완료");
    }
    if (receivingDetailPartialBtn instanceof HTMLButtonElement) {
        receivingDetailPartialBtn.hidden = !editable || receipt.status === "reopened";
        receivingDetailPartialBtn.disabled = receivingDetailSaving
            || receivingActionPending
            || Boolean(receivingScanDraft)
            || unpostedTotalQuantity <= 0;
        receivingDetailPartialBtn.textContent = receivingActionPending
            ? "처리 중..."
            : "현재 수량 입고 반영";
    }
    if (receivingDetailEditPlannedBtn instanceof HTMLButtonElement) {
        receivingDetailEditPlannedBtn.disabled = receipt.status !== "planned"
            || receivingActionPending
            || receivingDetailSaving
            || receivingDetailDirty
            || Boolean(receivingScanDraft);
    }
}

function renderReceivingDetail() {
    const receipt = getSelectedInventoryReceipt();
    if (!receipt) {
        closeReceivingDetailModal({ force: true });
        return;
    }
    const statusMeta = getInventoryReceiptStatusMeta(receipt.status);
    const completedWithVariance = receipt.status === "completed" && receipt.mismatchItemCount > 0;
    if (receivingDetailTitleEl) receivingDetailTitleEl.textContent = receipt.supplier || "입고 상세";
    if (receivingDetailCodeEl) receivingDetailCodeEl.textContent = receipt.receiptCode || "-";
    if (receivingDetailStatusBadgeEl) {
        receivingDetailStatusBadgeEl.textContent = completedWithVariance
            ? "입고 완료 · 수량 차이"
            : statusMeta.label;
        receivingDetailStatusBadgeEl.className = `receiving-status-badge is-${statusMeta.tone}`;
    }
    if (receivingDetailMetaEl) {
        receivingDetailMetaEl.innerHTML = `
          <div><span>입고예정일</span><strong>${escapeHtml(formatReceivingDate(receipt.expectedDate))}</strong></div>
          <div><span>입고 창고</span><strong>${escapeHtml(receipt.warehouseName)}</strong></div>
          <div><span>등록자</span><strong>${escapeHtml(receipt.createdBy || "-")}</strong></div>
          <div><span>메모</span><strong>${escapeHtml(receipt.memo || "-")}</strong></div>
        `;
    }
    if (receivingReworkNoticeEl instanceof HTMLElement) {
        receivingReworkNoticeEl.hidden = receipt.status !== "reopened";
        if (receipt.status === "reopened") {
            const reopenedMeta = [
                receipt.reopenedAt ? formatInventoryDateTime(receipt.reopenedAt) : "",
                receipt.reopenedBy,
            ].filter(Boolean).join(" · ");
            receivingReworkNoticeEl.innerHTML = `
              <strong>입고 재작업 중${receipt.reopenCount > 0 ? ` · ${formatMilkrunNumber(receipt.reopenCount)}회차` : ""}</strong>
              <span>기존 입고 반영은 취소되었습니다. 내용을 수정한 뒤 입고를 다시 완료해주세요.${reopenedMeta ? ` (${escapeHtml(reopenedMeta)})` : ""}</span>
            `;
        }
    }
    const completionEditable = isInventoryReceiptEditableStatus(receipt.status);
    const completionDisabled = !completionEditable
        || receivingActionPending
        || receivingDetailSaving
        || receivingCompletionBusy
        || Boolean(receivingScanDraft);
    if (receivingCompletionWorkspaceEl instanceof HTMLElement) {
        receivingCompletionWorkspaceEl.hidden = !completionEditable;
    }
    if (receivingCompletionTemplateBtn instanceof HTMLButtonElement) {
        receivingCompletionTemplateBtn.disabled = completionDisabled;
    }
    if (receivingCompletionUploadTrigger instanceof HTMLElement) {
        receivingCompletionUploadTrigger.classList.toggle("is-disabled", completionDisabled);
        receivingCompletionUploadTrigger.setAttribute("aria-disabled", String(completionDisabled));
    }
    if (receivingCompletionFileInput instanceof HTMLInputElement) {
        receivingCompletionFileInput.disabled = completionDisabled;
    }
    renderReceivingScanWorkspace();
    if (receivingDetailItemsBodyEl) {
        const receiptEditable = isInventoryReceiptEditableStatus(receipt.status);
        receivingDetailItemsBodyEl.innerHTML = receivingDetailDraftItems
            .map((item) => renderReceivingDetailSkuCard(item, {
                editable: receiptEditable && !item.receivingClosed,
            }))
            .join("");
    }
    if (receivingDetailCancelReceiptBtn instanceof HTMLButtonElement) {
        receivingDetailCancelReceiptBtn.hidden = receipt.status === "cancelled";
        receivingDetailCancelReceiptBtn.disabled = receivingActionPending
            || receivingDetailSaving
            || Boolean(receivingScanDraft);
        receivingDetailCancelReceiptBtn.textContent = receipt.status === "completed"
            ? "입고 완료 취소·재작업"
            : (receipt.status === "reopened"
                ? "입고건 완전 취소"
                : (receipt.status === "partial" ? "부분 입고 취소" : "입고 취소"));
    }
    if (receivingDetailEditPlannedBtn instanceof HTMLButtonElement) {
        receivingDetailEditPlannedBtn.hidden = receipt.status !== "planned";
        receivingDetailEditPlannedBtn.disabled = receivingActionPending
            || receivingDetailSaving
            || receivingDetailDirty
            || Boolean(receivingScanDraft);
    }
    syncReceivingDetailProgressUi();
    setReceivingDetailStatus("");
}

function openReceivingDetail(receiptId) {
    closeReceivingCompletionModal({ force: true });
    selectedReceivingId = receiptId;
    receivingActionPending = false;
    receivingDetailSaving = false;
    receivingDetailDirty = false;
    receivingScanDraft = null;
    receivingScanFeedback = {
        message: "상품 바코드를 스캔해주세요.",
        tone: "info",
    };
    const receipt = getSelectedInventoryReceipt();
    receivingDetailDraftItems = receipt ? buildReceivingDetailDraftItems(receipt) : [];
    renderReceivingDetail();
    if (!receipt) return;
    receivingDetailModal?.classList.remove("is-hidden");
    receivingDetailModal?.setAttribute("aria-hidden", "false");
    focusReceivingBarcodeInput();
}

function isReceivingAllocationStarted(allocation) {
    const normalized = normalizeInventoryReceiptAllocation(allocation);
    return normalized.quantity > 0
        || Boolean(normalized.palletNo || normalized.lotNo || normalized.expiryDate || normalized.location);
}

function normalizeReceivingDetailItems(items = receivingDetailDraftItems, {
    dropEmptyAllocations = false,
} = {}) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
        const allocations = (Array.isArray(item.allocations) ? item.allocations : [])
            .map(normalizeInventoryReceiptAllocation)
            .filter((allocation) => !dropEmptyAllocations || allocation.quantity > 0);
        return normalizeInventoryReceiptItem({
            ...item,
            allocations,
        }, index, { receiptStatus: "planned" });
    });
}

function validateReceivingCompletionDraft(items = receivingDetailDraftItems, { finalize = true } = {}) {
    const normalizedItems = normalizeReceivingDetailItems(items, { dropEmptyAllocations: true });
    const errors = [];

    (Array.isArray(items) ? items : []).forEach((draftItem, itemIndex) => {
        const normalizedItem = normalizedItems[itemIndex];
        const productLabel = normalizedItem.productName || normalizedItem.adminProductCode || `SKU ${itemIndex + 1}`;
        const startedAllocations = (Array.isArray(draftItem.allocations) ? draftItem.allocations : [])
            .map(normalizeInventoryReceiptAllocation)
            .filter((allocation) => (
                isReceivingAllocationStarted(allocation)
                && (
                    allocation.postedQuantity < allocation.quantity
                    || allocation.postedQuantity === 0
                )
            ));

        startedAllocations.forEach((allocation, allocationIndex) => {
            const rowLabel = `${productLabel} ${allocationIndex + 1}행`;
            if (allocation.quantity <= 0) {
                errors.push(`${rowLabel}의 입고수량을 입력해주세요.`);
                return;
            }
            if (!isValidReceivingExpiryDate(allocation.expiryDate)) {
                errors.push(`${rowLabel}의 유통기한을 YYYY-MM-DD 형식의 실제 날짜로 입력해주세요.`);
            }
        });

        const progress = getInventoryReceiptItemProgress(normalizedItem);
        const needsDiscrepancyReason = finalize
            ? progress.status !== "matched"
            : progress.status === "excess";
        if (needsDiscrepancyReason && !String(normalizedItem.discrepancyReason || "").trim()) {
            errors.push(`${productLabel}의 수량 차이 사유를 입력해주세요.`);
        }
    });

    const progress = getInventoryReceiptProgress(normalizedItems);
    const unpostedTotalQuantity = normalizedItems.reduce(
        (sum, item) => sum + getInventoryReceiptItemProgress(item).unpostedQuantity,
        0,
    );
    if (finalize && progress.receivedTotalQuantity <= 0) {
        errors.unshift("실입고수량을 1개 이상 입력해주세요.");
    } else if (!finalize && unpostedTotalQuantity <= 0) {
        errors.unshift("새롭게 반영할 입고수량을 1개 이상 입력해주세요.");
    }

    return {
        isValid: errors.length === 0,
        errors,
        items: normalizedItems,
        progress,
        unpostedTotalQuantity,
    };
}

function getReceivingPostedAllocations(item) {
    const allocations = (Array.isArray(item?.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation)
        .map((allocation) => ({
            ...allocation,
            quantity: Math.min(allocation.quantity, allocation.postedQuantity),
        }))
        .filter((allocation) => allocation.quantity > 0);
    if (allocations.length) return allocations;

    const progress = getInventoryReceiptItemProgress(item);
    return progress.postedQuantity > 0 || progress.receivedQuantity > 0
        ? [normalizeInventoryReceiptAllocation({
            allocationId: `${item.lineId}-legacy`,
            quantity: progress.postedQuantity || progress.receivedQuantity,
        })]
        : [];
}

function getReceivingUnpostedAllocations(item) {
    return (Array.isArray(item?.allocations) ? item.allocations : [])
        .map(normalizeInventoryReceiptAllocation)
        .map((allocation) => ({
            ...allocation,
            quantity: Math.max(0, allocation.quantity - allocation.postedQuantity),
        }))
        .filter((allocation) => allocation.quantity > 0);
}

function buildReceivingAllocationMemo(receipt, allocation) {
    return [
        receipt.receiptCode,
        receipt.supplier,
        allocation.palletNo ? `PLT ${allocation.palletNo}` : "",
        allocation.lotNo ? `LOT ${allocation.lotNo}` : "",
        allocation.expiryDate ? `유통기한 ${allocation.expiryDate}` : "",
        allocation.location ? `로케이션 ${allocation.location}` : "",
    ].filter(Boolean).join(" · ");
}

async function saveReceivingDetailDraft() {
    if (receivingDetailSaving || receivingActionPending || !receivingDetailDirty) return;
    const userId = getCloudDataUserId();
    const receipt = getSelectedInventoryReceipt();
    if (
        !userId
        || !receipt
        || !isInventoryReceiptEditableStatus(receipt.status)
    ) return;

    const receiptCollection = getCloudDataCollection(userId, INVENTORY_RECEIPT_COLLECTION);
    if (!receiptCollection) return;
    const receiptRef = doc(receiptCollection, receipt.id);
    const draftItems = normalizeReceivingDetailItems();
    let savedReceipt = null;

    receivingDetailSaving = true;
    syncReceivingDetailProgressUi();
    setReceivingDetailStatus("");

    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const receiptSnapshot = await firestoreTransaction.get(receiptRef);
            if (!receiptSnapshot.exists()) throw new Error("입고 건을 찾을 수 없습니다.");
            const liveReceipt = normalizeInventoryReceipt(receiptSnapshot.data());
            if (
                !isInventoryReceiptEditableStatus(liveReceipt.status)
                || liveReceipt.status !== receipt.status
            ) {
                const statusError = new Error("이미 처리된 입고 건입니다.");
                statusError.code = "receiving/already-processed";
                throw statusError;
            }
            const postedQuantityChanged = liveReceipt.items.length !== receipt.items.length
                || liveReceipt.items.some((item, index) => (
                    getInventoryReceiptItemProgress(item).postedQuantity
                    !== getInventoryReceiptItemProgress(receipt.items[index]).postedQuantity
                ));
            if (postedQuantityChanged) {
                const changedError = new Error("입고 반영 수량이 변경되었습니다.");
                changedError.code = "receiving/stale-detail";
                throw changedError;
            }

            savedReceipt = normalizeInventoryReceipt({
                ...liveReceipt,
                items: draftItems,
            });
            firestoreTransaction.set(receiptRef, {
                items: savedReceipt.items,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        });

        inventoryReceipts = inventoryReceipts.map((row) => (
            row.id === savedReceipt.id ? savedReceipt : row
        )).sort(compareInventoryReceiptsDesc);
        receivingDetailDraftItems = buildReceivingDetailDraftItems(savedReceipt);
        receivingDetailDirty = false;
        receivingDetailSaving = false;
        renderReceivingDetail();
        setReceivingDetailStatus(
            "입고 내용을 저장했습니다. ‘현재 수량 입고 반영’ 또는 ‘입고 완료’ 시 재고에 반영됩니다.",
            "success",
        );
    } catch (error) {
        console.error("입고 내용 저장에 실패했습니다.", error);
        receivingDetailSaving = false;
        syncReceivingDetailProgressUi();
        setReceivingDetailStatus(
            error?.code === "receiving/already-processed"
                ? "다른 화면에서 이미 처리된 입고 건입니다. 목록을 새로 확인해주세요."
                : (error?.code === "receiving/stale-detail"
                    ? "입고 반영 수량이 변경되었습니다. 상세 화면을 닫고 다시 열어주세요."
                    : "입고 내용을 저장하지 못했습니다. 잠시 후 다시 시도해주세요."),
        );
    }
}

function getLocalInventoryBalanceQuantity(skuKey) {
    const savedBalance = inventoryBalances.find((row) => row.skuKey === skuKey);
    if (savedBalance) return Math.max(0, Number(savedBalance.quantity) || 0);
    const snapshotRow = getInventorySnapshot().rows.find((row) => row.skuKey === skuKey);
    return Math.max(0, Number(snapshotRow?.currentStock) || 0);
}

async function completeInventoryReceipt(
    receiptId,
    draftItems = receivingDetailDraftItems,
    { finalize = true } = {},
) {
    if (receivingActionPending) return;
    const userId = getCloudDataUserId();
    const receipt = inventoryReceipts.find((row) => row.id === receiptId);
    if (
        !userId
        || !receipt
        || !isInventoryReceiptEditableStatus(receipt.status)
        || (receipt.status === "reopened" && !finalize)
    ) return;
    const validation = validateReceivingCompletionDraft(draftItems, { finalize });
    if (!validation.isValid) {
        setReceivingDetailStatus(validation.errors[0] || "입고 내용을 확인해주세요.");
        return;
    }
    const completionItems = validation.items;

    const receiptCollection = getCloudDataCollection(userId, INVENTORY_RECEIPT_COLLECTION);
    const balanceCollection = getCloudDataCollection(userId, INVENTORY_BALANCE_COLLECTION);
    const transactionCollection = getCloudDataCollection(userId, INVENTORY_TRANSACTION_COLLECTION);
    if (!receiptCollection || !balanceCollection || !transactionCollection) return;

    const receiptRef = doc(receiptCollection, receipt.id);
    const balanceRefs = completionItems.map((item) => (
        doc(balanceCollection, getInventoryDocumentId(item.skuKey))
    ));
    const ledgerEntries = completionItems.flatMap((item, itemIndex) => (
        getReceivingUnpostedAllocations(item).map((allocation) => ({
            itemIndex,
            item,
            allocation,
            ref: doc(transactionCollection),
        }))
    ));
    let completedReceipt = null;
    let savedBalances = [];
    let savedTransactions = [];
    receivingActionPending = true;
    renderReceivingDetail();

    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const receiptSnapshot = await firestoreTransaction.get(receiptRef);
            if (!receiptSnapshot.exists()) throw new Error("입고 건을 찾을 수 없습니다.");
            const liveReceipt = normalizeInventoryReceipt(receiptSnapshot.data());
            if (
                !isInventoryReceiptEditableStatus(liveReceipt.status)
                || liveReceipt.status !== receipt.status
            ) {
                const statusError = new Error("이미 처리된 입고 건입니다.");
                statusError.code = "receiving/already-processed";
                throw statusError;
            }
            const liveReceiptChanged = liveReceipt.items.length !== completionItems.length
                || liveReceipt.items.some((item, index) => (
                    item.skuKey !== completionItems[index]?.skuKey
                    || item.quantity !== completionItems[index]?.quantity
                    || getInventoryReceiptItemProgress(item).postedQuantity
                        !== getInventoryReceiptItemProgress(completionItems[index]).postedQuantity
                ));
            if (liveReceiptChanged) {
                const changedError = new Error("입고 예정 품목이 변경되었습니다.");
                changedError.code = "receiving/stale-detail";
                throw changedError;
            }

            const balanceSnapshots = await Promise.all(
                balanceRefs.map((balanceRef) => firestoreTransaction.get(balanceRef)),
            );
            const completedAt = new Date().toISOString();
            savedBalances = [];
            savedTransactions = [];
            let ledgerSequence = 0;

            completionItems.forEach((item, index) => {
                const itemDeltaQuantity = ledgerEntries
                    .filter((entry) => entry.itemIndex === index)
                    .reduce((sum, entry) => sum + entry.allocation.quantity, 0);
                const storedBalanceRow = balanceSnapshots[index].exists()
                    ? normalizeInventoryBalance(balanceSnapshots[index].data())
                    : normalizeInventoryBalance({
                        ...item,
                        quantity: getLocalInventoryBalanceQuantity(item.skuKey),
                    });
                const currentBalance = storedBalanceRow.quantity;
                const nextBalance = currentBalance + itemDeltaQuantity;
                const balanceRow = normalizeInventoryBalance({
                    ...item,
                    quantity: nextBalance,
                    warehouseId: liveReceipt.warehouseId,
                    warehouseName: liveReceipt.warehouseName,
                    storageRevision: storedBalanceRow.storageRevision + 1,
                    updatedAt: completedAt,
                });
                if (itemDeltaQuantity > 0) {
                    savedBalances.push(balanceRow);
                    firestoreTransaction.set(balanceRefs[index], {
                        ...balanceRow,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }

                let runningBalance = currentBalance;
                ledgerEntries
                    .filter((entry) => entry.itemIndex === index)
                    .forEach((entry) => {
                        runningBalance += entry.allocation.quantity;
                        const ledgerOccurredAt = new Date(
                            Date.parse(completedAt) + ledgerSequence,
                        ).toISOString();
                        ledgerSequence += 1;
                        const ledgerRow = buildInventoryTransactionDraft({
                            id: entry.ref.id,
                            transactionType: "receipt",
                            sku: { ...item, rowId: item.skuRowId },
                            quantity: entry.allocation.quantity,
                            balanceAfter: runningBalance,
                            occurredAt: ledgerOccurredAt,
                            reason: liveReceipt.status === "reopened"
                                ? "입고 다시 완료"
                                : "입고 완료",
                            memo: buildReceivingAllocationMemo(liveReceipt, entry.allocation),
                            createdBy: currentUserEmail || auth.currentUser?.email || "",
                            sourceType: "receipt",
                            sourceId: liveReceipt.id,
                            sourceCode: liveReceipt.receiptCode,
                            receiptLineId: item.lineId,
                            allocationId: entry.allocation.allocationId,
                            palletNo: entry.allocation.palletNo,
                            lotNo: entry.allocation.lotNo,
                            expiryDate: entry.allocation.expiryDate,
                            location: entry.allocation.location,
                        });
                        savedTransactions.push(ledgerRow);
                        firestoreTransaction.set(entry.ref, {
                            ...ledgerRow,
                            createdAt: serverTimestamp(),
                        });
                    });
            });

            const processedItems = buildPostedInventoryReceiptItems(completionItems, {
                finalize,
                postedAt: completedAt,
            });
            const allItemsClosed = processedItems.every((item) => item.receivingClosed);
            const nextStatus = finalize || allItemsClosed ? "completed" : "partial";

            completedReceipt = normalizeInventoryReceipt({
                ...liveReceipt,
                items: processedItems,
                status: nextStatus,
                receivedDate: liveReceipt.receivedDate || getInventoryTodayValue(),
                completedAt: nextStatus === "completed" ? completedAt : "",
            });
            firestoreTransaction.set(receiptRef, {
                ...completedReceipt,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        });

        inventoryReceipts = inventoryReceipts.map((row) => (
            row.id === completedReceipt.id ? completedReceipt : row
        )).sort(compareInventoryReceiptsDesc);
        savedBalances.forEach((balance) => {
            inventoryBalances = [
                balance,
                ...inventoryBalances.filter((row) => row.skuKey !== balance.skuKey),
            ];
        });
        inventoryTransactions = [
            ...savedTransactions.map(normalizeInventoryTransaction),
            ...inventoryTransactions,
        ];
        renderReceivingPage({ force: true });
        renderInventoryLedger();
        if (completedReceipt.status === "completed") {
            closeReceivingDetailModal({ force: true });
            const mismatchText = completedReceipt.mismatchItemCount > 0
                ? ` · 수량 차이 SKU ${formatMilkrunNumber(completedReceipt.mismatchItemCount)}개`
                : "";
            setReceivingPageStatus(
                `${completedReceipt.receiptCode} ${receipt.status === "reopened" ? "재작업 입고를 다시 완료하고 " : ""}`
                + `실입고 ${formatMilkrunNumber(completedReceipt.receivedTotalQuantity)}개를 현재고에 반영했습니다${mismatchText}. 주문관리에서 재고부족 주문을 선택해 재고 할당을 다시 실행할 수 있습니다.`,
                "success",
            );
        } else {
            receivingActionPending = false;
            receivingDetailDirty = false;
            receivingDetailDraftItems = buildReceivingDetailDraftItems(completedReceipt);
            renderReceivingDetail();
            setReceivingDetailStatus(
                `현재 입력분 ${formatMilkrunNumber(validation.unpostedTotalQuantity)}개를 재고에 반영했습니다. 부족·미입고 SKU는 계속 입력할 수 있으며, 주문 재고 할당은 주문관리에서 다시 실행해주세요.`,
                "success",
            );
        }
    } catch (error) {
        console.error("입고 완료 처리에 실패했습니다.", error);
        receivingActionPending = false;
        renderReceivingDetail();
        setReceivingDetailStatus(
            error?.code === "receiving/already-processed"
                ? "다른 화면에서 이미 처리된 입고 건입니다. 목록을 새로 확인해주세요."
                : (error?.code === "receiving/stale-detail"
                    ? "입고 예정 품목이 변경되었습니다. 상세 화면을 닫고 다시 열어주세요."
                    : "입고 완료 처리에 실패했습니다. 잠시 후 다시 시도해주세요."),
        );
    }
}

function getInventoryReceiptStorageShortage(receipt) {
    const requiredByGroup = new Map();
    (Array.isArray(receipt?.items) ? receipt.items : []).forEach((item) => {
        getReceivingPostedAllocations(item).forEach((allocation) => {
            const row = {
                skuKey: item.skuKey,
                lotNo: allocation.lotNo,
                expiryDate: allocation.expiryDate,
                location: allocation.location,
                palletNo: allocation.palletNo,
            };
            const key = getInventoryLotGroupKey(row);
            const current = requiredByGroup.get(key) || {
                ...row,
                productName: item.productName,
                requiredQuantity: 0,
            };
            current.requiredQuantity += allocation.quantity;
            requiredByGroup.set(key, current);
        });
    });

    if (!requiredByGroup.size) return null;
    const lotSnapshot = buildInventoryLotSnapshot(getInventorySnapshot().rows, inventoryTransactions);
    const currentByGroup = new Map(lotSnapshot.rows.map((row) => [row.lotKey, row.quantity]));
    return [...requiredByGroup.entries()]
        .map(([key, row]) => ({ ...row, currentQuantity: currentByGroup.get(key) || 0 }))
        .find((row) => row.currentQuantity < row.requiredQuantity) || null;
}

async function cancelInventoryReceipt(receiptId) {
    if (receivingActionPending) return;
    const userId = getCloudDataUserId();
    const receipt = inventoryReceipts.find((row) => row.id === receiptId);
    if (!userId || !receipt || receipt.status === "cancelled") return;

    const receiptCollection = getCloudDataCollection(userId, INVENTORY_RECEIPT_COLLECTION);
    const balanceCollection = getCloudDataCollection(userId, INVENTORY_BALANCE_COLLECTION);
    const transactionCollection = getCloudDataCollection(userId, INVENTORY_TRANSACTION_COLLECTION);
    if (!receiptCollection || !balanceCollection || !transactionCollection) return;

    const receiptRef = doc(receiptCollection, receipt.id);
    const shouldReopen = receipt.status === "completed";
    const shouldReverseStock = receipt.status === "completed" || receipt.status === "partial";
    const storageShortage = shouldReverseStock
        ? getInventoryReceiptStorageShortage(receipt)
        : null;
    if (storageShortage) {
        const storageLabel = [
            storageShortage.lotNo ? `LOT ${storageShortage.lotNo}` : "LOT 미지정",
            storageShortage.location ? `로케이션 ${storageShortage.location}` : "로케이션 미지정",
        ].join(" · ");
        setReceivingDetailStatus(
            `${storageShortage.productName || "입고 상품"}의 ${storageLabel} 재고가 이동 또는 차감되어 입고를 취소할 수 없습니다. 해당 보관재고를 원래 구분으로 되돌린 뒤 다시 시도해주세요.`,
        );
        return;
    }
    const balanceRefs = shouldReverseStock
        ? receipt.items.map((item) => doc(balanceCollection, getInventoryDocumentId(item.skuKey)))
        : [];
    const reversalEntries = shouldReverseStock
        ? receipt.items.flatMap((item, itemIndex) => (
            getReceivingPostedAllocations(item).map((allocation) => ({
                itemIndex,
                allocation,
                ref: doc(transactionCollection),
            }))
        ))
        : [];
    let updatedReceipt = null;
    let savedBalances = [];
    let savedTransactions = [];
    receivingActionPending = true;
    renderReceivingDetail();

    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const receiptSnapshot = await firestoreTransaction.get(receiptRef);
            if (!receiptSnapshot.exists()) throw new Error("입고 건을 찾을 수 없습니다.");
            const liveReceipt = normalizeInventoryReceipt(receiptSnapshot.data());
            if (liveReceipt.status === "cancelled") {
                const statusError = new Error("이미 취소된 입고 건입니다.");
                statusError.code = "receiving/already-processed";
                throw statusError;
            }
            if (liveReceipt.status !== receipt.status) {
                const statusError = new Error("입고 상태가 변경되었습니다.");
                statusError.code = "receiving/already-processed";
                throw statusError;
            }

            const liveShouldReopen = liveReceipt.status === "completed";
            const liveShouldReverse = liveReceipt.status === "completed" || liveReceipt.status === "partial";
            if (liveShouldReopen !== shouldReopen) {
                const statusError = new Error("입고 상태가 변경되었습니다.");
                statusError.code = "receiving/already-processed";
                throw statusError;
            }
            if (
                liveShouldReverse
                && (
                    liveReceipt.items.length !== receipt.items.length
                    || liveReceipt.items.some((item, index) => (
                        item.skuKey !== receipt.items[index]?.skuKey
                    ))
                )
            ) {
                const changedError = new Error("입고 상세 내역이 변경되었습니다.");
                changedError.code = "receiving/stale-detail";
                throw changedError;
            }
            const balanceSnapshots = liveShouldReverse
                ? await Promise.all(balanceRefs.map((balanceRef) => firestoreTransaction.get(balanceRef)))
                : [];
            const cancelledAt = new Date().toISOString();
            savedBalances = [];
            savedTransactions = [];
            let ledgerSequence = 0;

            if (liveShouldReverse) {
                const reversalChanged = liveReceipt.items.some((item, itemIndex) => {
                    const liveAllocations = getReceivingPostedAllocations(item);
                    const expectedAllocations = reversalEntries
                        .filter((entry) => entry.itemIndex === itemIndex)
                        .map((entry) => entry.allocation);
                    return liveAllocations.length !== expectedAllocations.length
                        || liveAllocations.some((allocation, allocationIndex) => (
                            allocation.allocationId
                                !== expectedAllocations[allocationIndex]?.allocationId
                            || allocation.quantity
                                !== expectedAllocations[allocationIndex]?.quantity
                        ));
                });
                if (reversalChanged) {
                    const changedError = new Error("입고 상세 내역이 변경되었습니다.");
                    changedError.code = "receiving/stale-detail";
                    throw changedError;
                }

                liveReceipt.items.forEach((item, index) => {
                    const postedQuantity = getReceivingPostedAllocations(item)
                        .reduce((sum, allocation) => sum + allocation.quantity, 0);
                    const storedBalanceRow = balanceSnapshots[index].exists()
                        ? normalizeInventoryBalance(balanceSnapshots[index].data())
                        : normalizeInventoryBalance({
                            ...item,
                            quantity: getLocalInventoryBalanceQuantity(item.skuKey),
                        });
                    const currentBalance = storedBalanceRow.quantity;
                    if (currentBalance < postedQuantity) {
                        const insufficientError = new Error("입고 수량을 취소할 현재고가 부족합니다.");
                        insufficientError.code = "receiving/insufficient-stock";
                        throw insufficientError;
                    }
                });

                liveReceipt.items.forEach((item, index) => {
                    const postedQuantity = getReceivingPostedAllocations(item)
                        .reduce((sum, allocation) => sum + allocation.quantity, 0);
                    const storedBalanceRow = balanceSnapshots[index].exists()
                        ? normalizeInventoryBalance(balanceSnapshots[index].data())
                        : normalizeInventoryBalance({
                            ...item,
                            quantity: getLocalInventoryBalanceQuantity(item.skuKey),
                        });
                    const currentBalance = storedBalanceRow.quantity;
                    const nextBalance = currentBalance - postedQuantity;
                    if (postedQuantity <= 0) return;
                    const balanceRow = normalizeInventoryBalance({
                        ...item,
                        quantity: nextBalance,
                        warehouseId: liveReceipt.warehouseId,
                        warehouseName: liveReceipt.warehouseName,
                        storageRevision: storedBalanceRow.storageRevision + 1,
                        updatedAt: cancelledAt,
                    });
                    savedBalances.push(balanceRow);

                    firestoreTransaction.set(balanceRefs[index], {
                        ...balanceRow,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });

                    let runningBalance = currentBalance;
                    const liveAllocations = getReceivingPostedAllocations(item);
                    const itemReversalEntries = reversalEntries
                        .filter((entry) => entry.itemIndex === index);
                    liveAllocations.forEach((allocation, allocationIndex) => {
                        const reversalEntry = itemReversalEntries[allocationIndex];
                        runningBalance -= allocation.quantity;
                        const ledgerOccurredAt = new Date(
                            Date.parse(cancelledAt) + ledgerSequence,
                        ).toISOString();
                        ledgerSequence += 1;
                        const ledgerRow = normalizeInventoryTransaction({
                            ...buildInventoryTransactionDraft({
                                id: reversalEntry.ref.id,
                                transactionType: "reversal",
                                sku: { ...item, rowId: item.skuRowId },
                                quantity: allocation.quantity,
                                balanceAfter: runningBalance,
                                occurredAt: ledgerOccurredAt,
                                reason: liveShouldReopen
                                    ? "입고 완료 취소·재작업"
                                    : "부분 입고 취소",
                                memo: buildReceivingAllocationMemo(liveReceipt, allocation),
                                createdBy: currentUserEmail || auth.currentUser?.email || "",
                                sourceType: "receipt",
                                sourceId: liveReceipt.id,
                                sourceCode: liveReceipt.receiptCode,
                                receiptLineId: item.lineId,
                                allocationId: allocation.allocationId,
                                palletNo: allocation.palletNo,
                                lotNo: allocation.lotNo,
                                expiryDate: allocation.expiryDate,
                                location: allocation.location,
                            }),
                            quantityDelta: -allocation.quantity,
                        });
                        savedTransactions.push(ledgerRow);
                        firestoreTransaction.set(reversalEntry.ref, {
                            ...ledgerRow,
                            createdAt: serverTimestamp(),
                        });
                    });
                });
            }

            const actor = currentUserEmail || auth.currentUser?.email || "";
            updatedReceipt = normalizeInventoryReceipt(liveShouldReopen
                ? {
                    ...liveReceipt,
                    status: "reopened",
                    items: buildReopenedInventoryReceiptItems(liveReceipt.items),
                    lastCompletedAt: liveReceipt.completedAt || liveReceipt.lastCompletedAt,
                    completedAt: "",
                    reopenedAt: cancelledAt,
                    reopenedBy: actor,
                    reopenCount: liveReceipt.reopenCount + 1,
                    reworkReversed: true,
                    cancelledAt: "",
                    cancelledBy: "",
                    cancellationReversed: false,
                }
                : {
                    ...liveReceipt,
                    status: "cancelled",
                    cancelledAt,
                    cancelledBy: actor,
                    cancellationReversed: liveShouldReverse,
                });
            firestoreTransaction.set(receiptRef, {
                ...updatedReceipt,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        });

        inventoryReceipts = inventoryReceipts.map((row) => (
            row.id === updatedReceipt.id ? updatedReceipt : row
        )).sort(compareInventoryReceiptsDesc);
        savedBalances.forEach((balance) => {
            inventoryBalances = [
                balance,
                ...inventoryBalances.filter((row) => row.skuKey !== balance.skuKey),
            ];
        });
        inventoryTransactions = [
            ...savedTransactions.map(normalizeInventoryTransaction),
            ...inventoryTransactions,
        ];
        renderReceivingPage({ force: true });
        renderInventoryLedger();
        if (updatedReceipt.status === "reopened") {
            receivingActionPending = false;
            receivingDetailDirty = false;
            receivingScanDraft = null;
            receivingDetailDraftItems = buildReceivingDetailDraftItems(updatedReceipt);
            renderReceivingDetail();
            setReceivingDetailStatus(
                `${updatedReceipt.receiptCode} 완료 입고를 취소하고 현재고를 원복했습니다. 내용을 수정한 뒤 입고를 다시 완료해주세요.`,
                "success",
            );
            focusReceivingBarcodeInput();
        } else {
            closeReceivingDetailModal({ force: true });
            setReceivingPageStatus(
                updatedReceipt.cancellationReversed
                    ? `${updatedReceipt.receiptCode} 반영 입고를 취소하고 현재고를 원복했습니다.`
                    : (receipt.status === "reopened"
                        ? `${updatedReceipt.receiptCode} 재작업 입고건을 완전히 취소했습니다.`
                        : `${updatedReceipt.receiptCode} 입고 예정 건을 취소했습니다.`),
                "success",
            );
        }
    } catch (error) {
        console.error("입고 취소 처리에 실패했습니다.", error);
        receivingActionPending = false;
        renderReceivingDetail();
        if (error?.code === "receiving/insufficient-stock") {
            setReceivingDetailStatus("입고 후 사용된 재고가 있어 취소할 수 없습니다. 재고조정을 이용해주세요.");
        } else if (error?.code === "receiving/already-processed") {
            setReceivingDetailStatus("다른 화면에서 이미 처리된 입고 건입니다.");
        } else if (error?.code === "receiving/stale-detail") {
            setReceivingDetailStatus("입고 상세 내역이 변경되었습니다. 상세 화면을 닫고 다시 열어주세요.");
        } else {
            setReceivingDetailStatus("입고 취소 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }
    }
}

async function loadInventoryReceipts(userId) {
    if (!userId) return;
    try {
        const savedRows = await loadCloudRows(userId, INVENTORY_RECEIPT_COLLECTION);
        inventoryReceipts = (savedRows ?? [])
            .map(normalizeInventoryReceipt)
            .sort(compareInventoryReceiptsDesc);
        renderReceivingPage({ force: isCurrentDashboardView("receiving") });
        setReceivingPageStatus(
            inventoryReceipts.length
                ? `저장된 입고 ${formatMilkrunNumber(inventoryReceipts.length)}건을 불러왔습니다.`
                : "입고 예정 건을 등록해 재고 반영 일정을 관리하세요.",
            "info",
        );
    } catch (error) {
        console.error("입고 목록을 불러오지 못했습니다.", error);
        inventoryReceipts = [];
        renderReceivingPage({ force: isCurrentDashboardView("receiving") });
        setReceivingPageStatus(
            error?.code === "permission-denied"
                ? "입고 관리 조회 권한이 없습니다."
                : "입고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
            "error",
        );
    }
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

    const workspaceRows = milkrunWorkspaces.map((workspace) => {
        const rows = Array.isArray(workspace.rows) ? workspace.rows : [];
        const centerCount = new Set(rows.map((row) => row.assignedCenter || row.originalCenter).filter(Boolean)).size;
        const boxCount = rows.reduce((sum, row) => sum + (Number(row.boxCount) || 0), 0);
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
                    aria-label="${escapeHtml(workspace.title || workspace.id)} 밀크런 작업 열기"
                >
                    <span class="milkrun-session-title" title="${escapeHtml(workspace.title || workspace.id)}">${escapeHtml(workspace.title || workspace.id)}</span>
                    <span class="milkrun-session-cell" data-label="발주">${formatMilkrunNumber(rows.length)}건</span>
                    <span class="milkrun-session-cell" data-label="박스">${formatMilkrunNumber(boxCount, 2)}BOX</span>
                    <span class="milkrun-session-cell" data-label="센터">${formatMilkrunNumber(centerCount)}개</span>
                    <span class="milkrun-session-cell milkrun-session-updated" data-label="업데이트">${updatedAt ? escapeHtml(updatedAt) : "-"}</span>
                    <span class="milkrun-session-open" aria-hidden="true">열기</span>
                </button>
            </article>
        `;
    }).join("");

    milkrunSessionListEl.innerHTML = `
        <div class="milkrun-session-table-head" aria-hidden="true">
            <span>선택</span>
            <span>발주서명</span>
            <span>발주</span>
            <span>박스</span>
            <span>센터</span>
            <span>업데이트</span>
            <span>관리</span>
        </div>
        ${workspaceRows}
    `;
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

async function handleDeleteSelectedMilkrunWorkspaces() {
    syncSelectedMilkrunWorkspaceIds();
    const selectedCount = selectedMilkrunWorkspaceIds.size;
    if (!selectedCount) {
        window.alert("삭제할 쿠팡 발주서를 먼저 선택해주세요.");
        return;
    }

    const message = [
        `선택한 쿠팡 발주서 ${selectedCount}개를 삭제할까요?`,
        "",
        "해당 발주서와 관련된 주문은 모두 삭제됩니다.",
        "주문에서 자동 반영된 CRM 데이터도 함께 삭제됩니다.",
        "별도로 업로드한 CRM 과거 데이터와 상품 매칭 규칙은 유지됩니다.",
    ].join("\n");
    if (!window.confirm(message)) return;

    const selectedIds = new Set(selectedMilkrunWorkspaceIds);
    const selectedWorkspaces = milkrunWorkspaces.filter((workspace) => selectedIds.has(workspace.id));
    const deleteResult = await deleteManagedOrdersForDerivedWorkspaces("coupang", selectedWorkspaces);
    if (deleteResult.aborted) return;
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
    await persistSkuWorkspace();

    if (orderManagementStatusEl) {
        const resultParts = [`쿠팡 발주서 ${selectedCount}개를 삭제했습니다.`];
        if (deleteResult.orderCount) {
            resultParts.push(`관련 주문 ${formatMilkrunNumber(deleteResult.orderCount)}건도 삭제했습니다.`);
        }
        if (deleteResult.crmCount) {
            resultParts.push(`CRM 자동 반영 데이터 ${formatMilkrunNumber(deleteResult.crmCount)}건도 정리했습니다.`);
        }
        if (deleteResult.crmDeleteFailed) {
            resultParts.push("CRM 데이터 정리는 다시 확인해주세요.");
        }
        orderManagementStatusEl.textContent = resultParts.join(" ");
    }
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
    if (
        currentDashboardViewName === "receiving"
        && viewName !== "receiving"
        && (receivingSaving || receivingActionPending)
    ) {
        setReceivingPageStatus("입고 처리가 끝날 때까지 잠시 기다려주세요.", "warning");
        return;
    }
    const paidOnlyViewNames = {
        tracking: "송장 조회",
        "kurly-label": "컬리 라벨 생성",
        "coupang-milkrun": "쿠팡 밀크런",
    };
    if (paidOnlyViewNames[viewName] && !hasPaidFeatureAccess()) {
        showPaidAccessRequiredMessage(paidOnlyViewNames[viewName]);
        viewName = "home";
    }
    currentDashboardViewName = viewName;
    if (viewName !== "sku") {
        closeSkuCategoryPicker({ restoreFocus: false });
    }
    if (viewName !== "inventory-ledger") {
        closeInventoryEntryModal();
    }
    if (viewName !== "receiving") {
        closeReceivingModals();
    }

    topLevelNavButtons.forEach((button) => {
        const isHome = viewName === "home" && button.dataset.view === "home";
        const isSettings = viewName === "settings" && button.dataset.view === "settings";
        button.classList.toggle("is-active", isHome || isSettings);
    });

    subNavButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.view === viewName);
    });
    navGroupEls.forEach((groupEl) => {
        groupEl.classList.toggle("has-active", Boolean(groupEl.querySelector(".sidebar-subnav-item.is-active")));
    });

    views.forEach((view) => {
        view.classList.toggle("is-visible", view.id === `view-${viewName}`);
    });

    openSidebarNavGroupForView(viewName);

    const meta = viewMeta[viewName];
    if (meta) {
        viewTitleEl.textContent = meta.title;
        viewSubtitleEl.textContent = meta.subtitle;
    }

    if (headerActionsEl) {
        headerActionsEl.hidden = viewName !== "home";
    }

    if (viewName === "order-upload") {
        renderOrderMatchPanel({ force: true });
    } else if (viewName === "upload-history") {
        renderUploadHistory();
    } else if (viewName === "order-management") {
        renderOrderManagement({ force: true });
    } else if (viewName === "crm") {
        renderCrmDashboard({ force: true });
    } else if (viewName === "sku" && skuRows.length) {
        renderCurrentSkuRows({ force: true });
    } else if (viewName === "inventory-ledger") {
        renderInventoryLedger({ force: true });
    } else if (viewName === "receiving") {
        renderReceivingPage({ force: true });
    } else if (viewName === "settings") {
        void ensureInventoryAllocationPolicyLoaded();
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
        renderSkuTypeTabs();
        closeSkuEditModal();
        updateSelectedFileName(null, skuFileNameEl);
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 파일이 없습니다.");
        renderOrderMatchPanel();
        return;
    }

    let uploadStage = "엑셀 파일 읽기";
    const refreshWarnings = [];
    const runPostUploadRefresh = (label, refresh) => {
        try {
            refresh();
        } catch (error) {
            console.error("SKU 업로드 후 " + label + " 갱신에 실패했습니다.", error);
            refreshWarnings.push(label);
        }
    };

    try {
        uploadStage = "엑셀 파일 읽기";
        const parsedRows = await parseSkuFile(file, {
            customHeaderAliases: buildSkuCustomHeaderAliases(),
        });
        uploadStage = "SKU 데이터 검증";
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

        uploadStage = "기존 SKU와 병합";
        const mergeResult = mergeSkuRowsFromUpload(skuRows, parsedRows);
        const mergedValidationResult = validateSkuRows(mergeResult.rows);

        if (mergedValidationResult.summary.invalid > 0) {
            setSkuResult(`SKU 병합 실패: 병합 후 오류 ${mergedValidationResult.summary.invalid}건`);
            window.alert(buildSkuUploadErrorMessage(mergedValidationResult.rows));
            return;
        }

        skuRows = mergeResult.rows;
        skuWorkspaceLoaded = true;
        syncSkuCategoryOptionsFromRows();
        selectedSkuRowIds = new Set();
        resetSkuSearchAndSort({ render: false });
        closeSkuEditModal();
        updateSelectedFileName(file, skuFileNameEl);
        // 주문 매칭/밀크런 화면은 SKU 저장의 부가 갱신입니다. 저장 자체가 성공했는데
        // 이전 작업판 데이터 문제로 전체 업로드가 실패하지 않도록 각각 안전하게 처리합니다.
        uploadStage = "SKU 화면 반영";
        runPostUploadRefresh("SKU 화면", () => renderCurrentSkuRows());
        runPostUploadRefresh("주문 매칭", () => renderOrderMatchPanel());
        runPostUploadRefresh("주문상품 연결", () => standardizeOrderManagementRows({ persist: true, render: true }));
        runPostUploadRefresh("밀크런 작업판", () => rebuildMilkrunWorkspacesFromSkuData({ persist: false }));

        uploadStage = "서버 저장";
        const saved = await persistSkuWorkspace();
        if (!saved) {
            throw new Error("SKU 데이터를 서버에 저장하지 못했습니다. 네트워크 연결과 저장 권한을 확인한 뒤 다시 시도해주세요.");
        }

        const completedMessage = "SKU 병합 완료: 신규 " + formatMilkrunNumber(mergeResult.addedCount)
            + "건 · 업데이트 " + formatMilkrunNumber(mergeResult.updatedCount)
            + "건 · 전체 " + formatMilkrunNumber(skuRows.length) + "건";
        setSkuResult(
            refreshWarnings.length
                ? completedMessage + "\n일부 연결 화면(" + refreshWarnings.join(", ") + ") 갱신이 지연되었습니다. 화면을 새로고침하면 다시 반영됩니다."
                : completedMessage,
        );
    } catch (error) {
        console.error(error);
        if (!skuRows.length) {
            setSkuEmptyTable("파일을 불러오지 못했습니다.");
        }
        const failureMessage = String(error?.message || "알 수 없는 오류가 발생했습니다.").trim();
        setSkuResult("SKU 업로드 실패 (" + uploadStage + "): " + failureMessage);
        window.alert("SKU 파일을 업로드할 수 없습니다.\n\n실패 단계: " + uploadStage + "\n사유: " + failureMessage);
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

    navGroupToggleEls.forEach((toggleEl) => {
        toggleEl.addEventListener("click", () => {
            const groupEl = toggleEl.closest(".sidebar-nav-group");
            if (!(groupEl instanceof HTMLElement)) return;
            const isOpen = groupEl.classList.contains("is-open");
            setSidebarNavGroupOpenState(groupEl, !isOpen);
        });
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
    const debouncedOrderMatchDeleteSearch = createDebouncedHandler(renderOrderMatchDeleteList, 180);
    const debouncedOrderManagementSearch = createDebouncedHandler(handleOrderManagementFilterChange, 180);
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
    customerKeySaveBtn?.addEventListener("click", () => {
        void handleSaveCustomerKeySettings();
    });
    customerKeyUnlockBtn?.addEventListener("click", () => {
        void handleUnlockCustomerKeySettings();
    });
    customerKeyLockBtn?.addEventListener("click", handleLockCustomerKeySettings);
    customerKeyRevealBtn?.addEventListener("click", openCustomerKeyRevealPrompt);
    customerKeyRevealConfirmBtn?.addEventListener("click", () => {
        void handleRevealCustomerKeyPrefix();
    });
    customerKeyAccountPasswordInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void handleRevealCustomerKeyPrefix();
    });
    customerKeySecretInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (hasCustomerKeySettings()) {
            void handleUnlockCustomerKeySettings();
        } else {
            customerKeySecretConfirmInput?.focus();
        }
    });
    customerKeySecretConfirmInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        void handleSaveCustomerKeySettings();
    });
    inventoryAllocationPrioritySelects.forEach((select) => {
        select?.addEventListener("change", handleInventoryAllocationPriorityChange);
    });
    inventoryAllocationUndatedPolicySelect?.addEventListener(
        "change",
        handleInventoryAllocationPolicyControlChange,
    );
    inventoryAllocationLotSplitInput?.addEventListener(
        "change",
        handleInventoryAllocationPolicyControlChange,
    );
    inventoryAllocationSaveBtn?.addEventListener("click", () => {
        void handleSaveInventoryAllocationPolicy();
    });
    inventoryAllocationResetBtn?.addEventListener("click", handleResetInventoryAllocationPolicy);
    skuCategoryLabelSaveBtn?.addEventListener("click", () => {
        void handleSaveSkuCategoryLabels();
    });
    skuCategoryLabelResetBtn?.addEventListener("click", () => {
        void handleResetSkuCategoryLabels();
    });
    skuCategoryLabelInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void handleSaveSkuCategoryLabels();
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
    skuFileInput?.addEventListener("change", async () => {
        const file = skuFileInput.files?.[0];
        await setSkuFileSelectedState(file);
    });
    inventoryOpeningOpenBtn?.addEventListener("click", () => {
        openInventoryEntryModal("opening");
    });
    inventoryAdjustmentOpenBtn?.addEventListener("click", () => {
        openInventoryEntryModal("adjustment");
    });
    inventoryViewTabsEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tab = target.closest("[data-inventory-view-tab]");
        if (!(tab instanceof HTMLButtonElement)) return;
        activateInventoryView(tab.dataset.inventoryViewTab || "stock");
    });
    inventoryViewTabsEl?.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...inventoryViewTabsEl.querySelectorAll("[data-inventory-view-tab]")]
            .filter((tab) => tab instanceof HTMLButtonElement);
        const currentTab = event.target instanceof HTMLElement
            ? event.target.closest("[data-inventory-view-tab]")
            : null;
        const currentIndex = tabs.indexOf(currentTab);
        if (currentIndex < 0 || !tabs.length) return;
        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        const nextTab = tabs[nextIndex];
        nextTab.focus();
        activateInventoryView(nextTab.dataset.inventoryViewTab || "stock");
    });
    document.querySelectorAll("[data-inventory-sort-view][data-inventory-sort-key]")
        .forEach((button) => {
            if (!(button instanceof HTMLButtonElement)) return;
            button.addEventListener("click", () => {
                toggleInventorySort(
                    button.dataset.inventorySortView || "",
                    button.dataset.inventorySortKey || "",
                );
            });
        });
    inventoryLedgerViewEl?.addEventListener("pointerdown", handleInventoryColumnResizePointerDown);
    inventoryLedgerViewEl?.addEventListener("pointermove", handleInventoryColumnResizePointerMove);
    inventoryLedgerViewEl?.addEventListener("pointerup", finishInventoryColumnResize);
    inventoryLedgerViewEl?.addEventListener("pointercancel", finishInventoryColumnResize);
    inventoryLedgerViewEl?.addEventListener("dblclick", handleInventoryColumnResizeDoubleClick);
    inventoryLedgerViewEl?.addEventListener("keydown", handleInventoryColumnResizeKeyDown);
    const handleInventoryStockFilterChange = () => {
        syncInventoryFiltersFromControls("stock");
        invalidateInventoryViewSearch("stock");
    };
    inventoryStockSearchInput?.addEventListener("input", handleInventoryStockFilterChange);
    inventoryStockTypeFilter?.addEventListener("change", handleInventoryStockFilterChange);
    inventoryStockStateFilter?.addEventListener("change", handleInventoryStockFilterChange);
    inventoryStockFilterResetBtn?.addEventListener("click", () => {
        inventoryStockFilters = {
            query: "",
            skuType: "all",
            stockState: "active",
        };
        resetInventorySort("stock");
        syncInventoryStockFilterControls();
        invalidateInventoryViewSearch("stock");
    });
    inventoryStockSearchBtn?.addEventListener("click", () => {
        void searchInventoryView("stock");
    });

    const handleInventoryLotFilterChange = () => {
        syncInventoryFiltersFromControls("lot");
        invalidateInventoryViewSearch("lot");
    };
    inventoryLotSearchInput?.addEventListener("input", handleInventoryLotFilterChange);
    inventoryLotExpiryFilter?.addEventListener("change", handleInventoryLotFilterChange);
    inventoryLotStockFilter?.addEventListener("change", handleInventoryLotFilterChange);
    inventoryLotFilterResetBtn?.addEventListener("click", () => {
        inventoryLotFilters = {
            query: "",
            expiryState: "all",
            stockState: "available",
        };
        resetInventorySort("lot");
        syncInventoryLotFilterControls();
        invalidateInventoryViewSearch("lot");
    });
    inventoryLotSearchBtn?.addEventListener("click", () => {
        void searchInventoryView("lot");
    });

    const handleInventoryLedgerFilterChange = () => {
        syncInventoryFiltersFromControls("ledger");
        invalidateInventoryViewSearch("ledger");
    };
    inventoryLedgerSearchInput?.addEventListener("input", handleInventoryLedgerFilterChange);
    inventoryLedgerTypeFilter?.addEventListener("change", handleInventoryLedgerFilterChange);
    inventoryLedgerPeriodFilter?.addEventListener("change", handleInventoryLedgerFilterChange);
    inventoryLedgerFilterResetBtn?.addEventListener("click", () => {
        inventoryLedgerFilters = {
            query: "",
            transactionType: "all",
            period: "30",
        };
        resetInventorySort("ledger");
        syncInventoryLedgerFilterControls();
        invalidateInventoryViewSearch("ledger");
    });
    inventoryLedgerSearchBtn?.addEventListener("click", () => {
        void searchInventoryView("ledger");
    });

    [
        [inventoryStockSearchInput, "stock"],
        [inventoryLotSearchInput, "lot"],
        [inventoryLedgerSearchInput, "ledger"],
    ].forEach(([input, viewName]) => {
        input?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" || event.isComposing) return;
            event.preventDefault();
            void searchInventoryView(viewName);
        });
    });
    inventoryStockBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const goSkuButton = target.closest("[data-inventory-go-sku]");
        if (goSkuButton) {
            showView("sku");
            return;
        }
        const adjustmentButton = target.closest("[data-inventory-adjust-sku]");
        if (!(adjustmentButton instanceof HTMLButtonElement)) return;
        openInventoryStorageModal(
            adjustmentButton.getAttribute("data-inventory-adjust-sku") || "",
            "",
            adjustmentButton,
        );
    });
    inventoryLotBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const adjustmentButton = target.closest("[data-inventory-adjust-storage]");
        if (!(adjustmentButton instanceof HTMLButtonElement)) return;
        openInventoryStorageModal(
            adjustmentButton.getAttribute("data-inventory-adjust-storage") || "",
            adjustmentButton.getAttribute("data-inventory-adjust-lot-key") || "",
            adjustmentButton,
        );
    });
    inventoryEntrySkuSearchInput?.addEventListener("input", renderInventorySkuSearchResults);
    inventoryEntrySkuResultsEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest("[data-inventory-select-sku]");
        if (!(button instanceof HTMLButtonElement) || button.disabled) return;
        selectInventorySku(button.getAttribute("data-inventory-select-sku") || "");
    });
    inventoryEntryQuantityInput?.addEventListener("input", () => {
        setInventoryEntryStatus("");
        renderInventoryEntryPreview();
    });
    inventoryEntryDateInput?.addEventListener("change", () => {
        setInventoryEntryStatus("");
    });
    inventoryAdjustmentDirectionInputs.forEach((input) => {
        input.addEventListener("change", () => {
            setInventoryEntryStatus("");
            syncInventoryDirectionControl();
        });
    });
    inventoryEntryCloseBtn?.addEventListener("click", closeInventoryEntryModal);
    inventoryEntryCancelBtn?.addEventListener("click", closeInventoryEntryModal);
    inventoryEntrySaveBtn?.addEventListener("click", () => {
        void saveInventoryEntry();
    });
    inventoryEntryModal?.addEventListener("click", (event) => {
        if (event.target === inventoryEntryModal) closeInventoryEntryModal();
    });
    inventoryStorageRowsEl?.addEventListener("input", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        const rowEl = input.closest("[data-inventory-storage-row-id]");
        const field = input.getAttribute("data-inventory-storage-field") || "";
        const row = inventoryStorageDraftRows.find(
            (item) => item.draftId === rowEl?.getAttribute("data-inventory-storage-row-id"),
        );
        if (!row || !["lotNo", "expiryDate", "location", "palletNo", "quantity"].includes(field)) return;
        row[field] = field === "expiryDate"
            ? formatReceivingExpiryInputElement(input)
            : input.value;
        setInventoryStorageStatus("");
        renderInventoryStoragePreview();
    });
    inventoryStorageRowsEl?.addEventListener("keydown", (event) => {
        handleReceivingExpiryBackspace(event);
    });
    inventoryStorageRowsEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const cloneButton = target.closest("[data-inventory-storage-clone]");
        if (cloneButton instanceof HTMLButtonElement) {
            const source = inventoryStorageDraftRows.find(
                (row) => row.draftId === cloneButton.getAttribute("data-inventory-storage-clone"),
            );
            if (!source) return;
            const nextRow = createInventoryStorageDraftRow({ ...source, quantity: 1 });
            const sourceIndex = inventoryStorageDraftRows.indexOf(source);
            inventoryStorageDraftRows.splice(sourceIndex + 1, 0, nextRow);
            setInventoryStorageStatus("복제한 행의 보관정보와 수량을 수정해주세요.", "success");
            renderInventoryStorageRows();
            window.setTimeout(() => {
                inventoryStorageRowsEl
                    ?.querySelector(`[data-inventory-storage-row-id="${nextRow.draftId}"] [data-inventory-storage-field="location"]`)
                    ?.focus();
            }, 0);
            return;
        }
        const removeButton = target.closest("[data-inventory-storage-remove]");
        if (!(removeButton instanceof HTMLButtonElement)) return;
        const rowId = removeButton.getAttribute("data-inventory-storage-remove") || "";
        inventoryStorageDraftRows = inventoryStorageDraftRows.filter((row) => row.draftId !== rowId);
        setInventoryStorageStatus("");
        renderInventoryStorageRows();
    });
    inventoryStorageAddRowBtn?.addEventListener("click", () => {
        const nextRow = createInventoryStorageDraftRow({ quantity: 1 });
        inventoryStorageDraftRows.push(nextRow);
        setInventoryStorageStatus("새 행의 보관정보와 수량을 입력해주세요.", "success");
        renderInventoryStorageRows();
        window.setTimeout(() => {
            inventoryStorageRowsEl
                ?.querySelector(`[data-inventory-storage-row-id="${nextRow.draftId}"] [data-inventory-storage-field="lotNo"]`)
                ?.focus();
        }, 0);
    });
    inventoryStorageReasonSelect?.addEventListener("change", () => {
        setInventoryStorageStatus("");
        renderInventoryStoragePreview();
    });
    inventoryStorageDateInput?.addEventListener("change", () => setInventoryStorageStatus(""));
    inventoryStorageMemoInput?.addEventListener("input", () => setInventoryStorageStatus(""));
    inventoryStorageCloseBtn?.addEventListener("click", () => closeInventoryStorageModal());
    inventoryStorageCancelBtn?.addEventListener("click", () => closeInventoryStorageModal());
    inventoryStorageSaveBtn?.addEventListener("click", () => {
        void saveInventoryStorageAdjustment();
    });
    inventoryStorageModal?.addEventListener("click", (event) => {
        if (event.target === inventoryStorageModal) closeInventoryStorageModal();
    });
    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape"
            && inventoryStorageModal
            && !inventoryStorageModal.classList.contains("is-hidden")
        ) {
            closeInventoryStorageModal();
        }
    });
    receivingUploadFileInput?.addEventListener("change", () => {
        const file = receivingUploadFileInput.files?.[0] || null;
        if (file) void handleReceivingUploadFile(file);
    });
    receivingUploadCancelBtn?.addEventListener("click", () => closeReceivingUploadModal());
    receivingUploadSaveBtn?.addEventListener("click", () => {
        void saveReceivingUploadPreview();
    });
    receivingUploadModal?.addEventListener("click", (event) => {
        if (event.target !== receivingUploadModal) return;
        event.preventDefault();
        event.stopPropagation();
    });
    receivingCompletionTemplateBtn?.addEventListener("click", downloadReceivingCompletionTemplate);
    receivingCompletionFileInput?.addEventListener("change", () => {
        const file = receivingCompletionFileInput.files?.[0] || null;
        if (file) void handleReceivingCompletionFile(file);
    });
    receivingCompletionCloseBtn?.addEventListener("click", () => closeReceivingCompletionModal());
    receivingCompletionCancelBtn?.addEventListener("click", () => closeReceivingCompletionModal());
    receivingCompletionApplyBtn?.addEventListener("click", applyReceivingCompletionPreview);
    receivingCompletionModal?.addEventListener("click", (event) => {
        if (event.target !== receivingCompletionModal) return;
        event.preventDefault();
        event.stopPropagation();
    });
    receivingCreateOpenBtn?.addEventListener("click", openReceivingCreateModal);
    const handleReceivingFilterChange = () => {
        receivingFilters = {
            query: receivingSearchInput?.value || "",
            status: receivingStatusFilter?.value || "all",
            period: receivingPeriodFilter?.value || "30",
        };
        renderReceivingList();
    };
    receivingSearchInput?.addEventListener("input", handleReceivingFilterChange);
    receivingStatusFilter?.addEventListener("change", handleReceivingFilterChange);
    receivingPeriodFilter?.addEventListener("change", handleReceivingFilterChange);
    receivingFilterResetBtn?.addEventListener("click", () => {
        receivingFilters = {
            query: "",
            status: "all",
            period: "30",
        };
        syncReceivingFilterControls();
        renderReceivingList();
    });
    receivingListBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const detailButton = target.closest("[data-receiving-detail-id]");
        if (!(detailButton instanceof HTMLButtonElement)) return;
        openReceivingDetail(detailButton.getAttribute("data-receiving-detail-id") || "");
    });
    receivingSkuSearchInput?.addEventListener("input", renderReceivingSkuSearchResults);
    receivingSkuSearchResultsEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const addButton = target.closest("[data-receiving-add-sku]");
        if (!(addButton instanceof HTMLButtonElement) || addButton.disabled) return;
        addReceivingDraftSku(addButton.getAttribute("data-receiving-add-sku") || "");
    });
    receivingItemsBodyEl?.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const skuKey = target.getAttribute("data-receiving-item-quantity") || "";
        if (!skuKey) return;
        const item = receivingDraftItems.find((row) => row.skuKey === skuKey);
        if (!item) return;
        item.quantity = Math.max(0, Math.trunc(Number(target.value) || 0));
        setReceivingCreateStatus("");
        const totals = getReceivingDraftTotals();
        if (receivingItemsSummaryEl) {
            receivingItemsSummaryEl.textContent = `${formatMilkrunNumber(totals.itemCount)}개 SKU · 총 ${formatMilkrunNumber(totals.totalQuantity)}개`;
        }
    });
    receivingItemsBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const removeButton = target.closest("[data-receiving-remove-sku]");
        if (!(removeButton instanceof HTMLButtonElement)) return;
        const skuKey = removeButton.getAttribute("data-receiving-remove-sku") || "";
        const item = receivingDraftItems.find((row) => row.skuKey === skuKey);
        const hasReceivingInput = Boolean(
            item?.allocations?.some((allocation) => isReceivingAllocationStarted(allocation)),
        );
        if (
            receivingEditReceiptId
            && hasReceivingInput
            && !window.confirm("이 SKU에 입력한 PLT·LOT·유통기한·로케이션·실입고수량도 함께 삭제됩니다. 품목을 삭제할까요?")
        ) {
            return;
        }
        receivingDraftItems = receivingDraftItems.filter((item) => item.skuKey !== skuKey);
        setReceivingCreateStatus("");
        renderReceivingSkuSearchResults();
        renderReceivingDraftItems();
    });
    receivingCreateCancelBtn?.addEventListener("click", closeReceivingCreateModal);
    receivingCreateSaveBtn?.addEventListener("click", () => {
        void saveInventoryReceiptDraft();
    });
    receivingCreateModal?.addEventListener("click", (event) => {
        if (event.target !== receivingCreateModal) return;
        event.preventDefault();
        event.stopPropagation();
    });
    receivingDetailBarcodeInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleReceivingBarcodeScan();
    });
    receivingDetailBarcodeSubmitBtn?.addEventListener("click", handleReceivingBarcodeScan);
    receivingScanProductPanelEl?.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !receivingScanDraft) return;
        const field = target.getAttribute("data-receiving-scan-field") || "";
        const allocationId = target.getAttribute("data-receiving-scan-allocation-id") || "";
        const allocation = receivingScanDraft.allocations?.find(
            (row) => row.allocationId === allocationId,
        );
        if (!field || !allocation) return;
        allocation[field] = field === "quantity"
            ? Math.max(0, Math.trunc(Number(target.value) || 0))
            : (field === "expiryDate"
                ? formatReceivingExpiryInputElement(target)
                : target.value);
        setReceivingScanFeedback(
            "입고정보 입력 중입니다. 모두 입력한 뒤 ‘이 상품 입력 완료’를 눌러주세요.",
            "info",
        );
    });
    receivingScanProductPanelEl?.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (handleReceivingExpiryBackspace(event)) return;
        if (event.key !== "Enter") return;
        const field = target.getAttribute("data-receiving-scan-field") || "";
        const allocationId = target.getAttribute("data-receiving-scan-allocation-id") || "";
        const fieldOrder = ["palletNo", "lotNo", "expiryDate", "location", "quantity"];
        const fieldIndex = fieldOrder.indexOf(field);
        const allocationIndex = receivingScanDraft?.allocations?.findIndex(
            (row) => row.allocationId === allocationId,
        ) ?? -1;
        if (fieldIndex < 0 || allocationIndex < 0) return;
        event.preventDefault();
        if (fieldIndex < fieldOrder.length - 1) {
            focusReceivingScanField(fieldOrder[fieldIndex + 1], allocationId);
            return;
        }
        const nextAllocation = receivingScanDraft.allocations[allocationIndex + 1];
        if (nextAllocation) {
            focusReceivingScanField("palletNo", nextAllocation.allocationId);
        } else {
            completeReceivingScanEntry();
        }
    });
    receivingScanProductPanelEl?.addEventListener("submit", (event) => {
        event.preventDefault();
        completeReceivingScanEntry();
    });
    receivingScanProductPanelEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const cancelButton = target.closest("[data-receiving-scan-cancel]");
        if (cancelButton instanceof HTMLButtonElement) {
            cancelReceivingScanEntry();
            return;
        }
        const addButton = target.closest("[data-receiving-scan-add-row]");
        if (addButton instanceof HTMLButtonElement && receivingScanDraft) {
            if (receivingScanDraft.allocations.length >= 20) {
                setReceivingScanFeedback("한 상품에는 최대 20개 입고 행까지 추가할 수 있습니다.", "warning");
                return;
            }
            const allocation = buildReceivingAllocationDraft();
            receivingScanDraft.allocations.push(allocation);
            setReceivingScanFeedback(
                `${formatMilkrunNumber(receivingScanDraft.allocations.length)}번째 입고 행을 추가했습니다.`,
                "info",
            );
            renderReceivingScanWorkspace();
            focusReceivingScanField("palletNo", allocation.allocationId);
            return;
        }
        const removeButton = target.closest("[data-receiving-scan-remove-row]");
        if (!(removeButton instanceof HTMLButtonElement) || !receivingScanDraft) return;
        const allocationId = removeButton.getAttribute("data-receiving-scan-remove-row") || "";
        if (receivingScanDraft.allocations.length <= 1) return;
        receivingScanDraft.allocations = receivingScanDraft.allocations.filter(
            (allocation) => allocation.allocationId !== allocationId,
        );
        setReceivingScanFeedback(
            `입고 행을 삭제했습니다. 현재 ${formatMilkrunNumber(receivingScanDraft.allocations.length)}개 행입니다.`,
            "info",
        );
        renderReceivingScanWorkspace();
        const lastAllocation = receivingScanDraft.allocations.at(-1);
        if (lastAllocation) focusReceivingScanField("palletNo", lastAllocation.allocationId);
    });
    receivingDetailItemsBodyEl?.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const receipt = getSelectedInventoryReceipt();
        if (
            !receipt
            || !isInventoryReceiptEditableStatus(receipt.status)
        ) return;

        const discrepancyLineId = target.getAttribute("data-receiving-discrepancy-reason") || "";
        if (discrepancyLineId) {
            const item = receivingDetailDraftItems.find((row) => row.lineId === discrepancyLineId);
            if (!item) return;
            item.discrepancyReason = target.value;
            receivingDetailDirty = true;
            setReceivingDetailStatus("");
            syncReceivingDetailProgressUi();
            return;
        }

        const lineId = target.getAttribute("data-receiving-detail-line") || "";
        const allocationId = target.getAttribute("data-receiving-allocation-id") || "";
        const field = target.getAttribute("data-receiving-allocation-field") || "";
        if (!lineId || !allocationId || !field) return;
        const item = receivingDetailDraftItems.find((row) => row.lineId === lineId);
        const allocation = item?.allocations?.find((row) => row.allocationId === allocationId);
        if (!item || !allocation) return;

        allocation[field] = field === "quantity"
            ? Math.max(0, Math.trunc(Number(target.value) || 0))
            : (field === "expiryDate"
                ? formatReceivingExpiryInputElement(target)
                : target.value);
        receivingDetailDirty = true;
        setReceivingDetailStatus("");
        syncReceivingDetailProgressUi();
    });
    receivingDetailItemsBodyEl?.addEventListener("keydown", (event) => {
        handleReceivingExpiryBackspace(event);
    });
    receivingDetailItemsBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const receipt = getSelectedInventoryReceipt();
        if (
            !receipt
            || !isInventoryReceiptEditableStatus(receipt.status)
        ) return;

        const addButton = target.closest("[data-receiving-add-allocation]");
        if (addButton instanceof HTMLButtonElement) {
            const lineId = addButton.getAttribute("data-receiving-add-allocation") || "";
            const item = receivingDetailDraftItems.find((row) => row.lineId === lineId);
            if (!item) return;
            item.allocations.push(buildReceivingAllocationDraft());
            receivingDetailDirty = true;
            renderReceivingDetail();
            return;
        }

        const removeButton = target.closest("[data-receiving-remove-allocation]");
        if (!(removeButton instanceof HTMLButtonElement)) return;
        const lineId = removeButton.getAttribute("data-receiving-detail-line") || "";
        const allocationId = removeButton.getAttribute("data-receiving-remove-allocation") || "";
        const item = receivingDetailDraftItems.find((row) => row.lineId === lineId);
        if (!item) return;
        item.allocations = item.allocations.filter((row) => row.allocationId !== allocationId);
        if (!item.allocations.length) item.allocations.push(buildReceivingAllocationDraft());
        receivingDetailDirty = true;
        renderReceivingDetail();
    });
    receivingDetailCloseBtn?.addEventListener("click", closeReceivingDetailModal);
    receivingDetailCloseActionBtn?.addEventListener("click", closeReceivingDetailModal);
    receivingDetailEditPlannedBtn?.addEventListener("click", openReceivingEditModal);
    receivingDetailModal?.addEventListener("click", (event) => {
        if (event.target !== receivingDetailModal) return;
        event.preventDefault();
        event.stopPropagation();
    });
    receivingDetailSaveBtn?.addEventListener("click", () => {
        void saveReceivingDetailDraft();
    });
    receivingDetailPartialBtn?.addEventListener("click", () => {
        const receipt = getSelectedInventoryReceipt();
        if (!receipt) return;
        const validation = validateReceivingCompletionDraft(receivingDetailDraftItems, {
            finalize: false,
        });
        if (!validation.isValid) {
            setReceivingDetailStatus(validation.errors[0] || "입고 내용을 확인해주세요.");
            return;
        }
        const confirmed = window.confirm(
            [
                `현재 입력한 ${formatMilkrunNumber(validation.unpostedTotalQuantity)}개를 재고에 반영할까요?`,
                "수량이 일치한 SKU는 완료되고, 부족·미입고 SKU는 부분 입고 상태로 계속 입력할 수 있습니다.",
            ].join("\n"),
        );
        if (confirmed) {
            void completeInventoryReceipt(receipt.id, validation.items, { finalize: false });
        }
    });
    receivingDetailCompleteBtn?.addEventListener("click", () => {
        const receipt = getSelectedInventoryReceipt();
        if (!receipt) return;
        const validation = validateReceivingCompletionDraft();
        if (!validation.isValid) {
            setReceivingDetailStatus(validation.errors[0] || "입고 내용을 확인해주세요.");
            return;
        }
        const varianceText = validation.progress.varianceQuantity === 0
            ? "수량 일치"
            : `${validation.progress.varianceQuantity > 0 ? "+" : "-"}${formatMilkrunNumber(Math.abs(validation.progress.varianceQuantity))}개`;
        const confirmed = window.confirm(
            [
                receipt.status === "reopened"
                    ? `${receipt.receiptCode} 입고를 다시 완료할까요?`
                    : `${receipt.receiptCode} 입고를 완료할까요?`,
                `예정 ${formatMilkrunNumber(validation.progress.plannedTotalQuantity)}개 · 실입고 ${formatMilkrunNumber(validation.progress.receivedTotalQuantity)}개 · 차이 ${varianceText}`,
                validation.progress.mismatchItemCount > 0
                    ? `수량 차이 SKU ${formatMilkrunNumber(validation.progress.mismatchItemCount)}개가 있습니다. 실입고수량만 현재고에 반영됩니다.`
                    : "모든 SKU의 수량이 일치합니다.",
            ].join("\n"),
        );
        if (confirmed) void completeInventoryReceipt(receipt.id, validation.items);
    });
    receivingDetailCancelReceiptBtn?.addEventListener("click", () => {
        const receipt = getSelectedInventoryReceipt();
        if (!receipt) return;
        const message = receipt.status === "completed"
            ? [
                `${receipt.receiptCode} 입고 완료를 취소하고 재작업으로 전환할까요?`,
                "반영된 수량은 현재고에서 역분개되며, 입력한 PLT·LOT·유통기한·로케이션·수량은 그대로 보존됩니다.",
                "입고 후 재고가 이미 사용된 경우에는 전환할 수 없습니다.",
            ].join("\n")
            : (receipt.status === "reopened"
                ? [
                    `${receipt.receiptCode} 재작업 입고건을 완전히 취소할까요?`,
                    "추가 재고 차감은 없으며, 취소 후에는 더 이상 수정하거나 다시 완료할 수 없습니다.",
                ].join("\n")
                : (receipt.status === "partial"
                    ? `${receipt.receiptCode} 부분 입고를 취소할까요?\n이미 반영된 수량이 현재고에서 차감되고 취소 수불이 기록됩니다.`
                    : `${receipt.receiptCode} 입고 예정 건을 취소할까요?`));
        if (window.confirm(message)) void cancelInventoryReceipt(receipt.id);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!inventoryEntryModal?.classList.contains("is-hidden")) {
            closeInventoryEntryModal();
        }
        if (!receivingCompletionModal?.classList.contains("is-hidden")) {
            closeReceivingCompletionModal();
            return;
        }
        if (!receivingDetailModal?.classList.contains("is-hidden")) {
            closeReceivingDetailModal();
        }
    });
    crmFileInput?.addEventListener("change", async () => {
        await setCrmFilesSelectedState(crmFileInput.files);
    });
    crmDeleteBtn?.addEventListener("click", () => {
        void handleDeleteCrmData();
    });
    crmPeriodPresetSelect?.addEventListener("change", () => {
        crmPeriodPreset = crmPeriodPresetSelect.value || "all";
        if (crmPeriodPreset === "custom") {
            crmCustomStartDate = crmCustomStartDate || crmRepurchaseAnalytics?.period?.startDate || "";
            crmCustomEndDate = crmCustomEndDate || crmRepurchaseAnalytics?.period?.endDate || "";
        }
        renderCrmDashboard({ force: true });
    });
    const handleCrmCustomPeriodChange = () => {
        crmCustomStartDate = crmPeriodStartInput?.value || "";
        crmCustomEndDate = crmPeriodEndInput?.value || "";
        if (crmPeriodPreset === "custom") renderCrmDashboard({ force: true });
    };
    crmPeriodStartInput?.addEventListener("change", handleCrmCustomPeriodChange);
    crmPeriodEndInput?.addEventListener("change", handleCrmCustomPeriodChange);
    crmCategoryTabsEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tab = target.closest("[data-crm-category-key]");
        if (!(tab instanceof HTMLElement)) return;
        const categoryKey = tab.getAttribute("data-crm-category-key") || "";
        if (!SKU_CATEGORY_FIELD_KEYS.includes(categoryKey)) return;
        crmActiveCategoryKey = categoryKey;
        renderCrmCategoryRetention(crmRepurchaseAnalytics);
    });
    orderUploadChannelAddBtn?.addEventListener("click", handleAddOrderUploadChannel);
    orderUploadChannelInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleAddOrderUploadChannel();
        }
    });
    orderUploadChannelListEl?.addEventListener("change", handleOrderUploadChannelFileChange);
    uploadHistoryRefreshBtn?.addEventListener("click", () => {
        void loadUploadHistory();
    });
    uploadHistoryStatusFilter?.addEventListener("change", handleUploadHistoryFilterChange);
    uploadHistoryChannelFilter?.addEventListener("change", handleUploadHistoryFilterChange);
    uploadHistorySearchInput?.addEventListener("input", handleUploadHistoryFilterChange);
    uploadHistoryClearBtn?.addEventListener("click", () => {
        uploadHistoryFilters = {
            status: "all",
            channel: "all",
            query: "",
        };
        renderUploadHistory();
    });
    uploadHistoryBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const detailButton = target.closest("[data-upload-history-detail]");
        if (!(detailButton instanceof HTMLElement)) return;
        selectedUploadHistoryId = detailButton.getAttribute("data-upload-history-detail") || "";
        renderUploadHistoryDetail();
        uploadHistoryDetailEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    uploadHistoryDetailCloseBtn?.addEventListener("click", closeUploadHistoryDetail);
    uploadHistoryErrorDownloadBtn?.addEventListener("click", downloadSelectedUploadHistoryErrors);
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
        const dataDeleteButton = target.closest("[data-order-upload-channel-data-delete]");
        if (dataDeleteButton instanceof HTMLElement) {
            handleDeleteOrderUploadChannelData(dataDeleteButton.getAttribute("data-order-upload-channel-data-delete") || "");
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
    orderMatchDeleteSearchInput?.addEventListener("input", debouncedOrderMatchDeleteSearch);
    orderMatchDeleteListEl?.addEventListener("click", handleOrderMatchDeleteClick);
    orderMatchDeleteListEl?.addEventListener("change", handleOrderMatchDeleteSelectionChange);
    orderMatchDeleteSelectAllBtn?.addEventListener("click", handleOrderMatchDeleteSelectAll);
    orderMatchDeleteSelectedBtn?.addEventListener("click", handleDeleteSelectedOrderMatches);
    orderMatchDeleteModal?.addEventListener("click", (event) => {
        if (event.target === orderMatchDeleteModal) closeOrderMatchDeleteModal();
    });
    orderManagementChannelFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementOrderStatusFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementAllocationStatusFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementShippingStatusFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementMatchFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementPeriodFilter?.addEventListener("change", handleOrderManagementFilterChange);
    orderManagementSearchInput?.addEventListener("input", debouncedOrderManagementSearch);
    orderManagementClearBtn?.addEventListener("click", () => {
        orderManagementFilters = {
            channel: "all",
            orderStatus: "all",
            allocationStatus: "all",
            shippingStatus: "all",
            match: "all",
            period: "all",
            query: "",
        };
        renderOrderManagement();
    });
    orderManagementSelectAllocationNeededBtn?.addEventListener(
        "click",
        handleSelectOrderManagementAllocationNeeded,
    );
    orderManagementBulkAllocateBtn?.addEventListener("click", () => {
        void handleBulkAllocateOrderManagementRows();
    });
    orderManagementBulkDeleteBtn?.addEventListener("click", () => {
        handleBulkDeleteOrderManagementRows();
    });
    orderManagementDeleteAllBtn?.addEventListener("click", () => {
        handleDeleteAllOrderManagementRows();
    });
    orderManagementSelectAllCheckbox?.addEventListener("change", handleOrderManagementSelectAllChange);
    orderManagementBodyEl?.addEventListener("change", handleOrderManagementSelectionChange);
    orderManagementBodyEl?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const matchButton = target.closest("[data-order-management-match-id]");
        if (matchButton instanceof HTMLElement) {
            openOrderMatchForManagedRow(matchButton.getAttribute("data-order-management-match-id") || "");
            return;
        }
        const deleteButton = target.closest("[data-order-management-delete-id]");
        if (deleteButton instanceof HTMLElement) {
            handleDeleteOrderManagementRow(deleteButton.getAttribute("data-order-management-delete-id") || "");
            return;
        }
        const detailButton = target.closest("[data-order-management-detail-id]");
        if (!(detailButton instanceof HTMLElement)) return;
        openOrderManagementDetail(detailButton.getAttribute("data-order-management-detail-id") || "");
    });
    orderManagementDetailCloseBtn?.addEventListener("click", closeOrderManagementDetail);
    orderManagementDetailCancelBtn?.addEventListener("click", closeOrderManagementDetail);
    orderManagementDetailOrderStatusSelect?.addEventListener("change", syncOrderManagementDetailStateControls);
    orderManagementAllocationBodyEl?.addEventListener("change", handleOrderManagementAllocationInput);
    orderManagementAllocationSearchInput?.addEventListener("input", (event) => {
        orderManagementAllocationSearch = event.target?.value || "";
        renderOrderManagementAllocationEditor({ preserveMessage: true });
    });
    orderManagementAllocationAutoBtn?.addEventListener("click", () => {
        void handleFillOrderManagementAllocationByPolicy();
    });
    orderManagementAllocationReleaseBtn?.addEventListener("click", handleReleaseOrderManagementAllocationDraft);
    orderManagementAllocationSaveBtn?.addEventListener("click", () => {
        void handleSaveOrderManagementAllocation();
    });
    orderManagementDetailDeleteBtn?.addEventListener("click", () => {
        handleDeleteOrderManagementRow(editingOrderManagementId);
    });
    orderManagementDetailSaveBtn?.addEventListener("click", handleSaveOrderManagementDetail);
    orderManagementDetailModal?.addEventListener("click", (event) => {
        if (event.target === orderManagementDetailModal) closeOrderManagementDetail();
    });
    document.addEventListener("click", handleOrderSkuPickerOutsideClick);
    document.addEventListener("scroll", handleOrderSkuPickerViewportChange, true);
    window.addEventListener("resize", handleOrderSkuPickerViewportChange);
    document.addEventListener("click", handleSkuCategoryPickerOutsideClick);
    document.addEventListener("scroll", handleSkuCategoryPickerViewportChange, true);
    window.addEventListener("resize", handleSkuCategoryPickerViewportChange);
    skuTableHead?.addEventListener("change", handleSkuSelectAllChange);
    skuTableBody?.addEventListener("change", handleSkuRowSelectionChange);
    skuTableBody?.addEventListener("click", handleSkuTableClick);
    skuTableBody?.addEventListener("dblclick", handleSkuTableDoubleClick);
    skuTableBody?.addEventListener("focusout", handleSkuInlineFocusOut);
    skuTableBody?.addEventListener("keydown", handleSkuInlineKeyDown);
    skuTableBody?.addEventListener("input", handleSkuInlineInput);

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
    skuSearchInput?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        handleRunSkuSearch();
    });
    skuSearchClearBtn?.addEventListener("click", handleRunSkuSearch);
    skuExportBtn?.addEventListener("click", () => {
        void handleSkuExportDownload();
    });
    skuTypeTabs?.addEventListener("click", handleSkuTypeTabClick);
    skuTypeTabs?.addEventListener("keydown", handleSkuTypeTabKeyDown);
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
    skuTableHead?.addEventListener("pointerdown", handleSkuColumnResizePointerDown);
    skuTableHead?.addEventListener("pointermove", handleSkuColumnResizePointerMove);
    skuTableHead?.addEventListener("pointerup", finishSkuColumnResize);
    skuTableHead?.addEventListener("pointercancel", finishSkuColumnResize);
    skuTableHead?.addEventListener("dblclick", handleSkuColumnResizeDoubleClick);
    skuTableHead?.addEventListener("keydown", handleSkuColumnResizeKeyDown);
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
    skuWorkspaceLoaded = false;
    skuCategoryLabels = { ...SKU_CATEGORY_LABEL_DEFAULTS };
    skuCategoryOptions = [];
    skuColumnWidths = {};
    skuColumnResizeState = null;
    window.clearTimeout(skuColumnWidthPersistTimer);
    document.body.classList.remove("is-sku-column-resizing");
    renderSkuCategoryLabelSettingsUi();
    setSkuCategoryLabelStatus("분류명을 바꾸면 SKU 화면과 업로드 헤더 매칭에 반영됩니다.", "info");
    selectedSkuHeaderKeys = getDefaultSkuHeaderKeys();
    selectedSkuRowIds = new Set();
    editingSkuRowId = null;
    skuExportRunning = false;
    resetSkuSearchAndSort({ render: false });
    updateSelectedFileName(null, skuFileNameEl);
    setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
    setSkuResult("업로드 시 자동 검증되며, 오류가 있으면 업로드되지 않습니다.");
    updateSkuExportButtonState({ rowCount: 0, waitingForSearch: false });
    closeSkuHeaderModal();
    closeSkuEditModal();
    closeSkuLabelPrintModal();
    closeSkuCategoryPicker({ restoreFocus: false });
}

function initializeInventoryLedgerUi() {
    inventoryTransactions = [];
    inventoryBalances = [];
    inventoryAllocations = [];
    inventoryLedgerLoaded = false;
    inventoryActiveView = "stock";
    inventorySearchLoading = false;
    inventoryViewSearchStates = {
        stock: false,
        lot: false,
        ledger: false,
    };
    inventoryLotSnapshotCache = null;
    inventoryStockFilters = {
        query: "",
        skuType: "all",
        stockState: "active",
    };
    inventoryLotFilters = {
        query: "",
        expiryState: "all",
        stockState: "available",
    };
    inventoryLedgerFilters = {
        query: "",
        transactionType: "all",
        period: "30",
    };
    inventorySortStates = createInventorySortStates();
    inventoryColumnWidths = {};
    inventoryColumnResizeState = null;
    window.clearTimeout(inventoryColumnWidthPersistTimer);
    document.body.classList.remove("is-inventory-column-resizing");
    inventoryEntryMode = "opening";
    selectedInventorySkuKey = "";
    inventoryEntrySaving = false;
    selectedInventoryStorageSkuKey = "";
    inventoryStorageBaselineRows = [];
    inventoryStorageDraftRows = [];
    inventoryStorageBaselineRevision = 0;
    inventoryStorageSaving = false;
    initializeInventoryColumnResizeUi();
    syncInventoryStockFilterControls();
    syncInventoryLotFilterControls();
    syncInventoryLedgerFilterControls();
    syncInventorySortHeaders();
    setInventorySearchLoading(false);
    setInventoryEntryActionsEnabled(false);
    closeInventoryEntryModal();
    closeInventoryStorageModal({ force: true });
    renderInventoryLedger();
    setInventoryPageStatus("조회 조건을 선택한 뒤 검색을 눌러 최신 재고 데이터를 확인하세요.", "info");
}

function initializeReceivingUi() {
    inventoryReceipts = [];
    receivingFilters = {
        query: "",
        status: "all",
        period: "30",
    };
    receivingDraftItems = [];
    receivingUploadParsed = null;
    receivingUploadPreview = null;
    receivingUploadSaving = false;
    receivingEditReceiptId = "";
    receivingEditBaselineSignature = "";
    receivingCreateReturnToDetail = false;
    receivingCompletionParsed = null;
    receivingCompletionPreview = null;
    receivingCompletionBusy = false;
    selectedReceivingId = "";
    receivingSaving = false;
    receivingActionPending = false;
    syncReceivingFilterControls();
    closeReceivingModals();
    renderReceivingPage({ force: true });
    setReceivingPageStatus("입고 예정 건을 등록해 재고 반영 일정을 관리하세요.", "info");
}

function initializeOrderUploadUi() {
    orderUploadRows = [];
    invalidateOrderProductCandidateCache();
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

function initializeUploadHistoryUi() {
    uploadHistoryRows = [];
    uploadHistoryLoading = false;
    selectedUploadHistoryId = "";
    uploadHistoryFilters = {
        status: "all",
        channel: "all",
        query: "",
    };
    renderUploadHistory();
}

function initializeOrderManagementUi() {
    orderManagementFilters = {
        channel: "all",
        orderStatus: "all",
        allocationStatus: "all",
        shippingStatus: "all",
        match: "all",
        period: "all",
        query: "",
    };
    selectedOrderManagementIds = new Set();
    editingOrderManagementId = "";
    orderManagementBulkAllocationPending = false;
    loadOrderManagementRowsFromLocal();
    renderOrderManagement();
    closeOrderManagementDetail();
}

function initializeCrmUi() {
    crmRows = [];
    crmHistoricalRows = [];
    invalidateOrderProductCandidateCache();
    crmAnalytics = buildCrmAnalytics([]);
    crmRepurchaseAnalytics = buildCrmRepurchaseAnalytics([]);
    crmSourceFileName = "";
    crmPeriodPreset = "all";
    crmCustomStartDate = "";
    crmCustomEndDate = "";
    crmActiveCategoryKey = "category1";
    updateSelectedFileName(null, crmFileNameEl);
    renderCrmDashboard();
    renderOrderMatchPanel();
    setCrmUploadStatus("과거 주문 엑셀을 업로드하면 고객 재구매 요약이 표시됩니다.", "info");
}

function initializeCustomerKeySettingsUi() {
    customerKeySettings = null;
    clearCustomerKeyInputs();
    renderCustomerKeySettingsUi();
    setCustomerKeyStatus("로그인 후 고객정보 암호키를 확인합니다.", "info");
}

function initializeInventoryAllocationSettingsUi() {
    inventoryAllocationPolicy = normalizeInventoryAllocationPolicy(
        INVENTORY_ALLOCATION_POLICY_DEFAULTS,
    );
    inventoryAllocationPolicyLoaded = false;
    inventoryAllocationPolicyLoading = false;
    inventoryAllocationPolicySaving = false;
    inventoryAllocationPolicyDirty = false;
    renderInventoryAllocationSettingsUi(inventoryAllocationPolicy);
    setInventoryAllocationControlsDisabled(true);
    setInventoryAllocationSettingsState("불러오기 전", "default");
    setInventoryAllocationSettingsStatus(
        "설정 화면을 열면 계정에 저장된 재고 운영 정책을 불러옵니다.",
    );
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
    skuWorkspaceLoaded = false;
    milkrunWorkspaceSourceRows = new Map();
    selectedMilkrunWorkspaceIds = new Set();
    selectedKurlyLabelWorkspaceIds = new Set();
    await loadOrderProductMatches();
    await loadOrderManagementRowsForCurrentUser();
    renderOrderManagement();
    if (!skuWorkspaceUserId) return;

    const workspaceDocRef = getSkuWorkspaceDocRef();
    if (!workspaceDocRef) return;

    try {
        const workspaceSnap = await getDoc(workspaceDocRef);
        const data = workspaceSnap.data();
        const savedRows = Array.isArray(data?.rows) ? data.rows : [];
        const savedSchemaVersion = String(data?.schemaVersion ?? "");
        const savedRowsNeedTypeMigration = savedRows.some((row) => !String(row?.skuType ?? "").trim());
        const savedRowsNeedCategoryTypeMigration = savedSchemaVersion !== SKU_WORKSPACE_SCHEMA_VERSION
            && savedRows.some(shouldMigrateSkuTypeFromCategory);
        const normalizedSavedRows = savedRows.map((row, index) => (
            normalizePersistableSkuRow(
                {
                    ...row,
                    skuType: savedSchemaVersion !== SKU_WORKSPACE_SCHEMA_VERSION
                        && shouldMigrateSkuTypeFromCategory(row)
                        ? getSkuTypeFromCategory(row?.category)
                        : getNormalizedSkuType(row?.skuType),
                },
                Number(row?.rowId) || index + 1,
            )
        ));
        const savedHeaders = Array.isArray(data?.selectedSkuHeaderKeys) ? data.selectedSkuHeaderKeys : [];
        const savedSkuColumnWidths = normalizeSkuColumnWidths(data?.skuColumnWidths);
        const savedSkuCategoryLabels = normalizeSkuCategoryLabels(data?.skuCategoryLabels);
        const savedSkuCategoryOptions = normalizeSkuCategoryOptions(data?.skuCategoryOptions, normalizedSavedRows);
        const shouldPersistSchemaMigration = shouldMigrateSkuCategoryHeaders(savedHeaders, savedSchemaVersion)
            || savedSchemaVersion !== SKU_WORKSPACE_SCHEMA_VERSION
            || savedRowsNeedTypeMigration
            || savedRowsNeedCategoryTypeMigration
            || !savedHeaders.includes("skuType")
            || !Array.isArray(data?.skuCategoryOptions)
            || !data?.skuCategoryLabels;
        const savedMilkrunWorkspaces = Array.isArray(data?.milkrunWorkspaces) ? data.milkrunWorkspaces : [];
        const savedKurlyLabelWorkspaces = Array.isArray(data?.kurlyLabelWorkspaces) ? data.kurlyLabelWorkspaces : [];

        skuCategoryLabels = savedSkuCategoryLabels;
        skuCategoryOptions = savedSkuCategoryOptions;
        renderSkuCategoryLabelSettingsUi();
        skuRows = normalizedSavedRows;
        skuWorkspaceLoaded = true;
        standardizeOrderManagementRows({ persist: true });
        renderSkuTypeTabs();
        selectedSkuHeaderKeys = getSavedSkuHeaderKeysForCurrentSchema(savedHeaders, savedSchemaVersion);
        skuColumnWidths = savedSkuColumnWidths;
        selectedSkuRowIds = new Set();
        syncSkuSearchControls();
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
        renderOrderManagement();
        if (shouldPersistSchemaMigration) {
            void persistSkuWorkspace();
        }
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
    initializeSidebarNavGroups();
    updatePaidFeatureLockUi();
    handlePaymentReturnMessage();
    showView("home");
    showTrackingMode("excel");
    initializeTrackingUi();
    initializeSkuUi();
    initializeInventoryLedgerUi();
    initializeReceivingUi();
    initializeOrderUploadUi();
    initializeUploadHistoryUi();
    initializeOrderManagementUi();
    initializeCrmUi();
    initializeCustomerKeySettingsUi();
    initializeInventoryAllocationSettingsUi();
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
        skuWorkspaceLoaded = false;
        skuLabelTemplates = [];
        currentUserPlan = "free";
        currentUserEmail = "";
        customerKeySettings = null;
            updatePaidFeatureLockUi();
        window.location.href = "./login.html";
        return;
    }

    try {
        skuWorkspaceUserId = user.uid;
        await loadApprovedUser(user);
        await loadCustomerKeySettings(user.uid);
        await loadSkuWorkspace(user.uid);
        await loadInventoryLedger(user.uid, {
            render: false,
            announce: false,
            preserveOnError: true,
        });
        renderOrderManagement();
        await loadInventoryColumnWidths(user.uid);
        await loadInventoryReceipts(user.uid);
        await loadUploadHistory();
        await loadCrmOrdersForCurrentUser();
        await loadSkuLabelTemplates(user.uid);
        initializeLabelEditor({ userId: user.uid });
    } catch (error) {
        console.error(error);
        dashboardUserInfoEl.textContent = "사용자 상태 확인 중 오류가 발생했습니다.";
    }
});

safelyInitializeDashboard();
