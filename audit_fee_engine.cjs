const { applyPaymentsAndAdjustments, calculatePenalties, closeAcademicYear, summarizeDues } = require('./src/utils/feeEngine');

console.log("=== TARGETED AUDIT: FEE ENGINE ===\n");

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err.message);
  }
}

// 1. ₹51 payment
runTest("1. ₹51 payment (₹60 charge -> ₹9 remaining)", () => {
  const charges = [{ id: 'chg_1', originalAmount: 60, dueDate: '2026-04-10', netDue: 60, allocatedPaid: 0, allocatedAdjusted: 0, type: 'base' }];
  const payments = [{ id: 'pay_1', amount: 51, date: '2026-04-11' }];
  const res = applyPaymentsAndAdjustments(charges, payments, []);
  if (res.ledger[0].netDue !== 9) throw new Error(`Expected 9 netDue, got ${res.ledger[0].netDue}`);
  if (res.advanceCredit !== 0) throw new Error("Expected 0 advance credit");
});

// 2. ₹61 payment
runTest("2. ₹61 payment (₹60 charge -> ₹1 advance)", () => {
  const charges = [{ id: 'chg_1', originalAmount: 60, dueDate: '2026-04-10', netDue: 60, allocatedPaid: 0, allocatedAdjusted: 0, type: 'base' }];
  const payments = [{ id: 'pay_1', amount: 61, date: '2026-04-11' }];
  const res = applyPaymentsAndAdjustments(charges, payments, []);
  if (res.ledger[0].netDue !== 0) throw new Error("Expected 0 netDue");
  if (res.ledger[0].allocatedPaid !== 60) throw new Error("Expected 60 allocatedPaid");
  if (res.advanceCredit !== 1) throw new Error(`Expected 1 advance credit, got ${res.advanceCredit}`);
});

// 3. Multiple charges
runTest("3. Multiple charges (One payment distributes correctly)", () => {
  const charges = [
    { id: 'chg_old', originalAmount: 50, dueDate: '2026-04-10', netDue: 50, allocatedPaid: 0, allocatedAdjusted: 0, type: 'base' },
    { id: 'chg_new', originalAmount: 100, dueDate: '2026-09-10', netDue: 100, allocatedPaid: 0, allocatedAdjusted: 0, type: 'base' }
  ];
  const payments = [{ id: 'pay_1', amount: 120, date: '2026-09-11' }];
  const res = applyPaymentsAndAdjustments(charges, payments, []);
  
  const chgOld = res.ledger.find(c => c.id === 'chg_old');
  const chgNew = res.ledger.find(c => c.id === 'chg_new');
  
  if (chgOld.netDue !== 0 || chgOld.allocatedPaid !== 50) throw new Error("Old charge not fully paid");
  if (chgNew.netDue !== 30 || chgNew.allocatedPaid !== 70) throw new Error(`New charge incorrect. netDue: ${chgNew.netDue}, paid: ${chgNew.allocatedPaid}`);
});

// 4. Adjustment + Payment interaction
runTest("4. Adjustment + Payment interaction (No negative balance)", () => {
  const charges = [{ id: 'chg_1', originalAmount: 100, dueDate: '2026-04-10', netDue: 100, allocatedPaid: 0, allocatedAdjusted: 0, type: 'base' }];
  const adjustments = [{ id: 'adj_1', chargeId: 'chg_1', amount: 50 }]; // 50 waiver
  const payments = [{ id: 'pay_1', amount: 60, date: '2026-04-11' }]; // 60 payment
  
  const res = applyPaymentsAndAdjustments(charges, payments, adjustments);
  const chg = res.ledger[0];
  
  if (chg.allocatedAdjusted !== 50) throw new Error("Adjustment not applied");
  if (chg.allocatedPaid !== 50) throw new Error("Over-allocated payment to charge");
  if (chg.netDue !== 0) throw new Error("Negative or non-zero netDue");
  if (res.advanceCredit !== 10) throw new Error(`Advance credit should be 10, got ${res.advanceCredit}`);
});

// 5. Duplicate protection
runTest("5. Duplicate protection (Penalties & Carry-forward)", () => {
  // Test penalty duplication
  const rules = [{ id: 'sept_late', deadline: '2026-09-10', amount: 200, waiveIfCleared: false }];
  const ledgerWithPenalty = [
    { id: 'chg_1', dueDate: '2026-04-10', netDue: 50, type: 'base' },
    { id: 'pen_1', type: 'penalty', relatedRuleId: 'sept_late' }
  ];
  const newPenalties = calculatePenalties(ledgerWithPenalty, '2026-10-01', rules);
  if (newPenalties.length !== 0) throw new Error("Duplicated existing penalty rule");

  // Test carry-forward duplication
  const currentLedger = [
    { id: 'chg_1', academicYear: '2025-2026', netDue: 100, type: 'base' },
    { id: 'arrears_already', academicYear: '2026-2027', type: 'arrears', sourceYear: '2025-2026' }
  ];
  const rollForward = closeAcademicYear({ id: 's1' }, currentLedger, '2025-2026', '2026-2027');
  if (rollForward.length !== 0) throw new Error("Duplicated existing carry-forward");
});

// 6. Academic-year isolation
runTest("6. Academic-year isolation (Summarize dues filters correctly)", () => {
  const ledger = [
    { id: 'chg_25', academicYear: '2025-2026', netDue: 100, type: 'base' },
    { id: 'chg_26', academicYear: '2026-2027', netDue: 200, type: 'base' }
  ];
  
  const sum25 = summarizeDues({ id: 's1' }, ledger, 0, '2025-2026');
  const sum26 = summarizeDues({ id: 's1' }, ledger, 0, '2026-2027');
  const sumAll = summarizeDues({ id: 's1' }, ledger, 0, null);
  
  if (sum25.totalDue !== 100) throw new Error("Failed to isolate 2025-2026");
  if (sum26.totalDue !== 200) throw new Error("Failed to isolate 2026-2027");
  if (sumAll.totalDue !== 300) throw new Error("Failed to combine overall");
});

console.log("\n=== AUDIT COMPLETE ===");
