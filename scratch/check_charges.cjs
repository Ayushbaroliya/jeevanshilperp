const admin = require('firebase-admin');
const serviceAccount = require('../secrets/jeevanshilporg-51db8-firebase-adminsdk-r5e8t-426c196be1.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function check() {
  const studentsSnap = await db.collection('students').where('name', '>=', 'Kritika').where('name', '<=', 'Kritika\uf8ff').get();
  console.log(`Found ${studentsSnap.size} Kritikas.`);
  for (const doc of studentsSnap.docs) {
    const s = doc.data();
    console.log(`Student ${doc.id}: ${s.name}, Class: ${s.class}, DueAmount: ${s.dueAmount}, SchoolId: ${s.schoolId}, AcademicYear: ${s.academicYear}`);
    
    const chargesSnap = await db.collection('fee_charges').where('studentId', '==', doc.id).get();
    console.log(`  -> Fee Charges found: ${chargesSnap.size}`);
    
    const settingsSnap = await db.collection('school_settings').doc('settings').get();
    const settings = settingsSnap.data()?.schoolClassSettings || {};
    console.log(`  -> Settings for school ${s.schoolId}, class ${s.class}:`, settings[s.schoolId]?.[s.class]);
  }
}
check().catch(console.error);
