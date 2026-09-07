const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { generateChargeSchedule, normalizeClassFeeSettings } = require('../src/utils/feeEngine.js');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkAndSeedStudentCharges() {
  const studentId = 'zjAJZ3RP1XinbQVqfEW0';
  const sDoc = await db.collection('students').doc(studentId).get();
  if (!sDoc.exists) {
    console.log(`Student ${studentId} does not exist.`);
    return;
  }
  const student = { id: sDoc.id, ...sDoc.data() };
  console.log('Found student:', student);

  const existingCharges = await db.collection('fee_charges').where('studentId', '==', studentId).get();
  console.log(`Existing charges for ${studentId}: ${existingCharges.size}`);

  if (existingCharges.size === 0) {
    console.log('Generating official permanent charges for Nursery new admission...');
    const settingsDoc = await db.collection('school_settings').doc('settings').get();
    const nurserySettings = settingsDoc.data()?.schoolClassSettings?.SCH_01?.['Nursery'];
    const feeTemplate = normalizeClassFeeSettings(nurserySettings, '2026-2027');

    const mockStudent = {
      id: studentId,
      isNewAdmission: true,
      academicYear: '2026-2027'
    };
    const charges = generateChargeSchedule(mockStudent, feeTemplate, '2026-2027');
    console.log(`Generated ${charges.length} charges:`);
    
    const batch = db.batch();
    for (const c of charges) {
      const ref = db.collection('fee_charges').doc(c.id);
      batch.set(ref, {
        id: c.id,
        studentId: studentId,
        academicYear: '2026-2027',
        academicYearId: 'AY_2026_27',
        schoolId: 'SCH_01',
        class: 'Nursery',
        section: 'A',
        componentId: c.componentId,
        label: c.label,
        originalAmount: c.originalAmount,
        dueDate: c.dueDate,
        status: 'unpaid',
        allocatedPaid: 0,
        allocatedAdjusted: 0,
        netDue: c.originalAmount,
        type: c.type || 'standard',
        createdAt: new Date().toISOString()
      });
      console.log(`  + ${c.id}: ${c.label} => ₹${c.originalAmount}`);
    }

    // Also update student's academicYear to 2026-2027 if missing
    batch.update(sDoc.ref, {
      academicYear: '2026-2027',
      isNewAdmission: true
    });

    await batch.commit();
    console.log('Successfully written permanent charges to Firestore for student.');
  } else {
    existingCharges.forEach(d => {
      console.log(`  - ${d.id}: ₹${d.data().originalAmount}`);
    });
  }
}

checkAndSeedStudentCharges().catch(console.error);
