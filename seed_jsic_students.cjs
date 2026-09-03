const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, deleteDoc, query, where, doc, setDoc } = require('firebase/firestore');
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

const firstNames = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Rayaan", "Ayaan", "Krishna", "Ishaan", "Shaurya", "Atharv", "Ananya", "Myra", "Saanvi", "Kiara", "Diya", "Pari", "Navya", "Riya"];
const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Chauhan", "Jain", "Bhatia"];

function getRandomName() {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last}`;
}

async function seedData() {
  await new Promise((resolve) => {
    rl.question('Enter Owner Email (e.g. jeevanshilporg@gmail.com): ', (email) => {
      rl.question('Enter Password: ', async (password) => {
        try {
          console.log('\nSigning in...');
          await signInWithEmailAndPassword(auth, email, password);
          console.log('Successfully signed in!\n');
          resolve();
        } catch (e) {
          console.error('Login failed:', e.message);
          process.exit(1);
        }
      });
    });
  });

  const schoolId = 'SCH_02'; // Jeevan Shilp Inter College
  
  // Step 1: Clear existing SCH_02 students
  console.log('Clearing old students for Jeevan Shilp Inter College...');
  const q = query(collection(db, 'students'), where('schoolId', '==', schoolId));
  const snap = await getDocs(q);
  let delCount = 0;
  for (const docSnap of snap.docs) {
    await deleteDoc(docSnap.ref);
    delCount++;
  }
  console.log(`Deleted ${delCount} old students.`);

  // Step 2: Generate class-wise data
  const classes = [6, 7, 8, 9, 10, 11, 12];
  let createdCount = 0;

  for (const cls of classes) {
    console.log(`Generating students for Class ${cls}...`);
    // Create 10 students per class
    for (let i = 1; i <= 10; i++) {
      const studentId = `JSIC-${cls.toString().padStart(2, '0')}-${i.toString().padStart(3, '0')}`;
      
      const newStudent = {
        id: studentId,
        name: getRandomName(),
        class: `Class ${cls}`,
        section: 'Section A',
        schoolId: schoolId,
        parentName: getRandomName(),
        contact: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        address: "Local Address, City",
        // Numeric data
        dueAmount: Math.floor(Math.random() * 5000), // Random due amount between 0 and 5000
        attendance: `${Math.floor(75 + Math.random() * 25)}%`, // Random attendance between 75% and 100%
        createdAt: new Date().toISOString()
      };

      // We use setDoc to specify the document ID as studentId so it looks nice in DB
      await setDoc(doc(db, 'students', studentId), newStudent);
      createdCount++;
    }
  }

  console.log(`\n✅ Successfully generated and uploaded ${createdCount} students for Jeevan Shilp Inter College (Classes 6 to 12).`);
  process.exit(0);
}

seedData().catch(console.error);
