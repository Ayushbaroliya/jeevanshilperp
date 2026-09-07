const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function surgicalDelete() {
  console.log('=== SURGICAL CLEANUP OF BATCH-A JSPS DUPLICATES ===\n');

  // Build the exact set of 67 target student IDs
  const targetStudentIds = [];
  for (let i = 0; i <= 66; i++) {
    targetStudentIds.push(`stu_jsps_1788784762579_${i}`);
  }
  const targetSet = new Set(targetStudentIds);
  console.log(`Targeting exactly ${targetStudentIds.length} Batch-A student IDs.`);

  // 1. Verify Student Docs
  const studentDocsToDelete = [];
  for (const sId of targetStudentIds) {
    const docRef = db.collection('students').doc(sId);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data();
      if (data.schoolId !== 'SCH_01') {
        throw new Error(`SAFETY STOP: Student ${sId} has schoolId ${data.schoolId} != 'SCH_01'!`);
      }
      studentDocsToDelete.push(docRef);
    } else {
      console.warn(`Warning: Student ${sId} not found in Firestore.`);
    }
  }
  console.log(`Found ${studentDocsToDelete.length} student documents to delete.`);
  if (studentDocsToDelete.length !== 67) {
    throw new Error(`SAFETY STOP: Expected 67 student docs, found ${studentDocsToDelete.length}!`);
  }

  // 2. Find associated Enrollments
  // In enrollments, query where schoolId == 'SCH_01'
  const enrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  const enrollDocsToDelete = [];
  enrollSnap.forEach(d => {
    const data = d.data();
    if (targetSet.has(data.studentId)) {
      enrollDocsToDelete.push(d.ref);
    }
  });
  console.log(`Found ${enrollDocsToDelete.length} enrollment documents to delete.`);
  if (enrollDocsToDelete.length !== 67) {
    throw new Error(`SAFETY STOP: Expected 67 enrollment docs for Batch-A, found ${enrollDocsToDelete.length}!`);
  }

  // 3. Find associated Fee Charges
  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  const chargeDocsToDelete = [];
  chargesSnap.forEach(d => {
    const data = d.data();
    if (targetSet.has(data.studentId)) {
      chargeDocsToDelete.push(d.ref);
    }
  });
  console.log(`Found ${chargeDocsToDelete.length} fee_charge documents to delete.`);
  if (chargeDocsToDelete.length !== 266) {
    throw new Error(`SAFETY STOP: Expected 266 fee_charges for Batch-A, found ${chargeDocsToDelete.length}!`);
  }

  // Total documents to delete = 67 + 67 + 266 = 400
  const allDocsToDelete = [...studentDocsToDelete, ...enrollDocsToDelete, ...chargeDocsToDelete];
  console.log(`\nTotal documents staged for deletion: ${allDocsToDelete.length}`);
  if (allDocsToDelete.length !== 400) {
    throw new Error(`SAFETY STOP: Total staging count ${allDocsToDelete.length} !== 400!`);
  }

  // Execute deletion in Batches of 400 (well within Firestore 500 limit)
  console.log('Committing batch deletion to Firestore...');
  const batch = db.batch();
  for (const docRef of allDocsToDelete) {
    batch.delete(docRef);
  }
  await batch.commit();
  console.log('Batch deletion committed successfully!\n');

  // Immediately verify Firestore counts
  console.log('=== POST-DELETION VERIFICATION ===');
  const finalSch01Students = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`SCH_01 Students count: ${finalSch01Students.size} (Expected: 257)`);

  const finalSch01Enroll = await db.collection('enrollments')
    .where('schoolId', '==', 'SCH_01')
    .where('academicYearId', '==', 'AY_2026_27')
    .get();
  console.log(`SCH_01 Enrollments for AY_2026_27: ${finalSch01Enroll.size} (Expected: 257)`);

  const finalSch01Charges = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  console.log(`SCH_01 Fee Charges: ${finalSch01Charges.size} (Expected: 1028)`);

  const finalSch02Students = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 JSIC Students count: ${finalSch02Students.size} (Expected: 993)`);

  if (finalSch01Students.size !== 257) {
    throw new Error(`SCH_01 students count is ${finalSch01Students.size}, expected 257!`);
  }
  if (finalSch01Enroll.size !== 257) {
    throw new Error(`SCH_01 enrollments count is ${finalSch01Enroll.size}, expected 257!`);
  }
  if (finalSch01Charges.size !== 1028) {
    throw new Error(`SCH_01 fee_charges count is ${finalSch01Charges.size}, expected 1028!`);
  }
  if (finalSch02Students.size !== 993) {
    throw new Error(`SCH_02 students count is ${finalSch02Students.size}, expected 993!`);
  }

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED PERFECTLY!');
}

surgicalDelete().catch(err => {
  console.error('ERROR OCCURRED:', err);
  process.exit(1);
});
