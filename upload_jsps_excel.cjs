const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc } = require('firebase/firestore');
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

function normalizeClass(rawClass) {
  if (!rawClass) return 'Class 1';
  let str = rawClass.toString().trim().toUpperCase();
  if (str === 'LKG' || str === 'UKG') return str;
  // match number
  const match = str.match(/\d+/);
  if (match) return `Class ${match[0]}`;
  return str;
}

async function uploadData() {
  try {
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    
    const schoolId = 'SCH_01'; // Jeevan Shilp Public School
    console.log('Reading Excel File for JSPS...');
    const wb = xlsx.readFile('jeevanshilp public school.xlsx');
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(ws);
    
    let createdCount = 0;
    const writePromises = [];

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const studentName = row["Student Name"];
      if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') continue;

      const cls = normalizeClass(row["Class"]);
      const section = 'Section A'; // Default to Section A
      const fatherName = row["Father Name"] || '';
      const mobile = row["Mobile"] ? String(row["Mobile"]) : `98765${Math.floor(10000 + Math.random() * 90000)}`;
      const address = row["Address"] || "Local Address, City";

      const studentId = `JSPS-${cls.replace(/[^a-zA-Z0-9]/g, '')}-${(createdCount + 1).toString().padStart(3, '0')}`;
      
      const newStudent = {
        id: studentId,
        name: studentName,
        class: cls,
        section: section,
        schoolId: schoolId,
        parentName: fatherName,
        contact: mobile,
        address: address,
        dueAmount: 0,
        attendance: `100%`,
        createdAt: new Date().toISOString()
      };

      writePromises.push(setDoc(doc(db, 'students', studentId), newStudent));
      createdCount++;
    }

    await Promise.all(writePromises);
    console.log(`\n✅ Successfully generated and uploaded ${createdCount} students for Jeevan Shilp Public School.`);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

uploadData();
