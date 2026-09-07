const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getJSPSFeeComponents, normalizeClassFeeSettings } = require('../src/utils/feeEngine.js');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function applyJSPSDefaults() {
  console.log('=== APPLYING JSPS (SCH_01) DEFAULT CLASS & FEE STRUCTURE ===\n');

  const ACADEMIC_YEAR_ID = 'AY_2026_27';
  const ACADEMIC_YEAR_LABEL = '2026-2027';

  // 1. Inspect existing JSPS records
  const settingsRef = db.collection('school_settings').doc('settings');
  const settingsSnap = await settingsRef.get();
  if (!settingsSnap.exists) {
    throw new Error('school_settings/settings document does not exist!');
  }
  const currentSettings = settingsSnap.data();

  // Safety check: verify JSIC before write
  const preJsicSnap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  if (preJsicSnap.size !== 993) {
    throw new Error(`PRE-CHECK FAILED: JSIC has ${preJsicSnap.size} students, expected 993!`);
  }
  const preJspsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  if (preJspsSnap.size !== 257) {
    throw new Error(`PRE-CHECK FAILED: JSPS has ${preJspsSnap.size} students, expected 257!`);
  }
  console.log('Pre-checks passed: JSPS = 257 students, JSIC = 993 students.');

  // 2. Define the 11 JSPS Classes
  const jspsClasses = [
    'Nursery', 'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8'
  ];

  const jspsSections = ['Section A', 'Section B'];

  // 3. Build the official fee structure for each class
  const jspsClassSettings = {};
  for (const cls of jspsClasses) {
    const rawComps = getJSPSFeeComponents(cls, ACADEMIC_YEAR_LABEL);
    const normalized = normalizeClassFeeSettings({
      academicYear: ACADEMIC_YEAR_LABEL,
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
    }, ACADEMIC_YEAR_LABEL);

    jspsClassSettings[cls] = normalized;
  }

  // 4. Update Firestore school_settings/settings atomically
  const updatedSchoolClasses = {
    ...currentSettings.schoolClasses,
    SCH_01: jspsClasses
  };

  const updatedSchoolSections = {
    ...currentSettings.schoolSections,
    SCH_01: jspsSections
  };

  const updatedSchoolClassSettings = {
    ...currentSettings.schoolClassSettings,
    SCH_01: jspsClassSettings
  };

  const updatedActiveAY = {
    ...currentSettings.activeAcademicYearId,
    SCH_01: ACADEMIC_YEAR_ID
  };

  console.log('Writing updated SCH_01 defaults to school_settings/settings...');
  await settingsRef.set({
    schoolClasses: updatedSchoolClasses,
    schoolSections: updatedSchoolSections,
    schoolClassSettings: updatedSchoolClassSettings,
    activeAcademicYearId: updatedActiveAY
  }, { merge: true });

  console.log('Firestore update completed successfully!\n');

  // 5. Post-Verification
  console.log('=== VERIFYING POST-WRITE STATE ===');
  const postSnap = await settingsRef.get();
  const postData = postSnap.data();

  const savedClasses = postData.schoolClasses?.SCH_01 || [];
  console.log(`Verified JSPS Classes (${savedClasses.length}/11):`, savedClasses);
  if (savedClasses.length !== 11) {
    throw new Error(`Expected 11 JSPS classes, found ${savedClasses.length}!`);
  }

  const savedSettings = postData.schoolClassSettings?.SCH_01 || {};
  for (const cls of jspsClasses) {
    const cfg = savedSettings[cls];
    if (!cfg) throw new Error(`Missing fee configuration for ${cls}!`);
    const comps = cfg.components || [];
    const adm = comps.find(c => c.id === 'admission')?.amount || 0;
    const tuit = comps.find(c => c.id === 'tuition')?.amount || 0;
    const ex = comps.find(c => c.id === 'exam')?.amount || 0;
    console.log(`  ✓ ${cls.padEnd(8)}: Admission=₹${adm}, Tuition=₹${tuit}, Exam=₹${ex}, Total=₹${adm + tuit + ex}`);
  }

  const postJspsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`Verified JSPS Student Count: ${postJspsSnap.size} (Expected: 257)`);
  if (postJspsSnap.size !== 257) {
    throw new Error(`JSPS students count changed to ${postJspsSnap.size}!`);
  }

  const postJsicSnap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`Verified JSIC Student Count: ${postJsicSnap.size} (Expected: 993)`);
  if (postJsicSnap.size !== 993) {
    throw new Error(`JSIC students count changed to ${postJsicSnap.size}!`);
  }

  console.log('\n✅ ALL JSPS DEFAULT SETTINGS VERIFIED AND SECURE!');
}

applyJSPSDefaults().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
