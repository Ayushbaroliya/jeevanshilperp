(async () => {
  const {
    generateChargeSchedule,
    calculatePenalties,
    applyPaymentsAndAdjustments,
    closeAcademicYear,
    summarizeDues
  } = await import('./src/utils/feeEngine.js');

  let passed = 0;
  let failed = 0;

  function assertEqual(actual, expected, testName) {
    if (actual === expected) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}. Expected ${expected}, got ${actual}`);
      failed++;
    }
  }

  console.log('=== Fee Engine — Penalty & Year-End Tests (Final 3-Installment Model) ===\n');

  const student = { id: 'stu_999' };
  const currentYear = '2026-2027';
  const nextYear    = '2027-2028';

  // ─── Final business model template ────────────────────────────────────────
  // Admission Fee = ₹1000 (one-time, due July)
  // July Installment = ₹2000, September Installment = ₹2000, December Installment = ₹2000
  const feeTemplate = {
    components: [
      {
        id: 'admission',
        name: 'Admission Fee',
        amount: 1000,
        schedule: [{ dueDate: '2026-07-10', label: 'One Time' }]
      },
      {
        id: 'july',
        name: 'July Installment',
        amount: 2000,
        schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }]
      },
      {
        id: 'september',
        name: 'September Installment',
        amount: 2000,
        schedule: [{ dueDate: '2026-09-10', label: 'September Installment' }]
      },
      {
        id: 'december',
        name: 'December Installment',
        amount: 2000,
        schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }]
      }
    ]
  };

  // ─── Final penalty rules (business requirement) ────────────────────────────
  // September: ₹100 Late Fee if any balance due after Sep 10 + 5 grace days
  // December:  ₹500 Late Fee, waived if ALL applicable charges cleared
  const penaltyRules = [
    { id: 'sept_late', label: 'Late Fee – September', deadline: '2026-09-10', graceDays: 5, amount: 100,  waiveIfCleared: false },
    { id: 'dec_late',  label: 'Late Fee – December',  deadline: '2026-12-10', graceDays: 5, amount: 500,  waiveIfCleared: true  }
  ];

  let ledger = generateChargeSchedule(student, feeTemplate, currentYear);
  assertEqual(ledger.length, 4, 'Four charges generated: Admission + 3 installments');

  // ─── Test 1: Partial September payment → Late Fee applies ──────────────────
  {
    console.log('\n--- Test 1: Partial Sept payment → September Late Fee ---');
    // Pay admission(1000) + July(2000) + 1500 toward September. Total = 4500.
    // September(2000): 1500 paid, 500 remaining after Sept 10.
    let res = applyPaymentsAndAdjustments(ledger, [{ id: 'p1', date: '2026-09-05', amount: 4500 }]);
    ledger = res.ledger;

    // Fast-forward to Sept 20 (past grace period → Sept 15)
    const newPenalties = calculatePenalties(ledger, '2026-09-20', penaltyRules);
    assertEqual(newPenalties.length, 1, 'One Late Fee charge generated');
    assertEqual(newPenalties[0].relatedRuleId, 'sept_late', 'It is the September Late Fee');
    assertEqual(newPenalties[0].originalAmount, 100, 'September Late Fee = ₹100');

    // Duplicate-prevention check
    ledger = [...ledger, ...newPenalties];
    const duplicatePenalties = calculatePenalties(ledger, '2026-09-25', penaltyRules);
    assertEqual(duplicatePenalties.length, 0, 'No duplicate Late Fee generated');
  }

  // ─── Test 2: December fully cleared → Late Fee waived ──────────────────────
  {
    console.log('\n--- Test 2: December fully cleared → Late Fee waived ---');
    // Current outstanding:
    //   September: 500 remaining
    //   September Late Fee: 100
    //   December: 2000
    //   Total = 2600
    // Pay exactly 2600 on Dec 12 (within grace period Dec 15)
    let res = applyPaymentsAndAdjustments(ledger, [{ id: 'p2', date: '2026-12-12', amount: 2600 }]);
    let tempLedger = res.ledger;

    // Fast-forward to Dec 20 (past grace → Dec 15)
    // waiveIfCleared=true: all applicable charges cleared → no Dec Late Fee
    const decPenalties = calculatePenalties(tempLedger, '2026-12-20', penaltyRules);
    assertEqual(decPenalties.length, 0, 'December Late Fee waived — all cleared');
  }

  // ─── Test 3: December partially paid → Late Fee applies ────────────────────
  {
    console.log('\n--- Test 3: December partially paid → Late Fee = ₹500 ---');
    // Revert: outstanding = 2600. Pay only 2000 on Dec 12.
    let res = applyPaymentsAndAdjustments(ledger, [{ id: 'p3', date: '2026-12-12', amount: 2000 }]);
    ledger = res.ledger; // 600 remains (500 Sep + 100 Sep-late — paid; 600 Dec remaining)

    // Fast-forward to Dec 20
    const decPenalties = calculatePenalties(ledger, '2026-12-20', penaltyRules);
    assertEqual(decPenalties.length, 1, 'December Late Fee applied (balance due)');
    assertEqual(decPenalties[0].relatedRuleId, 'dec_late', 'It is the December Late Fee');
    assertEqual(decPenalties[0].originalAmount, 500, 'December Late Fee = ₹500');

    ledger = [...ledger, ...decPenalties];
  }

  // ─── Test 4: Year-End Closing → Previous Year Due carry-forward ────────────
  {
    console.log('\n--- Test 4: Year-End Closing → Previous Year Due ---');
    // Current unpaid: outstanding Dec balance + 500 Dec Late Fee
    const carryForwardCharges = closeAcademicYear(student, ledger, currentYear, nextYear);

    assertEqual(carryForwardCharges.length, 1, 'One Previous Year Due charge generated');
    const arrearsCharge = carryForwardCharges[0];
    // The actual amount depends on what p3 paid; verify type and year
    assertEqual(arrearsCharge.type,          'arrears',  'Type = arrears (Previous Year Due)');
    assertEqual(arrearsCharge.academicYear,  nextYear,   'Belongs to next academic year');
    assertEqual(arrearsCharge.netDue > 0,    true,       'Carry-forward amount > 0');
    assertEqual(arrearsCharge.label.toLowerCase().includes('previous year due'), true, 'Label contains "Previous Year Due"');

    ledger = [...ledger, ...carryForwardCharges];

    // Duplicate-prevention
    const duplicateCarryForward = closeAcademicYear(student, ledger, currentYear, nextYear);
    assertEqual(duplicateCarryForward.length, 0, 'Duplicate carry-forward prevented');
  }

  // ─── Test 5: Payment made in next academic year clears arrears ─────────────
  {
    console.log('\n--- Test 5: Payment in next year clears Previous Year Due ---');
    const arrearsCharge = ledger.find(c => c.type === 'arrears' && c.academicYear === nextYear);
    const arrearsAmount = arrearsCharge.netDue;

    let res = applyPaymentsAndAdjustments(ledger, [{ id: 'p4', date: '2027-07-05', amount: arrearsAmount }]);
    ledger = res.ledger;

    const summaryNextYear = summarizeDues(student, ledger, 0, nextYear);
    assertEqual(summaryNextYear.arrearsDue, 0, 'Next year Previous Year Due fully cleared');
    assertEqual(summaryNextYear.totalDue,   0, 'Total due for next year = 0');

    // Historical integrity: old-year december charge must still show its original unpaid status
    const oldDecCharge = ledger.find(c => c.componentId === 'december' && c.academicYear === currentYear);
    assertEqual(oldDecCharge.netDue > 0, true, 'Old year December charge remains historically unpaid');
  }

  console.log(`\n=== RESULTS: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
})();
