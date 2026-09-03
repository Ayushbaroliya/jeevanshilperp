const fs = require('fs');
const content = `

export function normalizeClassFeeSettings(settings) {
  if (!settings) return { components: [] };
  if (Array.isArray(settings)) return { components: settings };
  if (settings.components && Array.isArray(settings.components)) return settings;
  const components = [];
  if (settings.admission > 0) components.push({ id: 'admission', name: 'Admission Fee', amount: settings.admission, schedule: [{ dueDate: '2026-04-10', label: '1st Installment' }] });
  if (settings.tuition > 0) components.push({ id: 'tuition', name: 'Tuition Fee', amount: settings.tuition, schedule: [{ dueDate: '2026-04-10', label: 'April' }, { dueDate: '2026-09-10', label: 'September' }] });
  return { components };
}

export function calculateStudentDue({ student, classSettings, payments, adjustments }) {
  const academicYear = student.academicYear || "2026-2027";
  const baseCharges = generateChargeSchedule(student, classSettings, academicYear);
  const arrears = calculateOpeningArrears(student, Number(student.dueAmount || 0), academicYear);
  const withArrears = [...arrears, ...baseCharges];
  
  const rules = [
    { id: 'sept_late', deadline: '2026-09-10', graceDays: 5, amount: 200, waiveIfCleared: false },
    { id: 'dec_late', deadline: '2026-12-10', graceDays: 5, amount: 500, waiveIfCleared: true }
  ];
  
  const penalties = calculatePenalties(withArrears, new Date().toISOString(), rules);
  const fullCharges = [...withArrears, ...penalties];
  
  const res = applyPaymentsAndAdjustments(fullCharges, payments || [], adjustments || []);
  return summarizeDues(student, res.ledger, res.advanceCredit);
}
`;

fs.appendFileSync('./src/utils/feeEngine.js', content);
