const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyADdvQI-awTVAR9i9TWqSB-7iW1FJ1uZig",
  authDomain: "jeevanshilporg-51db8.firebaseapp.com",
  projectId: "jeevanshilporg-51db8",
  storageBucket: "jeevanshilporg-51db8.firebasestorage.app",
  messagingSenderId: "671231951469",
  appId: "1:671231951469:web:29fd475e64855fc5c6f564"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const staffAuthEmail = (contact) => `${String(contact).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@jeevanshilpgroup.local`;

async function check() {
  try {
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    console.log("Logged in as Owner.");

    console.log("\n--- STAFF COLLECTION ---");
    const staffSnap = await getDocs(collection(db, 'staff'));
    console.log(`Total staff docs: ${staffSnap.size}`);
    const staffDocs = [];
    staffSnap.forEach(d => {
      const data = d.data();
      staffDocs.push({ id: d.id, ...data });
      console.log(`Staff doc ID: ${d.id}, name: ${data.name}, role: ${data.role}, uid: ${data.uid}, contact: ${data.contact}, schoolId: ${data.schoolId}, baseSalary: ${data.baseSalary}`);
    });

    console.log("\n--- USERS COLLECTION FOR STAFF ---");
    for (const s of staffDocs) {
      if (s.uid) {
        const uSnap = await getDoc(doc(db, 'users', s.uid));
        console.log(`User doc for ${s.name} (${s.uid}): exists=${uSnap.exists()}, data=`, uSnap.exists() ? uSnap.data() : null);
      }
    }

    console.log("\n--- STAFF_SALARY COLLECTION ---");
    const salSnap = await getDocs(collection(db, 'staff_salary'));
    console.log(`Total staff_salary docs: ${salSnap.size}`);
    salSnap.forEach(d => {
      console.log(`Salary doc ID: ${d.id}, data:`, d.data());
    });

  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

check();
