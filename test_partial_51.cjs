const { applyPaymentsAndAdjustments } = require('./src/utils/feeEngine');

const mockCharges = [
  { id: 'chg_1', label: 'Admission Fee', originalAmount: 60, dueDate: '2026-04-10', type: 'base', netDue: 60, allocatedPaid: 0, allocatedAdjusted: 0 }
];

const mockPayments = [
  { id: 'pay_1', amount: 51, date: '2026-04-11' }
];

console.log("Testing ₹51 payment against ₹60 charge...");

const res = applyPaymentsAndAdjustments(mockCharges, mockPayments, []);

console.log("---- Allocations ----");
console.log(res.allocations);

console.log("\n---- Final Ledger ----");
console.log(res.ledger);
