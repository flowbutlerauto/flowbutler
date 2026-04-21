const MM_TO_PX = 3.78;
const DRAG_CLICK_THRESHOLD_PX = 3;
const MAX_LABEL_TEMPLATES = 5;

import { auth, db } from "./firebase-config.js";
import { SKU_FIELDS } from "./sku-schema.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const state = {
    label: {
        widthMm: 100,
        heightMm: 150,
    },
    boxes: [],
    selectedBoxId: null,
    nextBoxNumber: 1,
    userId: null,
    templates: [],
    drag: {
        boxId: null,
        startMouseX: 0,
        startMouseY: 0,
        originBoxX: 0,
        originBoxY: 0,
        moved: false,
    },
};

const elements = {
    canvas: document.getElementById("label-canvas"),
    canvasMeta: document.querySelector(".label-canvas-meta"),
    canvasPlaceholder: document.querySelector(".label-canvas-placeholder"),

    addTextBtn: document.getElementById("label-add-text-btn"),
    applySizeBtn: document.getElementById("label-apply-size-btn"),

    labelWidthInput: document.getElementById("label-width"),
    labelHeightInput: document.getElementById("label-height"),

    boxList: document.getElementById("label-box-list"),

    propertiesEmpty: document.querySelector(".label-properties-empty"),
    propertiesForm: document.querySelector(".label-properties-form"),

    boxHeaderInput: document.getElementById("label-box-header"),
    boxSampleInput: document.getElementById("label-box-sample"),
    boxXInput: document.getElementById("label-box-x"),
    boxYInput: document.getElementById("label-box-y"),
    boxWidthInput: document.getElementById("label-box-width"),
    boxHeightInput: document.getElementById("label-box-height"),
    boxFontSizeInput: document.getElementById("label-box-font-size"),
    boxAlignInput: document.getElementById("label-box-align"),

    updateBoxBtn: document.getElementById("label-update-box-btn"),
    deleteBoxBtn: document.getElementById("label-delete-box-btn"),

    templateNameInput: document.getElementById("label-template-name"),
    templateList: document.getElementById("label-template-list"),
    templateSaveBtn: document.getElementById("label-template-save-btn"),
    templateLoadBtn: document.getElementById("label-template-load-btn"),
    templateDeleteBtn: document.getElementById("label-template-delete-btn"),
    templateStatus: document.getElementById("label-template-status"),
};

function mmToPx(mm) {
    return Math.round((Number(mm) || 0) * MM_TO_PX);
}

function pxToMm(px) {
    const raw = (Number(px) || 0) / MM_TO_PX;
    return Math.round(raw * 10) / 10;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getTemplateDocRef() {
    if (!state.userId) return null;
    return doc(db, "users", state.userId, "preferences", "labelTemplates");
}

function setTemplateStatus(message, tone = "info") {
    if (!elements.templateStatus) return;

    const colorMap = {
        info: "#475569",
        success: "#166534",
        error: "#b91c1c",
    };

    elements.templateStatus.textContent = message;
    elements.templateStatus.style.color = colorMap[tone] ?? colorMap.info;
}

function getLabelSnapshot() {
    return {
        label: {
            widthMm: state.label.widthMm,
            heightMm: state.label.heightMm,
        },
        boxes: state.boxes.map((box) => ({
            ...box,
        })),
        nextBoxNumber: state.nextBoxNumber,
    };
}

function applyLabelSnapshot(snapshot) {
    if (!snapshot) return;

    state.label.widthMm = clamp(Number(snapshot.label?.widthMm || 100), 20, 300);
    state.label.heightMm = clamp(Number(snapshot.label?.heightMm || 150), 20, 300);
    state.boxes = Array.isArray(snapshot.boxes) ? snapshot.boxes : [];
    state.nextBoxNumber = clamp(Number(snapshot.nextBoxNumber || state.boxes.length + 1), 1, 9999);
    state.selectedBoxId = state.boxes[0]?.id ?? null;

    if (elements.labelWidthInput) elements.labelWidthInput.value = String(state.label.widthMm);
    if (elements.labelHeightInput) elements.labelHeightInput.value = String(state.label.heightMm);

    updateCanvasSize();
    renderLabelCanvas();
    renderLabelBoxList();
    syncPropertiesPanel();
}

function sortTemplates(items) {
    return [...items].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}

function renderTemplateOptions(preferredTemplateId = "") {
    if (!elements.templateList) return;

    elements.templateList.innerHTML = "";

    if (!state.templates.length) {
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "저장된 양식이 없습니다.";
        elements.templateList.appendChild(emptyOption);
        return;
    }

    state.templates.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name;
        elements.templateList.appendChild(option);
    });

    const selectedId = preferredTemplateId || state.templates[0].id;
    elements.templateList.value = selectedId;
}

async function loadTemplates() {
    if (!state.userId) return;

    try {
        const templateDocRef = getTemplateDocRef();
        if (!templateDocRef) return;

        const templateDocSnap = await getDoc(templateDocRef);
        const templates = templateDocSnap.data()?.templates;
        state.templates = sortTemplates(Array.isArray(templates) ? templates : []);
        renderTemplateOptions();
        setTemplateStatus("저장된 라벨 양식을 불러왔습니다.", "info");
    } catch (error) {
        console.error(error);
        setTemplateStatus("양식 목록을 불러오지 못했습니다.", "error");
    }
}

async function persistTemplates() {
    const templateDocRef = getTemplateDocRef();
    if (!templateDocRef) return false;

    try {
        await setDoc(
            templateDocRef,
            {
                templates: state.templates,
                updatedAt: serverTimestamp(),
            },
            { merge: true },
        );
        return true;
    } catch (error) {
        console.error(error);
        setTemplateStatus("양식을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.", "error");
        return false;
    }
}

function getSelectedBox() {
    return state.boxes.find((box) => box.id === state.selectedBoxId) ?? null;
}

function ensureHeaderOption(value) {
    if (!elements.boxHeaderInput) return;
    if (!value) return;

    const optionExists = [...elements.boxHeaderInput.options]
        .some((option) => option.value === value);

    if (optionExists) return;

    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value} (기존 값)`;
    elements.boxHeaderInput.appendChild(option);
}

function initializeHeaderOptions() {
    if (!elements.boxHeaderInput) return;

    elements.boxHeaderInput.innerHTML = '<option value="">선택 안함</option>';

    SKU_FIELDS.forEach((field) => {
        const option = document.createElement("option");
        option.value = field.label;
        option.textContent = field.label;
        elements.boxHeaderInput.appendChild(option);
    });
}

function updateCanvasSize() {
    if (!elements.canvas) return;

    const widthPx = mmToPx(state.label.widthMm);
    const heightPx = mmToPx(state.label.heightMm);

    elements.canvas.style.width = `${widthPx}px`;
    elements.canvas.style.height = `${heightPx}px`;

    if (elements.canvasMeta) {
        elements.canvasMeta.textContent = `${state.label.widthMm}mm × ${state.label.heightMm}mm`;
    }
}

function createDefaultBox() {
    const number = state.nextBoxNumber;
    state.nextBoxNumber += 1;

    return {
        id: `box_${Date.now()}_${number}`,
        name: `텍스트 박스 ${number}`,
        type: "text",
        headerName: "",
        sampleText: `샘플 텍스트 ${number}`,
        x: 10,
        y: 10 + (number - 1) * 8,
        width: 40,
        height: 12,
        fontSize: 10,
        textAlign: "left",
    };
}

function setSelectedBox(boxId) {
    state.selectedBoxId = boxId;
    syncPropertiesPanel();
    renderLabelCanvas();
    renderLabelBoxList();
}

function clearSelectedBox() {
    state.selectedBoxId = null;
    syncPropertiesPanel();
    renderLabelCanvas();
    renderLabelBoxList();
}

function renderLabelCanvas() {
    if (!elements.canvas) return;

    elements.canvas.querySelectorAll(".label-box").forEach((node) => node.remove());

    const hasBoxes = state.boxes.length > 0;
    if (elements.canvasPlaceholder) {
        elements.canvasPlaceholder.style.display = hasBoxes ? "none" : "flex";
    }

    state.boxes.forEach((box) => {
        const boxEl = document.createElement("button");
        boxEl.type = "button";
        boxEl.className = "label-box";
        if (box.id === state.selectedBoxId) {
            boxEl.classList.add("is-selected");
        }

        boxEl.dataset.boxId = box.id;
        boxEl.style.left = `${mmToPx(box.x)}px`;
        boxEl.style.top = `${mmToPx(box.y)}px`;
        boxEl.style.width = `${mmToPx(box.width)}px`;
        boxEl.style.height = `${mmToPx(box.height)}px`;
        boxEl.style.fontSize = `${box.fontSize}px`;
        boxEl.style.textAlign = box.textAlign;

        const displayText =
            box.sampleText?.trim() ||
            box.headerName?.trim() ||
            box.name;

        boxEl.textContent = displayText;
        boxEl.title = box.headerName
            ? `${box.name} · 헤더: ${box.headerName}`
            : box.name;

        boxEl.addEventListener("mousedown", (event) => {
            handleBoxMouseDown(event, box.id);
        });

        elements.canvas.appendChild(boxEl);
    });
}

function renderLabelBoxList() {
    if (!elements.boxList) return;

    elements.boxList.innerHTML = "";

    if (!state.boxes.length) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "label-box-list-empty";
        emptyEl.textContent = "아직 생성된 텍스트 박스가 없습니다.";
        elements.boxList.appendChild(emptyEl);
        return;
    }

    state.boxes.forEach((box) => {
        const itemEl = document.createElement("button");
        itemEl.type = "button";
        itemEl.className = "label-box-item";
        if (box.id === state.selectedBoxId) {
            itemEl.classList.add("is-selected");
        }

        const title = box.headerName?.trim() || box.name;
        const meta = `X:${box.x} / Y:${box.y} / ${box.width}×${box.height}mm`;

        itemEl.innerHTML = `
      <div>
        <div class="label-box-item-title">${escapeHtml(title)}</div>
        <div class="label-box-item-meta">${escapeHtml(meta)}</div>
      </div>
    `;

        itemEl.addEventListener("click", () => {
            setSelectedBox(box.id);
        });

        elements.boxList.appendChild(itemEl);
    });
}

function syncPropertiesPanel() {
    const selectedBox = getSelectedBox();
    const hasSelection = Boolean(selectedBox);

    if (elements.propertiesEmpty) {
        elements.propertiesEmpty.style.display = hasSelection ? "none" : "block";
    }

    if (elements.propertiesForm) {
        elements.propertiesForm.classList.toggle("is-collapsed", !hasSelection);
    }

    if (!selectedBox) {
        if (elements.boxHeaderInput) elements.boxHeaderInput.value = "";
        if (elements.boxSampleInput) elements.boxSampleInput.value = "";
        if (elements.boxXInput) elements.boxXInput.value = "0";
        if (elements.boxYInput) elements.boxYInput.value = "0";
        if (elements.boxWidthInput) elements.boxWidthInput.value = "40";
        if (elements.boxHeightInput) elements.boxHeightInput.value = "12";
        if (elements.boxFontSizeInput) elements.boxFontSizeInput.value = "10";
        if (elements.boxAlignInput) elements.boxAlignInput.value = "left";
        return;
    }

    if (elements.boxHeaderInput) {
        ensureHeaderOption(selectedBox.headerName ?? "");
        elements.boxHeaderInput.value = selectedBox.headerName ?? "";
    }
    if (elements.boxSampleInput) elements.boxSampleInput.value = selectedBox.sampleText ?? "";
    if (elements.boxXInput) elements.boxXInput.value = String(selectedBox.x);
    if (elements.boxYInput) elements.boxYInput.value = String(selectedBox.y);
    if (elements.boxWidthInput) elements.boxWidthInput.value = String(selectedBox.width);
    if (elements.boxHeightInput) elements.boxHeightInput.value = String(selectedBox.height);
    if (elements.boxFontSizeInput) elements.boxFontSizeInput.value = String(selectedBox.fontSize);
    if (elements.boxAlignInput) elements.boxAlignInput.value = selectedBox.textAlign ?? "left";
}

function handleAddTextBox() {
    const newBox = createDefaultBox();
    state.boxes.push(newBox);
    setSelectedBox(newBox.id);
}

function handleApplyLabelSize() {
    const widthMm = clamp(Number(elements.labelWidthInput?.value || 100), 20, 300);
    const heightMm = clamp(Number(elements.labelHeightInput?.value || 150), 20, 300);

    state.label.widthMm = widthMm;
    state.label.heightMm = heightMm;

    updateCanvasSize();
    renderLabelCanvas();
}

function handleUpdateSelectedBox() {
    const selectedBox = getSelectedBox();
    if (!selectedBox) return;

    selectedBox.headerName = elements.boxHeaderInput?.value.trim() ?? "";
    selectedBox.sampleText = elements.boxSampleInput?.value ?? "";
    selectedBox.x = clamp(Number(elements.boxXInput?.value || 0), 0, state.label.widthMm);
    selectedBox.y = clamp(Number(elements.boxYInput?.value || 0), 0, state.label.heightMm);
    selectedBox.width = clamp(Number(elements.boxWidthInput?.value || 40), 5, state.label.widthMm);
    selectedBox.height = clamp(Number(elements.boxHeightInput?.value || 12), 5, state.label.heightMm);
    selectedBox.fontSize = clamp(Number(elements.boxFontSizeInput?.value || 10), 6, 72);
    selectedBox.textAlign = elements.boxAlignInput?.value || "left";

    selectedBox.x = clamp(selectedBox.x, 0, Math.max(0, state.label.widthMm - selectedBox.width));
    selectedBox.y = clamp(selectedBox.y, 0, Math.max(0, state.label.heightMm - selectedBox.height));

    renderLabelCanvas();
    renderLabelBoxList();
    syncPropertiesPanel();
}

function handleDeleteSelectedBox() {
    const selectedBox = getSelectedBox();
    if (!selectedBox) return;

    state.boxes = state.boxes.filter((box) => box.id !== selectedBox.id);

    if (!state.boxes.length) {
        clearSelectedBox();
        return;
    }

    setSelectedBox(state.boxes[0].id);
}

async function handleSaveTemplate() {
    const user = auth.currentUser;
    if (!user) {
        setTemplateStatus("로그인 후 양식 저장 기능을 사용할 수 있습니다.", "error");
        return;
    }

    const name = elements.templateNameInput?.value.trim() || "";
    if (!name) {
        setTemplateStatus("양식 이름을 입력해주세요.", "error");
        return;
    }

    const now = Date.now();
    const existing = state.templates.find((template) => template.name === name);

    if (!existing && state.templates.length >= MAX_LABEL_TEMPLATES) {
        setTemplateStatus("양식은 최대 5개까지 저장할 수 있습니다.", "error");
        return;
    }

    const snapshot = getLabelSnapshot();
    if (existing) {
        existing.snapshot = snapshot;
        existing.updatedAtMs = now;
    } else {
        state.templates.push({
            id: `tpl_${now}`,
            name,
            snapshot,
            updatedAtMs: now,
        });
    }

    state.templates = sortTemplates(state.templates);
    const ok = await persistTemplates();
    if (!ok) return;

    renderTemplateOptions(existing?.id);
    setTemplateStatus(`"${name}" 양식을 저장했습니다. (${state.templates.length}/5)`, "success");
}

function getSelectedTemplate() {
    const templateId = elements.templateList?.value || "";
    if (!templateId) return null;
    return state.templates.find((template) => template.id === templateId) ?? null;
}

function handleLoadTemplate() {
    const template = getSelectedTemplate();
    if (!template) {
        setTemplateStatus("불러올 양식을 선택해주세요.", "error");
        return;
    }

    applyLabelSnapshot(template.snapshot);
    if (elements.templateNameInput) {
        elements.templateNameInput.value = template.name;
    }
    setTemplateStatus(`"${template.name}" 양식을 불러왔습니다.`, "success");
}

async function handleDeleteTemplate() {
    const template = getSelectedTemplate();
    if (!template) {
        setTemplateStatus("삭제할 양식을 선택해주세요.", "error");
        return;
    }

    state.templates = state.templates.filter((item) => item.id !== template.id);
    const ok = await persistTemplates();
    if (!ok) return;

    renderTemplateOptions();
    setTemplateStatus(`"${template.name}" 양식을 삭제했습니다.`, "success");
}

function handleBoxMouseDown(event, boxId) {
    if (event.button !== 0) return;
    event.preventDefault();

    const box = state.boxes.find((item) => item.id === boxId);
    if (!box) return;

    state.drag.boxId = boxId;
    state.drag.startMouseX = event.clientX;
    state.drag.startMouseY = event.clientY;
    state.drag.originBoxX = box.x;
    state.drag.originBoxY = box.y;
    state.drag.moved = false;
}

function handleCanvasMouseMove(event) {
    if (!state.drag.boxId) return;
    const selectedBox = state.boxes.find((box) => box.id === state.drag.boxId);
    if (!selectedBox) return;

    const deltaPxX = event.clientX - state.drag.startMouseX;
    const deltaPxY = event.clientY - state.drag.startMouseY;

    if (Math.abs(deltaPxX) > DRAG_CLICK_THRESHOLD_PX || Math.abs(deltaPxY) > DRAG_CLICK_THRESHOLD_PX) {
        state.drag.moved = true;
    }

    const deltaMmX = pxToMm(deltaPxX);
    const deltaMmY = pxToMm(deltaPxY);

    const nextX = clamp(
        state.drag.originBoxX + deltaMmX,
        0,
        Math.max(0, state.label.widthMm - selectedBox.width),
    );
    const nextY = clamp(
        state.drag.originBoxY + deltaMmY,
        0,
        Math.max(0, state.label.heightMm - selectedBox.height),
    );

    selectedBox.x = nextX;
    selectedBox.y = nextY;

    state.selectedBoxId = selectedBox.id;
    renderLabelCanvas();
    renderLabelBoxList();
    syncPropertiesPanel();
}

function handleCanvasMouseUp() {
    if (!state.drag.boxId) return;

    if (!state.drag.moved) {
        setSelectedBox(state.drag.boxId);
    }

    state.drag.boxId = null;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function bindEvents() {
    elements.addTextBtn?.addEventListener("click", handleAddTextBox);
    elements.applySizeBtn?.addEventListener("click", handleApplyLabelSize);
    elements.updateBoxBtn?.addEventListener("click", handleUpdateSelectedBox);
    elements.deleteBoxBtn?.addEventListener("click", handleDeleteSelectedBox);
    elements.canvas?.addEventListener("mousemove", handleCanvasMouseMove);
    document.addEventListener("mouseup", handleCanvasMouseUp);
    elements.templateSaveBtn?.addEventListener("click", handleSaveTemplate);
    elements.templateLoadBtn?.addEventListener("click", handleLoadTemplate);
    elements.templateDeleteBtn?.addEventListener("click", handleDeleteTemplate);
}

function initializeLabelEditor(options = {}) {
    if (!elements.canvas) return;
    state.userId = options.userId ?? auth.currentUser?.uid ?? null;

    initializeHeaderOptions();
    updateCanvasSize();
    renderLabelCanvas();
    renderLabelBoxList();
    renderTemplateOptions();
    syncPropertiesPanel();
    bindEvents();
    loadTemplates();
}

export { initializeLabelEditor };
