import {
    createUserWithEmailAndPassword,
    deleteUser
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
    doc,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signup-btn");
const moveLoginBtn = document.getElementById("move-login-btn");
const statusEl = document.getElementById("status");

function setStatus(message) {
    statusEl.textContent = message;
}

moveLoginBtn?.addEventListener("click", () => {
    window.location.href = "./login.html";
});

signupBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
        setStatus("이메일을 입력해 주세요.");
        return;
    }

    if (!password) {
        setStatus("비밀번호를 입력해 주세요.");
        return;
    }

    if (password.length < 6) {
        setStatus("비밀번호는 6자 이상이어야 합니다.");
        return;
    }

    let userCredential;

    try {
        setStatus("회원가입을 처리하고 있어요...");

        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            approved: false,
            plan: "free",
            role: "user",
            createdAt: serverTimestamp()
        });

        setStatus("회원가입이 완료되었습니다. 승인 대기 페이지로 이동합니다.");
        window.location.href = "./pending.html";
    } catch (error) {
        console.error(error);

        if (userCredential?.user) {
            try {
                await deleteUser(userCredential.user);
            } catch (deleteError) {
                console.error(deleteError);
            }
        }

        setStatus(`회원가입 중 오류가 발생했습니다.\n${error.code}\n${error.message}`);
    }
});
