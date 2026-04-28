import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const statusEl = document.getElementById("admin-status");
const tableBodyEl = document.getElementById("pending-users-body");
const refreshBtn = document.getElementById("refresh-btn");
const logoutBtn = document.getElementById("logout-btn");

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

function isManagerOrAdmin(role) {
  return role === "manager" || role === "admin";
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
    tableBodyEl.innerHTML = '<tr><td colspan="5" class="admin-empty">관리자 권한이 없습니다.</td></tr>';
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
  tableBodyEl.innerHTML = `<tr><td colspan="5" class="admin-empty">${message}</td></tr>`;
}

function renderRows(users) {
  if (!Array.isArray(users) || users.length === 0) {
    renderEmpty("승인 대기 계정이 없습니다.");
    return;
  }

  tableBodyEl.innerHTML = users.map((user) => {
    const uid = safeText(user.uid);
    const email = safeText(user.email) || "-";
    const plan = safeText(user.plan) || "free";
    const role = safeText(user.role) || "user";
    const createdAt = toDisplayDate(user.createdAt);

    return `
      <tr data-uid="${uid}">
        <td>${email}</td>
        <td>${plan}</td>
        <td>${role}</td>
        <td>${createdAt}</td>
        <td>
          <div class="admin-actions">
            <button class="primary-btn admin-action-btn" data-action="approve">승인</button>
            <button class="secondary-btn admin-action-btn" data-action="reject">반려</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadPendingUsers() {
  setStatus("승인 대기 목록을 불러오는 중입니다...");
  renderEmpty("승인 대기 목록을 불러오는 중입니다...");

  try {
    const response = await fetchWithAuth("/api/admin/users/pending");
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.message || "승인 대기 목록 조회에 실패했습니다.");
    }

    const users = Array.isArray(payload.users) ? payload.users : [];
    renderRows(users);
    setStatus(`승인 대기 ${users.length}건`);
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

tableBodyEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const row = button.closest("tr[data-uid]");
  const uid = safeText(row?.dataset?.uid);
  const action = safeText(button.dataset.action);

  if (!uid || !action) return;

  button.disabled = true;

  try {
    if (action === "approve") {
      await handleApprove(uid);
    }

    if (action === "reject") {
      await handleReject(uid);
    }

    await loadPendingUsers();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "처리 중 오류가 발생했습니다.");
  } finally {
    button.disabled = false;
  }
});

refreshBtn?.addEventListener("click", () => {
  void loadPendingUsers();
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

    await loadPendingUsers();
  } catch (error) {
    console.error(error);
    setStatus("권한 확인 중 오류가 발생했습니다.");
  }
});
