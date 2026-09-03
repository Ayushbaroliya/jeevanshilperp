const xlsx = require('xlsx');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc, query, where, getDocs, deleteDoc } = require('firebase/firestore');
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

const workbook = xlsx.readFile('Student_Records_Classwise_Complete (1).xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

async function upload() {
  const targetSchoolId = await new Promise((resolve) => {
    rl.question('Enter Owner Email (e.g. jeevanshilporg@gmail.com): ', (email) => {
      rl.question('Enter Password: ', async (password) => {
        try {
          console.log('Signing in...');
          await signInWithEmailAndPassword(auth, email, password);
          console.log('Successfully signed in!');
          rl.question('Enter School ID to upload to (e.g. SCH_01, SCH_02, SCH_03): ', (schoolId) => {
            if (!schoolId) schoolId = 'SCH_01'; // default
            resolve(schoolId.trim().toUpperCase());
          });
        } catch (e) {
          console.error('Login failed:', e.message);
          process.exit(1);
        }
      });
    });
  });

  // Step 1: Delete all existing students for the specified school
  const q = query(collection(db, 'students'), where('schoolId', '==', targetSchoolId));
  const snapshot = await getDocs(q);
  console.log(`Found ${snapshot.size} existing records for ${targetSchoolId} to delete...`);
  let delCount = 0;
  for (const docSnapshot of snapshot.docs) {
    await deleteDoc(docSnapshot.ref);
    delCount++;
  }
  console.log(`Deleted ${delCount} records from ${targetSchoolId}.`);

  // Step 2: Upload new data
  let count = 0;
  console.log(`Uploading ${data.length} new records to ${targetSchoolId}...`);
  
  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const chunk = data.slice(i, i + batchSize);
    await Promise.all(chunk.map(row => {
      const name = row['Student Name'] || '';
      const fatherName = row["Father Name"] || '';
      const address = row["Address"] || '';
      const mobile = row["Mobile"] ? String(row["Mobile"]) : '';
      
      let clsName = 'Class 1'; // default
      if (row['Class']) {
        const clsStr = String(row['Class']);
        const match = clsStr.match(/\d+/);
        if (match) {
           clsName = `Class ${match[0]}`;
        } else {
           clsName = clsStr;
        }
      }
      
      const newStudentRef = doc(collection(db, 'students'));
      return setDoc(newStudentRef, {
        name: name,
        fatherName: fatherName,
        address: address,
        class: clsName,
        roll: '',
        contact: mobile,
        section: 'Section A',
        status: 'Active',
        attendance: '0%',
        dueAmount: 0,
        createdAt: new Date().toISOString(),
        schoolId: targetSchoolId
      });
    }));
    
    count += chunk.length;
    console.log(`Uploaded ${count} records...`);
  }
  
  console.log(`Successfully uploaded ${count} records to ${targetSchoolId}!`);
  process.exit(0);
}

upload().catch(console.error);
