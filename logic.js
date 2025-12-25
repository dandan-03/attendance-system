import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, remove, query, orderByChild, startAt, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
            apiKey: "AIzaSyC9CqjVBCcmjeYAZdX3grW213s2jyMHpAw",
            authDomain: "g40attendance.firebaseapp.com",
            databaseURL: "https://g40attendance-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "g40attendance",
            storageBucket: "g40attendance.firebasestorage.app",
            messagingSenderId: "487009872314",
            appId: "1:487009872314:web:9842ea3115be17e5505583"
        };

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentClassData = [];
let currentClassName = "";

// ==========================================
// 1. AUTHENTICATION & REDIRECTS
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
        window.location.href = "index.html"; // Always go to home on logout
    });
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is logged in
        if(document.getElementById('loginScreen')) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
        }

        // INIT PAGE LOGIC BASED ON WHAT ELEMENTS EXIST
        if(document.getElementById('bookDay')) loadAdminPanel(); // We are on Booking Page
        if(document.getElementById('historyDate')) {           // We are on Monitor Page
            document.getElementById('historyDate').valueAsDate = new Date();
            loadScheduleForSelectedDate();
        }

    } else {
        // User is logged out
        const isBookingPage = window.location.pathname.includes("booking.html");
        
        if (isBookingPage) {
            // Protect the booking page! Kick them out if not logged in.
            window.location.href = "index.html";
        } else {
            // Show login screen on index page
            document.getElementById('loginScreen').style.display = 'block';
            document.getElementById('dashboardScreen').style.display = 'none';
        }
    }
});

// ==========================================
// 2. ADMIN BOOKING LOGIC (Only runs if elements exist)
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
        const name = document.getElementById('bookName').value;
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
// 3. MONITOR LOGIC (Only runs if elements exist)
// ==========================================
const historyDateEl = document.getElementById('historyDate');
if(historyDateEl) {
    historyDateEl.addEventListener('change', loadScheduleForSelectedDate);
    
    document.getElementById('classSelector').addEventListener('change', (e) => {
        const v = e.target.value; if(!v) return;
        const [start, dur, name] = v.split(",");
        loadAttendance(parseInt(start.split(":")[0]), name, parseInt(dur));
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        if(!currentClassData.length) return alert("No data");
        const date = document.getElementById('historyDate').value;
        let csv = "data:text/csv;charset=utf-8,Name,ID,Time\n" + currentClassData.map(r=>`${r.Name},${r.ID},${r.Time}`).join("\n");
        const a = document.createElement("a"); a.href=encodeURI(csv); a.download=`Attendance_${currentClassName}_${date}.csv`; a.click();
    });
}

function loadScheduleForSelectedDate() {
    const dateInput = document.getElementById('historyDate').value;
    if(!dateInput) return;
    const dayIdx = new Date(dateInput).getDay();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    document.getElementById('dayLabel').innerText = "Day: " + days[dayIdx];

    const sel = document.getElementById('classSelector');
    onValue(ref(db, `class_schedule/${dayIdx}`), (snap) => {
        sel.innerHTML = "";
        if(!snap.exists()) { sel.innerHTML="<option value=''>No classes</option>"; return; }
        snap.forEach(c => {
            const d = c.val();
            const op = document.createElement('option');
            op.value = `${d.start_time},${d.duration},${d.name}`; op.innerText = `${d.start_time} - ${d.name}`;
            sel.appendChild(op);
        });
        sel.dispatchEvent(new Event('change'));
    });
}

function loadAttendance(startHour, className, duration) {
    document.getElementById('activeClassTitle').innerText = `📂 ${className}`;
    currentClassName = className;
    const d = new Date(document.getElementById('historyDate').value);
    d.setHours(startHour,0,0,0);
    const start = d.getTime();
    const end = start + (duration * 3600000);

    onValue(query(ref(db, 'attendance_logs'), orderByChild('timestamp'), startAt(start)), (snap) => {
        const list = document.getElementById('attendanceList'); list.innerHTML="";
        let count=0, currentClassData=[], already_noted=[];
        snap.forEach(c => {
            const d = c.val();

            if(already_noted.indexOf(d.rfid_tag) !== -1) { //checks if already noted based on student id
                return
            } else {
                already_noted.push(d.rfid_tag)
            }

            if(d.timestamp < end) {
                const time = new Date(d.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                list.innerHTML += `<li><b>${d.name}</b> <span>${time}</span></li>`;
                currentClassData.push({Name:d.name, ID:d.student_id, Time:time});
                console.log(currentClassData)
                count++;
            }
        });
        document.getElementById('count').innerText = count;
        document.getElementById('present_text').innerText = count;
        document.getElementById('absent_text').innerText = 5 - count; //5 is total student
    });
}

// 4. SIMULATOR
const simBtn = document.getElementById('simBtn');
if(simBtn) {
    simBtn.addEventListener('click', () => {
        const name = document.getElementById('simName').value;
        const id = document.getElementById('simID').value;
        if(!name || !id) return alert("Please enter Name and ID");
        
        push(ref(db, 'attendance_logs'), {
            name: name,
            student_id: id,
            rfid_tag: "SIM_" + Math.floor(Math.random() * 1000),
            timestamp: Date.now()
        }).then(() => {
            document.getElementById('simStatus').innerText = `✅ Checked in: ${name}`;
            setTimeout(() => document.getElementById('simStatus').innerText="", 3000);
            document.getElementById('simName').value = "";
            document.getElementById('simID').value = "";
        });
    });
}
