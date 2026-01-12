// =======================================================
// 1. IMPORTS
// =======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// =======================================================
// 2. CONFIGURATION (PASTE YOUR KEYS HERE)
// =======================================================
const firebaseConfig = {
  // >>> PASTE YOUR REAL KEYS HERE <<<
  apiKey: "AIzaSyD_YOUR_REAL_API_KEY",
  authDomain: "rfid-attendance-30745.firebaseapp.com",
  databaseURL: "https://rfid-attendance-30745-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rfid-attendance-30745",
  storageBucket: "rfid-attendance-30745.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// =======================================================
// 3. LOGIN BUTTON LOGIC
// =======================================================
const loginBtn = document.getElementById('login-btn'); // Make sure this matches your HTML ID

if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevents page refresh

        // Get values from HTML inputs
        const email = document.getElementById('email').value;       // Match HTML ID
        const password = document.getElementById('password').value; // Match HTML ID

        if (!email || !password) {
            alert("Please enter both email and password.");
            return;
        }

        console.log("Attempting login...");

        // Firebase Login Function
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in successfully
                const user = userCredential.user;
                console.log("Login Successful:", user.email);
                alert("Login Successful!");
                
                // Redirect to the Dashboard
                window.location.href = "dashboard.html"; // CHANGE THIS to your actual dashboard filename
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error("Login Failed:", errorCode, errorMessage);
                alert("Login Failed: " + errorMessage);
            });
    });
}

// =======================================================
// 4. AUTO-REDIRECT (Optional)
// =======================================================
// If user is already logged in, send them straight to dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("User already logged in. Redirecting...");
    window.location.href = "dashboard.html"; // CHANGE THIS to your actual dashboard filename
  }
});
