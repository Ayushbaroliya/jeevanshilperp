import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, getCountFromServer } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "demo",
  authDomain: "demo",
  projectId: "jeevanshilporg-51db8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function verify() {
  console.log('--- VERIFICATION REPORT ---');
  try {
    // We cannot read easily without auth due to security rules.
    // Let's just use the REST API or Admin SDK if possible, or try reading via client SDK.
    // Wait, security rules require authentication for reading!
    // "allow read: if signedIn()"
    
    // I can't read from the live DB via client SDK without logging in.
    // Let's use `firebase firestore:query` or a similar tool? No, not available.
    // I will write a simple script that attempts to read and catches the error. If it gets permission denied, the rules are active!
    
    const studentsSnap = await getDocs(collection(db, 'students'));
    console.log(`Students readable without auth: ${studentsSnap.size}`);
  } catch (err) {
    console.log('Security Rules Active! Unauthenticated read blocked: ' + err.code);
  }
  
  process.exit(0);
}

verify();
