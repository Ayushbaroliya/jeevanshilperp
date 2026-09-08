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

export const normalizeLoginId = (contact) => {
  if (!contact) return '';
  const str = String(contact).trim();
  if (str.includes('@')) {
    return str.toLowerCase().trim();
  }
  // Strip spaces, dashes, parentheses and country code symbols
  let clean = str.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  // If Indian mobile with country code +91 or 91 (12 digits)
  if (/^91[0-9]{10}$/.test(clean)) {
    clean = clean.slice(2);
  } else if (/^0[0-9]{10}$/.test(clean)) {
    clean = clean.slice(1);
  }
  return clean;
};

export const staffAuthEmail = (contact) => {
  const norm = normalizeLoginId(contact);
  if (!norm) return '';
  if (norm.includes('@')) return norm;
  return `${norm}@jeevanshilpgroup.local`;
};

// Uses a secondary Firebase app so creating a staff account does not sign the current admin out.
export const createStaffAuthAccount = async (contact, password) => {
  const email = staffAuthEmail(contact);
  const secondary = initializeApp(firebaseConfig, `staff-creator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const secondaryAuth = getAuth(secondary);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return credential.user;
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      try {
        const existingCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth);
        return existingCred.user;
      } catch (signErr) {
        throw err;
      }
    }
    throw err;
  } finally {
    try {
      await deleteApp(secondary);
    } catch (_) {}
  }
};

export { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

