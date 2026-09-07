const { initializeApp: initAdmin, cert } = require('firebase-admin/app');
const { getFirestore: getAdminDb } = require('firebase-admin/firestore');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, connectFirestoreEmulator } = require('firebase/firestore');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');

// Initialize Admin SDK with emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
const adminApp = initAdmin({ projectId: 'jeevanshilporg-51db8' });
const adminDb = getAdminDb();

const app = initializeApp({ projectId: 'jeevanshilporg-51db8', apiKey: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, 'localhost', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://localhost:9099');

async function test() {
  try {
    const email = 'owner_test_' + Date.now() + '@demo.com';
    const userCredential = await createUserWithEmailAndPassword(auth, email, 'password123');
    const uid = userCredential.user.uid;
    
    // Create Owner profile bypassing rules using Admin SDK
    await adminDb.collection('users').doc(uid).set({ role: 'Owner' });
    console.log('Owner profile created in emulator via Admin SDK!');
    
    // Test the JS SDK read query
    try {
      const q = query(collection(db, 'enrollments'), where('schoolId', '==', 'SCH_01'));
      await getDocs(q);
      console.log('SUCCESS: List query worked!');
    } catch(e) {
      console.log('FAILED: List query threw error:', e.message);
    }
    process.exit(0);
  } catch(e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}
test();
