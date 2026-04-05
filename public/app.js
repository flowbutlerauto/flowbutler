import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
    doc,
    getDoc,
    getFirestore,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBYQbBznp6VQjy4MdXDK632fLPtMB3LwgM",
    authDomain: "flowbutler.firebaseapp.com",
    projectId: "flowbutler",
    storageBucket: "flowbutler.firebasestorage.app",
    messagingSenderId: "275549773661",
    appId: "1:275549773661:web:b62155c0f7d88cb50592b4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signup-btn");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");
const userInfoEl = document.getElementById("user-info");
const pendingArea = document.getElementById("pending-area");
const dashboardArea = document.getElementById("dashboard-area");
const testActionBtn = document.getElementById("test-action-btn");

let isSigningUp = false;

function setStatus(message) {
    statusEl.textContent = message;
}

function hideAllProtectedAreas() {
    pendingArea.style.display = "none";
    dashboardArea.style.display = "none";
}

function showPendingArea() {
    hideAllProtectedAreas();
    pendingArea.style.display = "block";
}

function showDashboardArea() {
    hideAllProtectedAreas();
    dashboardArea.style.display = "block";
}

function resetLoggedOutView() {
    userInfoEl.textContent = "로그인 안 됨";
    setStatus("");
    hideAllProtectedAreas();
}

signupBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    isSigningUp = true;
    setStatus("회원가입 처리 중...");

    let userCredential;

    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            approved: false,
            role: "pending",
            createdAt: serverTimestamp()
        });

        setStatus(`회원가입 완료\n승인 대기 상태입니다: ${user.email}`);
        showPendingArea();
    } catch (error) {
        console.error("회원가입 처리 실패:", error);

        if (userCredential?.user) {
            try {
                await deleteUser(userCredential.user);
            } catch (deleteError) {
                console.error("Auth 롤백 실패:", deleteError);
            }
        }

        setStatus(`회원가입 실패\n${error.code}\n${error.message}`);
    } finally {
        isSigningUp = false;
    }
});

loginBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            hideAllProtectedAreas();
            setStatus("사용자 문서가 없습니다. 관리자에게 문의해주세요.");
            return;
        }

        const userData = userSnap.data();

        if (userData.approved === true) {
            setStatus(`로그인 성공: ${user.email}\n승인된 사용자입니다.`);
            showDashboardArea();
        } else {
            setStatus(`로그인 성공: ${user.email}\n현재 관리자 승인 대기중입니다.`);
            showPendingArea();
        }
    } catch (error) {
        console.error("로그인 실패:", error);
        setStatus(`로그인 실패: ${error.code}\n${error.message}`);
    }
});

logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
        resetLoggedOutView();
        setStatus("로그아웃 성공");
    } catch (error) {
        console.error("로그아웃 실패:", error);
        setStatus(`로그아웃 실패: ${error.code}\n${error.message}`);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        resetLoggedOutView();
        return;
    }

    userInfoEl.textContent = user.email;

    if (isSigningUp) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            hideAllProtectedAreas();
            setStatus("로그인된 계정은 있지만 사용자 문서가 없습니다.");
            return;
        }

        const userData = userSnap.data();

        if (userData.approved) {
            setStatus("승인된 계정입니다.");
            showDashboardArea();
        } else {
            setStatus("관리자 승인 대기중입니다.");
            showPendingArea();
        }
    } catch (error) {
        console.error("사용자 문서 조회 실패:", error);
        setStatus(`사용자 정보 조회 실패\n${error.code}\n${error.message}`);
    }
});

testActionBtn?.addEventListener("click", () => {
    alert("승인된 사용자만 실행 가능한 테스트 작업입니다.");
});