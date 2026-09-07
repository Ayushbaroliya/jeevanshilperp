import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, connectAuthEmulator } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyADdvQI-awTVAR9i9TWqSB-7iW1FJ1uZig",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "jeevanshilporg-51db8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "jeevanshilporg-51db8",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "jeevanshilporg-51db8.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "671231951469",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:671231951469:web:29fd475e64855fc5c6f564"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const functions = getFunctions(app);

import { collection, doc, getDocs, query, where, runTransaction } from "firebase/firestore";

if (import.meta.env.VITE_E2E_TESTING === 'true' && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  window.e2eFirestore = { db, collection, doc, getDocs, query, where, runTransaction };
}

export const staffAuthEmail = (contact) => `${String(contact).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@jeevanshilpgroup.local`;

// Uses a secondary Firebase app so creating a staff account does not sign the current admin out.
export const createStaffAuthAccount = async (contact, password) => {
  const secondary = initializeApp(firebaseConfig, `staff-creator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const secondaryAuth = getAuth(secondary);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, staffAuthEmail(contact), password);
    await signOut(secondaryAuth);
    return credential.user;
  } finally {
    await deleteApp(secondary);
  }
};

export { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

