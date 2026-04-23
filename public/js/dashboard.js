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
const headerActionsEl = document.getElementById("header-actions");
const headerQuickViewButtons = document.querySelectorAll("[data-quick-view]");

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

const viewMeta = {
    home: {
        title: "홈",
        subtitle: "지금 필요한 물류 자동화 작업을 빠르게 시작하세요.",
    },
    tracking: {
        title: "송장번호 Tracking",
        subtitle: "엑셀 업로드와 수기입력 방식으로 Tracking 업무를 처리할 수 있습니다.",
    },
    label: {
        title: "라벨 양식 설정",
        subtitle: "텍스트 박스를 배치하고 엑셀 헤더와 연결할 수 있는 라벨 편집 화면입니다.",
    },
    sku: {
        title: "SKU 관리",
        subtitle: "SKU 파일 업로드와 필수값/형식 검증을 수행할 수 있습니다.",
    },
    "kurly-label": {
        title: "컬리 라벨 생성",
        subtitle: "엑셀 업로드 후 엄격 검증을 거쳐 컬리 라벨을 생성/출력합니다.",
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
let kurlyRows = [];
let kurlyParsedFileName = "";
const SKU_IMAGE_FIELD_KEY = "productImageUrl";
const SKU_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
let draggingSkuHeaderKey = "";

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
    return viewName === "tracking" || viewName === "label" || viewName === "sku" || viewName === "kurly-label";
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
    return ensureSkuHeaderSelection(["adminProductCode", "productName", "productImageUrl", "brand", "category"]);
}

function ensureSkuHeaderSelection(keys) {
    const uniqueKeys = [...new Set(keys)];
    const availableKeySet = new Set(SKU_FIELDS.map((field) => field.key));
    const requiredKeySet = new Set(SKU_REQUIRED_KEYS);

    const filtered = uniqueKeys.filter((key) => availableKeySet.has(key));
    const merged = [...new Set([...filtered, ...SKU_REQUIRED_KEYS])];

    if (!merged.length) {
        return [...SKU_REQUIRED_KEYS];
    }

    return merged.sort((a, b) => {
        const fieldIndexA = SKU_FIELDS.findIndex((field) => field.key === a);
        const fieldIndexB = SKU_FIELDS.findIndex((field) => field.key === b);

        const isRequiredA = requiredKeySet.has(a);
        const isRequiredB = requiredKeySet.has(b);

        if (isRequiredA && !isRequiredB) return -1;
        if (!isRequiredA && isRequiredB) return 1;
        return fieldIndexA - fieldIndexB;
    });
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

function renderSkuHeaderCheckboxes() {
    if (!skuHeaderCheckboxList) return;

    const requiredKeySet = new Set(SKU_REQUIRED_KEYS);

    skuHeaderCheckboxList.innerHTML = SKU_FIELDS.map((field) => {
        const checked = selectedSkuHeaderKeys.includes(field.key);
        const disabled = requiredKeySet.has(field.key);
        const requiredBadge = disabled ? " (필수)" : "";

        return `
      <label class="sku-header-checkbox-item">
        <input type="checkbox" data-sku-header-key="${field.key}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
        <span>${escapeHtml(field.label)}${requiredBadge}</span>
      </label>
    `;
    }).join("");
}

function setSkuHeaderCheckboxSelection(keys) {
    if (!skuHeaderCheckboxList) return;

    const selectedKeySet = new Set(ensureSkuHeaderSelection(keys));
    const checkboxes = skuHeaderCheckboxList.querySelectorAll('input[data-sku-header-key]');
    checkboxes.forEach((checkbox) => {
        const key = checkbox.getAttribute("data-sku-header-key") || "";
        checkbox.checked = selectedKeySet.has(key);
    });
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
        return;
    }

    const validationResult = validateSkuRows(skuRows);
    renderSkuTable(validationResult.rows);
    const { total, valid, invalid } = validationResult.summary;
    setSkuResult(`총 ${total}건 중 정상 ${valid}건, 오류 ${invalid}건`);
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
    setSkuHeaderCheckboxSelection(getDefaultSkuHeaderKeys());
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

async function setSkuFileSelectedState(file) {
    if (!file) {
        skuRows = [];
        selectedSkuRowIds = new Set();
        closeSkuEditModal();
        updateSelectedFileName(null, skuFileNameEl);
        setSkuEmptyTable("SKU 파일을 선택하면 자동으로 검증합니다.");
        setSkuResult("선택된 파일이 없습니다.");
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
            await persistSkuWorkspace();
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

    headerQuickViewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const viewName = button.dataset.quickView;
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
    skuFileInput?.addEventListener("change", async () => {
        const file = skuFileInput.files?.[0];
        await setSkuFileSelectedState(file);
    });
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
    skuEditSaveBtn?.addEventListener("click", handleSaveSkuEdit);
    skuEditForm?.addEventListener("change", (event) => {
        void handleSkuEditFormChange(event);
    });
    skuEditCancelBtn?.addEventListener("click", closeSkuEditModal);
    skuLabelPrintRunBtn?.addEventListener("click", handleRunSkuLabelPrint);
    skuLabelPrintCancelBtn?.addEventListener("click", closeSkuLabelPrintModal);
    kurlyLabelGenerateBtn?.addEventListener("click", handleGenerateKurlyLabels);
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

function initializeKurlyLabelUi() {
    kurlyRows = [];
    kurlyParsedFileName = "";
    updateSelectedFileName(null, kurlyLabelFileNameEl);
    setKurlyLabelResult("필수 헤더가 정확히 일치해야 라벨을 생성할 수 있습니다. (상품코드 헤더 불가, 마스터코드만 허용)");
    resetKurlyProgress();
}

async function loadSkuWorkspace(userId) {
    skuWorkspaceUserId = userId ?? null;
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
    showView("home");
    showTrackingMode("excel");
    initializeTrackingUi();
    initializeSkuUi();
    initializeKurlyLabelUi();
    bindEvents();
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        skuWorkspaceUserId = null;
        skuLabelTemplates = [];
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

initializeDashboard();
