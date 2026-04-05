import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const pendingMessageEl = document.getElementById("pending-message");
const logoutBtn = document.getElementById("logout-btn");

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "/login.html";
  } catch (error) {
    console.error(error);
    pendingMessageEl.textContent = "로그아웃 중 오류가 발생했습니다.";
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      pendingMessageEl.textContent = "사용자 정보가 없습니다.";
      return;
    }

    const userData = userSnap.data();

    if (userData.approved === true) {
      window.location.href = "/dashboard.html";
      return;
    }

    pendingMessageEl.textContent =
      `현재 관리자 승인 대기중입니다.\n\n계정: ${user.email}\n플랜: ${userData.plan ?? "free"}`;
  } catch (error) {
    console.error(error);
    pendingMessageEl.textContent = "승인 상태 확인 중 오류가 발생했습니다.";
  }
});