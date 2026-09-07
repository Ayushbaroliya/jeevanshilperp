const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkDetails() {
  const sDoc = await db.collection('school_settings').doc('settings').get();
  console.log('activeAcademicYearId:', sDoc.data()?.activeAcademicYearId);

  // Check students in SCH_01
  const studentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`Total SCH_01 students: ${studentsSnap.size}`);

  const studentsById = {};
  const studentCreationPrefix = {};
  studentsSnap.forEach(d => {
    studentsById[d.id] = d.data();
    const prefix = d.id.split('_').slice(0, 3).join('_');
    studentCreationPrefix[prefix] = (studentCreationPrefix[prefix] || 0) + 1;
  });
  console.log('Student ID prefixes:', studentCreationPrefix);

  // Check enrollments
  const enrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  console.log(`Total SCH_01 enrollments: ${enrollSnap.size}`);
  const enrollByAY = {};
  enrollSnap.forEach(d => {
    const data = d.data();
    enrollByAY[data.academicYearId || data.academicYear || 'NO_AY'] = (enrollByAY[data.academicYearId || data.academicYear || 'NO_AY'] || 0) + 1;
  });
  console.log('Enrollments by AY:', enrollByAY);

  // Check fee_charges
  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  console.log(`Total SCH_01 fee_charges: ${chargesSnap.size}`);
  
  // Group charges by studentId
  const chargesByStudent = {};
  chargesSnap.forEach(d => {
    const data = d.data();
    if (!chargesByStudent[data.studentId]) chargesByStudent[data.studentId] = [];
    chargesByStudent[data.studentId].push(data);
  });
  console.log(`Distinct students with charges: ${Object.keys(chargesByStudent).length}`);

  // Class-wise charge counts & student counts
  const classStats = {};
  studentsSnap.forEach(d => {
    const s = d.data();
    const cls = s.class || 'UNKNOWN';
    if (!classStats[cls]) {
      classStats[cls] = {
        studentCount: 0,
        chargesCount: 0,
        sampleStudentId: d.id,
        chargesPerStudent: 0,
        tuition: 0,
        inst1: 0,
        inst2: 0,
        inst3: 0,
        exam: 0,
        admission: 0,
        totalPerStudent: 0,
        examCount: 0
      };
    }
    classStats[cls].studentCount++;
    const sCharges = chargesByStudent[d.id] || [];
    classStats[cls].chargesCount += sCharges.length;
  });

  // Calculate per-class breakdown from sample students
  for (const cls of Object.keys(classStats)) {
    const sampleId = classStats[cls].sampleStudentId;
    const sCharges = chargesByStudent[sampleId] || [];
    classStats[cls].chargesPerStudent = sCharges.length;
    sCharges.forEach(c => {
      classStats[cls].totalPerStudent += c.originalAmount;
      if (c.componentId === 'exam') {
        classStats[cls].exam += c.originalAmount;
        classStats[cls].examCount++;
      } else if (c.componentId === 'admission') {
        classStats[cls].admission += c.originalAmount;
      } else if (c.componentId === 'tuition') {
        classStats[cls].tuition += c.originalAmount;
        if (c.label.includes('1st Installment')) classStats[cls].inst1 = c.originalAmount;
        if (c.label.includes('2nd Installment')) classStats[cls].inst2 = c.originalAmount;
        if (c.label.includes('3rd Installment')) classStats[cls].inst3 = c.originalAmount;
      }
    });
  }

  console.log('\n--- CLASS-WISE VERIFICATION ---');
  for (const cls of Object.keys(classStats).sort()) {
    const stat = classStats[cls];
    console.log(`\nClass: ${cls}`);
    console.log(`  Students: ${stat.studentCount}`);
    console.log(`  Total Charges in Class: ${stat.chargesCount}`);
    console.log(`  Charges per student: ${stat.chargesPerStudent}`);
    console.log(`  Tuition: ₹${stat.tuition} (1st: ₹${stat.inst1}, 2nd: ₹${stat.inst2}, 3rd: ₹${stat.inst3})`);
    console.log(`  Exam Fee: ₹${stat.exam} (Count: ${stat.examCount})`);
    console.log(`  Admission Fee: ₹${stat.admission}`);
    console.log(`  Total Annual: ₹${stat.totalPerStudent}`);
    console.log(`  Exam Fee charged exactly once: ${stat.examCount === 1 ? 'YES' : 'NO'}`);
  }

  // Check students with no charges or different charge counts
  const chargeCountDistribution = {};
  for (const [sId, chgs] of Object.entries(chargesByStudent)) {
    chargeCountDistribution[chgs.length] = (chargeCountDistribution[chgs.length] || 0) + 1;
  }
  console.log('\nCharges per student distribution:', chargeCountDistribution);

  const studentsWithoutCharges = Object.keys(studentsById).filter(id => !chargesByStudent[id]);
  console.log(`Students without charges: ${studentsWithoutCharges.length}`);
  if (studentsWithoutCharges.length > 0) {
    console.log('Sample student without charges:', studentsById[studentsWithoutCharges[0]]);
  }
}

checkDetails().catch(console.error);
