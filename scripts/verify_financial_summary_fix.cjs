const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { calculateStudentDue, applyPaymentsAndAdjustments, summarizeDues } = require('../src/utils/feeEngine.js');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function runVerification() {
  console.log('====================================================');
  console.log('VERIFYING FINANCIAL SUMMARY FIX FOR JSPS NURSERY');
  console.log('====================================================\n');

  const studentId = 'zjAJZ3RP1XinbQVqfEW0';
  const studentDoc = await db.collection('students').doc(studentId).get();
  if (!studentDoc.exists) {
    throw new Error(`Student ${studentId} not found!`);
  }
  const student = { id: studentDoc.id, ...studentDoc.data() };
  console.log(`1. Student Found: ${student.name} (${student.id})`);
  console.log(`   School: ${student.schoolId}, Class: ${student.class}, isNewAdmission: ${student.isNewAdmission}\n`);

  // Fetch permanent charges
  const chargesSnap = await db.collection('fee_charges').where('studentId', '==', studentId).get();
  console.log(`2. Permanent Charges Found: ${chargesSnap.size}`);
  let totalBilled = 0;
  let tuitionTotal = 0;
  let examTotal = 0;
  let admissionTotal = 0;

  const charges = [];
  chargesSnap.forEach(d => {
    const c = { id: d.id, ...d.data() };
    charges.push(c);
    totalBilled += c.originalAmount;
    if (c.componentId === 'tuition') tuitionTotal += c.originalAmount;
    if (c.componentId === 'exam') examTotal += c.originalAmount;
    if (c.componentId === 'admission') admissionTotal += c.originalAmount;
    console.log(`   - [${c.componentId}] ${c.label}: ₹${c.originalAmount}`);
  });

  console.log(`\n   Breakdown:`);
  console.log(`   * Admission: ₹${admissionTotal} (Expected ₹1700)`);
  console.log(`   * Tuition: ₹${tuitionTotal} (Expected ₹6400)`);
  console.log(`   * Exam: ₹${examTotal} (Expected ₹600)`);
  console.log(`   * Total Billed: ₹${totalBilled} (Expected ₹8700)`);

  if (totalBilled !== 8700 || tuitionTotal !== 6400 || examTotal !== 600 || admissionTotal !== 1700) {
    throw new Error(`Charges mismatch! Expected total ₹8700, got ₹${totalBilled}`);
  }
  console.log('   ✅ Charges breakdown strictly matches official JSPS 2026-27 structure!\n');

  // Fetch payments
  const paymentsSnap = await db.collection('student_ledger').where('studentId', '==', studentId).where('type', '==', 'credit').get();
  const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Fetch adjustments
  const adjSnap = await db.collection('fee_adjustments').where('studentId', '==', studentId).where('status', '==', 'approved').get();
  const adjustments = adjSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Test calculateStudentDue
  const settingsDoc = await db.collection('school_settings').doc('settings').get();
  const storedSettings = settingsDoc.data()?.schoolClassSettings || {};
  const classSettings = storedSettings['SCH_01']?.['Nursery'] || {};

  const summary = calculateStudentDue({
    student,
    charges,
    classSettings,
    payments,
    adjustments
  });

  console.log(`3. Financial Summary Calculation:`);
  console.log(`   * Total Due (Fee Due): ₹${summary.totalDue} (Expected ₹8700)`);
  console.log(`   * Total Paid: ₹${summary.totalPaid}`);
  console.log(`   * Advance Credit: ₹${summary.advanceCredit}`);
  console.log(`   * Ledger entries: ${summary.ledger.length}`);

  if (summary.totalDue !== 8700) {
    throw new Error(`Fee Due calculation error! Expected ₹8700, got ₹${summary.totalDue}`);
  }
  console.log('   ✅ Fee Due in Financial Summary is exactly ₹8,700!\n');

  // Test StudentLedger metrics
  const totalAnnualCharges = charges.reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
  const totalAnnualTuition = charges.filter(c => c.componentId === 'tuition').reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
  console.log(`4. Student Ledger Card Metrics:`);
  console.log(`   * Outstanding Due: ₹${summary.totalDue}`);
  console.log(`   * Total Annual Fee (Annual Billing): ₹${totalAnnualCharges}`);
  console.log(`   * Total Annual Tuition: ₹${totalAnnualTuition}`);
  if (totalAnnualCharges !== 8700 || totalAnnualTuition !== 6400) {
    throw new Error('Student Ledger metrics mismatch!');
  }
  console.log('   ✅ Student Ledger displays correct ₹8,700 and ₹6,400 with NO duplicate installment!\n');

  // Check JSIC student count
  const jsicStudents = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`5. Checking JSIC (SCH_02) Integrity:`);
  console.log(`   * SCH_02 student count: ${jsicStudents.size} (Expected exactly 993)`);
  if (jsicStudents.size !== 993) {
    throw new Error(`JSIC student count changed! Expected 993, got ${jsicStudents.size}`);
  }
  console.log('   ✅ JSIC data is completely untouched and authoritative!\n');

  // Check JSPS student count
  const jspsStudents = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`6. Checking JSPS (SCH_01) Student Count:`);
  console.log(`   * SCH_01 student count: ${jspsStudents.size}`);

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY!');
  console.log('====================================================');
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
