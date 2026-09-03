const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');
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

async function wipeStudents() {
  try {
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    console.log('Fetching all students...');
    const snap = await getDocs(collection(db, 'students'));
    let count = 0;
    
    // Process in batches
    const deletePromises = [];
    snap.forEach(document => {
      deletePromises.push(deleteDoc(doc(db, 'students', document.id)));
      count++;
    });

    console.log(`Deleting ${count} students...`);
    await Promise.all(deletePromises);
    
    console.log(`✅ Successfully deleted all ${count} student records.`);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

wipeStudents();
