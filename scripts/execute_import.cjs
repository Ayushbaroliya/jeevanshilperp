const { initializeApp } = require('firebase/app');
const { getFirestore, writeBatch, doc, collection, getDocs } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('fs');

const firebaseConfig = {
  apiKey: "demo",
  authDomain: "demo",
  projectId: "jeevanshilporg-51db8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Use a demo login or the test credentials if we need auth. Since we might not need auth in emulator, 
// let's just try to read/write directly. If it fails, we know it's a security rule issue.
// Wait, the project is live (jeevanshilporg-51db8). Security rules likely require auth.
// But we know from mockData/App that admin login is probably admin@jeevanshilp.org / admin123 or similar.
// Actually, if we just want to bypass rules, we can't from the web SDK.

async function executeImport() {
  try {
    // 1. Wipe existing collections
    const collectionsToWipe = ['students', 'enrollments', 'invoices', 'student_ledger', 'fee_adjustments'];
    for (const collName of []) {
      console.log(`Wiping collection: ${collName}...`);
      const snap = await getDocs(collection(db, collName));
      let batch = writeBatch(db);
      let count = 0;
      snap.forEach(document => {
        batch.delete(document.ref);
        count++;
        if (count % 500 === 0) {
          batch.commit();
          batch = writeBatch(db);
        }
      });
      if (count % 500 !== 0) {
        await batch.commit();
      }
      console.log(`Deleted ${count} documents from ${collName}.`);
    }

    // 2. Import new data
    const data = JSON.parse(fs.readFileSync('scripts/import_data.json', 'utf-8'));
    console.log(`Starting import of ${data.length} students...`);
    
    let batch = writeBatch(db);
    let count = 0;
    
    for (const student of data) {
      const studentRef = doc(collection(db, 'students'));
      const enrollmentRef = doc(collection(db, 'enrollments'));
      
      const { enrollment, ...studentData } = student;
      
      batch.set(studentRef, {
        ...studentData,
        createdAt: new Date().toISOString(),
        status: 'Active'
      });
      
      batch.set(enrollmentRef, {
        studentId: studentRef.id,
        schoolId: studentData.schoolId,
        academicYearId: 'AY_2025_26',
        ...enrollment,
        createdAt: new Date().toISOString()
      });
      
      count++;
      if (count % 250 === 0) { // Batch limit is 500 writes, each student takes 2 writes = 500
        await batch.commit();
        batch = writeBatch(db);
        console.log(`Committed ${count} students...`);
      }
    }
    
    if (count % 250 !== 0) {
      await batch.commit();
      console.log(`Committed final batch. Total students: ${count}`);
    }
    
    console.log('IMPORT COMPLETE!');
    process.exit(0);
  } catch (err) {
    console.error('Error during execution:', err);
    process.exit(1);
  }
}

executeImport();

