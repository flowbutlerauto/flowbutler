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

const TEXT = {
    EMAIL_REQUIRED: "\uc774\uba54\uc77c\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
    PASSWORD_REQUIRED: "\ube44\ubc00\ubc88\ud638\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
    PASSWORD_TOO_SHORT: "\ube44\ubc00\ubc88\ud638\ub294 6\uc790 \uc774\uc0c1\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4.",
    SIGNUP_PROGRESS: "\ud68c\uc6d0\uac00\uc785\uc744 \ucc98\ub9ac\ud558\uace0 \uc788\uc5b4\uc694...",
    SIGNUP_SUCCESS: "\ud68c\uc6d0\uac00\uc785\uc774 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc2b9\uc778 \ub300\uae30 \ud398\uc774\uc9c0\ub85c \uc774\ub3d9\ud569\ub2c8\ub2e4.",
    ERROR_EMAIL_IN_USE: "\uc774\ubbf8 \uac00\uc785\ub41c \uc774\uba54\uc77c\uc785\ub2c8\ub2e4. \ub85c\uadf8\uc778 \ud398\uc774\uc9c0\uc5d0\uc11c \ub85c\uadf8\uc778\ud574 \uc8fc\uc138\uc694.",
    ERROR_INVALID_EMAIL: "\uc774\uba54\uc77c \ud615\uc2dd\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.",
    ERROR_WEAK_PASSWORD: "\ube44\ubc00\ubc88\ud638 \ubcf4\uc548 \uac15\ub3c4\uac00 \ub0ae\uc2b5\ub2c8\ub2e4. 6\uc790 \uc774\uc0c1\uc73c\ub85c \ub2e4\uc2dc \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
    ERROR_NETWORK: "\ub124\ud2b8\uc6cc\ud06c \uc5f0\uacb0\uc774 \ubd88\uc548\uc815\ud569\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.",
    ERROR_DEFAULT_PREFIX: "\ud68c\uc6d0\uac00\uc785 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.\n\uc624\ub958 \ucf54\ub4dc: "
};

function setStatus(message) {
    statusEl.textContent = message;
}

function getSignupErrorMessage(errorCode) {
    switch (errorCode) {
        case "auth/email-already-in-use":
            return TEXT.ERROR_EMAIL_IN_USE;
        case "auth/invalid-email":
            return TEXT.ERROR_INVALID_EMAIL;
        case "auth/weak-password":
            return TEXT.ERROR_WEAK_PASSWORD;
        case "auth/network-request-failed":
            return TEXT.ERROR_NETWORK;
        default:
            return `${TEXT.ERROR_DEFAULT_PREFIX}${errorCode || "unknown"}`;
    }
}

moveLoginBtn?.addEventListener("click", () => {
    window.location.href = "./login.html";
});

signupBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
        setStatus(TEXT.EMAIL_REQUIRED);
        return;
    }

    if (!password) {
        setStatus(TEXT.PASSWORD_REQUIRED);
        return;
    }

    if (password.length < 6) {
        setStatus(TEXT.PASSWORD_TOO_SHORT);
        return;
    }

    let userCredential;

    try {
        setStatus(TEXT.SIGNUP_PROGRESS);

        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            approved: false,
            plan: "free",
            role: "user",
            createdAt: serverTimestamp()
        });

        setStatus(TEXT.SIGNUP_SUCCESS);
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

        setStatus(getSignupErrorMessage(error?.code));
    }
});
