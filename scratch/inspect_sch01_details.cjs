const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function inspect() {
  // Check settings doc
  const sDoc = await db.collection('school_settings').doc('settings').get();
  console.log('school_settings/settings keys:', Object.keys(sDoc.data() || {}));
  console.log('academicYearId/currentAcademicYearId in settings:', sDoc.data()?.currentAcademicYearId, sDoc.data()?.academicYearId, sDoc.data()?.currentSession);

  // Check a sample fee_charge doc
  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').limit(5).get();
  console.log('\nSample fee_charges docs:');
  chargesSnap.forEach(d => {
    console.log(d.id, '=>', d.data());
  });

  // Check students in SCH_01: why are there 324?
  const studentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  const byAcademicYear = {};
  const byImportSource = {};
  const classCounts = {};
  studentsSnap.forEach(d => {
    const data = d.data();
    byAcademicYear[data.academicYear || data.academicYearId || 'NO_AY'] = (byAcademicYear[data.academicYear || data.academicYearId || 'NO_AY'] || 0) + 1;
    byImportSource[data.source || (data.importedAt ? 'imported' : 'other')] = (byImportSource[data.source || (data.importedAt ? 'imported' : 'other')] || 0) + 1;
    classCounts[data.class || 'NO_CLASS'] = (classCounts[data.class || 'NO_CLASS'] || 0) + 1;
  });
  console.log('\nSCH_01 Students by academicYear:', byAcademicYear);
  console.log('SCH_01 Students by source:', byImportSource);
  console.log('SCH_01 Students by class:', classCounts);

  // Check enrollments in SCH_01
  const enrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  const enrollByAY = {};
  enrollSnap.forEach(d => {
    const data = d.data();
    enrollByAY[data.academicYearId || data.academicYear || 'NO_AY'] = (enrollByAY[data.academicYearId || data.academicYear || 'NO_AY'] || 0) + 1;
  });
  console.log('\nSCH_01 Enrollments by academicYear:', enrollByAY);
}

inspect().catch(console.error);
