const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getJSPSFeeComponents, normalizeClassFeeSettings } = require('../src/utils/feeEngine.js');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function prepareJSPSConfig() {
  console.log('=== INSPECTING CURRENT JSPS SETTINGS ===\n');

  const settingsDoc = await db.collection('school_settings').doc('settings').get();
  const currentData = settingsDoc.data() || {};

  console.log('Current schoolClasses.SCH_01:', currentData.schoolClasses?.SCH_01);
  console.log('Current schoolSections.SCH_01:', currentData.schoolSections?.SCH_01);
  console.log('Current activeAcademicYearId:', currentData.activeAcademicYearId);
  console.log('Current schoolClassSettings.SCH_01 exists?:', !!currentData.schoolClassSettings?.SCH_01);

  const jspsClasses = [
    'Nursery', 'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8'
  ];

  const jspsSections = ['Section A', 'Section B'];

  const jspsClassSettings = {};
  for (const cls of jspsClasses) {
    const rawComps = getJSPSFeeComponents(cls, '2026-2027');
    const normalized = normalizeClassFeeSettings({
      academicYear: '2026-2027',
      duePolicy: {
        defaultDueDay: 10,
        defaultGraceDays: 5,
        defaultPenalty: 100,
        maximumPenalty: 500,
        septemberPenalty: 100,
        decemberPenalty: 500,
        decemberClearWaivesPenalty: true
      },
      components: rawComps
    }, '2026-2027');

    jspsClassSettings[cls] = normalized;

    // Verify component amounts and totals
    let adm = 0, tuit = 0, ex = 0;
    normalized.components.forEach(c => {
      if (c.id === 'admission') adm = c.amount;
      if (c.id === 'tuition') tuit = c.amount;
      if (c.id === 'exam') ex = c.amount;
    });
    console.log(`Class: ${cls.padEnd(8)} | Adm: ₹${adm.toString().padEnd(4)} | Tuit: ₹${tuit.toString().padEnd(4)} | Exam: ₹${ex.toString().padEnd(4)} | Total: ₹${adm + tuit + ex}`);
  }

  return { jspsClasses, jspsSections, jspsClassSettings };
}

prepareJSPSConfig().catch(console.error);
