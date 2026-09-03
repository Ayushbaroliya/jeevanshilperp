const fs = require('fs');
const content = `

export const FEE_FREQUENCIES = [
  { id: 'monthly', label: 'Monthly (12 installments)' },
  { id: 'quarterly', label: 'Quarterly (4 installments)' },
  { id: 'half_yearly', label: 'Half Yearly (2 installments)' },
  { id: 'annual', label: 'Annually (1 installment)' }
];

export const INSTALLMENTS = [
  { dueDate: '2026-04-10', label: 'April Installment' },
  { dueDate: '2026-07-10', label: 'July Installment' },
  { dueDate: '2026-10-10', label: 'October Installment' },
  { dueDate: '2027-01-10', label: 'January Installment' }
];

export const DEFAULT_FEE_COMPONENTS = [
  { id: 'admission', name: 'Admission Fee', amount: 10000, schedule: [{ dueDate: '2026-04-10', label: 'One Time' }] },
  { id: 'tuition', name: 'Tuition Fee', amount: 3000, schedule: [{ dueDate: '2026-04-10', label: 'April' }, { dueDate: '2026-09-10', label: 'September' }] },
  { id: 'computer', name: 'Computer Fee', amount: 1500, schedule: [{ dueDate: '2026-04-10', label: 'Annual' }] },
  { id: 'exam', name: 'Examination Fee', amount: 2000, schedule: [{ dueDate: '2026-09-10', label: 'Term 1' }, { dueDate: '2027-02-10', label: 'Term 2' }] }
];
`;
fs.appendFileSync('./src/utils/feeEngine.js', content);
