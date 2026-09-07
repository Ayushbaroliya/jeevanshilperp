const { normalizeClassFeeSettings, generateChargeSchedule, applyPaymentsAndAdjustments, summarizeDues } = require('../src/utils/feeEngine');

console.log("=== FEE ALLOCATION TEST ===");

const student = {
  id: 'student_123',
  name: 'Test Student',
  class: 'Class 10',
  academicYear: '2026-2027',
  dueAmount: 500 // Previous Year Due
};

const classSettings = {
  admission: 1200,
  tuition: 3000,
  components: [
    { id: 'admission', name: 'Admission Fee', amount: 1200, schedule: [{ dueDate: '2026-04-10', label: 'Admission' }] },
    { id: 'tuition', name: 'Tuition Fee', amount: 3000, schedule: [
        { dueDate: '2026-07-10', label: 'July', amount: 2000 },
        { dueDate: '2026-10-10', label: 'September', amount: 1000 }
      ]
    }
  ]
};

const normalized = normalizeClassFeeSettings(classSettings, '2026-2027');
let charges = generateChargeSchedule(student, normalized, '2026-2027');
// Add previous year due
charges = [{ id: 'prev_year_due', componentId: 'previous_year_due', type: 'arrears', originalAmount: 500, netDue: 500, label: 'Previous Year Due', dueDate: '1970-01-01', allocatedPaid: 0, allocatedAdjusted: 0, status: 'unpaid' }, ...charges];

console.log("CHARGES:");
charges.forEach(c => console.log(`- ${c.label}: ₹${c.netDue}`));

const payment = { id: 'preview', date: new Date().toISOString(), amount: 3200 };
const res = applyPaymentsAndAdjustments(charges, [payment], []);

console.log("\nALLOCATIONS:");
const allocations = res.allocations.filter(a => a.paymentId === 'preview');
allocations.forEach(a => {
  let label = charges.find(c => c.id === a.chargeId)?.label || a.componentId;
  if (label === 'September') label = 'October Installment / अक्टूबर की किस्त';
  console.log(`- ${label}: ₹${a.amount}`);
  if (a.amount === undefined || a.amount === null || isNaN(a.amount) || a.amount < 0) {
    console.error(`❌ ERROR: Invalid allocation amount detected for ${label}: ${a.amount}`);
    process.exit(1);
  }
});

console.log(`Advance Credit: ₹${res.advanceCredit}`);

if (res.advanceCredit > 0) {
  console.log(`- Advance Payment / अग्रिम भुगतान: ₹${res.advanceCredit}`);
}

console.log("\n✅ ALLOCATION TEST PASSED");
