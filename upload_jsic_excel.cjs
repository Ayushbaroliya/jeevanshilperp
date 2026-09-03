const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, deleteDoc, query, where, doc, setDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const xlsx = require('xlsx');

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

async function uploadData() {
  try {
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    
    const schoolId = 'SCH_02';
    console.log('Reading Excel File for JSIC...');
    const wb = xlsx.readFile('Classwise_Student_List_Jeevan_Shilp_Inter_College.xlsx');
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(ws);
    
    let createdCount = 0;
    const writePromises = [];

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const studentName = row["__EMPTY_2"];
      if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') continue;

      const cls = row["__EMPTY_5"] || row["__EMPTY"]; // e.g. "Class 6"
      const section = 'Section ' + (row["__EMPTY_1"] || 'A');
      const fatherName = row["__EMPTY_3"] || '';

      const studentId = `JSIC-${cls.replace(/[^a-zA-Z0-9]/g, '')}-${(createdCount + 1).toString().padStart(3, '0')}`;
      
      const newStudent = {
        id: studentId,
        name: studentName,
        class: cls,
        section: section,
        schoolId: schoolId,
        parentName: fatherName,
        contact: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        address: "Local Address, City",
        dueAmount: 0,
        attendance: `100%`,
        createdAt: new Date().toISOString()
      };

      writePromises.push(setDoc(doc(db, 'students', studentId), newStudent));
      createdCount++;
    }

    await Promise.all(writePromises);
    console.log(`\n✅ Successfully generated and uploaded ${createdCount} students for Jeevan Shilp Inter College.`);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

uploadData();
