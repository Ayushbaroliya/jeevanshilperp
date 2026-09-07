const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore();

async function runReadOnlyVerification() {
  console.log('=== STARTING STRICT READ-ONLY VERIFICATION ===\n');

  // 1. Verify canonical academic year
  const settingsDoc = await db.collection('school_settings').doc('settings').get();
  const currentAY = settingsDoc.exists ? settingsDoc.data().currentAcademicYearId : null;
  console.log(`[1] Canonical Academic Year in school_settings/settings: "${currentAY}"`);
  
  const aySnap = await db.collection('academic_years').get();
  console.log(`Academic years found in 'academic_years' collection (${aySnap.size} docs):`);
  aySnap.forEach(d => {
    console.log(`  - id: ${d.id}, name: ${d.data().name || d.data().label}`);
  });

  // 2. SCH_01 counts
  const sch01StudentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  const sch01EnrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  const sch01ChargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();

  console.log(`\n[2] SCH_01 Totals:`);
  console.log(`  - Students: ${sch01StudentsSnap.size}`);
  console.log(`  - Enrollments: ${sch01EnrollSnap.size}`);
  console.log(`  - Fee Charges: ${sch01ChargesSnap.size}`);

  const sch01ClassStudents = {};
  sch01StudentsSnap.forEach(doc => {
    const cls = doc.data().class || 'UNKNOWN';
    sch01ClassStudents[cls] = (sch01ClassStudents[cls] || 0) + 1;
  });

  const sch01ClassCharges = {};
  sch01ChargesSnap.forEach(doc => {
    const cls = doc.data().class || 'UNKNOWN';
    sch01ClassCharges[cls] = (sch01ClassCharges[cls] || 0) + 1;
  });

  console.log('\n  Class-wise student & charge distribution for SCH_01:');
  const allClasses = Array.from(new Set([...Object.keys(sch01ClassStudents), ...Object.keys(sch01ClassCharges)])).sort();
  for (const c of allClasses) {
    console.log(`    * ${c}: Students = ${sch01ClassStudents[c] || 0}, Charges = ${sch01ClassCharges[c] || 0}`);
  }

  // 3 & 4. JSPS Class charge breakdown verification
  console.log('\n[3 & 4] Charge Breakdown per class in SCH_01:');
  const classBreakdown = {};
  sch01ChargesSnap.forEach(doc => {
    const d = doc.data();
    const cls = d.class;
    if (!classBreakdown[cls]) {
      classBreakdown[cls] = {
        chargesPerStudent: 0,
        sampleStudentId: d.studentId,
        components: {},
        examCount: 0,
        totalAmountPerStudent: 0,
        installments: {}
      };
    }
  });

  // For a sample student from each class, inspect exact charges
  for (const cls of Object.keys(classBreakdown)) {
    const sampleCharges = sch01ChargesSnap.docs
      .map(d => d.data())
      .filter(d => d.class === cls && d.studentId === classBreakdown[cls].sampleStudentId);

    classBreakdown[cls].chargesCount = sampleCharges.length;
    let sum = 0;
    let examAmt = 0;
    let tuitionInst1 = 0;
    let tuitionInst2 = 0;
    let tuitionInst3 = 0;
    let admissionAmt = 0;
    let examCount = 0;

    sampleCharges.forEach(c => {
      sum += (c.amount || 0);
      if (c.type === 'exam') {
        examAmt += c.amount;
        examCount++;
      } else if (c.type === 'admission') {
        admissionAmt += c.amount;
      } else if (c.type === 'tuition') {
        if (c.installmentNumber === 1) tuitionInst1 += c.amount;
        if (c.installmentNumber === 2) tuitionInst2 += c.amount;
        if (c.installmentNumber === 3) tuitionInst3 += c.amount;
      }
    });

    console.log(`  Class: ${cls}`);
    console.log(`    - Total charges generated per student: ${sampleCharges.length}`);
    console.log(`    - Tuition Inst 1: ₹${tuitionInst1}`);
    console.log(`    - Tuition Inst 2: ₹${tuitionInst2}`);
    console.log(`    - Tuition Inst 3: ₹${tuitionInst3}`);
    console.log(`    - Total Tuition: ₹${tuitionInst1 + tuitionInst2 + tuitionInst3}`);
    console.log(`    - Exam Fee: ₹${examAmt} (Count: ${examCount})`);
    console.log(`    - Admission Fee: ₹${admissionAmt}`);
    console.log(`    - Total Annual Charges: ₹${sum}`);
    console.log(`    - Exam fee isolated from installments: ${examCount === 1 && sampleCharges.find(c => c.type === 'exam').installmentNumber === 0 ? 'YES (standalone exam fee)' : 'CHECK'}`);
  }

  // 5. Excel admission status inspection
  console.log('\n[5] Excel Admission Status Inspection:');
  const excelFile = 'jeevanshilppublic school.xlsx';
  const excelPath = path.join(__dirname, '..', excelFile);
  const xlsx = require('xlsx');
  if (fs.existsSync(excelPath)) {
    const workbook = xlsx.readFile(excelPath);
    console.log(`  Excel file: ${excelFile}`);
    console.log(`  Excel sheet names: ${workbook.SheetNames.join(', ')}`);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log(`  Total rows in Excel: ${rows.length}`);
    console.log(`  Header row:`, JSON.stringify(rows[0]));
    if (rows.length > 1) {
      console.log(`  Sample row 1:`, JSON.stringify(rows[1]));
    }
    // Check if any column mentions admission, new, old, type, status
    const headers = rows[0] || [];
    const admissionRelatedHeaders = headers.filter(h => typeof h === 'string' && /admiss|new|continu|type|status/i.test(h));
    console.log(`  Admission-related columns found:`, admissionRelatedHeaders);
  } else {
    console.log(`  Excel file not found at ${excelPath}`);
  }

  // 6. Verify SCH_02 (JSIC)
  console.log('\n[6] SCH_02 (JSIC) Integrity Check:');
  const sch02StudentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`  - SCH_02 Student Count: ${sch02StudentsSnap.size}`);

  const sch02EnrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_02').get();
  console.log(`  - SCH_02 Enrollment Count: ${sch02EnrollSnap.size}`);

  const sch02ChargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_02').get();
  console.log(`  - SCH_02 Fee Charges Count: ${sch02ChargesSnap.size}`);

  const sch02PaymentsSnap = await db.collection('payments').where('schoolId', '==', 'SCH_02').get();
  console.log(`  - SCH_02 Payments Count: ${sch02PaymentsSnap.size}`);

  const sch02AdjSnap = await db.collection('fee_adjustments').where('schoolId', '==', 'SCH_02').get();
  console.log(`  - SCH_02 Fee Adjustments Count: ${sch02AdjSnap.size}`);

  console.log('\n=== READ-ONLY VERIFICATION COMPLETE ===');
}

runReadOnlyVerification().catch(console.error);
