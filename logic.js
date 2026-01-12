import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, remove, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ================= FIREBASE CONFIG =================
const firebaseConfig = {
    apiKey: "AIzaSyD_htAAKN1dv7fsOkO0g8IxgQRsDuIiyu4",
    authDomain: "rfid-attendance-30745.firebaseapp.com",
    databaseURL: "https://rfid-attendance-30745-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "rfid-attendance-30745",
    storageBucket: "rfid-attendance-30745.firebasestorage.app",
    messagingSenderId: "860028054162",
    appId: "1:860028054162:web:f3b05e9a5c6733bae0944b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Global Variables
let currentClassData = [];
let currentClassName = "";
let deleteTarget = null; 
let isEarlyExitOpen = false; // Tracks lock state safely

// =======================================================
// 1. AUTHENTICATION & PAGE ROUTING
// =======================================================
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('emailInput').value;
        const pass = document.getElementById('passwordInput').value;
        
        loginBtn.innerText = "Logging in...";
        
        signInWithEmailAndPassword(auth, email, pass).catch(e => {
            const err = document.getElementById('loginError');
            err.innerText = "Error: " + e.message;
            err.style.display = 'block';
            loginBtn.innerText = "Log In";
        });
    });
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => { window.location.href = "index.html"; });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logged In
        if (document.getElementById('loginScreen')) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
        }
        
        // Initialize Pages
        const todayStr = new Date().toISOString().split('T')[0];

        // If on Monitor Page (index.html)
        if (document.getElementById('historyDate')) {
            document.getElementById('historyDate').value = todayStr;
            initMonitorPage();
            initLecturerControl(); 
        }

        // If on Booking Page (booking.html)
        if (document.getElementById('viewDate')) {
            document.getElementById('viewDate').value = todayStr;
            updateTimeSlots();
            loadScheduleList(todayStr); 
            initLecturerControl(); 
        }

    } else {
        // Logged Out
        if (window.location.pathname.includes("booking.html")) {
            window.location.href = "index.html";
        } else {
            const loginScreen = document.getElementById('loginScreen');
            const dashScreen = document.getElementById('dashboardScreen');
            if(loginScreen) loginScreen.style.display = 'block';
            if(dashScreen) dashScreen.style.display = 'none';
        }
    }
});

// =======================================================
// 2. MONITORING LOGIC (index.html)
// =======================================================

function initMonitorPage() {
    const historyDate = document.getElementById('historyDate');
    const classSelector = document.getElementById('classSelector');

    // Update dropdown when date changes
    historyDate.addEventListener('change', () => {
        loadClassDropdown(historyDate.value);
    });

    // Load Attendance when Class is selected
    classSelector.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
            resetMonitorUI();
            return;
        }
        // val format: "08:00,2,EEE430"
        const [start, dur, name] = val.split(",");
        loadAttendance(start, name, parseInt(dur));
    });

    // Initial load
    loadClassDropdown(historyDate.value);

    // CSV Export
    document.getElementById('exportBtn').addEventListener('click', () => {
        if (!currentClassData.length) return alert("No data to export.");
        let csv = "data:text/csv;charset=utf-8,Name,ID,Status,Time\n" + 
                  currentClassData.map(r => `${r.name},${r.id},${r.status},${r.time}`).join("\n");
        const a = document.createElement("a");
        a.href = encodeURI(csv);
        a.download = `Attendance_${currentClassName}.csv`;
        a.click();
    });
}

function loadClassDropdown(dateStr) {
    const dayIdx = new Date(dateStr).getDay();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const label = document.getElementById('dayLabel');
    if(label) label.innerText = "Day: " + days[dayIdx];

    const sel = document.getElementById('classSelector');
    sel.innerHTML = "<option>Loading...</option>";

    onValue(ref(db, `class_schedule/${dayIdx}`), (snap) => {
        sel.innerHTML = "<option value=''>-- Select Class --</option>";
        if (!snap.exists()) return;

        snap.forEach(c => {
            const d = c.val();
            let show = false;
            // Filter logic
            if (d.type === 'repeat') show = true;
            if (d.type === 'once' && d.date === dateStr) show = true;

            // Note: We don't filter exceptions here (in dropdown) to keep it simple, 
            // but you could add the same exception logic here if needed.
            if (show) {
                const op = document.createElement('option');
                op.value = `${d.start_time},${d.duration},${d.name}`;
                op.innerText = `${d.start_time} - ${d.name}`;
                sel.appendChild(op);
            }
        });
    });
}

async function loadAttendance(startTimeStr, className, duration) {
    document.getElementById('activeClassTitle').innerText = `📂 ${className}`;
    currentClassName = className;
    const dateInput = document.getElementById('historyDate').value;

    // 1. GET ENROLLED LIST
    const studentSnapshot = await get(ref(db, 'StdInfo'));
    let enrolledStudents = {}; 
    let totalEnrolledCount = 0;

    if(studentSnapshot.exists()) {
        studentSnapshot.forEach(child => {
            const data = child.val();
            if(data.course && data.course[className] === true) {
                enrolledStudents[child.key] = { 
                    name: data.name,
                    matric: data.matric,
                    status: "Absent",
                    time: "--:--",
                    style: "border-left: 5px solid red; background:#fff5f5;"
                };
                totalEnrolledCount++;
            }
        });
    }

    // 2. GET ACTUAL SCANS
    const attRef = ref(db, `attendance/Electronic/${dateInput}/${className}`);
    
    onValue(attRef, (snap) => {
        const list = document.getElementById('attendanceList'); 
        list.innerHTML = "";
        currentClassData = []; 
        
        const scanData = snap.val() || {};
        let presentCount = 0;   // Completed (In + Out)
        let ongoingCount = 0;   // Incomplete (In only)

        // A. Match Enrolled Students
        Object.keys(enrolledStudents).forEach(uid => {
            const student = enrolledStudents[uid];
            const log = scanData[uid];

            if (log) {
                if (log.clock_out) {
                    // HAS CLOCK OUT -> TRULY PRESENT
                    student.status = "Present";
                    student.time = `${log.clock_in} - ${log.clock_out}`;
                    student.style = "border-left: 5px solid green; background:#f0fff4;";
                    presentCount++;
                } else {
                    // ONLY CLOCK IN -> INCOMPLETE
                    student.status = "Incomplete";
                    student.time = `${log.clock_in} (Active)`;
                    student.style = "border-left: 5px solid orange; background:#fff3cd;";
                    ongoingCount++; 
                }
                scanData[uid].handled = true; 
            }

            renderRow(list, student.name, student.matric, student.time, student.style);
            currentClassData.push({name: student.name, id: student.matric, status: student.status, time: student.time});
        });

        // B. Detect Intruders
        let intruderCount = 0;
        Object.keys(scanData).forEach(uid => {
            if (!scanData[uid].handled) {
                intruderCount++;
                const log = scanData[uid];
                const div = document.createElement('div');
                div.className = "schedule-item"; 
                div.style = "border-left: 5px solid #dc3545; background: #ffe6e6; color: #721c24; margin-bottom:5px;";
                div.innerHTML = `
                    <div><b>⚠️ UNREGISTERED: ${log.name || "Unknown"}</b><br><small>ID: ${uid}</small></div>
                    <span>${log.clock_in}</span>
                `;
                list.prepend(div);
            }
        });

        // C. Update Stats
        const absentCount = totalEnrolledCount - (presentCount + ongoingCount);
        
        document.getElementById('count').innerText = presentCount; 
        
        const totalEl = document.getElementById('total_student_text');
        const presEl = document.getElementById('present_text');
        const absEl = document.getElementById('absent_text');

        if(totalEl) totalEl.innerText = totalEnrolledCount;
        
        if(presEl) {
            presEl.innerHTML = `${presentCount} <small style='color:orange; font-size:0.6em;'>(+${ongoingCount} active)</small>`;
        }
        
        if(absEl) absEl.innerText = absentCount;

        if (intruderCount > 0) {
            document.getElementById('activeClassTitle').innerHTML = `📂 ${className} <span style="color:red; font-size:0.7em;">(${intruderCount} Unknown)</span>`;
        }
    });
}

function renderRow(list, name, matric, time, style) {
    const li = document.createElement('li');
    li.style = style + " padding:10px; margin-bottom:5px; display:flex; justify-content:space-between; border-radius:4px;";
    li.innerHTML = `<div><b>${name}</b> <small>(${matric})</small></div> <span>${time}</span>`;
    list.appendChild(li);
}

function resetMonitorUI() {
    document.getElementById('activeClassTitle').innerText = "Waiting...";
    document.getElementById('attendanceList').innerHTML = "";
    document.getElementById('count').innerText = "0";
    if(document.getElementById('total_student_text')) document.getElementById('total_student_text').innerText = "-";
    if(document.getElementById('present_text')) document.getElementById('present_text').innerText = "-";
    if(document.getElementById('absent_text')) document.getElementById('absent_text').innerText = "-";
}

// =======================================================
// 3. SCHEDULING LOGIC (booking.html)
// =======================================================

const viewDateInput = document.getElementById('viewDate');
if(viewDateInput) {
    viewDateInput.addEventListener('change', (e) => {
        loadScheduleList(e.target.value);
    });
}

const bookingTypeEl = document.getElementById('bookingType');
if(bookingTypeEl) {
    bookingTypeEl.addEventListener('change', (e) => {
        if(e.target.value === 'repeat') {
            document.getElementById('dayInputGroup').style.display = 'block';
            document.getElementById('dateInputGroup').style.display = 'none';
        } else {
            document.getElementById('dayInputGroup').style.display = 'none';
            document.getElementById('dateInputGroup').style.display = 'block';
        }
    });
}

const addClassBtn = document.getElementById('addClassBtn');
if(addClassBtn) {
    addClassBtn.addEventListener('click', () => {
        const type = document.getElementById('bookingType').value;
        const time = document.getElementById('bookTime').value;
        const dur = parseInt(document.getElementById('bookDuration').value);
        const name = document.getElementById('bookName').value;

        if(!name || time === "Full") return alert("Please fill all fields");

        let path = "";
        let dayIdx = 0;
        let dateVal = "";

        if (type === 'repeat') {
            dayIdx = document.getElementById('bookDay').value;
        } else {
            dateVal = document.getElementById('bookSpecificDate').value;
            if(!dateVal) return alert("Select a date");
            dayIdx = new Date(dateVal).getDay();
        }

        const timeCode = time.replace(":", "");
        path = `class_schedule/${dayIdx}/${timeCode}`;

        set(ref(db, path), { 
            name: name, 
            start_time: time, 
            duration: dur,
            type: type,
            date: dateVal // Empty if repeat
        }).then(() => { 
            alert("Class Booked!"); 
            const currentViewDate = document.getElementById('viewDate').value;
            if (new Date(currentViewDate).getDay() == dayIdx) {
                loadScheduleList(currentViewDate);
            }
        });
    });
}

// >>> NEW: Updated Schedule Loader with Exception Handling
async function loadScheduleList(dateStr) {
    const list = document.getElementById('bookingList');
    if(!list) return;
    
    const dayIdx = new Date(dateStr).getDay();
    list.innerHTML = "<p style='text-align:center;'>Loading...</p>";

    // 1. Fetch Exceptions first
    const exceptionSnap = await get(ref(db, `class_exceptions/${dateStr}`));
    const exceptions = exceptionSnap.val() || {};

    // 2. Fetch Schedule
    onValue(ref(db, `class_schedule/${dayIdx}`), (snap) => {
        list.innerHTML = "";
        if(!snap.exists()) { list.innerHTML = "<p style='text-align:center;'>No classes found.</p>"; return; }

        snap.forEach(c => {
            const d = c.val();
            let show = false;
            
            // Check Repeating + Exception
            if (d.type === 'repeat') {
                if (exceptions[c.key] === true) {
                    show = false; // It is cancelled/blacklisted for today
                } else {
                    show = true;
                }
            }

            // Check One-Time
            if (d.type === 'once' && d.date === dateStr) show = true;

            if (show) {
                const end = parseInt(d.start_time.split(":")[0]) + d.duration;
                let endH = end % 24; 
                const endStr = (endH<10?"0":"")+endH+":00";
                
                const typeLabel = d.type === 'repeat' ? '<span style="color:blue">🔄 Weekly</span>' : '<span style="color:orange">📅 Once</span>';
                
                const div = document.createElement('div'); 
                div.className = 'schedule-item';
                div.innerHTML = `
                    <div>
                        <strong>${d.start_time} - ${endStr}</strong> <br> 
                        ${d.name} <small>(${typeLabel})</small>
                    </div>
                    <button class="delete-btn">Delete</button>
                `;
                
                div.querySelector('.delete-btn').addEventListener('click', () => {
                    handleDeleteClick(dayIdx, c.key, d);
                });
                
                list.appendChild(div);
            }
        });
    });
}

function handleDeleteClick(dayIdx, key, data) {
    if (data.type === 'once') {
        if(confirm("Delete this one-time class?")) {
            remove(ref(db, `class_schedule/${dayIdx}/${key}`));
        }
    } else {
        deleteTarget = { dayIdx, key };
        document.getElementById('deleteModal').style.display = 'flex';
    }
}

// Modal Listeners
const delAllBtn = document.getElementById('delAllBtn');
if(delAllBtn) {
    // 1. Delete Entire Series (Standard)
    delAllBtn.addEventListener('click', () => {
        if(deleteTarget) {
            remove(ref(db, `class_schedule/${deleteTarget.dayIdx}/${deleteTarget.key}`))
            .then(() => document.getElementById('deleteModal').style.display = 'none');
        }
    });
    
    // 2. Delete Single Day (Exception Logic)
    document.getElementById('delSingleBtn').addEventListener('click', () => {
        if (!deleteTarget) return;
        const dateStr = document.getElementById('viewDate').value;
        
        // Write Exception
        set(ref(db, `class_exceptions/${dateStr}/${deleteTarget.key}`), true)
        .then(() => {
            alert("Class cancelled for " + dateStr + " only.");
            document.getElementById('deleteModal').style.display = 'none';
            loadScheduleList(dateStr); // Refresh list immediately
        });
    });
    
    document.getElementById('cancelDelBtn').addEventListener('click', () => {
        document.getElementById('deleteModal').style.display = 'none';
    });
}

function updateTimeSlots() {
    const timeSelect = document.getElementById('bookTime');
    if(!timeSelect) return;
    timeSelect.innerHTML = "";
    // 00:00 to 23:00 (24 Hour Cycle)
    for(let i=0; i<24; i++) { 
        const t = (i<10?"0":"")+i+":00";
        const op = document.createElement('option');
        op.value = t; op.innerText = t;
        timeSelect.appendChild(op);
    }
}

// =======================================================
// 4. LECTURER REMOTE CONTROL
// =======================================================

function initLecturerControl() {
    console.log(">>> SYSTEM: Initializing Lecturer Control Module...");

    const unlockBtn = document.getElementById('unlockBtn');
    const exitStatus = document.getElementById('exitStatus');

    if(!unlockBtn) return; // Not present on page

    // 1. LISTEN to Firebase
    // This updates the GLOBAL Variable 'isEarlyExitOpen' directly.
    onValue(ref(db, 'Classroom/Control/early_exit'), (snapshot) => {
        const dbValue = snapshot.val();
        isEarlyExitOpen = (dbValue === true); // Sync Variable
        console.log(">>> FIREBASE: Early Exit is", isEarlyExitOpen ? "OPEN" : "CLOSED");

        if (isEarlyExitOpen) {
            if(exitStatus) {
                exitStatus.innerText = "UNLOCKED (Students can leave)";
                exitStatus.style.color = "green";
            }
            unlockBtn.innerText = "🔒 Lock Attendance";
            unlockBtn.style.background = "#6c757d"; 
        } else {
            if(exitStatus) {
                exitStatus.innerText = "LOCKED (Time Restricted)";
                exitStatus.style.color = "red";
            }
            unlockBtn.innerText = "🔓 Unlock Early Exit";
            unlockBtn.style.background = "#ff9800"; 
        }
    });

    // 2. SEND Command
    // Checks the GLOBAL Variable 'isEarlyExitOpen' (Safe Method)
    unlockBtn.onclick = function() {
        console.log(">>> CLICK: Requesting State Change...");

        if (isEarlyExitOpen === false) {
            console.log(">>> ACTION: Unlocking...");
            set(ref(db, 'Classroom/Control/early_exit'), true)
                .catch(e => alert("Firebase Error: " + e.message));
        } else {
            console.log(">>> ACTION: Locking...");
            set(ref(db, 'Classroom/Control/early_exit'), false)
                .catch(e => alert("Firebase Error: " + e.message));
        }
    };
}
