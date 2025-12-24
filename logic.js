import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, remove, query, orderByChild, startAt, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, reauthenticateWithCredential, EmailAuthProvider, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔴 PASTE YOUR FIREBASE CONFIG HERE
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

// 1. LOGIN & SECURITY
document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passwordInput').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => {
        document.getElementById('loginError').innerText = e.message;
        document.getElementById('loginError').style.display = 'block';
    });
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const whitelistRef = ref(db, `authorized_users/${user.uid}`);
        const snapshot = await get(whitelistRef);

        if (snapshot.exists() || user.email === "admin@test.com") { 
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').style.display = 'block';
            document.getElementById('historyDate').valueAsDate = new Date();
            loadAdminPanel();
            loadScheduleForSelectedDate();
        } else {
            alert("🚫 Access Denied: Not authorized.");
            signOut(auth);
        }
    } else {
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('dashboardScreen').style.display = 'none';
    }
});

// 2. USER MANAGEMENT
document.getElementById('unlockBtn').addEventListener('click', () => {
    const user = auth.currentUser;
    const pass = document.getElementById('reauthPassword').value;
    const credential = EmailAuthProvider.credential(user.email, pass);
    
    reauthenticateWithCredential(user, credential).then(() => {
        document.getElementById('unlockPanel').style.display = 'none';
        document.getElementById('accessPanel').style.display = 'block';
        loadUserList();
    }).catch(() => alert("❌ Incorrect Password."));
});

document.getElementById('addAdminBtn').addEventListener('click', () => {
    const newEmail = document.getElementById('newAdminEmail').value;
    const newPass = document.getElementById('newAdminPass').value;
    if(!newEmail || !newPass) return alert("Enter details");

    const secondaryApp = initializeApp(firebaseConfig, "Secondary");
    const secondaryAuth = getAuth(secondaryApp);

    createUserWithEmailAndPassword(secondaryAuth, newEmail, newPass).then((userCred) => {
        set(ref(db, `authorized_users/${userCred.user.uid}`), { email: newEmail, added_by: auth.currentUser.email });
        alert(`✅ User ${newEmail} created!`);
        document.getElementById('newAdminEmail').value = "";
        document.getElementById('newAdminPass').value = "";
        signOut(secondaryAuth);
    }).catch((e) => alert("Error: " + e.message));
});

function loadUserList() {
    const listDiv = document.getElementById('adminList');
    onValue(ref(db, 'authorized_users'), (snapshot) => {
        listDiv.innerHTML = "";
        snapshot.forEach(child => {
            const data = child.val();
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<span>👤 ${data.email}</span><button class="remove-user-btn">Revoke</button>`;
            div.querySelector('button').addEventListener('click', () => {
                if(confirm(`Block ${data.email}?`)) remove(ref(db, `authorized_users/${child.key}`));
            });
            listDiv.appendChild(div);
        });
    });
}

// 3. ADMIN BOOKING
function loadAdminPanel() { updateAvailableTimeSlots(); loadScheduleList(); }
document.getElementById('bookDay').addEventListener('change', () => { updateAvailableTimeSlots(); loadScheduleList(); });

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

document.getElementById('addClassBtn').addEventListener('click', () => {
    const day = document.getElementById('bookDay').value;
    const time = document.getElementById('bookTime').value;
    const name = document.getElementById('bookName').value;
    const dur = document.getElementById('bookDuration').value;
    if(!name || time==="Full") return;
    set(ref(db, `class_schedule/${day}/${time.replace(":","")}`), { name, start_time:time, duration:parseInt(dur) })
    .then(() => { alert("Booked!"); updateAvailableTimeSlots(); });
});

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

// 4. MONITOR & HISTORY
document.getElementById('historyDate').addEventListener('change', loadScheduleForSelectedDate);
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

document.getElementById('classSelector').addEventListener('change', (e) => {
    const v = e.target.value; if(!v) return;
    const [start, dur, name] = v.split(",");
    loadAttendance(parseInt(start.split(":")[0]), name, parseInt(dur));
});

function loadAttendance(startHour, className, duration) {
    document.getElementById('activeClassTitle').innerText = `📂 ${className}`;
    currentClassName = className;
    const d = new Date(document.getElementById('historyDate').value);
    d.setHours(startHour,0,0,0);
    const start = d.getTime();
    const end = start + (duration * 3600000);

    onValue(query(ref(db, 'attendance_logs'), orderByChild('timestamp'), startAt(start)), (snap) => {
        const list = document.getElementById('attendanceList'); list.innerHTML="";
        let count=0; currentClassData=[];
        snap.forEach(c => {
            const d = c.val();
            if(d.timestamp < end) {
                const time = new Date(d.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
                list.innerHTML += `<li><b>${d.name}</b> <span>${time}</span></li>`;
                currentClassData.push({Name:d.name, ID:d.student_id, Time:time});
                count++;
            }
        });
        document.getElementById('count').innerText = count;
    });
}

document.getElementById('exportBtn').addEventListener('click', () => {
    if(!currentClassData.length) return alert("No data");
    const date = document.getElementById('historyDate').value;
    let csv = "data:text/csv;charset=utf-8,Name,ID,Time\n" + currentClassData.map(r=>`${r.Name},${r.ID},${r.Time}`).join("\n");
    const a = document.createElement("a"); a.href=encodeURI(csv); a.download=`Attendance_${currentClassName}_${date}.csv`; a.click();
});