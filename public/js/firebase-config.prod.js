import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

export { auth, db };
