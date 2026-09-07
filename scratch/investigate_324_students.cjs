const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const xlsx = require('xlsx');
const path = require('path');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function runInvestigation() {
  console.log('=== JSPS 324 vs 257 STUDENTS INVESTIGATION (READ-ONLY) ===\n');

  // 1. Count Firestore students where schoolId == SCH_01
  const sch01StudentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`1. Firestore students where schoolId == 'SCH_01': ${sch01StudentsSnap.size}`);

  // 2. Count enrollments where schoolId == SCH_01 and academicYearId is canonical AY_2026_27
  const sch01CanonicalEnrollSnap = await db.collection('enrollments')
    .where('schoolId', '==', 'SCH_01')
    .where('academicYearId', '==', 'AY_2026_27')
    .get();
  console.log(`2. Enrollments where schoolId == 'SCH_01' and academicYearId == 'AY_2026_27': ${sch01CanonicalEnrollSnap.size}`);

  const allSch01EnrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  const enrollYearCounts = {};
  allSch01EnrollSnap.forEach(d => {
    const y = d.data().academicYearId || d.data().academicYear || 'UNKNOWN';
    enrollYearCounts[y] = (enrollYearCounts[y] || 0) + 1;
  });
  console.log(`   All SCH_01 enrollments breakdown:`, enrollYearCounts);

  // 3. Identify all 324 SCH_01 student IDs and timestamps
  const students = [];
  sch01StudentsSnap.forEach(d => {
    students.push({ id: d.id, ...d.data() });
  });

  const batch67 = students.filter(s => s.id.startsWith('stu_jsps_1788784762579'));
  const batch257 = students.filter(s => !s.id.startsWith('stu_jsps_1788784762579'));

  console.log(`\n3. Batch Breakdown:`);
  console.log(`   - Earlier batch (prefix stu_jsps_1788784762579, created ~12:39:22Z): ${batch67.length}`);
  console.log(`   - Latest batch (created ~12:40:19Z): ${batch257.length}`);
  console.log(`   - Sum = ${batch67.length + batch257.length}`);

  // 4. Check duplicate students by name + fatherName + class
  console.log('\n4. Duplicate Analysis:');
  const studentKeyMap = {};
  students.forEach(s => {
    const key = `${(s.name || '').trim().toLowerCase()}|${(s.fatherName || '').trim().toLowerCase()}|${(s.class || '').trim().toLowerCase()}`;
    if (!studentKeyMap[key]) studentKeyMap[key] = [];
    studentKeyMap[key].push(s);
  });

  const duplicates = Object.entries(studentKeyMap).filter(([k, list]) => list.length > 1);
  console.log(`   Total distinct (name + father + class) keys: ${Object.keys(studentKeyMap).length}`);
  console.log(`   Keys with >1 student: ${duplicates.length}`);

  // Check how many of the 67 match one of the 257 exactly
  let matchCount = 0;
  let nonMatchCount = 0;
  const matchDetails = [];

  batch67.forEach(s67 => {
    const key = `${(s67.name || '').trim().toLowerCase()}|${(s67.fatherName || '').trim().toLowerCase()}|${(s67.class || '').trim().toLowerCase()}`;
    const matchIn257 = batch257.find(s257 => {
      const k257 = `${(s257.name || '').trim().toLowerCase()}|${(s257.fatherName || '').trim().toLowerCase()}|${(s257.class || '').trim().toLowerCase()}`;
      return k257 === key;
    });
    if (matchIn257) {
      matchCount++;
      matchDetails.push({
        name: s67.name,
        fatherName: s67.fatherName,
        class: s67.class,
        oldId: s67.id,
        newId: matchIn257.id
      });
    } else {
      nonMatchCount++;
    }
  });

  console.log(`   Of the 67 earlier students:`);
  console.log(`     - Matched an identical student in the 257 batch: ${matchCount}`);
  console.log(`     - Unmatched in the 257 batch: ${nonMatchCount}`);

  // 5. Excel inspection
  console.log('\n7. Excel Verification:');
  const excelFile = 'jeevanshilppublic school.xlsx';
  const wb = xlsx.readFile(excelFile);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
  console.log(`   Excel file: ${excelFile}`);
  console.log(`   Sheet name: ${wb.SheetNames[0]}`);
  console.log(`   Total data rows in Excel: ${rawData.length}`);

  // Class-wise count of the 67 records
  const classBreakdown67 = {};
  batch67.forEach(s => {
    classBreakdown67[s.class] = (classBreakdown67[s.class] || 0) + 1;
  });
  console.log('\nGrouping of the 67 extra records by class:', classBreakdown67);

  // Print summary of the 67 records
  console.log('\nSample of the 67 extra records:');
  batch67.slice(0, 10).forEach((s, idx) => {
    console.log(`   [${idx + 1}] ID: ${s.id}, Name: "${s.name}", Father: "${s.fatherName}", Class: "${s.class}", Roll: ${s.roll}`);
  });

  // 6. SCH_02 Check
  const sch02Snap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`\nJSIC SCH_02 student count: ${sch02Snap.size}`);
}

runInvestigation().catch(console.error);
