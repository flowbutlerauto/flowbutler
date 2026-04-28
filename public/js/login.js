import {
    onAuthStateChanged,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const moveSignupBtn = document.getElementById("move-signup-btn");
const userInfoEl = document.getElementById("user-info");
const statusEl = document.getElementById("status");

function safeText(value) {
    return String(value ?? "").trim();
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

function setStatus(message) {
    statusEl.textContent = message;
}

async function moveUserByApproval(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        setStatus("사용자 문서가 없습니다. 관리자에게 문의해주세요.");
        return;
    }

    const userData = userSnap.data();
    const status = getUserStatus(userData);
    const role = safeText(userData?.role).toLowerCase() || "user";

    if (status !== "approved") {
        window.location.href = "./pending.html";
        return;
    }

    if (isManagerOrAdmin(role)) {
        window.location.href = "./admin.html";
        return;
    }

    window.location.href = "./dashboard.html";
}

moveSignupBtn?.addEventListener("click", () => {
    window.location.href = "./signup.html";
});

loginBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
        setStatus("이메일을 입력해주세요.");
        return;
    }

    if (!password) {
        setStatus("비밀번호를 입력해주세요.");
        return;
    }

    try {
        setStatus("로그인 처리 중...");
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await moveUserByApproval(userCredential.user);
    } catch (error) {
        console.error(error);
        setStatus(`로그인 실패\n${error.code}\n${error.message}`);
    }
});

onAuthStateChanged(auth, async (user) => {
    userInfoEl.textContent = user ? user.email : "로그인 안 됨";

    if (!user) return;

    try {
        await moveUserByApproval(user);
    } catch (error) {
        console.error(error);
        setStatus("사용자 상태 확인 중 오류가 발생했습니다.");
    }
});
