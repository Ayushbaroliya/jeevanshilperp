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
    console.log('\nSigning in...');
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    console.log('Successfully signed in!\n');
    
    // Fix the user's profile
    console.log('Restoring Owner profile...');
    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      name: 'Group Owner / Super Admin',
      role: 'Administrator',
      email: 'jeevanshilporg@gmail.com',
      createdAt: new Date().toISOString()
    }, { merge: true });
    
  } catch (e) {
    console.error('Login failed:', e.message);
    process.exit(1);
  }

  const schoolId = 'SCH_02';
  
  console.log('Clearing old students for Jeevan Shilp Inter College...');
  const q = query(collection(db, 'students'), where('schoolId', '==', schoolId));
  const snap = await getDocs(q);
  let delCount = 0;
  for (const docSnap of snap.docs) {
    await deleteDoc(docSnap.ref);
    delCount++;
  }
  console.log(`Deleted ${delCount} old students.`);

  console.log('Reading Excel File...');
  const wb = xlsx.readFile('Classwise_Student_List_Jeevan_Shilp_Inter_College.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(ws);
  
  // Data starts at index 1 (second row in JSON array)
  let createdCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    
    // Check if the row has a valid student name
    const studentName = row["__EMPTY_2"];
    if (!studentName || typeof studentName !== 'string' || studentName.trim() === '') continue;

    const cls = row["__EMPTY_5"] || row["__EMPTY"]; // e.g. "Class 6" or "Class 11 Art"
    const section = 'Section ' + (row["__EMPTY_1"] || 'A');
    const fatherName = row["__EMPTY_3"] || '';

    // Generate student ID
    const studentId = `JSIC-${cls.replace(/[^a-zA-Z0-9]/g, '')}-${(createdCount + 1).toString().padStart(3, '0')}`;
    
    const newStudent = {
      id: studentId,
      name: studentName,
      class: cls,
      section: section,
      schoolId: schoolId,
      parentName: fatherName,
      contact: `98765${Math.floor(10000 + Math.random() * 90000)}`, // Dummy contact as not in excel
      address: "Local Address, City", // Dummy address
      dueAmount: 0, 
      attendance: `100%`,
      createdAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'students', studentId), newStudent);
    createdCount++;
  }

  console.log(`\n✅ Successfully generated and uploaded ${createdCount} students for Jeevan Shilp Inter College.`);
  process.exit(0);
}

uploadData().catch(console.error);
