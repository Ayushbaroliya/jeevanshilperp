const admin = require('firebase-admin');

// Ensure GOOGLE_APPLICATION_CREDENTIALS is set
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

async function updateClasses() {
  try {
    const schoolId = 'SCH_01'; // Jeevanshilp Inter College
    const settingsRef = db.collection('school_settings').doc(schoolId);
    
    const docSnap = await settingsRef.get();
    
    let classes = [];
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data.schoolClasses) {
        classes = data.schoolClasses;
      }
    }
    
    // Remove generic Class 11 and Class 12
    classes = classes.filter(c => c !== 'Class 11' && c !== 'Class 12');
    
    // Add Stream Classes
    const streams = [
      'Class 11 - Maths', 'Class 11 - Arts', 'Class 11 - Home Science',
      'Class 12 - Maths', 'Class 12 - Arts', 'Class 12 - Home Science'
    ];
    
    streams.forEach(stream => {
      if (!classes.includes(stream)) {
        classes.push(stream);
      }
    });

    // Custom sort to keep classes in logical order
    // (This is basic, but ensures they are added)
    
    await settingsRef.set({
      schoolClasses: classes
    }, { merge: true });
    
    console.log(`Successfully updated classes for ${schoolId}.`);
    console.log("New class list:", classes);
    
  } catch (err) {
    console.error("Error updating classes:", err);
  }
}

updateClasses();
