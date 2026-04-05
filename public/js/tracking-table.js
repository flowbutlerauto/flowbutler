function safeString(value) {
    return String(value ?? "").trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getStatusCellHtml(row) {
    const status = safeString(row?.status);

    if (!status) return "";

    return `
    <span class="tracking-status-text">
      ${escapeHtml(status)}
    </span>
  `;
}

function getTimeCellHtml(row) {
    return escapeHtml(safeString(row?.time));
}

export function setEmptyTrackingTable(trackingTableBody) {
    if (!trackingTableBody) return;

    trackingTableBody.innerHTML = `
    <tr class="tracking-empty-row">
      <td colspan="4">업로드된 파일이 없습니다. 엑셀 파일을 선택해 주세요.</td>
    </tr>
  `;
}

export function renderTrackingTable(rows, trackingTableBody) {
    if (!trackingTableBody) return;

    const safeRows = rows ?? [];

    if (!safeRows.length) {
        setEmptyTrackingTable(trackingTableBody);
        return;
    }

    trackingTableBody.innerHTML = safeRows
        .map((row, index) => {
            const rowId = row?.rowId ?? index + 1;
            const courier = safeString(row?.courier);
            const trackingNumber = safeString(row?.trackingNumber);
            const message = safeString(row?.message);

            return `
        <tr data-row-id="${rowId}">
          <td
            contenteditable="true"
            data-field="courier"
            data-row-id="${rowId}"
            title="${escapeHtml(message)}"
          >${escapeHtml(courier)}</td>
          <td
            contenteditable="true"
            data-field="trackingNumber"
            data-row-id="${rowId}"
            title="${escapeHtml(message)}"
          >${escapeHtml(trackingNumber)}</td>
          <td
            data-field="status"
            data-row-id="${rowId}"
            title="${escapeHtml(message)}"
          >${getStatusCellHtml(row)}</td>
          <td
            data-field="time"
            data-row-id="${rowId}"
            title="${escapeHtml(message)}"
          >${getTimeCellHtml(row)}</td>
        </tr>
      `;
        })
        .join("");
}

export function syncRowsFromTable(trackingTableBody) {
    if (!trackingTableBody) return [];

    const tableRows = [...trackingTableBody.querySelectorAll("tr")].filter(
        (row) => !row.classList.contains("tracking-empty-row")
    );

    return tableRows.map((row, index) => {
        const rowIdAttr = row.getAttribute("data-row-id");
        const rowId = rowIdAttr ? Number(rowIdAttr) : index + 1;

        const courierCell = row.querySelector('td[data-field="courier"]');
        const trackingNumberCell = row.querySelector('td[data-field="trackingNumber"]');
        const statusCell = row.querySelector('td[data-field="status"]');
        const timeCell = row.querySelector('td[data-field="time"]');

        return {
            rowId,
            courier: safeString(courierCell?.textContent),
            trackingNumber: safeString(trackingNumberCell?.textContent),
            status: safeString(statusCell?.textContent),
            time: safeString(timeCell?.textContent),
            message: "",
            isValid: false,
            excludedReason: "",
        };
    });
}

export function updateSelectedFileName(file, trackingFileNameEl) {
    if (!trackingFileNameEl) return;

    if (!file) {
        trackingFileNameEl.textContent = "선택된 파일 없음";
        return;
    }

    trackingFileNameEl.textContent = file.name;
}