const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function checkJSIC() {
  const sSnap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Student Count: ${sSnap.size}`);

  const eSnap = await db.collection('enrollments').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Enrollment Count: ${eSnap.size}`);

  const cSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Fee Charges Count: ${cSnap.size}`);

  const pSnap = await db.collection('payments').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Payments Count: ${pSnap.size}`);

  const aSnap = await db.collection('fee_adjustments').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Fee Adjustments Count: ${aSnap.size}`);

  const iSnap = await db.collection('invoices').where('schoolId', '==', 'SCH_02').get();
  console.log(`SCH_02 Invoices Count: ${iSnap.size}`);
}

checkJSIC().catch(console.error);
