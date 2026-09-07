const { normalizeClassFeeSettings, generateChargeSchedule } = require('../src/utils/feeEngine');

console.log("=== Testing Class Fee Settings Normalization and Persistence ===");

// 1. Initial Science class settings
const scienceInitial = {
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

const normalizedScience = normalizeClassFeeSettings(scienceInitial, 'AY_2026_27');
console.log("Normalized Science Tuition Schedule:", normalizedScience.components.find(c => c.id === 'tuition').schedule);

// 2. Modify July from 2000 to 2100 in standard class
const standardInitial = {
  components: [
    {
      id: 'tuition',
      name: 'Tuition Fee',
      amount: 6000,
      enabled: true,
      frequency: 'every_installment',
      installments: ['july', 'september', 'december'],
      schedule: [
        { dueDate: '2026-07-10', label: 'July Installment', amount: 2100 },
        { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 2000 },
        { dueDate: '2026-12-10', label: 'December Installment', amount: 2000 }
      ]
    }
  ]
};

const normalizedStandard = normalizeClassFeeSettings(standardInitial, 'AY_2026_27');
console.log("Normalized Standard Tuition Schedule (July 2100):", normalizedStandard.components.find(c => c.id === 'tuition').schedule);

// Test generateChargeSchedule for new admission vs continuing
const newStudent = { id: 'st_1', isNewAdmission: true };
const contStudent = { id: 'st_2', isNewAdmission: false };

const newCharges = generateChargeSchedule(newStudent, { components: [
  { id: 'admission', amount: 1500, schedule: [{ dueDate: '2026-07-10' }] },
  ...normalizedScience.components
]}, 'AY_2026_27');

const contCharges = generateChargeSchedule(contStudent, { components: [
  { id: 'admission', amount: 1500, schedule: [{ dueDate: '2026-07-10' }] },
  ...normalizedScience.components
]}, 'AY_2026_27');

console.log("New Student Charges count:", newCharges.length, "Has Admission:", newCharges.some(c => c.componentId === 'admission'));
console.log("Continuing Student Charges count:", contCharges.length, "Has Admission:", contCharges.some(c => c.componentId === 'admission'));
