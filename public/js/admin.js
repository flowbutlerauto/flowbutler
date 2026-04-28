import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const statusEl = document.getElementById("admin-status");
const tableBodyEl = document.getElementById("pending-users-body");
const refreshBtn = document.getElementById("refresh-btn");
const logoutBtn = document.getElementById("logout-btn");
const reviewModeBtn = document.getElementById("review-mode-btn");
const deleteModeBtn = document.getElementById("delete-mode-btn");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");

let currentMode = "review";
let currentSearchQuery = "";

function safeText(value) {
  return String(value ?? "").trim();
}

function toDisplayDate(value) {
  if (!value) return "-";

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("ko-KR");
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString("ko-KR");
  }

  return "-";
}

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message ?? "";
}

function getUserStatus(userData) {
  if (safeText(userData?.status)) {
    return safeText(userData.status).toLowerCase();
  }

  return userData?.approved === true ? "approved" : "pending";
}

function getStatusLabel(status) {
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  if (status === "deleted") return "삭제";
  return "대기";
}

function isManagerOrAdmin(role) {
  return role === "manager" || role === "admin";
}

function setMode(mode) {
  currentMode = mode === "delete" ? "delete" : "review";
  reviewModeBtn?.classList.toggle("is-active", currentMode === "review");
  deleteModeBtn?.classList.toggle("is-active", currentMode === "delete");
}

async function ensureAdminAccess(user) {
  if (!user) {
    window.location.href = "/login.html";
    return false;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    setStatus("사용자 문서를 찾을 수 없습니다.");
    return false;
  }

  const userData = userSnap.data() || {};
  const role = safeText(userData.role).toLowerCase() || "user";
  const status = getUserStatus(userData);

  if (status !== "approved") {
    window.location.href = "/pending.html";
    return false;
  }

  if (!isManagerOrAdmin(role)) {
    setStatus("관리자 계정만 접근할 수 있습니다.");
    tableBodyEl.innerHTML = '<tr><td colspan="6" class="admin-empty">관리자 권한이 없습니다.</td></tr>';
    return false;
  }

  return true;
}

async function fetchWithAuth(url, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("로그인이 필요합니다.");
  }

  const idToken = await user.getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(options.headers || {}),
    },
  });
}

function renderEmpty(message) {
  tableBodyEl.innerHTML = `<tr><td colspan="6" class="admin-empty">${message}</td></tr>`;
}

function renderActionButtons(status, uid) {
  if (currentMode === "delete") {
    return `<button class="secondary-btn admin-action-btn admin-delete-btn" data-action="delete" data-uid="${uid}">계정 삭제</button>`;
  }

  if (status === "pending") {
    return `
      <button class="primary-btn admin-action-btn" data-action="approve" data-uid="${uid}">승인</button>
      <button class="secondary-btn admin-action-btn" data-action="reject" data-uid="${uid}">반려</button>
    `;
  }

  if (status === "rejected") {
    return `<button class="primary-btn admin-action-btn" data-action="approve" data-uid="${uid}">재승인</button>`;
  }

  return "<span class=\"admin-row-meta\">처리 완료</span>";
}

function renderRows(users) {
  if (!Array.isArray(users) || users.length === 0) {
    renderEmpty("조건에 맞는 계정이 없습니다.");
    return;
  }

  tableBodyEl.innerHTML = users.map((user) => {
    const uid = safeText(user.uid);
    const email = safeText(user.email) || "-";
    const plan = safeText(user.plan) || "free";
    const role = safeText(user.role) || "user";
    const createdAt = toDisplayDate(user.createdAt);
    const status = safeText(user.status).toLowerCase() || "pending";

    return `
      <tr>
        <td>${email}</td>
        <td>${getStatusLabel(status)}</td>
        <td>${plan}</td>
        <td>${role}</td>
        <td>${createdAt}</td>
        <td><div class="admin-actions">${renderActionButtons(status, uid)}</div></td>
      </tr>
    `;
  }).join("");
}

function getListEndpoint() {
  const queryString = new URLSearchParams();

  if (currentSearchQuery) {
    queryString.set("q", currentSearchQuery);
  }

  if (currentMode === "review") {
    return `/api/admin/users/pending?${queryString.toString()}`;
  }

  queryString.set("scope", "all");
  return `/api/admin/users?${queryString.toString()}`;
}

async function loadUsers() {
  const modeLabel = currentMode === "review" ? "가입 승인/반려" : "계정 삭제";
  setStatus(`${modeLabel} 목록을 불러오는 중입니다...`);
  renderEmpty("목록을 불러오는 중입니다...");

  try {
    const response = await fetchWithAuth(getListEndpoint());
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.message || "계정 목록 조회에 실패했습니다.");
    }

    const users = Array.isArray(payload.users) ? payload.users : [];
    renderRows(users);
    setStatus(`${modeLabel} 대상 ${users.length}건`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "목록 조회 중 오류가 발생했습니다.");
    renderEmpty("목록 조회 중 오류가 발생했습니다.");
  }
}

async function handleApprove(uid) {
  setStatus("승인 처리 중...");

  const response = await fetchWithAuth(`/api/admin/users/${uid}/approve`, {
    method: "POST",
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "승인 처리에 실패했습니다.");
  }

  setStatus("승인 처리 완료");
}

async function handleReject(uid) {
  const reason = window.prompt("반려 사유를 입력하세요.");

  if (reason === null) {
    setStatus("반려 처리를 취소했습니다.");
    return;
  }

  if (!safeText(reason)) {
    setStatus("반려 사유는 필수입니다.");
    return;
  }

  setStatus("반려 처리 중...");

  const response = await fetchWithAuth(`/api/admin/users/${uid}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: safeText(reason) }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "반려 처리에 실패했습니다.");
  }

  setStatus("반려 처리 완료");
}

async function handleDelete(uid) {
  const reason = window.prompt("계정 삭제 사유를 입력하세요. (선택)") ?? "";
  const shouldDelete = window.confirm("정말 이 계정을 삭제할까요? 삭제 후 사용자는 다시 회원가입해야 합니다.");

  if (!shouldDelete) {
    setStatus("계정 삭제를 취소했습니다.");
    return;
  }

  setStatus("계정 삭제 처리 중...");

  const response = await fetchWithAuth(`/api/admin/users/${uid}/delete`, {
    method: "POST",
    body: JSON.stringify({ reason: safeText(reason) }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.message || "계정 삭제에 실패했습니다.");
  }

  setStatus("계정 삭제 완료");
}

tableBodyEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const uid = safeText(button.dataset.uid);
  const action = safeText(button.dataset.action);
  if (!uid || !action) return;

  button.disabled = true;

  try {
    if (action === "approve") await handleApprove(uid);
    if (action === "reject") await handleReject(uid);
    if (action === "delete") await handleDelete(uid);
    await loadUsers();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "처리 중 오류가 발생했습니다.");
  } finally {
    button.disabled = false;
  }
});

reviewModeBtn?.addEventListener("click", async () => {
  setMode("review");
  await loadUsers();
});

deleteModeBtn?.addEventListener("click", async () => {
  setMode("delete");
  await loadUsers();
});

searchBtn?.addEventListener("click", async () => {
  currentSearchQuery = safeText(searchInput?.value);
  await loadUsers();
});

searchInput?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  currentSearchQuery = safeText(searchInput.value);
  await loadUsers();
});

refreshBtn?.addEventListener("click", async () => {
  currentSearchQuery = safeText(searchInput?.value);
  await loadUsers();
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "/login.html";
  } catch (error) {
    console.error(error);
    setStatus("로그아웃 중 오류가 발생했습니다.");
  }
});

onAuthStateChanged(auth, async (user) => {
  try {
    const allowed = await ensureAdminAccess(user);
    if (!allowed) return;

    setMode("review");
    await loadUsers();
  } catch (error) {
    console.error(error);
    setStatus("권한 확인 중 오류가 발생했습니다.");
  }
});
