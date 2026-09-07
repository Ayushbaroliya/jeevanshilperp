const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('C:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Import fee logic (must execute locally)
const { generateChargeSchedule, getJSPSFeeComponents, normalizeClassFeeSettings } = require('./src/utils/feeEngine.js');

async function dryRun() {
  console.log("Starting fee migration dry run...");
  
  // 1. Fetch Students
  const studentsSnap = await db.collection('students').get();
  const students = [];
  studentsSnap.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
  
  const sch01Count = students.filter(s => s.schoolId === 'SCH_01').length;
  const sch02Count = students.filter(s => s.schoolId === 'SCH_02').length;
  
  console.log('\n=== PRE-MIGRATION COUNTS ===');
  console.log('SCH_01 (JSPS) student count:', sch01Count);
  console.log('SCH_02 (JSIC) student count:', sch02Count);

  console.log('\n=== JSPS FEE CONFIGURATION DRY RUN (SCH_01) ===');
  const jspsClasses = [
    'Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8'
  ];
  
  for (const cls of jspsClasses) {
    const rawComponents = getJSPSFeeComponents(cls, '2026-2027');
    const feeTemplate = normalizeClassFeeSettings({ components: rawComponents }, '2026-2027');
    
    // Simulate a new admission student to test admission fee
    const simStudentNew = { id: 'sim_new', class: cls, isNewAdmission: true, schoolId: 'SCH_01' };
    const chargesNew = generateChargeSchedule(simStudentNew, feeTemplate, '2026-2027');
    
    const admissionCharge = chargesNew.find(c => c.componentId === 'admission');
    const tuitionCharges = chargesNew.filter(c => c.componentId === 'tuition');
    const examCharge = chargesNew.find(c => c.componentId === 'exam');
    
    const admissionAmount = admissionCharge ? admissionCharge.originalAmount : 0;
    const tuitionTotal = tuitionCharges.reduce((sum, c) => sum + c.originalAmount, 0);
    const examTotal = examCharge ? examCharge.originalAmount : 0;
    
    const total = admissionAmount + tuitionTotal + examTotal;
    
    // Check continuing student
    const simStudentCont = { id: 'sim_cont', class: cls, isNewAdmission: false, schoolId: 'SCH_01' };
    const chargesCont = generateChargeSchedule(simStudentCont, feeTemplate, '2026-2027');
    const hasAdmissionCont = chargesCont.some(c => c.componentId === 'admission');
    
    console.log('\n--- ' + cls + ' ---');
    console.log('Admission Fee: ₹' + admissionAmount + ' (Continuing student gets admission: ' + hasAdmissionCont + ')');
    console.log('Tuition Fee: ₹' + tuitionTotal);
    console.log('Exam Fee: ₹' + examTotal);
    console.log('Total for New Admission: ₹' + total);
    console.log('Installment Sums (Tuition + Exam grouped by Due Date):');
    
    const byDate = {};
    chargesNew.filter(c => c.componentId !== 'admission').forEach(c => {
      byDate[c.dueDate] = (byDate[c.dueDate] || 0) + c.originalAmount;
    });
    
    Object.keys(byDate).sort().forEach(date => {
       let label = "";
       if (date.includes('-07-')) label = "1st Installment (April/July)";
       else if (date.includes('-10-')) label = "2nd Installment (September/October)";
       else label = "3rd Installment (December/January)";
       console.log('  - ' + label + ': ₹' + byDate[date] + ' (Due: ' + date + ')');
    });

    const tuitionComponent = rawComponents.find(c => c.id === 'tuition');
    console.log('Late Fee Rule: ₹' + (tuitionComponent ? tuitionComponent.penalty : 0) + ' per month');
  }

  console.log('\n=== DRY RUN VALIDATION ===');
  console.log('1. schoolId: SCH_01 (simulated above)');
  console.log('2. academicYearId: 2026-2027');
  console.log('11. SCH_01 student count remains 0: ' + (sch01Count === 0));
  console.log('12. SCH_02 student count remains 992: ' + (sch02Count === 992));
}

dryRun().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
