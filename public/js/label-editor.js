const MM_TO_PX = 3.78;

const state = {
    label: {
        widthMm: 100,
        heightMm: 150,
    },
    boxes: [],
    selectedBoxId: null,
    nextBoxNumber: 1,
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
};

function mmToPx(mm) {
    return Math.round((Number(mm) || 0) * MM_TO_PX);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getSelectedBox() {
    return state.boxes.find((box) => box.id === state.selectedBoxId) ?? null;
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

        boxEl.addEventListener("click", () => {
            setSelectedBox(box.id);
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

    if (elements.boxHeaderInput) elements.boxHeaderInput.value = selectedBox.headerName ?? "";
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
}

function initializeLabelEditor() {
    if (!elements.canvas) return;

    updateCanvasSize();
    renderLabelCanvas();
    renderLabelBoxList();
    syncPropertiesPanel();
    bindEvents();
}

export { initializeLabelEditor };