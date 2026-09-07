const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkConfig() {
  const settingsDoc = await db.collection('school_settings').doc('settings').get();
  const data = settingsDoc.data();
  console.log('Active Academic Year:', data.activeAcademicYearId);
  const sch02Settings = data.schoolClassSettings?.['SCH_02'];
  if (sch02Settings) {
    console.log('SCH_02 Keys:', Object.keys(sch02Settings));
  }
}
checkConfig().catch(console.error);
