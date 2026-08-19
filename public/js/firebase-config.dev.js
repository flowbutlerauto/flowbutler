import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyAly32Slh9AKHtyMRZ_vl2m9lAFt-4Kj6o",
    authDomain: "flowbutler-dev.firebaseapp.com",
    projectId: "flowbutler-dev",
    storageBucket: "flowbutler-dev.firebasestorage.app",
    messagingSenderId: "648289935946",
    appId: "1:648289935946:web:59a500d21fd54001d0fcb3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-northeast3");

export { auth, db, functions };
