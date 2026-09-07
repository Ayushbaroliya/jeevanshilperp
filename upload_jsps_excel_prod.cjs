const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const xlsx = require('xlsx');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const { generateChargeSchedule, getJSPSFeeComponents, normalizeClassFeeSettings } = require('./src/utils/feeEngine.js');

async function runProductionImport() {
  const SCHOOL_ID = 'SCH_01';
  const ACADEMIC_YEAR_ID = 'AY_2026_27';
  const ACADEMIC_YEAR_LABEL = '2026-2027';

  console.log('--- JSPS PRODUCTION DATA IMPORT ---');

  const wb = xlsx.readFile('jeevanshilppublic school.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });

  const classMap = {
    '1st': 'Class 1', '2nd': 'Class 2', '3rd': 'Class 3', '4th': 'Class 4',
    '5th': 'Class 5', '6th': 'Class 6', '7th': 'Class 7', '8th': 'Class 8'
  };

  const studentsToImport = [];
  const seenKeys = new Set();

  rawData.forEach((row, idx) => {
    let rawClass = row['CLASS'] || row['Class'] || row['class'];
    const mappedClass = classMap[rawClass] || rawClass;
    const name = row['Student Name']?.trim();
    const fatherName = row['Father Name']?.trim() || '';

    if (!name || !mappedClass) return;

    const uniqueKey = `${name}_${fatherName}_${mappedClass}`.toLowerCase().replace(/\s+/g, '');
    if (seenKeys.has(uniqueKey)) return;
    seenKeys.add(uniqueKey);

    studentsToImport.push({
      _id: `stu_jsps_${Date.now()}_${idx}`, 
      name,
      fatherName,
      class: mappedClass,
      schoolId: SCHOOL_ID,
      section: 'A',
      roll: row['S.N.'] || idx + 1,
      contact: row['Mobile']?.toString() || '',
      address: row['Address'] || '',
      isNewAdmission: false, 
      academicYear: ACADEMIC_YEAR_LABEL,
      createdAt: new Date().toISOString(),
      status: 'active'
    });
  });

  const sch02Snap = await db.collection('students').where('schoolId', '==', 'SCH_02').count().get();
  if (sch02Snap.data().count !== 993) {
    console.error(`CRITICAL ERROR: SCH_02 student count is ${sch02Snap.data().count}, expected 993. Aborting.`);
    process.exit(1);
  }

  const batchSize = 400; 
  let batch = db.batch();
  let count = 0;
  let chargeCount = 0;

  for (const stu of studentsToImport) {
    const studentRef = db.collection('students').doc(stu._id);
    const stuData = { ...stu };
    delete stuData._id;
    batch.set(studentRef, stuData);
    count++;

    const enrolRef = db.collection('enrollments').doc(`${stu._id}_${ACADEMIC_YEAR_ID}`);
    batch.set(enrolRef, {
      studentId: stu._id,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      class: stu.class,
      section: 'A',
      enrolledAt: stu.createdAt,
      isNewAdmission: false
    });
    count++;

    const rawComponents = getJSPSFeeComponents(stu.class, ACADEMIC_YEAR_LABEL);
    const feeTemplate = normalizeClassFeeSettings({ components: rawComponents }, ACADEMIC_YEAR_LABEL);
    
    const mockStudentForEngine = { id: stu._id, ...stuData };
    const charges = generateChargeSchedule(mockStudentForEngine, feeTemplate, ACADEMIC_YEAR_LABEL);

    for (const charge of charges) {
      const chargeRef = db.collection('fee_charges').doc(charge.id);
      batch.set(chargeRef, {
        ...charge,
        schoolId: SCHOOL_ID,
        academicYearId: ACADEMIC_YEAR_ID,
        createdAt: new Date().toISOString()
      });
      count++;
      chargeCount++;

      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`Successfully imported ${studentsToImport.length} students and ${chargeCount} fee_charges for JSPS.`);
}

runProductionImport().catch(console.error);
