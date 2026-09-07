const { normalizeClassFeeSettings, generateChargeSchedule } = require('../src/utils/feeEngine');

console.log("=== PART 1 — UAT FEE VERIFICATION ===");

// 1. Class 11 Science tuition test
const scienceInput = {
  academicYear: '2026-2027',
  components: [
    {
      id: 'tuition',
      name: 'Tuition Fee',
      amount: 7500,
      enabled: true,
      frequency: 'every_installment',
      installments: ['july', 'september', 'december'],
      schedule: [
        { dueDate: '2026-07-10', label: 'July Installment', amount: 3000 },
        { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 2500 },
        { dueDate: '2026-12-10', label: 'December Installment', amount: 2000 }
      ]
    }
  ]
};

// Simulate Save Configuration (normalize before writing to DB)
const savedConfig = normalizeClassFeeSettings(scienceInput, '2026-2027');

// Simulate Page Refresh (normalize upon reading DB)
const refreshedConfig = normalizeClassFeeSettings(JSON.parse(JSON.stringify(savedConfig)), '2026-2027');

const tuitionComp = refreshedConfig.components.find(c => c.id === 'tuition');
const julySched = tuitionComp.schedule.find(s => s.dueDate.includes('-07-'));
const octSched  = tuitionComp.schedule.find(s => s.dueDate.includes('-10-'));
const decSched  = tuitionComp.schedule.find(s => s.dueDate.includes('-12-'));

console.log("July Amount:", julySched.amount, "(Expected: 3000)");
console.log("October Amount:", octSched.amount, "(Expected: 2500)");
console.log("December Amount:", decSched.amount, "(Expected: 2000)");

if (julySched.amount === 3000 && octSched.amount === 2500 && decSched.amount === 2000) {
  console.log("✅ TEST 1 PASSED: Class 11 Science amounts persist exactly!");
} else {
  console.error("❌ TEST 1 FAILED!");
  process.exit(1);
}

// 2. New Admission Student Test
const newStudent = { id: 'student_new_1', name: 'Aarav Sharma', isNewAdmission: true };
const templateWithAdmission = {
  components: [
    { id: 'admission', name: 'Admission Fee', amount: 1500, enabled: true, schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
    ...refreshedConfig.components
  ]
};

const newStudentCharges = generateChargeSchedule(newStudent, templateWithAdmission, '2026-2027');
const hasAdmissionFeeNew = newStudentCharges.some(c => c.componentId === 'admission');
console.log("New Student Charges count:", newStudentCharges.length, "Has Admission Fee:", hasAdmissionFeeNew);

if (hasAdmissionFeeNew && newStudentCharges.find(c => c.componentId === 'admission').originalAmount === 1500) {
  console.log("✅ TEST 2 PASSED: New Admission Fee generated!");
} else {
  console.error("❌ TEST 2 FAILED!");
  process.exit(1);
}

// 3. Continuing Student Test
const contStudent = { id: 'student_cont_1', name: 'Riya Verma', isNewAdmission: false };
const contStudentCharges = generateChargeSchedule(contStudent, templateWithAdmission, '2026-2027');
const hasAdmissionFeeCont = contStudentCharges.some(c => c.componentId === 'admission');
console.log("Continuing Student Charges count:", contStudentCharges.length, "Has Admission Fee:", hasAdmissionFeeCont);

if (!hasAdmissionFeeCont) {
  console.log("✅ TEST 3 PASSED: Continuing student does NOT receive Admission Fee!");
} else {
  console.error("❌ TEST 3 FAILED!");
  process.exit(1);
}

console.log("\n=== ALL PART 1 UAT FEE CHECKS PASSED PERFECTLY ===");
