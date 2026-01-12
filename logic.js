import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, set, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

// 1. Your Firebase Config (Keep your existing one)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "rfid-attendance-30745.firebaseapp.com",
  databaseURL: "https://rfid-attendance-30745-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rfid-attendance-30745",
  storageBucket: "rfid-attendance-30745.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// =======================================================
//  BUTTON LOGIC
// =======================================================

// A. Handle "Delete This Date Only" (Creates Exception)
document.getElementById('btn-delete-single').addEventListener('click', function() {
    
    // 1. Get the data from your UI
    const selectedDate = document.getElementById('schedule-date-picker').value; // e.g., "2026-01-13"
    const subjectCode = document.getElementById('input-subject-code').value;    // e.g., "EEE430"
    
    if(!selectedDate || !subjectCode) {
        alert("Error: Missing Date or Subject Code");
        return;
    }

    // 2. Construct the "Exception" path
    // Path: class_exceptions / 2026-01-13 / EEE430
    const exceptionPath = `class_exceptions/${selectedDate}/${subjectCode}`;
    const dbRef = ref(db, exceptionPath);

    // 3. Write "true" -> This automatically creates the "folder"
    set(dbRef, true)
        .then(() => {
            alert(`Class ${subjectCode} cancelled for ${selectedDate} only.`);
            closeModal(); // Call your function to hide the popup
            // location.reload(); // Optional: Refresh page
        })
        .catch((error) => {
            console.error("Error adding exception:", error);
            alert("Failed to update schedule.");
        });
});


// B. Handle "Delete Entire Series" (Deletes from Schedule)
document.getElementById('btn-delete-series').addEventListener('click', function() {
    
    // 1. Get Day of Week (0=Sun, 1=Mon, etc.)
    // You likely have this stored in a variable when the user clicked the calendar
    // For this example, let's assume you stored the key of the class being edited
    const dayIndex = 1; // Example: Monday
    const classKey = "some_unique_id_from_firebase"; // You need the ID of the class to delete
    
    if(!classKey) {
        alert("Error: Could not identify class series.");
        return;
    }

    // 2. Remove the actual node from the weekly schedule
    const seriesPath = `class_schedule/${dayIndex}/${classKey}`;
    const dbRef = ref(db, seriesPath);

    remove(dbRef)
        .then(() => {
            alert("Entire class series deleted.");
            closeModal();
            // location.reload(); 
        })
        .catch((error) => {
            console.error("Delete failed:", error);
        });
});

// Helper: Close Modal
function closeModal() {
    document.querySelector('.modal-container').style.display = 'none'; // Adjust class name to match yours
}
