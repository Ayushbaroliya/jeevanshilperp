const admin = require('firebase-admin');

// Ensure you have set the GOOGLE_APPLICATION_CREDENTIALS environment variable
// pointing to your Firebase service account JSON key file before running this script.

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
  console.log("Please export GOOGLE_APPLICATION_CREDENTIALS='/path/to/service-account-file.json'");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const ownerEmail = 'jeevanshilporg@gmail.com';
const defaultPassword = 'changeMe123!';

async function bootstrapOwner() {
  try {
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(ownerEmail);
      console.log(`User ${ownerEmail} already exists in Firebase Auth.`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        userRecord = await admin.auth().createUser({
          email: ownerEmail,
          password: defaultPassword,
          displayName: 'Group Owner / Super Admin',
        });
        console.log(`Successfully created Firebase Auth user for ${ownerEmail}.`);
        console.log(`Temporary Password: ${defaultPassword}`);
      } else {
        throw error;
      }
    }

    const db = admin.firestore();
    const userDocRef = db.collection('users').doc(userRecord.uid);
    
    await userDocRef.set({
      name: 'Group Owner / Super Admin',
      role: 'Owner',
      email: ownerEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`Firestore document for ${ownerEmail} initialized successfully.`);
    console.log("Bootstrap complete. Ensure the owner changes their password after logging in.");
  } catch (err) {
    console.error("Error bootstrapping owner:", err);
  }
}

bootstrapOwner();
