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

// Mock the feeEngine
const { calculateStudentDue, normalizeClassFeeSettings } = require('./src/utils/feeEngine.js');

async function run() {
  await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
  
  // Get settings
  const settingsDoc = await getDoc(doc(db, 'school_settings', 'settings'));
  const storedSettings = settingsDoc.data().schoolClassSettings || {};
  
  // Get some students
  const snap = await getDocs(collection(db, 'students'));
  let count = 0;
  snap.forEach(d => {
      if (count > 5) return;
      const data = d.data();
      if (data.status !== 'Deleted' && data.status !== 'archived') {
          const classSettings = normalizeClassFeeSettings(storedSettings[data.schoolId]?.[data.class] || {});
          const result = calculateStudentDue({
              student: data,
              classSettings,
              payments: [],
              adjustments: []
          });
          console.log(`Student ${data.id} (${data.name}) - Class: ${data.class}`);
          console.log(`  openingArrears in DB:`, data.openingArrears);
          console.log(`  dueAmount in DB:`, data.dueAmount);
          console.log(`  calculated totalDue:`, result.totalDue);
          console.log(`  calculated scheduledDue:`, result.scheduledDue);
          console.log(`  calculated openingArrears (feeEngine):`, result.openingArrears);
          console.log(`  charges length:`, result.charges.length);
          count++;
      }
  });
  
  process.exit(0);
}

run();
