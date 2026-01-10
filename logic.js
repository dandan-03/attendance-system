import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, remove, query, orderByChild, startAt, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyD_htAAKN1dv7fsOkO0g8IxgQRsDuIiyu4",
  authDomain: "rfid-attendance-30745.firebaseapp.com",
  databaseURL: "https://rfid-attendance-30745-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rfid-attendance-30745",
  storageBucket: "rfid-attendance-30745.firebasestorage.app",
  messagingSenderId: "860028054162",
  appId: "1:860028054162:web:f3b05e9a5c6733bae0944b",
  measurementId: "G-XMZEQML8B9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentClassData = [];
let currentClassName = "";

// ==========================================
// 1. AUTHENTICATION 
// ==========================================
const loginBtn = document.getElementById('loginBtn');
if(loginBtn) {
    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('emailInput').value;
        const pass = document.getElementById('passwordInput').value;
        signInWithEmailAndPassword(auth, email, pass).catch(e => {
            document.getElementById('loginError').innerText = e.message;
            document.getElementById('loginError').style.display = 'block';
        });
    });
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = "index.html"; 
    });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        if(document.getElementById('loginScreen')) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
        }
        if(document.getElementById('bookDay')) loadAdminPanel(); 
        if(document.getElementById('historyDate')) {           
            document.getElementById('historyDate').valueAsDate = new Date();
            loadScheduleForSelectedDate();
        }
    } else {
        const isBookingPage = window.location.pathname.includes("booking.html");
        if (isBookingPage) window.location.href = "index.html";
        else {
            document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('dashboardScreen').style.display = 'none';
        }
    }
});

// ==========================================
// 2. ADMIN BOOKING 
// ==========================================
function loadAdminPanel() { 
    updateAvailableTimeSlots(); 
    loadScheduleList(); 
}

const bookDayEl = document.getElementById('bookDay');
if(bookDayEl) {
    bookDayEl.addEventListener('change', () => { updateAvailableTimeSlots(); loadScheduleList(); });
    
    document.getElementById('addClassBtn').addEventListener('click', () => {
        const day = document.getElementById('bookDay').value;
        const time = document.getElementById('bookTime').value;
        const name = document.getElementById('bookName').value; // IMPORTANT: Name must match 'StdInfo' course keys (e.g., "EEE270")
        const dur = document.getElementById('bookDuration').value;
        if(!name || time==="Full") return;
        set(ref(db, `class_schedule/${day}/${time.replace(":","")}`), { name, start_time:time, duration:parseInt(dur) })
        .then(() => { alert("Booked!"); updateAvailableTimeSlots(); });
    });
}

function updateAvailableTimeSlots() {
    const day = document.getElementById('bookDay').value;
    const timeSelect = document.getElementById('bookTime');
    get(ref(db, `class_schedule/${day}`)).then((snapshot) => {
        const blocked = []; 
        if (snapshot.exists()) {
            snapshot.forEach(c => {
                const start = parseInt(c.val().start_time.split(":")[0]);
                for(let i=0; i<c.val().duration; i++) blocked.push((start+i<10?"0":"")+(start+i)+"00");
            });
        }
        timeSelect.innerHTML = "";
        for(let i=0; i<24; i++) {
            const id = (i<10?"0":"")+i+"00";
            if(!blocked.includes(id)) {
                const op = document.createElement('option');
                op.value=(i<10?"0":"")+i+":00"; op.innerText=op.value;
                timeSelect.appendChild(op);
            }
        }
        if(timeSelect.options.length===0) timeSelect.innerHTML="<option>Full</option>";
    });
}

function loadScheduleList() {
    const day = document.getElementById('bookDay').value;
    const list = document.getElementById('bookingList');
    onValue(ref(db, `class_schedule/${day}`), (snap) => {
        list.innerHTML = "";
        if(!snap.exists()) { list.innerHTML="<small>Empty</small>"; return; }
        snap.forEach(c => {
            const d = c.val();
            const end = parseInt(d.start_time.split(":")[0]) + d.duration;
            const endStr = (end<10?"0":"")+end+":00";
            const div = document.createElement('div'); div.className='schedule-item';
            div.innerHTML = `<div><b>${d.start_time} - ${endStr}</b><br>${d.name}</div><button class="delete-btn">Delete</button>`;
            div.querySelector('button').addEventListener('click', () => remove(ref(db, `class_schedule/${day}/${c.key}`)).then(()=>updateAvailableTimeSlots()));
            list.appendChild(div);
        });
    });
}

// ==========================================
// 3. MONITOR LOGIC 
// ==========================================
const historyDateEl = document.getElementById('historyDate');
if(historyDateEl) {
    historyDateEl.addEventListener('change', loadScheduleForSelectedDate);
    
    document.getElementById('classSelector').addEventListener('change', (e) => {
        const v = e.target.value; 
        if(!v) {
            resetMonitorDisplay();
            return;
        }
        const [start, dur, name] = v.split(",");
        loadAttendance(start, name, parseInt(dur));
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        if(!currentClassData.length) return alert("No data");
        const date = document.getElementById('historyDate').value;
        let csv = "data:text/csv;charset=utf-8,Name,ID,Clock In,Status\n" + currentClassData.map(r=>`${r.Name},${r.ID},${r.Time},${r.Status}`).join("\n");
        const a = document.createElement("a"); a.href=encodeURI(csv); a.download=`Attendance_${currentClassName}_${date}.csv`; a.click();
    });
}

function resetMonitorDisplay() {
    document.getElementById('activeClassTitle').innerText = "Waiting...";
    document.getElementById('attendanceList').innerHTML = "";
    document.getElementById('count').innerText = "0";
    document.getElementById('total_student_text').innerText = "-";
    document.getElementById('present_text').innerText = "-";
    document.getElementById('absent_text').innerText = "-";
}

function loadScheduleForSelectedDate() {
    const dateInput = document.getElementById('historyDate').value;
    if(!dateInput) return;
    const dayIdx = new Date(dateInput).getDay();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    document.getElementById('dayLabel').innerText = "Day: " + days[dayIdx];

    const sel = document.getElementById('classSelector');
    // NOTE: This still assumes 'class_schedule' exists in the DB!
    onValue(ref(db, `class_schedule/${dayIdx}`), (snap) => {
        sel.innerHTML = "";
        if(!snap.exists()) { sel.innerHTML="<option value=''>No classes</option>"; sel.dispatchEvent(new Event('change')); return; }
        snap.forEach(c => {
            const d = c.val();
            const op = document.createElement('option');
            // Passing the Class Name (e.g., EEE270) to the load function
            op.value = `${d.start_time},${d.duration},${d.name}`; 
            op.innerText = `${d.start_time} - ${d.name}`;
            sel.appendChild(op);
        });
        sel.dispatchEvent(new Event('change'));
    });
}

async function loadAttendance(startTimeStr, className, duration) {
    document.getElementById('activeClassTitle').innerText = `📂 ${className}`;
    currentClassName = className;
    
    const dateInput = document.getElementById('historyDate').value; // Format: YYYY-MM-DD
    
    // 1. Calculate Class Time Window (e.g., 09:00 to 11:00)
    const startHour = parseInt(startTimeStr.split(":")[0]);
    const endHour = startHour + duration;

    // 2. Fetch All Students (StdInfo) to find who is enrolled
    const studentSnapshot = await get(ref(db, 'StdInfo'));
    if(!studentSnapshot.exists()) { alert("No student data (StdInfo) found!"); return; }

    let enrolledStudents = [];
    
    studentSnapshot.forEach(child => {
        const studentData = child.val();
        const rfid = child.key;
        // Check if student has the course key set to true (e.g., EEE270: true)
        if(studentData.course && studentData.course[className] === true) {
            enrolledStudents.push({
                rfid: rfid,
                name: studentData.name,
                matric: studentData.matric
            });
        }
    });

    console.log("Enrolled in " + className, enrolledStudents);

    // 3. Fetch Attendance for TODAY (attendance/Electronic/YYYY-MM-DD)
    const attRef = ref(db, `attendance/Electronic/${dateInput}`);
    
    onValue(attRef, (snap) => {
        const list = document.getElementById('attendanceList'); 
        list.innerHTML = "";
        currentClassData = [];
        let presentCount = 0;

        const attendanceData = snap.val() || {}; // might be null if no one scanned today

        // 4. Match Students with Attendance Logs
        enrolledStudents.forEach(student => {
            const studentLog = attendanceData[student.rfid];
            let status = "Absent";
            let timeStr = "--:--";
            let style = "color:red";

            if (studentLog && studentLog.clock_in) {
                // Parse Clock In Time (e.g., "16:34:00")
                const logHour = parseInt(studentLog.clock_in.split(":")[0]);
                
                // Check if they clocked in during class hours
                if(logHour >= startHour && logHour < endHour) {
                    status = "Present";
                    timeStr = studentLog.clock_in;
                    style = "color:green";
                    presentCount++;
                } else {
                    status = "Wrong Time"; // Scanned, but outside class hours
                    timeStr = studentLog.clock_in;
                    style = "color:orange";
                }
            }

            // Render to list
            if(status === "Present") {
                list.innerHTML += `<li style="border-left: 5px solid green">
                    <div><b>${student.name}</b> <small>(${student.matric})</small></div> 
                    <span>${timeStr}</span>
                </li>`;
            }

            // Save for export
            if(status === "Present") {
                currentClassData.push({Name: student.name, ID: student.matric, Time: timeStr, Status: status});
            }
        });

        // Update Summary Cards
        document.getElementById('count').innerText = presentCount;
        document.getElementById('total_student_text').innerText = enrolledStudents.length;
        document.getElementById('present_text').innerText = presentCount;
        document.getElementById('absent_text').innerText = enrolledStudents.length - presentCount;
    });
}

// ==========================================
// 4. SIMULATOR 
// ==========================================
const simBtn = document.getElementById('simBtn');
if(simBtn) {
    simBtn.addEventListener('click', async () => {
        const rfidInput = document.getElementById('simID').value; 
        const nameInput = document.getElementById('simName').value;

        if(!rfidInput) return alert("Please enter an RFID (e.g., C348762D)");

        // Generate Current Date and Time Strings
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

        // Update to new path: attendance/Electronic/YYYY-MM-DD/RFID
        const logPath = `attendance/Electronic/${dateStr}/${rfidInput}`;
        
        // We use 'update' so we don't overwrite existing data (like clock_out if it exists)
        await update(ref(db, logPath), {
            clock_in: timeStr,
            name: nameInput || "Unknown"
        });

        document.getElementById('simStatus').innerText = `✅ Checked in: ${rfidInput} at ${timeStr}`;
        setTimeout(() => document.getElementById('simStatus').innerText="", 3000);
    });
}
