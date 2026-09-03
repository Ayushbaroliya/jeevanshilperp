import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyADdvQI-awTVAR9i9TWqSB-7iW1FJ1uZig",
    authDomain: "jeevanshilporg-51db8.firebaseapp.com",
    projectId: "jeevanshilporg-51db8",
    storageBucket: "jeevanshilporg-51db8.firebasestorage.app",
    messagingSenderId: "671231951469",
    appId: "1:671231951469:web:29fd475e64855fc5c6f564"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, 'nonexistent@test.com', 'password');
  } catch(e) {
    console.log(e.code);
  }
}
run();
