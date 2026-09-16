import assert from 'node:assert/strict';
import { allocateSelectedCharges, getChargeOutstanding } from '../src/utils/paymentAllocation.js';

const charges = [
  { id: 'i1', componentId: 'tuition', description: '1st Installment', amount: 5000 },
  { id: 'i2', componentId: 'tuition', description: '2nd Installment', amount: 5000 },
  { id: 'exam', componentId: 'exam', description: 'Exam Fee', amount: 1000 },
  { id: 'transport', componentId: 'transport', description: 'Transport', amount: 3500, paidAmount: 500 },
];

let result = allocateSelectedCharges(charges, { i1: 5000, exam: 1000 });
assert.equal(result.total, 6000);
assert.deepEqual(result.allocations.map(x => x.chargeId), ['i1', 'exam']);
assert.equal(getChargeOutstanding(charges[1]), 5000);

result = allocateSelectedCharges(charges, { i1: 2000 });
assert.equal(result.total, 2000);
assert.equal(result.allocations[0].amount, 2000);

result = allocateSelectedCharges(charges, { transport: 5000 });
assert.equal(result.total, 3000);
assert.equal(result.allocations[0].amount, 3000);

console.log('payment allocation tests: 3 passed');
