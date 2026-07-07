const DEFAULT_COMPANY_NAME = "(주식회사 라온글로벌)";
const MAX_SKU_PER_BLOCK = 10;
const PALLET_PRINT_COPIES = 2;
const PDF_PAGE_WIDTH_PT = 842;
const PDF_PAGE_HEIGHT_PT = 595;
const PDF_RENDER_WIDTH_PX = 1123;
const PDF_RENDER_HEIGHT_PX = 794;
const PDF_RENDER_SCALE = 1.35;

function safeString(value) {
    return String(value ?? "").trim();
}

function parseNumber(value) {
    const normalized = safeString(value).replace(/,/g, "");
    if (!normalized) return Number.NaN;
    return Number(normalized);
}

function parsePositiveNumber(value) {
    const numericValue = parseNumber(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : Number.NaN;
}

function getComponentPcsPerBox(component) {
    const pcsPerBox = parsePositiveNumber(component?.pcsPerBox);
    if (!Number.isNaN(pcsPerBox)) return pcsPerBox;

    const boxesPerPlt = parsePositiveNumber(component?.boxesPerPlt);
    const pcsPerPlt = parsePositiveNumber(component?.pcsPerPlt);
    if (Number.isNaN(boxesPerPlt) || Number.isNaN(pcsPerPlt)) return Number.NaN;

    return pcsPerPlt / boxesPerPlt;
}

function getComponentPcsPerPlt(component) {
    const pcsPerPlt = parsePositiveNumber(component?.pcsPerPlt);
    if (!Number.isNaN(pcsPerPlt)) return pcsPerPlt;

    const pcsPerBox = getComponentPcsPerBox(component);
    const boxesPerPlt = parsePositiveNumber(component?.boxesPerPlt);
    if (Number.isNaN(pcsPerBox) || Number.isNaN(boxesPerPlt)) return Number.NaN;

    return pcsPerBox * boxesPerPlt;
}

function normalizeComponentQuantity(value) {
    const quantity = parsePositiveNumber(value);
    return Number.isNaN(quantity) ? 1 : quantity;
}

function getUniqueText(values) {
    return [...new Set((values ?? []).map(safeString).filter(Boolean))];
}

function getFormattedDueDate(rows) {
    const dueDates = getUniqueText(rows.map((row) => row.dueDate));
    return dueDates.length === 1 ? dueDates[0] : "입고예정일 확인";
}

function formatDueDateForLoadingList(value) {
    const text = safeString(value);
    if (!text || text === "입고예정일 확인") return text || "입고예정일 확인";
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 8) return digits.slice(0, 8);
    return text;
}

function getPoNumbersText(rows) {
    const orderCodes = getUniqueText(rows.map((row) => row.orderCode));
    return orderCodes.length ? `(${orderCodes.join(" / ")})` : "";
}

export function getLoadingListPoDisplay(value) {
    const text = safeString(value).replace(/\s*\/\s*/g, " / ");
    const textLength = text.length;
    let fontSize = 16;
    let lineHeight = 22;

    if (textLength > 340) {
        fontSize = 7.8;
        lineHeight = 12;
    } else if (textLength > 300) {
        fontSize = 8.5;
        lineHeight = 13;
    } else if (textLength > 250) {
        fontSize = 9.2;
        lineHeight = 14;
    } else if (textLength > 210) {
        fontSize = 10;
        lineHeight = 15;
    } else if (textLength > 180) {
        fontSize = 10.8;
        lineHeight = 16;
    } else if (textLength > 150) {
        fontSize = 11.5;
        lineHeight = 17;
    } else if (textLength > 124) {
        fontSize = 12.5;
        lineHeight = 18;
    } else if (textLength > 100) {
        fontSize = 13.5;
        lineHeight = 19;
    } else if (textLength > 76) {
        fontSize = 14;
        lineHeight = 20;
    } else if (textLength > 60) {
        fontSize = 13;
        lineHeight = 19;
    } else if (textLength > 46) {
        fontSize = 14;
        lineHeight = 20;
    }

    return {
        text,
        fontSize,
        lineHeight,
    };
}

function escapeHtml(value) {
    return safeString(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sanitizeFileNamePart(value) {
    return safeString(value)
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "쿠팡";
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function triggerCoupangLoadingListDownload(downloadFile) {
    if (!downloadFile?.blob || !downloadFile?.filename) {
        throw new Error("저장할 적재리스트 파일이 준비되지 않았습니다.");
    }
    downloadBlob(downloadFile.blob, downloadFile.filename);
}

function getAssignedCenter(row, assignedCenterByOrderId) {
    const orderCode = safeString(row?.orderCode);
    return assignedCenterByOrderId.get(orderCode) || safeString(row?.center) || "미지정";
}

function addSkuGroupLine(centerData, line) {
    const skuCode = safeString(line.skuCode) || safeString(line.skuName) || "UNKNOWN";
    if (!centerData.skuGroups.has(skuCode)) {
        centerData.skuGroups.set(skuCode, {
            skuCode,
            skuName: safeString(line.skuName),
            eaQty: 0,
            boxCount: 0,
            pcsPerBox: line.pcsPerBox,
            boxesPerPlt: line.boxesPerPlt,
            pcsPerPlt: line.pcsPerPlt,
            warnings: [],
        });
    }

    const group = centerData.skuGroups.get(skuCode);
    if (!group.skuName && line.skuName) group.skuName = safeString(line.skuName);
    group.eaQty += Number(line.eaQty) || 0;
    group.boxCount += Number(line.boxCount) || 0;
    if (Number.isNaN(group.pcsPerBox) && !Number.isNaN(line.pcsPerBox)) group.pcsPerBox = line.pcsPerBox;
    if (Number.isNaN(group.boxesPerPlt) && !Number.isNaN(line.boxesPerPlt)) group.boxesPerPlt = line.boxesPerPlt;
    if (Number.isNaN(group.pcsPerPlt) && !Number.isNaN(line.pcsPerPlt)) group.pcsPerPlt = line.pcsPerPlt;
    group.warnings.push(...(line.warnings ?? []));
}

function buildCenterData({ sourceRows, milkrunRows, resolveSkuComponents }) {
    const assignedCenterByOrderId = new Map((milkrunRows ?? [])
        .map((row) => [safeString(row.orderId), safeString(row.assignedCenter || row.originalCenter)])
        .filter(([orderId, center]) => orderId && center));
    const centerMap = new Map();

    (sourceRows ?? [])
        .filter((row) => row?.channel === "coupang" && row?.isValid !== false)
        .forEach((row) => {
            const center = getAssignedCenter(row, assignedCenterByOrderId);
            if (!centerMap.has(center)) {
                centerMap.set(center, {
                    center,
                    rows: [],
                    skuGroups: new Map(),
                    warnings: [],
                });
            }

            const centerData = centerMap.get(center);
            centerData.rows.push(row);

            const orderQuantity = parseNumber(row.quantity) || 0;
            const components = typeof resolveSkuComponents === "function"
                ? resolveSkuComponents(row)
                : [];

            if (!Array.isArray(components) || !components.length) {
                const fallbackBoxCount = Math.ceil(parseNumber(row.boxCount) || 0);
                const warning = `${safeString(row.productCode || row.productName) || "상품"}: SKU 매칭이 없어 적재 기준을 계산할 수 없습니다.`;
                centerData.warnings.push(warning);
                addSkuGroupLine(centerData, {
                    skuCode: row.productCode,
                    skuName: row.productName,
                    eaQty: orderQuantity,
                    boxCount: fallbackBoxCount,
                    pcsPerBox: Number.NaN,
                    boxesPerPlt: Number.NaN,
                    pcsPerPlt: Number.NaN,
                    warnings: [warning],
                });
                return;
            }

            components.forEach((component) => {
                const componentQuantity = normalizeComponentQuantity(component?.quantity);
                const eaQty = orderQuantity * componentQuantity;
                const pcsPerBox = getComponentPcsPerBox(component);
                const boxesPerPlt = parsePositiveNumber(component?.boxesPerPlt);
                const pcsPerPlt = getComponentPcsPerPlt(component);
                const boxCount = Number.isNaN(pcsPerBox) ? 0 : Math.ceil(eaQty / pcsPerBox);
                const skuCode = safeString(component?.skuKey) || safeString(component?.skuName);
                const skuName = safeString(component?.skuName) || skuCode;
                const warnings = [];

                if (Number.isNaN(pcsPerBox)) {
                    warnings.push(`${skuCode || skuName}: 박스당 입수 또는 plt 기준 정보가 없어 박스 수를 계산할 수 없습니다.`);
                }
                if (Number.isNaN(pcsPerPlt) && Number.isNaN(boxesPerPlt)) {
                    warnings.push(`${skuCode || skuName}: 팔레트 기준 정보가 없어 PT 배치를 정확히 계산할 수 없습니다.`);
                }

                centerData.warnings.push(...warnings);
                addSkuGroupLine(centerData, {
                    skuCode,
                    skuName,
                    eaQty,
                    boxCount,
                    pcsPerBox,
                    boxesPerPlt,
                    pcsPerPlt,
                    warnings,
                });
            });
        });

    return [...centerMap.values()];
}

function splitSkuGroupsToChunks(skuGroups) {
    const chunks = [];
    const groups = [...skuGroups].sort((left, right) => right.boxCount - left.boxCount);

    groups.forEach((group) => {
        const boxCapacity = !Number.isNaN(group.boxesPerPlt) && group.boxesPerPlt > 0
            ? group.boxesPerPlt
            : Math.max(1, group.boxCount || 1);
        let remainingBoxes = Math.max(0, Math.ceil(group.boxCount || 0));
        let remainingEa = Math.max(0, Math.round(group.eaQty || 0));

        if (!remainingBoxes && remainingEa) remainingBoxes = 1;

        while (remainingBoxes > 0) {
            const boxCount = Math.min(remainingBoxes, boxCapacity);
            const isLastChunk = remainingBoxes - boxCount <= 0;
            const averageEaPerBox = remainingBoxes > 0 ? remainingEa / remainingBoxes : 0;
            const eaQty = isLastChunk ? remainingEa : Math.round(averageEaPerBox * boxCount);
            const footprint = !Number.isNaN(group.pcsPerPlt) && group.pcsPerPlt > 0
                ? eaQty / group.pcsPerPlt
                : (!Number.isNaN(group.boxesPerPlt) && group.boxesPerPlt > 0 ? boxCount / group.boxesPerPlt : 1);

            chunks.push({
                skuCode: group.skuCode,
                skuName: group.skuName,
                boxCount,
                eaQty,
                footprint,
                warnings: group.warnings,
            });

            remainingBoxes -= boxCount;
            remainingEa -= eaQty;
        }
    });

    return chunks.sort((left, right) => right.boxCount - left.boxCount);
}

function assignChunksToPallets(chunks, defaultMaxSkuPerPallet = 4) {
    const pallets = [];
    let currentPallet = [];
    let currentFootprint = 0;

    chunks.forEach((chunk) => {
        const footprint = Number.isFinite(chunk.footprint) && chunk.footprint > 0 ? chunk.footprint : 1;
        const maxSku = currentFootprint <= 0.65 ? 8 : defaultMaxSkuPerPallet;
        const wouldExceedFootprint = currentFootprint + footprint > 1.000001;
        const wouldExceedSku = currentPallet.length + 1 > maxSku;

        if ((wouldExceedFootprint || wouldExceedSku) && currentPallet.length) {
            pallets.push(currentPallet);
            currentPallet = [];
            currentFootprint = 0;
        }

        currentPallet.push(chunk);
        currentFootprint += footprint;
    });

    if (currentPallet.length) pallets.push(currentPallet);
    return pallets;
}

export function buildCoupangLoadingListData({ sourceRows, milkrunRows, resolveSkuComponents } = {}) {
    const centers = buildCenterData({ sourceRows, milkrunRows, resolveSkuComponents })
        .map((centerData) => {
            const skuGroups = [...centerData.skuGroups.values()];
            const chunks = splitSkuGroupsToChunks(skuGroups);
            const pallets = assignChunksToPallets(chunks);
            const totalBoxes = skuGroups.reduce((sum, group) => sum + Math.ceil(group.boxCount || 0), 0);
            const totalQty = skuGroups.reduce((sum, group) => sum + Math.round(group.eaQty || 0), 0);

            return {
                center: centerData.center,
                dueDate: getFormattedDueDate(centerData.rows),
                poNumbersText: getPoNumbersText(centerData.rows),
                totalBoxes,
                totalQty,
                skuCount: skuGroups.length,
                pallets,
                warnings: [...new Set(centerData.warnings.filter(Boolean))],
            };
        })
        .filter((center) => center.pallets.length);

    return centers.sort((left, right) => left.center.localeCompare(right.center, "ko-KR", { numeric: true }));
}

function pushEmptyRows(rows, count) {
    for (let i = 0; i < count; i += 1) rows.push([]);
}

function pushPalletBlock(rows, merges, center, palletItems, palletIndex, palletCount) {
    const startRow = rows.length;
    const occupancy = palletItems.reduce((sum, item) => sum + (Number(item.footprint) || 0), 0);

    rows.push(["", "쿠팡 밀크런 적재리스트 (일반)", "", "", "", "", ""]);
    rows.push([]);
    rows.push(["", "", "", palletCount, `${palletCount}-${palletIndex + 1}`, "총 박스수량:", `${center.totalBoxes} BOX`]);
    rows.push(["", "", "", "입고예정일자:", center.dueDate, "납품센터명", center.center]);
    rows.push(["", "", "", "업체명", DEFAULT_COMPANY_NAME, "", ""]);
    rows.push(["", "", "", "발주번호:", center.poNumbersText, "", ""]);
    rows.push(["", "", "", "PT 점유율:", `${occupancy.toFixed(2)} PT`, "", ""]);
    rows.push(["", "", "NO", "SKU NO", "SKU NAME", "BOX 수량", "수량"]);

    for (let itemIndex = 0; itemIndex < MAX_SKU_PER_BLOCK; itemIndex += 1) {
        const item = palletItems[itemIndex];
        rows.push([
            "",
            "",
            itemIndex + 1,
            item?.skuCode || "",
            item?.skuName || "",
            item ? Math.ceil(item.boxCount || 0) : "",
            item ? Math.round(item.eaQty || 0) : "",
        ]);
    }

    rows.push([]);
    rows.push([]);
    rows.push([]);

    merges.push({ s: { r: startRow, c: 1 }, e: { r: startRow, c: 6 } });
}

export function buildCoupangLoadingListWorkbook(loadingListData, XLSX) {
    if (!XLSX) throw new Error("엑셀 라이브러리가 로드되지 않았습니다.");
    if (!Array.isArray(loadingListData) || !loadingListData.length) {
        throw new Error("적재리스트를 만들 쿠팡 밀크런 데이터가 없습니다.");
    }

    const summaryRows = [
        ["센터", "PT 수", "SKU 수", "총 박스", "총 수량", "입고예정일", "발주번호", "주의"],
        ...loadingListData.map((center) => [
            center.center,
            center.pallets.length,
            center.skuCount,
            center.totalBoxes,
            center.totalQty,
            center.dueDate,
            center.poNumbersText,
            center.warnings.join(" / "),
        ]),
    ];
    const blockRows = [];
    const merges = [];

    loadingListData.forEach((center, centerIndex) => {
        if (centerIndex > 0) pushEmptyRows(blockRows, 2);
        center.pallets.forEach((palletItems, palletIndex) => {
            pushPalletBlock(blockRows, merges, center, palletItems, palletIndex, center.pallets.length);
            pushEmptyRows(blockRows, 1);
        });
    });

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet["!cols"] = [
        { wch: 16 },
        { wch: 8 },
        { wch: 8 },
        { wch: 10 },
        { wch: 10 },
        { wch: 16 },
        { wch: 36 },
        { wch: 52 },
    ];

    const listSheet = XLSX.utils.aoa_to_sheet(blockRows);
    listSheet["!merges"] = merges;
    listSheet["!cols"] = [
        { wch: 3 },
        { wch: 4 },
        { wch: 6 },
        { wch: 14 },
        { wch: 38 },
        { wch: 12 },
        { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, "센터요약");
    XLSX.utils.book_append_sheet(workbook, listSheet, "적재리스트");
    return workbook;
}

export function downloadCoupangLoadingListWorkbook(loadingListData, filename) {
    const XLSX = typeof window !== "undefined" ? window.XLSX : null;
    const workbook = buildCoupangLoadingListWorkbook(loadingListData, XLSX);
    XLSX.writeFile(workbook, filename);
}

function getLoadingListRenderRoot() {
    let root = document.getElementById("coupang-loading-list-render-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "coupang-loading-list-render-root";
        root.style.cssText = [
            "position:fixed",
            "left:-20000px",
            "top:0",
            `width:${PDF_RENDER_WIDTH_PX}px`,
            `height:${PDF_RENDER_HEIGHT_PX}px`,
            "overflow:hidden",
            "pointer-events:none",
            "z-index:-1",
            "background:#fff",
        ].join(";");
        document.body.appendChild(root);
    }
    return root;
}

function buildLoadingListPageHtml(center, palletItems, palletIndex) {
    const poDisplay = getLoadingListPoDisplay(center.poNumbersText);
    const rows = [];
    for (let index = 0; index < MAX_SKU_PER_BLOCK; index += 1) {
        const item = palletItems[index];
        rows.push(`
            <tr>
                <td class="no-cell">${index + 1}</td>
                <td class="sku-code-cell">${escapeHtml(item?.skuCode || "")}</td>
                <td class="sku-name-cell">${escapeHtml(item?.skuName || "")}</td>
                <td class="box-cell">${item ? escapeHtml(Math.ceil(item.boxCount || 0)) : ""}</td>
                <td class="qty-cell">${item ? escapeHtml(Math.round(item.eaQty || 0)) : ""}</td>
            </tr>
        `);
    }

    return `
        <style>
            .loading-list-pdf-page {
                position: relative;
                box-sizing: border-box;
                width: ${PDF_RENDER_WIDTH_PX}px;
                height: ${PDF_RENDER_HEIGHT_PX}px;
                background: #ffffff;
                color: #000000;
                font-family: "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif;
                font-weight: 800;
                line-height: 1.2;
                overflow: hidden;
            }

            .loading-list-pdf-title {
                position: absolute;
                top: 58px;
                left: 0;
                width: 100%;
                text-align: center;
                font-size: 24px;
                line-height: 1.12;
                font-style: italic;
                font-weight: 900;
                letter-spacing: 1px;
            }

            .loading-list-pdf-frame {
                position: absolute;
                left: 168px;
                top: 100px;
                width: 782px;
                height: 524px;
                border: 1px solid #000000;
                box-sizing: border-box;
            }

            .loading-list-pdf-total {
                position: absolute;
                top: 139px;
                left: 278px;
                min-width: 26px;
                text-align: center;
                font-size: 17px;
            }

            .loading-list-pdf-pt {
                position: absolute;
                top: 139px;
                left: 338px;
                min-width: 70px;
                font-size: 17px;
            }

            .loading-list-pdf-info {
                position: absolute;
                font-size: 16px;
                white-space: nowrap;
            }

            .loading-list-pdf-label {
                display: inline-block;
                min-width: 105px;
            }

            .loading-list-pdf-value {
                display: inline-block;
                vertical-align: bottom;
                overflow: hidden;
                text-overflow: clip;
                white-space: nowrap;
            }

            .loading-list-pdf-left {
                left: 234px;
            }

            .loading-list-pdf-right {
                left: 660px;
            }

            .loading-list-pdf-date {
                top: 170px;
            }

            .loading-list-pdf-company {
                top: 199px;
            }

            .loading-list-pdf-po {
                top: 226px;
                width: 690px;
                height: 58px;
                max-height: 58px;
                display: flex;
                align-items: flex-start;
                line-height: 22px;
                overflow: hidden;
                white-space: normal;
            }

            .loading-list-pdf-box {
                top: 139px;
            }

            .loading-list-pdf-center {
                top: 170px;
            }

            .loading-list-pdf-po .loading-list-pdf-value {
                flex: 1 1 auto;
                width: auto;
                max-height: 58px;
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 3;
                font-size: var(--po-font-size, 16px);
                line-height: var(--po-line-height, 22px);
                white-space: normal;
                overflow: hidden;
                overflow-wrap: normal;
                word-break: normal;
            }

            .loading-list-pdf-table {
                position: absolute;
                left: 198px;
                top: 300px;
                width: 720px;
                border-collapse: collapse;
                table-layout: fixed;
                font-size: 16px;
            }

            .loading-list-pdf-table th,
            .loading-list-pdf-table td {
                height: 28px;
                box-sizing: border-box;
                border: 1px solid #000000;
                padding: 3px 4px;
                overflow: hidden;
                text-overflow: clip;
                white-space: nowrap;
                vertical-align: middle;
                text-align: left;
            }

            .loading-list-pdf-table th {
                font-size: 16px;
                font-weight: 900;
            }

            .loading-list-pdf-table .no-cell {
                width: 32px;
            }

            .loading-list-pdf-table .sku-code-cell {
                width: 106px;
            }

            .loading-list-pdf-table .sku-name-cell {
                width: 322px;
            }

            .loading-list-pdf-table .box-cell,
            .loading-list-pdf-table .qty-cell {
                width: 130px;
            }
        </style>
        <div class="loading-list-pdf-page">
            <div class="loading-list-pdf-title">쿠팡 파렛트 적재리스트 (일반)</div>
            <div class="loading-list-pdf-frame"></div>
            <div class="loading-list-pdf-total">${escapeHtml(center.pallets.length)}</div>
            <div class="loading-list-pdf-pt">${escapeHtml(`${center.pallets.length}-${palletIndex + 1}`)}</div>

            <div class="loading-list-pdf-info loading-list-pdf-left loading-list-pdf-date">
                <span class="loading-list-pdf-label">입고예정일자 :</span>
                <span class="loading-list-pdf-value">${escapeHtml(formatDueDateForLoadingList(center.dueDate))}</span>
            </div>
            <div class="loading-list-pdf-info loading-list-pdf-left loading-list-pdf-company">
                <span class="loading-list-pdf-label">업체명 :</span>
                <span class="loading-list-pdf-value">${escapeHtml(DEFAULT_COMPANY_NAME)}</span>
            </div>
            <div class="loading-list-pdf-info loading-list-pdf-left loading-list-pdf-po" style="--po-font-size: ${poDisplay.fontSize}px; --po-line-height: ${poDisplay.lineHeight}px;">
                <span class="loading-list-pdf-label">발주번호 :</span>
                <span class="loading-list-pdf-value" title="${escapeHtml(poDisplay.text)}">${escapeHtml(poDisplay.text)}</span>
            </div>

            <div class="loading-list-pdf-info loading-list-pdf-right loading-list-pdf-box">
                <span class="loading-list-pdf-label">총 박스수량 :</span>
                <span class="loading-list-pdf-value">${escapeHtml(center.totalBoxes)} BOX</span>
            </div>
            <div class="loading-list-pdf-info loading-list-pdf-right loading-list-pdf-center">
                <span class="loading-list-pdf-label">납품센터명 :</span>
                <span class="loading-list-pdf-value">${escapeHtml(center.center)}</span>
            </div>

            <table class="loading-list-pdf-table">
                <thead>
                    <tr>
                        <th class="no-cell">NO</th>
                        <th class="sku-code-cell">SKU NO</th>
                        <th class="sku-name-cell">SKU NAME</th>
                        <th class="box-cell">BOX 수량</th>
                        <th class="qty-cell">수량</th>
                    </tr>
                </thead>
                <tbody>${rows.join("")}</tbody>
            </table>
        </div>
    `;
}

async function renderLoadingListPageToCanvas(center, palletItems, palletIndex, html2canvas) {
    const root = getLoadingListRenderRoot();
    const pageWrap = document.createElement("div");
    pageWrap.innerHTML = buildLoadingListPageHtml(center, palletItems, palletIndex);
    root.appendChild(pageWrap);

    try {
        if (document.fonts?.ready) {
            try {
                await document.fonts.ready;
            } catch (error) {
                console.warn("폰트 로딩 완료를 기다리지 못했습니다.", error);
            }
        }

        const pageElement = pageWrap.querySelector(".loading-list-pdf-page");
        return await html2canvas(pageElement, {
            backgroundColor: "#ffffff",
            scale: PDF_RENDER_SCALE,
            logging: false,
            width: PDF_RENDER_WIDTH_PX,
            height: PDF_RENDER_HEIGHT_PX,
            windowWidth: PDF_RENDER_WIDTH_PX,
            windowHeight: PDF_RENDER_HEIGHT_PX,
        });
    } finally {
        pageWrap.remove();
    }
}

function addLoadingListImagePage(pdf, imageData, isFirstPage) {
    if (!isFirstPage) pdf.addPage("a4", "landscape");
    pdf.addImage(
        imageData,
        "PNG",
        0,
        0,
        PDF_PAGE_WIDTH_PT,
        PDF_PAGE_HEIGHT_PT,
        undefined,
        "FAST",
    );
}

async function buildCenterLoadingListPdfBlob(center, dependencies, options = {}) {
    const { jsPDF, html2canvas } = dependencies;
    const { centerIndex = 0, centerCount = 1, onProgress } = options;
    const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
        compress: true,
    });

    let isFirstPage = true;

    for (let palletIndex = 0; palletIndex < center.pallets.length; palletIndex += 1) {
        const palletItems = center.pallets[palletIndex];
        onProgress?.({
            phase: "render",
            center,
            centerIndex,
            centerCount,
            palletIndex: palletIndex + 1,
            palletCount: center.pallets.length,
        });
        const canvas = await renderLoadingListPageToCanvas(center, palletItems, palletIndex, html2canvas);
        const imageData = canvas.toDataURL("image/png");

        for (let copyIndex = 0; copyIndex < PALLET_PRINT_COPIES; copyIndex += 1) {
            addLoadingListImagePage(pdf, imageData, isFirstPage);
            isFirstPage = false;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    return pdf.output("blob");
}

function getPdfDependencies() {
    const jsPDF = window.jspdf?.jsPDF;
    const html2canvas = window.html2canvas;
    const JSZip = window.JSZip;

    if (!jsPDF) throw new Error("PDF 생성 라이브러리(jsPDF)가 로드되지 않았습니다.");
    if (!html2canvas) throw new Error("PDF 렌더링 라이브러리(html2canvas)가 로드되지 않았습니다.");
    if (!JSZip) throw new Error("ZIP 생성 라이브러리(JSZip)가 로드되지 않았습니다.");

    return { jsPDF, html2canvas, JSZip };
}

export async function prepareCoupangLoadingListPdfs(loadingListData, filenameBase = "coupang-loading-list", options = {}) {
    if (!Array.isArray(loadingListData) || !loadingListData.length) {
        throw new Error("적재리스트를 만들 쿠팡 밀크런 데이터가 없습니다.");
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
        throw new Error("PDF 다운로드는 브라우저에서만 실행할 수 있습니다.");
    }

    const dependencies = getPdfDependencies();
    const safeBaseName = sanitizeFileNamePart(filenameBase);

    if (loadingListData.length === 1) {
        const center = loadingListData[0];
        const pdfBlob = await buildCenterLoadingListPdfBlob(center, dependencies, {
            centerIndex: 1,
            centerCount: 1,
            onProgress: options.onProgress,
        });
        return {
            type: "pdf",
            count: 1,
            blob: pdfBlob,
            filename: `${sanitizeFileNamePart(center.center)} 파렛트 적재리스트.pdf`,
        };
    }

    const zip = new dependencies.JSZip();

    for (let centerIndex = 0; centerIndex < loadingListData.length; centerIndex += 1) {
        const center = loadingListData[centerIndex];
        const pdfBlob = await buildCenterLoadingListPdfBlob(center, dependencies, {
            centerIndex: centerIndex + 1,
            centerCount: loadingListData.length,
            onProgress: options.onProgress,
        });
        zip.file(`${sanitizeFileNamePart(center.center)} 파렛트 적재리스트.pdf`, pdfBlob);
    }

    options.onProgress?.({ phase: "zip", centerCount: loadingListData.length });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    return {
        type: "zip",
        count: loadingListData.length,
        blob: zipBlob,
        filename: `${safeBaseName}-파렛트-적재리스트.zip`,
    };
}

export async function downloadCoupangLoadingListPdfs(loadingListData, filenameBase = "coupang-loading-list", options = {}) {
    const downloadFile = await prepareCoupangLoadingListPdfs(loadingListData, filenameBase, options);
    triggerCoupangLoadingListDownload(downloadFile);
    return {
        type: downloadFile.type,
        count: downloadFile.count,
        filename: downloadFile.filename,
    };
}
