// =======================================================
// 1. IMPORTS (Standard Modular SDK)
// =======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase, ref, set, remove, get, child } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

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
const db = getDatabase(app);

// =======================================================
// 3. AUTHENTICATION CHECK (Fixes Login Issue)
// =======================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("User is logged in:", user.email);
    // User is signed in, load the schedule data
    loadScheduleData(); 
  } else {
    console.log("No user detected. Redirecting...");
    // If no user, kick them back to login page
    window.location.href = "index.html"; 
  }
});

// Logout Button Logic
const logoutBtn = document.getElementById('logout-btn'); // Check your HTML ID
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            window.location.href = "index.html";
        }).catch((error) => {
            console.error("Sign out error", error);
        });
    });
}

// =======================================================
// 4. SCHEDULE & CALENDAR LOGIC (Simplified)
// =======================================================
function loadScheduleData() {
    console.log("Loading schedule data from Firebase...");
    // (Your existing code to populate the calendar goes here)
    // For now, this confirms the page is working.
}

// =======================================================
// 5. DELETE & EXCEPTION LOGIC (The New Feature)
// =======================================================

// A. Handle "Delete This Date Only" (Creates Exception)
const btnSingle = document.getElementById('btn-delete-single');
if (btnSingle) {
    btnSingle.addEventListener('click', function() {
        
        const dateInput = document.getElementById('schedule-date-picker');
        const subjectInput = document.getElementById('input-subject-code');

        // Validation
        if(!dateInput || !subjectInput) {
            console.error("HTML Error: Missing input IDs 'schedule-date-picker' or 'input-subject-code'");
            return;
        }

        const selectedDate = dateInput.value; 
        const subjectCode = subjectInput.value;    
        
        if(!selectedDate || !subjectCode) {
            alert("Error: Please select a valid date and subject.");
            return;
        }

        // Construct Path: class_exceptions / YYYY-MM-DD / CourseName
        const exceptionPath = `class_exceptions/${selectedDate}/${subjectCode}`;
        const dbRef = ref(db, exceptionPath);

        // Write "true" to create the exception
        set(dbRef, true)
            .then(() => {
                alert(`SUCCESS: Class ${subjectCode} cancelled for ${selectedDate} only.`);
                closeModal(); 
                // Optional: Refresh calendar here
            })
            .catch((error) => {
                console.error("Error adding exception:", error);
                alert("Failed to cancel class: " + error.message);
            });
    });
}

// B. Handle "Delete Entire Series" (Deletes from Schedule)
const btnSeries = document.getElementById('btn-delete-series');
if (btnSeries) {
    btnSeries.addEventListener('click', function() {
        
        // >>> IMPORTANT: You must get these values dynamically from your UI <<<
        // Currently hardcoded as placeholders
        const dayIndex = 1; // Example: Monday (Needs to come from your clicked event)
        const classKey = document.getElementById('hidden-class-id').value; // Example hidden input
        
        if(!classKey) {
            alert("Error: Could not identify the class series to delete.");
            return;
        }

        if(confirm("Are you sure? This will delete the class for EVERY week.")) {
            const seriesPath = `class_schedule/${dayIndex}/${classKey}`;
            const dbRef = ref(db, seriesPath);

            remove(dbRef)
                .then(() => {
                    alert("Entire class series deleted.");
                    closeModal();
                })
                .catch((error) => {
                    console.error("Delete failed:", error);
                    alert("Failed to delete series.");
                });
        }
    });
}

// Helper: Close Modal
function closeModal() {
    // Make sure this matches your CSS class for the popup
    const modal = document.querySelector('.modal-container'); 
    if (modal) {
        modal.style.display = 'none';
    } else {
        console.warn("Could not find .modal-container to close");
    }
}
