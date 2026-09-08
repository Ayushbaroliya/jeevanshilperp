const assert = require('assert');

// Test simulation replicating sortLedgerCharges & applyPaymentsAndAdjustments
const isAdmissionCharge = (c) => {
  if (!c) return false;
  if (c.componentId === 'admission') return true;
  if (typeof c.componentId === 'string' && c.componentId.toLowerCase().includes('admission')) return true;
  if (typeof c.label === 'string' && c.label.toLowerCase().includes('admission')) return true;
  if (typeof c.id === 'string' && c.id.toLowerCase().includes('admission')) return true;
  return false;
};

const sortLedgerCharges = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const aAdm = isAdmissionCharge(a);
    const bAdm = isAdmissionCharge(b);
    if (aAdm && !bAdm) return -1;
    if (!aAdm && bAdm) return 1;

    if (a.type === 'arrears' && b.type !== 'arrears') return -1;
    if (b.type === 'arrears' && a.type !== 'arrears') return 1;

    const timeA = new Date(a.dueDate).getTime();
    const timeB = new Date(b.dueDate).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeA - timeB;

    if (a.type === 'penalty' && b.type !== 'penalty') return 1;
    if (b.type === 'penalty' && a.type !== 'penalty') return -1;

    return (a.id || '').localeCompare(b.id || '');
  });
};

console.log("Starting Admission Fee Ranking & Order Audit...");

// Case 1: Existing student had tuition charges created months ago, and was later edited to New Admission
const mockCharges = [
  { id: 'chg_1', componentId: 'tuition', label: 'July Installment', dueDate: '2026-07-10', netDue: 1000, originalAmount: 1000, allocatedPaid: 0 },
  { id: 'chg_2', componentId: 'tuition', label: 'October Installment', dueDate: '2026-10-10', netDue: 1000, originalAmount: 1000, allocatedPaid: 0 },
  { id: 'chg_3', componentId: 'tuition', label: 'December Installment', dueDate: '2026-12-10', netDue: 1000, originalAmount: 1000, allocatedPaid: 0 },
  // Admission fee added later via student edit:
  { id: 'chg_adm', componentId: 'admission', label: 'Admission Fee - One Time', dueDate: '2026-07-10', netDue: 500, originalAmount: 500, allocatedPaid: 0 }
];

const sorted = sortLedgerCharges(mockCharges);
assert.strictEqual(sorted[0].componentId, 'admission', 'Admission Fee MUST be at index 0 (top of payment list)');
console.log("✅ Case 1: Admission Fee placed at top of charges even when added after existing installments");

// Case 2: Even if an earlier due date exists on a different component
const mockChargesWithEarlyDue = [
  { id: 'chg_early', componentId: 'exam', label: 'Term Exam Fee', dueDate: '2026-04-10', netDue: 300, originalAmount: 300, allocatedPaid: 0 },
  { id: 'chg_adm', componentId: 'admission', label: 'Admission Fee', dueDate: '2026-07-10', netDue: 500, originalAmount: 500, allocatedPaid: 0 }
];
const sorted2 = sortLedgerCharges(mockChargesWithEarlyDue);
assert.strictEqual(sorted2[0].componentId, 'admission', 'Admission Fee MUST precede earlier due dates');
console.log("✅ Case 2: Admission Fee strictly ranks above earlier due dates");

// Case 3: Label check fallback (e.g. legacy label 'Admission Fee')
const mockChargesLabel = [
  { id: 'chg_t', componentId: 'tuition_fee', label: 'July Installment', dueDate: '2026-07-10', netDue: 1000 },
  { id: 'chg_legacy_adm', componentId: 'comp_custom', label: 'New Admission Fee', dueDate: '2026-08-01', netDue: 750 }
];
const sorted3 = sortLedgerCharges(mockChargesLabel);
assert.strictEqual(sorted3[0].id, 'chg_legacy_adm', 'Admission Fee detected via label MUST be at index 0');
console.log("✅ Case 3: Admission Fee detected by label is positioned at index 0");

console.log("ALL ADMISSION FEE ORDERING TESTS PASSED!");
