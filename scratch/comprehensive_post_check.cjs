const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { generateChargeSchedule, normalizeClassFeeSettings } = require('../src/utils/feeEngine.js');

const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function comprehensivePostCheck() {
  console.log('=== COMPREHENSIVE POST-VERIFICATION ===\n');

  const settingsDoc = await db.collection('school_settings').doc('settings').get();
  const settings = settingsDoc.data();

  // 1. Verify 11 classes
  const classes = settings.schoolClasses?.SCH_01 || [];
  console.log(`[1] JSPS Classes (${classes.length}):`, classes);
  if (classes.length !== 11) throw new Error('Expected exactly 11 JSPS classes');

  // 2. Verify each class fee settings
  console.log('\n[2] Verifying Fee Configuration for each class:');
  const classConfigs = settings.schoolClassSettings?.SCH_01 || {};
  
  const expectedTotals = {
    'Nursery': { adm: 1700, tuit: 6400, ex: 600, total: 8700, inst1: 2400, inst2: 2000, inst3: 2000 },
    'LKG':     { adm: 1700, tuit: 6400, ex: 600, total: 8700, inst1: 2400, inst2: 2000, inst3: 2000 },
    'UKG':     { adm: 1800, tuit: 6400, ex: 600, total: 8800, inst1: 2400, inst2: 2000, inst3: 2000 },
    'Class 1': { adm: 2000, tuit: 7400, ex: 750, total: 10150, inst1: 3400, inst2: 2000, inst3: 2000 },
    'Class 2': { adm: 2000, tuit: 7500, ex: 750, total: 10250, inst1: 3500, inst2: 2000, inst3: 2000 },
    'Class 3': { adm: 2000, tuit: 7600, ex: 750, total: 10350, inst1: 3600, inst2: 2000, inst3: 2000 },
    'Class 4': { adm: 2000, tuit: 7700, ex: 750, total: 10450, inst1: 3700, inst2: 2000, inst3: 2000 },
    'Class 5': { adm: 2000, tuit: 7800, ex: 750, total: 10550, inst1: 3800, inst2: 2000, inst3: 2000 },
    'Class 6': { adm: 2000, tuit: 8000, ex: 750, total: 10750, inst1: 3000, inst2: 2500, inst3: 2500 },
    'Class 7': { adm: 2000, tuit: 8200, ex: 750, total: 10950, inst1: 3200, inst2: 2500, inst3: 2500 },
    'Class 8': { adm: 2000, tuit: 8400, ex: 750, total: 11150, inst1: 3400, inst2: 2500, inst3: 2500 }
  };

  for (const [cls, exp] of Object.entries(expectedTotals)) {
    const cfg = classConfigs[cls];
    if (!cfg) throw new Error(`Missing config for ${cls}`);
    const comps = cfg.components || [];
    const admComp = comps.find(c => c.id === 'admission');
    const tuitComp = comps.find(c => c.id === 'tuition');
    const exComp = comps.find(c => c.id === 'exam');

    if (admComp.amount !== exp.adm) throw new Error(`${cls} admission is ${admComp.amount}, expected ${exp.adm}`);
    if (tuitComp.amount !== exp.tuit) throw new Error(`${cls} tuition is ${tuitComp.amount}, expected ${exp.tuit}`);
    if (exComp.amount !== exp.ex) throw new Error(`${cls} exam is ${exComp.amount}, expected ${exp.ex}`);

    // Verify installment amounts
    const inst1 = tuitComp.schedule[0].amount;
    const inst2 = tuitComp.schedule[1].amount;
    const inst3 = tuitComp.schedule[2].amount;
    if (inst1 !== exp.inst1 || inst2 !== exp.inst2 || inst3 !== exp.inst3) {
      throw new Error(`${cls} installments mismatch: got ${inst1}/${inst2}/${inst3}, expected ${exp.inst1}/${exp.inst2}/${exp.inst3}`);
    }

    console.log(`  ✓ ${cls.padEnd(8)}: Matches official fee schedule exactly. (Installments: ₹${inst1 + exp.ex}/₹${inst2}/₹${inst3})`);
  }

  // 3. Test Fee Schedule Generation for New Admission vs Continuing
  console.log('\n[3] Testing Charge Generation for New vs Continuing Student:');
  const nurseryTemplate = classConfigs['Nursery'];
  
  // Case A: New Admission
  const newStudentCharges = generateChargeSchedule({ id: 'test_new', isNewAdmission: true }, nurseryTemplate, '2026-2027');
  const newTotal = newStudentCharges.reduce((s, c) => s + c.originalAmount, 0);
  console.log(`  Nursery New Admission Charges (${newStudentCharges.length} charges): Total ₹${newTotal} (Expected: ₹8700)`);
  if (newTotal !== 8700 || newStudentCharges.length !== 5) {
    throw new Error(`Nursery new admission charges expected 5 charges totaling 8700, got ${newStudentCharges.length} totaling ${newTotal}`);
  }

  // Case B: Continuing Student
  const contStudentCharges = generateChargeSchedule({ id: 'test_cont', isNewAdmission: false }, nurseryTemplate, '2026-2027');
  const contTotal = contStudentCharges.reduce((s, c) => s + c.originalAmount, 0);
  console.log(`  Nursery Continuing Charges (${contStudentCharges.length} charges): Total ₹${contTotal} (Expected: ₹7000)`);
  if (contTotal !== 7000 || contStudentCharges.length !== 4) {
    throw new Error(`Nursery continuing charges expected 4 charges totaling 7000, got ${contStudentCharges.length} totaling ${contTotal}`);
  }

  // 4. Verify Existing Student Counts
  console.log('\n[4] Database Integrity:');
  const jspsSnap = await db.collection('students').where('schoolId', '==', 'SCH_01').get();
  console.log(`  JSPS Students (SCH_01): ${jspsSnap.size} (Expected: 257)`);
  if (jspsSnap.size !== 257) throw new Error('JSPS student count mismatch');

  const jsicSnap = await db.collection('students').where('schoolId', '==', 'SCH_02').get();
  console.log(`  JSIC Students (SCH_02): ${jsicSnap.size} (Expected: 993)`);
  if (jsicSnap.size !== 993) throw new Error('JSIC student count mismatch');

  const chargesSnap = await db.collection('fee_charges').where('schoolId', '==', 'SCH_01').get();
  console.log(`  JSPS Permanent Fee Charges: ${chargesSnap.size} (Expected: 1028)`);
  if (chargesSnap.size !== 1028) throw new Error('JSPS fee charges count mismatch');

  console.log('\n=== ALL POST-VERIFICATION CHECKS PASSED ===');
}

comprehensivePostCheck().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
