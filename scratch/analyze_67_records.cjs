const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function analyze67() {
  const studentsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  
  const batch67 = [];
  const batch257 = [];

  studentsSnap.forEach(d => {
    const data = { id: d.id, ...d.data() };
    if (d.id.startsWith('stu_jsps_1788784762579')) {
      batch67.push(data);
    } else {
      batch257.push(data);
    }
  });

  console.log(`Batch 67 count: ${batch67.length}`);
  console.log(`Batch 257 count: ${batch257.length}`);

  // Group batch67 by class
  const byClass = {};
  batch67.forEach(s => {
    if (!byClass[s.class]) byClass[s.class] = [];
    byClass[s.class].push(s);
  });

  for (const [cls, list] of Object.entries(byClass).sort()) {
    console.log(`\n--- Class: ${cls} (${list.length} records) ---`);
    list.forEach((s, idx) => {
      console.log(`${idx + 1}. [ID: ${s.id}] Name: ${s.name} | Father: ${s.fatherName} | Roll: ${s.roll} | Contact: ${s.contact}`);
    });
  }

  // Check fee_charges associated with batch67 vs batch257
  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  let chargesFor67 = 0;
  let chargesFor257 = 0;
  const sIds67 = new Set(batch67.map(s => s.id));
  const sIds257 = new Set(batch257.map(s => s.id));

  chargesSnap.forEach(d => {
    const sId = d.data().studentId;
    if (sIds67.has(sId)) chargesFor67++;
    else if (sIds257.has(sId)) chargesFor257++;
    else console.log('Orphan charge:', d.id, sId);
  });

  console.log(`\nCharges attached to 67 earlier records: ${chargesFor67}`);
  console.log(`Charges attached to 257 latest records: ${chargesFor257}`);

  // Check enrollments
  const enrollSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').get();
  let enrollFor67 = 0;
  let enrollFor257 = 0;
  enrollSnap.forEach(d => {
    const sId = d.data().studentId;
    if (sIds67.has(sId)) enrollFor67++;
    else if (sIds257.has(sId)) enrollFor257++;
  });
  console.log(`Enrollments attached to 67 earlier records: ${enrollFor67}`);
  console.log(`Enrollments attached to 257 latest records: ${enrollFor257}`);
}

analyze67().catch(console.error);
