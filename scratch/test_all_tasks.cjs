const { normalizeClassFeeSettings, generateChargeSchedule, calculateStudentDue } = require('../src/utils/feeEngine');

console.log("=== COMPREHENSIVE SUITE FOR TASKS 1-6 ===");

// 1. Test JSIC Class 6 (Tuition: July 500, Oct 500, Dec 500 test configuration)
const class6TestConfig = {
  academicYear: '2026-2027',
  duePolicy: {
    defaultDueDay: 10,
    septemberPenalty: 100,
    decemberPenalty: 500
  },
  components: [
    {
      id: 'tuition',
      name: 'Tuition Fee',
      amount: 1500,
      enabled: true,
      frequency: 'every_installment',
      installments: ['july', 'september', 'december'],
      schedule: [
        { dueDate: '2026-07-10', label: 'July Installment', amount: 500 },
        { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 500 },
        { dueDate: '2026-12-10', label: 'December Installment', amount: 500 }
      ]
    },
    {
      id: 'exam',
      name: 'Examination Fee',
      amount: 500,
      enabled: true,
      frequency: 'one_time',
      installments: ['december'],
      schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }]
    }
  ]
};

const savedClass6 = normalizeClassFeeSettings(class6TestConfig, '2026-2027');
const refreshedClass6 = normalizeClassFeeSettings(JSON.parse(JSON.stringify(savedClass6)), '2026-2027');

const t6 = refreshedClass6.components.find(c => c.id === 'tuition');
console.log("Class 6 Tuition Schedule:", t6.schedule.map(s => `${s.label}: ₹${s.amount}`));
console.log("Class 6 Due Policy:", refreshedClass6.duePolicy);

if (t6.schedule[0].amount === 500 && t6.schedule[1].amount === 500 && t6.schedule[2].amount === 500) {
  console.log("✅ PASS: Class 6 test configuration persists July ₹500 / October ₹500 / December ₹500!");
} else {
  console.error("❌ FAIL: Class 6 persistence error");
  process.exit(1);
}

// 2. Test Student Directory Live Due Calculation for Class 6 Student
const studentClass6Cont = { id: 'st_c6_1', name: 'Aman Kumar', class: 'Class 6', isNewAdmission: false };
const dueResultC6 = calculateStudentDue({
  student: studentClass6Cont,
  classSettings: refreshedClass6,
  payments: [],
  adjustments: []
});
console.log("Class 6 Continuing Student Total Dues:", dueResultC6.totalDue, "(Expected: 2000 => Tuition 1500 + Exam 500)");

if (dueResultC6.totalDue === 2000) {
  console.log("✅ PASS: Student List computes correct live due (₹2,000) for Class 6 student!");
} else {
  console.error("❌ FAIL: Student List dynamic due calculation failed for Class 6!");
  process.exit(1);
}

// 3. Test JSIC Class 11 Science Configuration (3000 / 2500 / 2000)
const class11SciConfig = {
  academicYear: '2026-2027',
  duePolicy: { defaultDueDay: 10, septemberPenalty: 100, decemberPenalty: 500 },
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
    },
    {
      id: 'exam',
      name: 'Examination Fee',
      amount: 1000,
      enabled: true,
      frequency: 'one_time',
      installments: ['december'],
      schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }]
    }
  ]
};

const savedSci = normalizeClassFeeSettings(class11SciConfig, '2026-2027');
const refreshedSci = normalizeClassFeeSettings(JSON.parse(JSON.stringify(savedSci)), '2026-2027');

const tSci = refreshedSci.components.find(c => c.id === 'tuition');
console.log("Class 11 Science Tuition Schedule:", tSci.schedule.map(s => `${s.label}: ₹${s.amount}`));

if (tSci.schedule[0].amount === 3000 && tSci.schedule[1].amount === 2500 && tSci.schedule[2].amount === 2000) {
  console.log("✅ PASS: Class 11 Science uneven tuition amounts (3000/2500/2000) persist!");
} else {
  console.error("❌ FAIL: Class 11 Science unequal installment persistence error");
  process.exit(1);
}

// 4. Test New Admission vs Continuing Student Dues for Class 11 Science
const studentSciNew = { id: 'st_sci_new', name: 'Neha Gupta', class: 'Class 11 Science', isNewAdmission: true };
const studentSciCont = { id: 'st_sci_cont', name: 'Vikas Kumar', class: 'Class 11 Science', isNewAdmission: false };

const templateSciWithAdmission = {
  ...refreshedSci,
  components: [
    { id: 'admission', name: 'Admission Fee', amount: 2000, enabled: true, frequency: 'one_time', schedule: [{ dueDate: '2026-07-10' }] },
    ...refreshedSci.components
  ]
};

const dueResultSciNew = calculateStudentDue({
  student: studentSciNew,
  classSettings: templateSciWithAdmission,
  payments: [],
  adjustments: []
});

const dueResultSciCont = calculateStudentDue({
  student: studentSciCont,
  classSettings: templateSciWithAdmission,
  payments: [],
  adjustments: []
});

console.log("Science New Student Total Dues:", dueResultSciNew.totalDue, "(Expected: 10500 => Admission 2000 + Tuition 7500 + Exam 1000)");
console.log("Science Continuing Student Total Dues:", dueResultSciCont.totalDue, "(Expected: 8500 => Tuition 7500 + Exam 1000)");

if (dueResultSciNew.totalDue === 10500 && dueResultSciCont.totalDue === 8500) {
  console.log("✅ PASS: Strict opt-in Admission logic verified for Class 11 Science!");
} else {
  console.error("❌ FAIL: Science admission logic error!");
  process.exit(1);
}

console.log("\n=== ALL COMPREHENSIVE SUITE CHECKS PASSED ===");
