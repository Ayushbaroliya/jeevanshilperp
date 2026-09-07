const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('c:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
async function clean() {
  const colls = ['fee_charges', 'student_ledger', 'fee_adjustments', 'invoices'];
  for (let c of colls) {
    const snap = await db.collection(c).get();
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Deleted ${snap.size} from ${c}`);
  }
}
clean();
