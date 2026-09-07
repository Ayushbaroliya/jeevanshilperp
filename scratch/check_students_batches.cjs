const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkBatches() {
  const snap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  const batches = {};
  snap.forEach(d => {
    const s = d.data();
    const created = s.createdAt || 'NO_DATE';
    batches[created] = (batches[created] || 0) + 1;
  });
  console.log('Creation timestamps of SCH_01 students:', batches);

  // Check the one student with 2 charges: { '2': 1, '4': 323 }
  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  const byStudent = {};
  chargesSnap.forEach(d => {
    const c = d.data();
    if (!byStudent[c.studentId]) byStudent[c.studentId] = [];
    byStudent[c.studentId].push(c);
  });
  for (const [sId, list] of Object.entries(byStudent)) {
    if (list.length !== 4) {
      console.log(`Student with ${list.length} charges:`, sId);
      const sDoc = await db.collection('students').doc(sId).get();
      console.log('Student data:', sDoc.data());
      console.log('Charges:', list);
    }
  }
}

checkBatches().catch(console.error);
