const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');
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

async function run() {
  await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
  const docSnap = await getDoc(doc(db, 'school_settings', 'settings'));
  if (docSnap.exists()) {
    const data = docSnap.data();
    console.log("schoolClasses:", Object.keys(data.schoolClasses || {}));
    if (data.schoolClasses) {
        console.log("SCH_01 classes type:", Array.isArray(data.schoolClasses['SCH_01']) ? 'array' : typeof data.schoolClasses['SCH_01']);
        console.log("SCH_01 classes length:", data.schoolClasses['SCH_01']?.length);
    }
  } else {
    console.log("Document does not exist");
  }
  process.exit(0);
}
run();
