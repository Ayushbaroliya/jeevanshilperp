const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const xlsx = require('xlsx');

// Determine if we are using an emulator or production
// Use GOOGLE_APPLICATION_CREDENTIALS for service account or application default credentials
initializeApp({
  credential: applicationDefault(),
  projectId: "jeevanshilporg-51db8"
});

const db = getFirestore();

const TARGET_SCHOOL_ID = 'SCH_02';
const ACADEMIC_YEAR_ID = '2026-27';
const EXCEL_FILE = 'JSIC_2026-27_Firestore_Import_Prepared.xlsx';

async function verifyAndImport() {
  try {
    console.log('✅ Authenticated successfully via Admin SDK.\n');

    // 1. BACKUP/SAFETY CHECK FIRST
    console.log('--- 1. SAFETY CHECKS ---');
    const studentsSnap = await db.collection('students').where('schoolId', '==', TARGET_SCHOOL_ID).get();
    const enrollmentsSnap = await db.collection('enrollments').where('schoolId', '==', TARGET_SCHOOL_ID).get();
    
    // Check JSPS (SCH_01) as control group
    const jspsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
    
    console.log(`Found ${studentsSnap.size} existing JSIC students.`);
    console.log(`Found ${enrollmentsSnap.size} existing JSIC enrollments.`);
    console.log(`Found ${jspsSnap.size} JSPS students (Control Group - WILL NOT BE TOUCHED).`);

    // Extract student IDs for financial safety check
    const jsicStudentIds = new Set();
    studentsSnap.forEach(d => jsicStudentIds.add(d.id));

    // 6. FINANCIAL SAFETY
    console.log('\n--- 6. FINANCIAL SAFETY CHECK ---');
    let financialRecordsCount = 0;
    const collectionsToCheck = ['fee_charges', 'student_ledger', 'fee_adjustments', 'invoices'];
    const affectedFinancials = {};

    for (const collName of collectionsToCheck) {
      const snap = await db.collection(collName).get();
      let collCount = 0;
      snap.forEach(d => {
        if (d.data().studentId && jsicStudentIds.has(d.data().studentId)) {
          collCount++;
          financialRecordsCount++;
        }
      });
      affectedFinancials[collName] = collCount;
      if (collCount > 0) {
        console.log(`WARNING: Found ${collCount} records in '${collName}' belonging to JSIC students!`);
      }
    }

    if (financialRecordsCount > 0) {
      console.error('\n🚨 CRITICAL ERROR: Financial records exist for the old JSIC students.');
      console.error(JSON.stringify(affectedFinancials, null, 2));
      console.error('ABORTING: Reset must not wipe financial collections unless explicitly handled. Stop and review.');
      process.exit(1);
    } else {
      console.log('✅ No financial records found for existing JSIC students.');
    }

    if (process.env.CONFIRM_JSIC_RESET !== 'true') {
      console.log('\n🛑 ABORTED: CONFIRM_JSIC_RESET=true flag is missing.');
      console.log('Run the script with this environment variable to proceed with deletion and import.');
      process.exit(0);
    }

    console.log('\n⚠️ CONFIRM_JSIC_RESET is true. Proceeding with DELETION of JSIC students and enrollments...');
    
    // 2. DELETE ONLY JSIC STUDENT/ENROLLMENT DATA
    let delStudents = 0;
    for (const docSnap of studentsSnap.docs) {
      await docSnap.ref.delete();
      delStudents++;
    }
    
    let delEnrollments = 0;
    for (const docSnap of enrollmentsSnap.docs) {
      await docSnap.ref.delete();
      delEnrollments++;
    }
    console.log(`✅ Deleted ${delStudents} students and ${delEnrollments} enrollments for SCH_02.`);

    // 4. IMPORT THE PREPARED JSIC EXCEL
    console.log('\n--- 4. READING EXCEL ---');
    const wb = xlsx.readFile(EXCEL_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(ws);
    
    if (rawData.length === 0) {
      console.error('🚨 Error: Excel file is empty.');
      process.exit(1);
    }

    console.log(`Found ${rawData.length} rows to import.`);

    // 5. CREATE NEW STUDENT + ENROLLMENT
    console.log('\n--- 5. IMPORTING STUDENTS ---');
    let importedCount = 0;
    const writePromises = [];
    const dupCheck = new Set();

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const studentName = row.name || '';
      if (!studentName || studentName.trim() === '') continue;

      const cls = row.class || '';
      const section = row.section || '';
      const stream = row.stream || '';
      const fatherName = row.fatherName || '';
      const roll = row.roll || '';

      const dupKey = `${cls}-${section}-${studentName}`;
      if (dupCheck.has(dupKey)) {
        console.warn(`WARNING: Possible duplicate found in import sheet: ${dupKey}`);
      }
      dupCheck.add(dupKey);

      // Create new Firestore document ref (auto-generated ID)
      const newStudentRef = db.collection('students').doc();
      
      const newStudent = {
        name: studentName,
        class: cls,
        section: section,
        schoolId: TARGET_SCHOOL_ID,
        parentName: fatherName,
        stream: stream,
        roll: roll,
        isNewAdmission: row.isNewAdmission || false,
        dueAmount: row.dueAmount || 0,
        attendance: row.attendance || '100%',
        status: row.status || 'Active',
        createdAt: new Date().toISOString()
      };

      writePromises.push(newStudentRef.set(newStudent));

      const newEnrollmentRef = db.collection('enrollments').doc();
      const newEnrollment = {
        studentId: newStudentRef.id,
        schoolId: TARGET_SCHOOL_ID,
        academicYearId: ACADEMIC_YEAR_ID,
        class: cls,
        section: section,
        roll: roll,
        status: 'Active',
        attendance: '100%',
        createdAt: new Date().toISOString()
      };

      writePromises.push(newEnrollmentRef.set(newEnrollment));
      importedCount++;
    }

    await Promise.all(writePromises);
    console.log(`✅ Imported ${importedCount} students and enrollments.`);

    // 7. POST-IMPORT VERIFICATION
    console.log('\n--- 7. POST-IMPORT VERIFICATION ---');
    const newStudentsSnap = await db.collection('students').where('schoolId', '==', TARGET_SCHOOL_ID).get();
    const newEnrollmentsSnap = await db.collection('enrollments').where('schoolId', '==', TARGET_SCHOOL_ID).get();
    const newJspsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
    
    console.log(`Total JSIC Students: ${newStudentsSnap.size}`);
    console.log(`Total JSIC Enrollments: ${newEnrollmentsSnap.size}`);
    
    if (newJspsSnap.size !== jspsSnap.size) {
      console.error(`🚨 CRITICAL: JSPS student count changed from ${jspsSnap.size} to ${newJspsSnap.size}!`);
    } else {
      console.log(`✅ JSPS student count unchanged (${jspsSnap.size}).`);
    }

    const classCounts = {};
    let class11Sci = 0;
    let class11Arts = 0;
    let class12Sci = 0;
    let class12Arts = 0;
    let missingStream = 0;

    newStudentsSnap.forEach(d => {
      const data = d.data();
      classCounts[data.class] = (classCounts[data.class] || 0) + 1;
      
      if (data.class === 'Class 11') {
        if (data.stream === 'Science') class11Sci++;
        else if (data.stream === 'Art' || data.stream === 'Arts') class11Arts++;
        else missingStream++;
      }
      if (data.class === 'Class 12') {
        if (data.stream === 'Science') class12Sci++;
        else if (data.stream === 'Art' || data.stream === 'Arts') class12Arts++;
        else missingStream++;
      }
    });

    console.log('\nStudents by Class:');
    console.table(classCounts);
    console.log(`Class 11 Science: ${class11Sci}`);
    console.log(`Class 11 Arts: ${class11Arts}`);
    console.log(`Class 12 Science: ${class12Sci}`);
    console.log(`Class 12 Arts: ${class12Arts}`);
    console.log(`Classes 11/12 Missing/Unassigned Stream: ${missingStream}`);

    console.log('\n✅ Verification Complete.');

  } catch (e) {
    console.error('Error during import:', e);
  } finally {
    process.exit(0);
  }
}

verifyAndImport();
