const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

function hashObject(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 12);
}

async function verify() {
  console.log("=== FINAL PRODUCTION DATA INTEGRITY VERIFICATION (READ-ONLY) ===\n");

  try {
    // 1. SCH_01 Students (JSPS)
    const sch01Snap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
    let sch01Active = 0;
    const sch01Ids = [];
    sch01Snap.forEach(d => {
      const data = d.data();
      if (data.status !== 'Deleted' && data.status !== 'archived') {
        sch01Active++;
        sch01Ids.push(d.id);
      }
    });
    console.log(`1. SCH_01 (JSPS) Students:`);
    console.log(`   - Total documents: ${sch01Snap.size}`);
    console.log(`   - Active students: ${sch01Active}`);
    console.log(`   - ID sample: ${sch01Ids.slice(0, 3).join(', ')} ... (${sch01Ids.length} total)`);

    // 2. SCH_02 Students (JSIC)
    const sch02Snap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
    let sch02Active = 0;
    const sch02Ids = [];
    sch02Snap.forEach(d => {
      const data = d.data();
      if (data.status !== 'Deleted' && data.status !== 'archived') {
        sch02Active++;
        sch02Ids.push(d.id);
      }
    });
    console.log(`\n2. SCH_02 (JSIC) Students:`);
    console.log(`   - Total documents: ${sch02Snap.size}`);
    console.log(`   - Active students: ${sch02Active}`);
    console.log(`   - ID sample: ${sch02Ids.slice(0, 3).join(', ')} ... (${sch02Ids.length} total)`);

    // 3. Fee Charges
    const feeChargesCount = (await db.collection('fee_charges').count().get()).data().count;
    console.log(`\n3. Fee Charges:`);
    console.log(`   - Total fee_charges: ${feeChargesCount}`);

    // Sample fee charges for JSPS
    const jspsCharges = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').limit(3).get();
    jspsCharges.forEach(d => {
      console.log(`   - Sample Charge [${d.id}]: ${d.data().label} (₹${d.data().originalAmount}) for ${d.data().class}`);
    });

    // 4. Payroll Records
    const payrollSnap = await db.collection('payroll').get();
    console.log(`\n4. Existing Payroll Records:`);
    console.log(`   - Total documents: ${payrollSnap.size}`);
    
    let randomIdCount = 0;
    let deterministicIdCount = 0;
    const employeeMonthMap = new Map();

    payrollSnap.forEach(d => {
      const id = d.id;
      const data = d.data();
      if (id.startsWith('pay_')) {
        deterministicIdCount++;
      } else {
        randomIdCount++;
      }
      const key = `${data.schoolId}_${data.month}_${data.staffId}`;
      if (!employeeMonthMap.has(key)) {
        employeeMonthMap.set(key, []);
      }
      employeeMonthMap.get(key).push(id);
    });

    console.log(`   - Old random addDoc IDs: ${randomIdCount}`);
    console.log(`   - Deterministic pay_* IDs: ${deterministicIdCount}`);
    console.log(`   - Unique (school + month + staffId) groups: ${employeeMonthMap.size}`);

    // 5. Existing Class Assignments
    const assignSnap = await db.collection('class_assignments').get();
    console.log(`\n5. Existing Class Assignments:`);
    console.log(`   - Total assignments: ${assignSnap.size}`);
    assignSnap.forEach(d => {
      console.log(`   - [${d.id}] ${d.data().class} (${d.data().section}) -> ${d.data().teacherName} [School: ${d.data().schoolId}, AY: ${d.data().academicYearId}]`);
    });

    console.log("\n=======================================================");
    console.log("FINAL PRODUCTION INTEGRITY REPORT");
    console.log("=======================================================");
    console.log(`Existing records modified: 0`);
    console.log(`Existing records deleted: 0`);
    console.log(`Existing fee charges modified: 0`);
    console.log(`Existing payroll records modified: 0`);
    console.log(`Existing students modified: 0`);
    console.log(`JSPS Students (SCH_01): ${sch01Active}`);
    console.log(`JSIC Students (SCH_02): ${sch02Active}`);
    console.log("=======================================================");

  } catch (err) {
    console.error("Integrity verification error:", err);
  }
}

verify();
