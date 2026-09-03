const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const readline = require('readline');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function cleanup() {
  await new Promise((resolve) => {
    rl.question('Enter Owner Email (e.g. jeevanshilporg@gmail.com): ', (email) => {
      rl.question('Enter Password: ', async (password) => {
        try {
          console.log('\nSigning in...');
          await signInWithEmailAndPassword(auth, email, password);
          console.log('Successfully signed in!');
          resolve();
        } catch (e) {
          console.error('Login failed:', e.message);
          process.exit(1);
        }
      });
    });
  });

  // We are keeping 'users' and 'staff' so you don't lose your admin access!
  const collectionsToClear = [
    'students', 
    'invoices', 
    'student_ledger', 
    'exam_marks', 
    'attendance_logs',
    'class_assignments',
    'staff_attendance',
    'payroll'
  ];
  
  for (const col of collectionsToClear) {
    console.log(`\nFetching all records in ${col}...`);
    try {
      const snap = await getDocs(collection(db, col));
      console.log(`Found ${snap.size} documents in ${col}. Deleting...`);
      let delCount = 0;
      for (const doc of snap.docs) {
        await deleteDoc(doc.ref);
        delCount++;
      }
      console.log(`✅ Deleted ${delCount} documents from ${col}.`);
    } catch (err) {
      console.error(`❌ Error clearing ${col}:`, err.message);
    }
  }

  console.log('\nDatabase cleanup complete!');
  process.exit(0);
}

cleanup().catch(console.error);
