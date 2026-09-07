(async () => {
  const {
    generateChargeSchedule,
    calculateOpeningArrears,
    calculatePenalties,
    applyPaymentsAndAdjustments,
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

  console.log('=== Fee Engine — Final 3-Installment Model Tests ===\n');

  const student = { id: 'stu_123', name: 'Alice', isNewAdmission: true };
  const academicYear = '2026-2027';

  // ─── Template: Admission ₹10 + July ₹50 ───────────────────────────────────
  // Reflects the final model: Admission Fee is separate, July is the first
  // tuition installment.
  const feeTemplate = {
    components: [
      {
        id: 'admission',
        name: 'Admission Fee',
        amount: 10,
        schedule: [{ dueDate: '2026-07-10', label: 'One Time' }]
      },
      {
        id: 'july',
        name: 'July Installment',
        amount: 50,
        schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }]
      }
    ]
  };

  const baseCharges = generateChargeSchedule(student, feeTemplate, academicYear);
  assertEqual(baseCharges.length, 2, 'Two charges generated (Admission + July)');

  // ─── Test 1: ₹51 payment → Admission ₹10 + July ₹41, ₹9 remaining ─────────
  {
    console.log('\n--- Test 1: ₹51 payment (Admission=10, July=50) ---');
    const payments = [{ id: 'p1', date: '2026-07-12', amount: 51 }];
    const res = applyPaymentsAndAdjustments(baseCharges, payments);

    const adm  = res.ledger.find(c => c.componentId === 'admission');
    const july = res.ledger.find(c => c.componentId === 'july');

    assertEqual(adm.status,          'paid',    'Admission fully paid');
    assertEqual(adm.netDue,          0,         'Admission netDue = 0');
    assertEqual(july.status,         'partial',  'July tuition partially paid');
    assertEqual(july.allocatedPaid,  41,         'July allocatedPaid = 41');
    assertEqual(july.netDue,         9,          'July netDue = 9');
    assertEqual(res.advanceCredit,   0,          'No advance credit');
  }

  // ─── Test 2: ₹61 payment → Admission ₹10 + July ₹50 + ₹1 Advance ──────────
  {
    console.log('\n--- Test 2: ₹61 payment (Admission=10, July=50) → ₹1 Advance ---');
    const payments = [{ id: 'p2', date: '2026-07-12', amount: 61 }];
    const res = applyPaymentsAndAdjustments(baseCharges, payments);

    const adm  = res.ledger.find(c => c.componentId === 'admission');
    const july = res.ledger.find(c => c.componentId === 'july');

    assertEqual(adm.netDue,         0,  'Admission netDue = 0');
    assertEqual(july.netDue,        0,  'July tuition netDue = 0');
    assertEqual(res.advanceCredit,  1,  'Advance Payment = 1');
  }

  // ─── Test 3: ₹5 payment → only toward Admission ─────────────────────────────
  {
    console.log('\n--- Test 3: ₹5 payment → only toward Admission ---');
    const payments = [{ id: 'p3', date: '2026-07-08', amount: 5 }];
    const res = applyPaymentsAndAdjustments(baseCharges, payments);

    const adm  = res.ledger.find(c => c.componentId === 'admission');
    const july = res.ledger.find(c => c.componentId === 'july');

    assertEqual(adm.status,   'partial', 'Admission partially paid');
    assertEqual(adm.netDue,   5,         'Admission netDue = 5');
    assertEqual(july.status,  'unpaid',  'July still unpaid');
    assertEqual(july.netDue,  50,        'July netDue = 50');
  }

  // ─── Test 4: Deterministic Priority (Arrears → Oldest → Penalties last) ─────
  {
    console.log('\n--- Test 4: Deterministic allocation priority ---');
    const arrears = calculateOpeningArrears(student, 20, academicYear);
    assertEqual(arrears.length, 1, 'One Previous Year Due charge created');
    assertEqual(arrears[0].type, 'arrears', 'Charge type is arrears');

    // Construct a small template with admission + september
    const tpl2 = {
      components: [
        { id: 'admission', name: 'Admission Fee', amount: 10,
          schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
        { id: 'september', name: 'September Installment', amount: 50,
          schedule: [{ dueDate: '2026-09-10', label: 'September Installment' }] }
      ]
    };
    const charges2 = generateChargeSchedule(student, tpl2, academicYear);

    // September is past its deadline; generate a Late Fee
    const penaltyRules = [
      { id: 'sept_late', label: 'Late Fee – September', deadline: '2026-09-10', graceDays: 5, amount: 5, waiveIfCleared: false }
    ];
    const penalties = calculatePenalties(charges2, '2026-09-20', penaltyRules);
    assertEqual(penalties.length > 0, true, 'Late Fee generated for September');

    const allCharges = [...arrears, ...charges2, ...penalties];

    // Pay ₹25: Arrears(20) should be cleared first, then ₹5 toward Admission
    const payments = [{ id: 'p4', date: '2026-09-21', amount: 25 }];
    const res = applyPaymentsAndAdjustments(allCharges, payments);

    const arr = res.ledger.find(c => c.type === 'arrears');
    const adm = res.ledger.find(c => c.componentId === 'admission');
    const pen = res.ledger.find(c => c.type === 'penalty');

    assertEqual(arr.netDue, 0,  'Previous Year Due paid first (0 remaining)');
    assertEqual(adm.netDue, 5,  'Admission paid second (5 remaining)');
    assertEqual(pen.netDue, 5,  'Late Fee not yet reached (5 still due)');

    const summary = summarizeDues(student, res.ledger, res.advanceCredit);
    assertEqual(summary.arrearsDue, 0, 'Summary: arrearsDue = 0');
  }

  // ─── Test 5: Fee Adjustment (waiver / concession) ────────────────────────────
  {
    console.log('\n--- Test 5: Fee Adjustment (concession on Admission Fee) ---');
    const charges = generateChargeSchedule(student, feeTemplate, academicYear);
    const admChargeId = charges.find(c => c.componentId === 'admission').id;

    const adjustments = [{ chargeId: admChargeId, amount: 10, type: 'waiver' }];
    const res = applyPaymentsAndAdjustments(charges, [], adjustments);

    const adm = res.ledger.find(c => c.id === admChargeId);
    assertEqual(adm.status,           'paid', 'Admission waived completely');
    assertEqual(adm.allocatedAdjusted, 10,    'allocatedAdjusted = 10');
    assertEqual(adm.netDue,            0,     'netDue = 0 after waiver');
  }

  // ─── Test 6: Full 3-installment charge generation ────────────────────────────
  {
    console.log('\n--- Test 6: 3-installment schedule generation ---');
    const tpl3 = {
      components: [
        { id: 'admission',  name: 'Admission Fee',         amount: 1000,
          schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
        { id: 'july',       name: 'July Installment',       amount: 2000,
          schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
        { id: 'september',  name: 'September Installment',  amount: 2000,
          schedule: [{ dueDate: '2026-09-10', label: 'September Installment' }] },
        { id: 'december',   name: 'December Installment',   amount: 2000,
          schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] }
      ]
    };
    const charges3 = generateChargeSchedule(student, tpl3, academicYear);
    assertEqual(charges3.length, 4, 'Four charges: Admission + 3 installments');
    assertEqual(charges3.filter(c => c.componentId === 'admission').length, 1, 'Exactly 1 Admission Fee charge');
    assertEqual(charges3.filter(c => c.componentId === 'july').length,      1, 'Exactly 1 July Installment charge');
    assertEqual(charges3.filter(c => c.componentId === 'september').length, 1, 'Exactly 1 September Installment charge');
    assertEqual(charges3.filter(c => c.componentId === 'december').length,  1, 'Exactly 1 December Installment charge');

    const total = charges3.reduce((s, c) => s + c.originalAmount, 0);
    assertEqual(total, 7000, 'Total annual fee = 7000 (1000 + 2000 + 2000 + 2000)');
  }

  // ─── Test 7: Academic-year-aware due dates ────────────────────────────────────
  // Verify that the SAME fee template generates DIFFERENT due dates
  // when called with different academic years. No hardcoded year must appear.
  {
    console.log('\n--- Test 7: Academic-year-aware due date generation ---');

    function makeTemplate(yr) {
      return {
        components: [
          { id: 'admission',  name: 'Admission Fee',        amount: 1000,
            schedule: [{ dueDate: `${yr}-07-10`, label: 'One Time' }] },
          { id: 'july',       name: 'July Installment',      amount: 2000,
            schedule: [{ dueDate: `${yr}-07-10`, label: 'July Installment' }] },
          { id: 'september',  name: 'October Installment / अक्टूबर की किस्त', amount: 2000,
            schedule: [{ dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त' }] },
          { id: 'december',   name: 'December Installment',  amount: 2000,
            schedule: [{ dueDate: `${yr}-12-10`, label: 'December Installment' }] }
        ]
      };
    }

    // Year 1: 2026-2027
    const stu2 = { id: 'stu_yr_test', isNewAdmission: true };
    const charges2627 = generateChargeSchedule(stu2, makeTemplate('2026'), '2026-2027');
    const charges2728 = generateChargeSchedule(stu2, makeTemplate('2027'), '2027-2028');

    // Due dates must reflect the correct start year
    const july2627 = charges2627.find(c => c.componentId === 'july');
    const july2728 = charges2728.find(c => c.componentId === 'july');
    assertEqual(july2627.dueDate, '2026-07-10', '2026-2027 July due date is 2026-07-10');
    assertEqual(july2728.dueDate, '2027-07-10', '2027-2028 July due date is 2027-07-10');

    const sept2627 = charges2627.find(c => c.componentId === 'september');
    const sept2728 = charges2728.find(c => c.componentId === 'september');
    assertEqual(sept2627.dueDate, '2026-10-10', '2026-2027 October due date is 2026-10-10');
    assertEqual(sept2728.dueDate, '2027-10-10', '2027-2028 October due date is 2027-10-10');

    const dec2627 = charges2627.find(c => c.componentId === 'december');
    const dec2728 = charges2728.find(c => c.componentId === 'december');
    assertEqual(dec2627.dueDate, '2026-12-10', '2026-2027 December due date correct');
    assertEqual(dec2728.dueDate, '2027-12-10', '2027-2028 December due date correct');

    // Academic year labels on charges
    assertEqual(charges2627.every(c => c.academicYear === '2026-2027'), true, 'All 2626-27 charges tagged with correct academicYear');
    assertEqual(charges2728.every(c => c.academicYear === '2027-2028'), true, 'All 2027-28 charges tagged with correct academicYear');

    // Admission Fee must NOT share its schedule or ID with installment components
    const adm2627 = charges2627.find(c => c.componentId === 'admission');
    const instIds = ['july', 'september', 'december'];
    assertEqual(instIds.includes(adm2627.componentId), false, 'Admission Fee is NOT an installment');
  }

  // ─── Test 8: Class 11/12 Science Per-Installment Amounts ────────────────────
  {
    console.log('\n--- Test 8: Class 11 Science tuition per-installment amounts ---');
    const scienceTemplate = {
      components: [
        {
          id: 'tuition',
          name: 'Tuition Fee',
          amount: 7500,
          schedule: [
            { dueDate: '2026-07-10', label: 'July Installment', amount: 3000 },
            { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 2500 },
            { dueDate: '2026-12-10', label: 'December Installment', amount: 2000 }
          ]
        }
      ]
    };
    const scienceStudent = { id: 'stu_sci_01', name: 'Bob Science' };
    const sciCharges = generateChargeSchedule(scienceStudent, scienceTemplate, '2026-2027');

    assertEqual(sciCharges.length, 3, 'Three tuition charges generated for Science');
    assertEqual(sciCharges[0].originalAmount, 3000, 'Science July = ₹3,000');
    assertEqual(sciCharges[1].originalAmount, 2500, 'Science October = ₹2,500');
    assertEqual(sciCharges[2].originalAmount, 2000, 'Science December = ₹2,000');
    const totalSciTuition = sciCharges.reduce((sum, c) => sum + c.originalAmount, 0);
    assertEqual(totalSciTuition, 7500, 'Science Total Tuition = ₹7,500');
  }

  // ─── Test 9: Strict Opt-in Admission Fee (All 6 Cases) ───────────────────────
  {
    console.log('\n--- Test 9: Strict Opt-in Admission Fee (6 Cases) ---');
    const admTemplate = {
      components: [
        { id: 'admission', name: 'Admission Fee', amount: 1500, schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
        { id: 'tuition', name: 'Tuition Fee', amount: 6000, schedule: [{ dueDate: '2026-07-10', label: 'July Installment', amount: 2000 }] }
      ]
    };

    // Case 1: isNewAdmission = true → admission charged
    const s1 = { id: 's1', isNewAdmission: true };
    const c1 = generateChargeSchedule(s1, admTemplate, '2026-2027');
    assertEqual(c1.some(c => c.componentId === 'admission'), true, 'Case 1: isNewAdmission=true → admission charged');

    // Case 2: admissionType = "new" → admission charged
    const s2 = { id: 's2', admissionType: 'new' };
    const c2 = generateChargeSchedule(s2, admTemplate, '2026-2027');
    assertEqual(c2.some(c => c.componentId === 'admission'), true, 'Case 2: admissionType="new" → admission charged');

    // Case 3: isNewAdmission = false → no admission
    const s3 = { id: 's3', isNewAdmission: false };
    const c3 = generateChargeSchedule(s3, admTemplate, '2026-2027');
    assertEqual(c3.some(c => c.componentId === 'admission'), false, 'Case 3: isNewAdmission=false → no admission');

    // Case 4: admissionType = "continuing" → no admission
    const s4 = { id: 's4', admissionType: 'continuing' };
    const c4 = generateChargeSchedule(s4, admTemplate, '2026-2027');
    assertEqual(c4.some(c => c.componentId === 'admission'), false, 'Case 4: admissionType="continuing" → no admission');

    // Case 5: isContinuing = true → no admission
    const s5 = { id: 's5', isContinuing: true };
    const c5 = generateChargeSchedule(s5, admTemplate, '2026-2027');
    assertEqual(c5.some(c => c.componentId === 'admission'), false, 'Case 5: isContinuing=true → no admission');

    // Case 6: admission fields completely missing → NO admission
    const s6 = { id: 's6', name: 'Legacy Imported Student' };
    const c6 = generateChargeSchedule(s6, admTemplate, '2026-2027');
    assertEqual(c6.some(c => c.componentId === 'admission'), false, 'Case 6: admission fields missing → NO admission');
  }

  console.log(`\n=== RESULTS: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
})();

