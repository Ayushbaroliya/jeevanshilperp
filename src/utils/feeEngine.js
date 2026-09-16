/**
 * feeEngine.js
 *
 * V4 Materialized Ledger Fee Engine
 *
 * FINAL BUSINESS MODEL (3 Installments):
 *   - July Installment     (id: 'july',      due: 10 Jul)
 *   - September Installment (id: 'september', due: 10 Sep)
 *   - December Installment  (id: 'december',  due: 10 Dec)
 *   - Admission Fee is a SEPARATE component, never an installment.
 *
 * PENALTY RULES:
 *   - September unpaid after deadline + grace → ₹100 Late Fee.
 *   - December:
 *       full balance cleared → Late Fee waived (₹0)
 *       otherwise           → ₹500 Late Fee at December close / year-end
 *   - Unpaid balance + applicable December Late Fee carries forward
 *     to the next academic year as "Previous Year Due".
 *
 * PAYMENT ALLOCATION:
 *   Deterministic FIFO by charge level:
 *     arrears (previous year due) → oldest due-date charges first → penalties last.
 *     Excess payment becomes Advance Payment.
 */

export const isAdmissionCharge = (c) => {
  if (!c) return false;
  if (c.componentId === 'admission') return true;
  if (typeof c.componentId === 'string' && c.componentId.toLowerCase().includes('admission')) return true;
  if (typeof c.label === 'string' && c.label.toLowerCase().includes('admission')) return true;
  if (typeof c.id === 'string' && c.id.toLowerCase().includes('admission')) return true;
  return false;
};

export const isTransportCharge = (c) => {
  if (!c) return false;
  if (c.componentId === 'transport') return true;
  const label = (c.label || '').toLowerCase();
  const id = (c.id || '').toLowerCase();
  return label.includes('transport') || id.includes('transport') || label.includes('परिवहन');
};

export const parseChargeDueDate = (dateStr) => {
  if (!dateStr) return 0;
  // Handle formats like AY_2026_27-07-10 or 2026-07-10
  const clean = String(dateStr).replace(/^AY_\d{4}_\d{2,4}-/, '2026-');
  const t = new Date(clean).getTime();
  return isNaN(t) ? 0 : t;
};

export const getChargeCanonicalRank = (c) => {
  if (!c) return 999;
  const isTransport = isTransportCharge(c);
  const label = (c.label || '').toLowerCase();
  const isPenalty = c.type === 'penalty' || label.includes('late fee') || label.includes('विलंब शुल्क');
  const isArrears = c.type === 'arrears' || label.includes('arrears') || label.includes('previous year');

  if (!isTransport) {
    // ── ACADEMIC GROUP ──
    // 1. Admission Fee ALWAYS on top
    if (isAdmissionCharge(c)) return 10;
    // 2. Arrears / Previous Year
    if (isArrears) return 20;

    const isExam = c.componentId === 'exam' || label.includes('exam') || label.includes('परीक्षा');

    // 3. July Installment / First Installment
    if (!isExam && (label.includes('july') || label.includes('1st installment') || label.includes('first installment') || String(c.dueDate).includes('-07-'))) {
      return isPenalty ? 115 : 110;
    }

    // 4. Second Installment / October (or legacy September)
    if (!isExam && (label.includes('october') || label.includes('अक्टूबर') || label.includes('september') || label.includes('2nd installment') || label.includes('second installment') || String(c.dueDate).includes('-10-') || String(c.dueDate).includes('-09-'))) {
      return isPenalty ? 125 : 120;
    }

    // 5. Examination Fee (Systematically placed between second and third installment)
    if (isExam) {
      return isPenalty ? 135 : 130;
    }

    // 6. Third Installment / December
    if (label.includes('december') || label.includes('दिसंबर') || label.includes('3rd installment') || label.includes('third installment') || String(c.dueDate).includes('-12-')) {
      return isPenalty ? 145 : 140;
    }

    // 7. Other Academic Charges
    if (isPenalty) return 190;
    return 150;
  } else {
    // ── TRANSPORT GROUP ──
    // 1. 1st Installment
    if (label.includes('1st installment') || label.includes('first installment') || label.includes('july') || String(c.dueDate).includes('-07-')) {
      return isPenalty ? 215 : 210;
    }
    // 2. 2nd Installment
    if (label.includes('2nd installment') || label.includes('second installment') || label.includes('october') || String(c.dueDate).includes('-10-')) {
      return isPenalty ? 225 : 220;
    }
    // 3. 3rd Installment
    if (label.includes('3rd installment') || label.includes('third installment') || label.includes('december') || String(c.dueDate).includes('-12-')) {
      return isPenalty ? 235 : 230;
    }
    if (isPenalty) return 290;
    return 250;
  }
};

export function getCleanFeeLabel(label, lang = 'en', componentId = '') {
  if (!label) return '';
  const isHi = lang === 'hi';
  const lower = String(label).toLowerCase();

  // 1. Admission Fee
  if (lower.includes('admission') || componentId === 'admission') {
    return isHi ? 'प्रवेश शुल्क (एकमुश्त)' : 'Admission Fee (One Time)';
  }

  // 2. Late Fee / Penalty
  if (lower.includes('late fee') || lower.includes('विलंब')) {
    if (lower.includes('october') || lower.includes('अक्टूबर') || lower.includes('september')) {
      return isHi ? 'विलंब शुल्क (अक्टूबर)' : 'Late Fee (October)';
    }
    if (lower.includes('december') || lower.includes('दिसंबर')) {
      return isHi ? 'विलंब शुल्क (दिसंबर)' : 'Late Fee (December)';
    }
    return isHi ? 'विलंब शुल्क' : 'Late Fee';
  }

  // 3. Exam Fee
  if (lower.includes('exam') || lower.includes('परीक्षा') || componentId === 'exam') {
    if (lower.includes('december') || lower.includes('दिसंबर')) {
      return isHi ? 'परीक्षा शुल्क - दिसंबर' : 'Examination Fee - December';
    }
    return isHi ? 'परीक्षा शुल्क' : 'Examination Fee';
  }

  // 4. Advance Payment
  if (lower.includes('advance') || componentId === 'advance') {
    return isHi ? 'अग्रिम भुगतान' : 'Advance Payment';
  }

  // 5. Transport Fee
  if (lower.includes('transport') || componentId === 'transport' || lower.includes('परिवहन')) {
    let instNumber = '';
    if (lower.includes('1st') || lower.includes('first')) instNumber = '1';
    else if (lower.includes('2nd') || lower.includes('second')) instNumber = '2';
    else if (lower.includes('3rd') || lower.includes('third')) instNumber = '3';

    const match = label.match(/Transport Fee \((.*)\) -/i);
    let routeName = match ? match[1].trim() : '';

    if (routeName) {
      if (isHi && typeof TRANSPORT_ROUTES !== 'undefined' && TRANSPORT_ROUTES) {
        const allRoutes = [...(TRANSPORT_ROUTES.SCH_01 || []), ...(TRANSPORT_ROUTES.SCH_03 || [])];
        const found = allRoutes.find(r => r.name === routeName || r.nameEn === routeName);
        if (found && found.nameHi) {
          routeName = found.nameHi;
        }
      }
      if (instNumber) {
        return isHi 
          ? `परिवहन शुल्क (${routeName}) - किस्त ${instNumber}` 
          : `Transport Fee (${routeName}) - Installment ${instNumber}`;
      }
      return isHi ? `परिवहन शुल्क (${routeName})` : `Transport Fee (${routeName})`;
    }

    if (instNumber) {
      return isHi ? `परिवहन शुल्क - किस्त ${instNumber}` : `Transport Fee - Installment ${instNumber}`;
    }
    return isHi ? 'परिवहन शुल्क' : 'Transport Fee';
  }

  // 6. Tuition Installments
  if (lower.includes('tuition') || componentId === 'tuition' || (!lower.includes('transport') && !lower.includes('exam'))) {
    if (lower.includes('july') || lower.includes('जुलाई') || lower.includes('1st installment') || lower.includes('first installment')) {
      return isHi ? 'शिक्षण शुल्क - जुलाई किस्त' : 'Tuition Fee - July Installment';
    }
    if (lower.includes('october') || lower.includes('अक्टूबर') || lower.includes('september') || lower.includes('2nd installment') || lower.includes('second installment')) {
      return isHi ? 'शिक्षण शुल्क - अक्टूबर किस्त' : 'Tuition Fee - October Installment';
    }
    if (lower.includes('december') || lower.includes('दिसंबर') || lower.includes('3rd installment') || lower.includes('third installment')) {
      return isHi ? 'शिक्षण शुल्क - दिसंबर किस्त' : 'Tuition Fee - December Installment';
    }
  }

  // Generic fallback if label has a slash 'English / Hindi':
  if (label.includes(' / ')) {
    const parts = label.split(' / ');
    if (isHi && parts[1]) return parts[1].trim();
    if (!isHi && parts[0]) return parts[0].trim();
  }

  return label;
}

export const sortLedgerCharges = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    // 1. Canonical rank (groups Academic first in requested order, then Transport in requested order)
    const rankA = getChargeCanonicalRank(a);
    const rankB = getChargeCanonicalRank(b);
    if (rankA !== rankB) return rankA - rankB;

    // 2. Oldest charge by sanitized dueDate
    const timeA = parseChargeDueDate(a.dueDate);
    const timeB = parseChargeDueDate(b.dueDate);
    if (timeA !== timeB && timeA > 0 && timeB > 0) return timeA - timeB;

    // 3. Lexical tiebreak
    return (a.id || '').localeCompare(b.id || '');
  });
};

// ─── 1. Generate Charge Schedule ────────────────────────────────────────────

/**
 * Builds a list of charge entries for a student from a fee template.
 *
 * @param {Object} student      - Must have `id`.
 * @param {Object} feeTemplate  - { components: [{ id, name, amount, schedule: [{dueDate, label}] }] }
 * @param {String} academicYear - e.g. '2026-2027'
 * @returns {Array} charges
 */
export function generateChargeSchedule(student, feeTemplate, academicYear) {
  if (!student || !feeTemplate || !feeTemplate.components) return [];
  const charges = [];

  for (const component of feeTemplate.components) {
    if (component.enabled === false) continue;
    
    if (component.id === 'admission') {
      const isNew = student?.isNewAdmission === true || student?.admissionType === 'new';
      if (!isNew) continue;
    }
    if (!component.schedule || component.schedule.length === 0) continue;
    for (const item of component.schedule) {
      const amt = item.amount ?? component.amount;
      const chargeId = `chg_${student.id}_${academicYear}_${component.id}_${item.dueDate}`;
      charges.push({
        id: chargeId,
        studentId: student.id,
        academicYear,
        componentId: component.id,
        label: `${component.name} - ${item.label}`,
        originalAmount: amt,
        dueDate: item.dueDate,
        status: 'unpaid',
        allocatedPaid: 0,
        allocatedAdjusted: 0,
        netDue: amt,
        type: 'standard'
      });
    }
  }
  return sortLedgerCharges(charges);
}

// ─── 2. Calculate Penalties (Late Fees) ──────────────────────────────────────

/**
 * Evaluates the ledger against configurable penalty rules and returns
 * new penalty charges. Does NOT duplicate existing penalties.
 *
 * Penalty rule shape:
 *   {
 *     id:            string   – unique rule identifier
 *     deadline:      ISO date – the due date being enforced
 *     graceDays:     number   – days after deadline before penalty fires
 *     amount:        number   – Late Fee amount (₹)
 *     waiveIfCleared: boolean – if true, waive the Late Fee when all
 *                               applicable charges are fully paid
 *   }
 *
 * @param {Array}  ledger       - Current list of ALL charges (paid + unpaid + existing penalties)
 * @param {String} asOfDate     - ISO date string to evaluate against
 * @param {Array}  penaltyRules - Array of rule objects (see shape above)
 * @returns {Array} newPenalties
 */
export function calculatePenalties(ledger, asOfDate, penaltyRules = []) {
  const newPenalties = [];
  const asOfTime = new Date(asOfDate).getTime();

  for (const rule of penaltyRules) {
    const deadlineTime = new Date(rule.deadline).getTime();
    const graceMs = (rule.graceDays || 0) * 24 * 60 * 60 * 1000;
    const thresholdTime = deadlineTime + graceMs;

    // Grace period has not expired yet
    if (asOfTime <= thresholdTime) continue;

    // Prevent duplicate: if a penalty for this rule already exists, skip
    const alreadyAssessed = ledger.some(
      c => c.type === 'penalty' && c.relatedRuleId === rule.id
    );
    if (alreadyAssessed) continue;

    // Charges that were due on or before this rule's deadline (excludes penalties)
    const applicableCharges = ledger.filter(
      c => c.type !== 'penalty' && new Date(c.dueDate).getTime() <= deadlineTime
    );

    if (applicableCharges.length === 0) continue;

    const totalRemainingDue = applicableCharges.reduce((sum, c) => sum + c.netDue, 0);

    // waiveIfCleared: if student fully cleared all applicable charges, no Late Fee
    if (rule.waiveIfCleared && totalRemainingDue <= 0) continue;

    // Standard: if any amount is still owed, apply the Late Fee
    if (totalRemainingDue <= 0) continue;

    const sample = applicableCharges[0];
    newPenalties.push({
      id: `chg_${sample.studentId}_${sample.academicYear}_penalty_${rule.id}`,
      studentId: sample.studentId,
      academicYear: sample.academicYear,
      componentId: 'late_fee',
      label: rule.label || `Late Fee (${rule.id})`,
      originalAmount: rule.amount,
      dueDate: asOfDate,          // Late Fee due immediately
      status: 'unpaid',
      allocatedPaid: 0,
      allocatedAdjusted: 0,
      netDue: rule.amount,
      type: 'penalty',
      relatedRuleId: rule.id
    });
  }

  return newPenalties;
}

// ─── 3. Apply Payments and Adjustments (Deterministic Allocation) ─────────────

/**
 * Allocates payments and fee adjustments deterministically across charges.
 *
 * Allocation priority (ascending sort before each payment):
 *   1. Previous Year Due (arrears) — always first
 *   2. Oldest charge by dueDate
 *   3. Penalties (Late Fees) — last within the same dueDate
 *   4. Lexical id tiebreak
 *
 * Excess payment is stored as Advance Payment (advanceCredit).
 *
 * @param {Array} charges     - All charge entries for this student
 * @param {Array} payments    - [{ id, date, amount }]
 * @param {Array} adjustments - [{ chargeId, amount, type }]
 * @returns {{ ledger, allocations, advanceCredit }}
 */
export function applyPaymentsAndAdjustments(charges, payments = [], adjustments = []) {
  // Always sort charges immediately: Admission Fee ALWAYS on top, then arrears, then oldest dueDate
  let ledger = sortLedgerCharges(charges.map(c => ({ ...c })));
  let advanceCredit = 0;
  const allAllocations = [];

  // Apply fee adjustments (concessions / waivers) first
  for (const adj of adjustments) {
    if (adj.deleted || adj.isDeleted || adj.status === 'deleted') continue;
    if (adj.chargeId) {
      const target = ledger.find(c => c.id === adj.chargeId);
      if (target && target.netDue > 0) {
        const applyAmt = Math.min(target.netDue, adj.amount);
        target.allocatedAdjusted += applyAmt;
        target.netDue -= applyAmt;
        updateChargeStatus(target);
      }
    }
  }

  // Apply payments in chronological order
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const payment of sortedPayments) {
    if (payment.deleted || payment.isDeleted || payment.status === 'deleted') continue;
    const paymentAmt = Number(payment.amount);
    if (isNaN(paymentAmt) || paymentAmt <= 0) continue;

    const hasAuthoritativeAllocations = Array.isArray(payment.allocations) && payment.allocations.length > 0;

    if (hasAuthoritativeAllocations) {
      // ── Authoritative Charge-Level Allocations ──
      // CRITICAL SAFETY: Treat allocations as authoritative. NEVER silently re-waterfall.
      for (const alloc of payment.allocations) {
        const allocAmt = Number(alloc.amount);
        if (isNaN(allocAmt) || allocAmt <= 0) continue;

        if (alloc.chargeId === 'advance') {
          advanceCredit += allocAmt;
          allAllocations.push({
            paymentId: payment.id,
            chargeId: 'advance',
            amount: allocAmt,
            componentId: 'advance'
          });
          continue;
        }

        const target = ledger.find(c => c.id === alloc.chargeId);
        if (target) {
          const allocate = Math.min(target.netDue, allocAmt);
          target.allocatedPaid += allocate;
          target.netDue -= allocate;
          updateChargeStatus(target);

          allAllocations.push({
            paymentId: payment.id,
            chargeId: target.id,
            amount: allocate,
            componentId: target.componentId
          });
        }
      }
    } else {
      // ── Legacy Waterfall Fallback (ONLY for historical payments without allocations) ──
      let remaining = paymentAmt;
      ledger = sortLedgerCharges(ledger);

      for (const charge of ledger) {
        if (remaining <= 0) break;
        if (charge.netDue <= 0) continue;

        const allocate = Math.min(charge.netDue, remaining);
        charge.allocatedPaid += allocate;
        charge.netDue -= allocate;
        remaining -= allocate;

        updateChargeStatus(charge);

        allAllocations.push({
          paymentId: payment.id,
          chargeId: charge.id,
          amount: allocate,
          componentId: charge.componentId
        });
      }

      if (remaining > 0) {
        advanceCredit += remaining;
      }
    }
  }

  return { ledger, allocations: allAllocations, advanceCredit };
}

function updateChargeStatus(charge) {
  if (charge.netDue <= 0) {
    charge.status = 'paid';
  } else if (charge.allocatedPaid > 0) {
    charge.status = 'partial';
  } else {
    charge.status = 'unpaid';
  }
}

// ─── 4. Year-End Closing & Carry-Forward (Previous Year Due) ─────────────────

/**
 * Takes the active ledger for a given academic year, sums all unpaid amounts
 * (charges + Late Fees), and generates ONE consolidated "Previous Year Due"
 * (opening_arrears) charge for the next academic year.
 *
 * Prevents double-execution by checking if the next year's arrears charge
 * from this source year already exists.
 *
 * @param {Object} student
 * @param {Array}  currentLedger
 * @param {String} currentAcademicYear
 * @param {String} nextAcademicYear
 * @returns {Array} carry-forward charges (0 or 1 entries)
 */
export function closeAcademicYear(student, currentLedger, currentAcademicYear, nextAcademicYear) {
  // Idempotency guard
  const alreadyRolledOver = currentLedger.some(
    c =>
      c.academicYear === nextAcademicYear &&
      c.type === 'arrears' &&
      c.sourceYear === currentAcademicYear
  );
  if (alreadyRolledOver) return [];

  const totalUnpaid = currentLedger
    .filter(c => c.academicYear === currentAcademicYear && c.netDue > 0)
    .reduce((sum, c) => sum + c.netDue, 0);

  if (totalUnpaid <= 0) return [];

  // Previous Year Due appears at the start of the new academic year (July)
  const startYear = nextAcademicYear.split('-')[0];
  const dueDate = `${startYear}-07-10`;

  return [
    {
      id: `chg_${student.id}_${nextAcademicYear}_arrears_from_${currentAcademicYear}`,
      studentId: student.id,
      academicYear: nextAcademicYear,
      componentId: 'opening_arrears',
      label: `Previous Year Due (from ${currentAcademicYear})`,
      originalAmount: totalUnpaid,
      dueDate,
      status: 'unpaid',
      allocatedPaid: 0,
      allocatedAdjusted: 0,
      netDue: totalUnpaid,
      type: 'arrears',
      sourceYear: currentAcademicYear
    }
  ];
}

/**
 * Creates a one-time "opening_arrears" charge for a student who already
 * had a legacy due balance recorded outside the V4 engine.
 * NOTE: Do not use `student.dueAmount` as source of truth for ongoing
 * calculations; this is only for one-time legacy seeding.
 */
export function calculateOpeningArrears(student, legacyDueAmount, academicYear) {
  if (!legacyDueAmount || legacyDueAmount <= 0) return [];
  const startYear = academicYear.split('-')[0];
  return [
    {
      id: `chg_${student.id}_${academicYear}_legacy_arrears`,
      studentId: student.id,
      academicYear,
      componentId: 'opening_arrears',
      label: `Previous Year Due`,
      originalAmount: legacyDueAmount,
      dueDate: `${startYear}-07-10`,
      status: 'unpaid',
      allocatedPaid: 0,
      allocatedAdjusted: 0,
      netDue: legacyDueAmount,
      type: 'arrears'
    }
  ];
}

// ─── 5. Summarise Dues ────────────────────────────────────────────────────────

/**
 * Produces a summary of all outstanding dues for a student.
 *
 * @param {Object} student
 * @param {Array}  ledger
 * @param {Number} advanceCredit       - Excess payment (Advance Payment)
 * @param {String} filterAcademicYear  - Optional: only summarise a specific year
 * @returns {{ totalDue, scheduledDue, penaltyDue, arrearsDue, advanceCredit, ledger }}
 */
export function summarizeDues(student, ledger, advanceCredit = 0, filterAcademicYear = null) {
  let totalDue = 0;
  let penaltyDue = 0;
  let arrearsDue = 0;

  for (const c of ledger) {
    if (filterAcademicYear && c.academicYear !== filterAcademicYear) continue;
    if (c.netDue > 0) {
      totalDue += c.netDue;
      if (c.type === 'penalty') penaltyDue += c.netDue;
      if (c.type === 'arrears') arrearsDue += c.netDue;
    }
  }

  return {
    totalDue: Math.max(0, totalDue - advanceCredit),
    scheduledDue: totalDue - penaltyDue - arrearsDue,
    penaltyDue,
    arrearsDue,
    advanceCredit,
    ledger
  };
}

// ─── 6. Convenience Runner ────────────────────────────────────────────────────

/**
 * Full engine run for a single student.
 * Reads class settings → generates charges → applies current Late Fees
 * → applies payments/adjustments → returns summary.
 *
 * Penalty amounts and deadlines are sourced from classSettings.duePolicy
 * when available; the built-in defaults match the final business rules.
 */
export function calculateStudentDue({ student, charges, classSettings, payments, adjustments }) {
  let baseCharges = charges;

  // Use permanent stored charges if available; otherwise fallback to schedule
  // generated from classSettings so students without imported charges (e.g. JSIC) show dues
  if (!baseCharges || baseCharges.length === 0) {
    if (classSettings && classSettings.components && classSettings.components.some(c => c.enabled && c.amount > 0)) {
      const academicYear = student.academicYear || '2026-2027';
      baseCharges = generateChargeSchedule(student, classSettings, academicYear);
    } else {
      return {
        totalDue: 0,
        totalPaid: 0,
        totalConcession: 0,
        advanceCredit: 0,
        ledger: [],
        missingCharges: true
      };
    }
  }

  const academicYear = student.academicYear || '2026-2027';
  const policy = classSettings?.duePolicy || {};

  const withArrears = [...baseCharges];

  // Late Fee rules derived from class policy (or built-in defaults)
  // Per requirement: No late fee for July/October installments. Only final/December obligation gets late fee.
  const rules = [
    {
      id: 'dec_late',
      label: 'Late Fee / विलंब शुल्क',
      deadline: `${academicYear.split('-')[0]}-12-10`,
      graceDays: policy.decemberGraceDays ?? 5,
      amount: policy.decemberPenalty ?? 500,
      waiveIfCleared: policy.decemberClearWaivesPenalty !== false
    }
  ];

  const penalties = calculatePenalties(withArrears, new Date().toISOString(), rules);
  const fullCharges = [...withArrears, ...penalties];

  const res = applyPaymentsAndAdjustments(fullCharges, payments || [], adjustments || []);
  return summarizeDues(student, res.ledger, res.advanceCredit);
}

// ─── 7. Normalise Legacy Class Fee Settings ───────────────────────────────────

/**
 * Converts an older/flat class-settings shape into the canonical
 * { components: [...] } format expected by generateChargeSchedule.
 *
 * @param {Object} settings      - Raw class settings object
 * @param {String} academicYear  - e.g. '2026-2027' — used to derive correct due dates
 */
export function normalizeClassFeeSettings(settings, academicYear) {
  if (!settings) return { components: [] };
  if (Array.isArray(settings)) return { components: settings };

  const yr = (academicYear || '2026').match(/\d{4}/)?.[0] || '2026';

  // ── Path A: canonical shape — has a components array ──────────────────────
  if (settings.components && Array.isArray(settings.components)) {
    const LEGACY_IDS = new Set(['july', 'september', 'december', 'october', 'october_inst', 'october_installment', 'july_inst', 'july_installment', 'december_inst', 'december_installment']);

    // Step 1: remove legacy standalone installment components
    let comps = settings.components.filter(c => !LEGACY_IDS.has(c.id));

    // Step 2: if no tuition component exists at all, inject a blank one
    if (!comps.find(c => c.id === 'tuition')) {
      comps.push({
        id: 'tuition', name: 'Tuition Fee', amount: 0,
        enabled: false, frequency: 'every_installment',
        installments: ['july', 'september', 'december'],
        dueDay: 10, penalty: 100, graceDays: 5,
        schedule: [
          { dueDate: `${yr}-07-10`, label: 'July Installment' },
          { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त' },
          { dueDate: `${yr}-12-10`, label: 'December Installment' }
        ]
      });
    }

    // Step 3: enforce correct canonical shape on every component
    comps = comps.map(c => {
      if (c.id === 'tuition') {
        if (c.frequency === 'custom' && c.schedule && c.schedule.length > 0) {
          return c; // Preserve custom schedules (e.g. JSPS config)
        }

        const existingSched = c.schedule || [];
        const julyItem = existingSched.find(s => s.dueDate?.includes('-07-'));
        const octItem  = existingSched.find(s => s.dueDate?.includes('-09-') || s.dueDate?.includes('-10-'));
        const decItem  = existingSched.find(s => s.dueDate?.includes('-12-'));

        let julyAmt = julyItem?.amount;
        let octAmt  = octItem?.amount;
        let decAmt  = decItem?.amount;

        // If schedule items have no explicit amounts set yet, calculate fallbacks based on c.amount
        if (julyAmt === undefined && octAmt === undefined && decAmt === undefined && c.amount > 0) {
          if (c.amount === 7500) {
            julyAmt = 3000; octAmt = 2500; decAmt = 2000;
          } else {
            const third = Math.round(c.amount / 3);
            julyAmt = third; octAmt = third; decAmt = c.amount - (third * 2);
          }
        }

        const totalSched = (julyAmt || 0) + (octAmt || 0) + (decAmt || 0);

        return {
          ...c,
          amount: totalSched > 0 ? totalSched : (c.amount || 0),
          frequency: 'every_installment',
          installments: ['july', 'september', 'december'],
          schedule: [
            { dueDate: `${yr}-07-10`, label: 'July Installment', ...(julyAmt !== undefined ? { amount: julyAmt } : {}) },
            { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त', ...(octAmt !== undefined ? { amount: octAmt } : {}) },
            { dueDate: `${yr}-12-10`, label: 'December Installment', ...(decAmt !== undefined ? { amount: decAmt } : {}) }
          ]
        };
      }
      if (c.id === 'admission') {
        return { ...c, frequency: 'one_time', installments: [] };
      }
      return c;
    });

    return { ...settings, components: comps };
  }

  // ── Path B: very old flat object (e.g. { tuition: 1500, admission: 500 }) ──
  const components = [];
  if (settings.admission > 0) {
    components.push({
      id: 'admission', name: 'Admission Fee', amount: settings.admission,
      enabled: true, frequency: 'one_time', installments: [],
      dueDay: 10, penalty: 0, graceDays: 5,
      schedule: [{ dueDate: `${yr}-07-10`, label: 'One Time' }]
    });
  }
  if (settings.tuition > 0) {
    components.push({
      id: 'tuition', name: 'Tuition Fee', amount: settings.tuition,
      enabled: true, frequency: 'every_installment',
      installments: ['july', 'september', 'december'],
      dueDay: 10, penalty: 100, graceDays: 5,
      schedule: [
        { dueDate: `${yr}-07-10`, label: 'July Installment' },
        { dueDate: `${yr}-09-10`, label: 'September Installment' },
        { dueDate: `${yr}-12-10`, label: 'December Installment' }
      ]
    });
  }
  return { components };
}


// ─── 7.5. Transport Route Configuration ───────────────────────────────────────

/**
 * Returns the configurable transport routes based on the school ID.
 * Transport is completely STUDENT-WISE. Each student can independently have a route assigned.
 */
export const TRANSPORT_ROUTES = {
  SCH_01: [
    { id: 't_shared_1', name: 'Banpur', nameEn: 'Banpur', nameHi: 'बानपुर', annual: 3600, annualFee: 3600, inst1: 1600, installment1: 1600, inst2: 1000, installment2: 1000, inst3: 1000, installment3: 1000 },
    { id: 't_shared_2', name: 'Ganeshpura, Khiriya (Kailguwan Road), Hasraiyan', nameEn: 'Ganeshpura, Khiriya (Kailguwan Road), Hasraiyan', nameHi: 'गणेशपुरा, खिरिया (कैलगुवां रोड), हसरैयन', annual: 4800, annualFee: 4800, inst1: 2800, installment1: 2800, inst2: 1000, installment2: 1000, inst3: 1000, installment3: 1000 },
    { id: 't_shared_3', name: 'Chakaura, Kuagaon, Udaya / Tapran', nameEn: 'Chakaura, Kuagaon, Udaya / Tapran', nameHi: 'चकौरा, कुआगाँव, उदया / टपरन', annual: 5300, annualFee: 5300, inst1: 2300, installment1: 2300, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_4', name: 'Chhilla', nameEn: 'Chhilla', nameHi: 'छिल्ला', annual: 5500, annualFee: 5500, inst1: 2500, installment1: 2500, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_5', name: 'Ajnaora, Umri', nameEn: 'Ajnaora, Umri', nameHi: 'अजनौरा, ऊमरी', annual: 5800, annualFee: 5800, inst1: 2800, installment1: 2800, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_6', name: 'Khiriya Mishra', nameEn: 'Khiriya Mishra', nameHi: 'खिरिया मिश्र', annual: 6000, annualFee: 6000, inst1: 3000, installment1: 3000, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_7', name: 'Sunwaha', nameEn: 'Sunwaha', nameHi: 'सुनवाहा', annual: 6500, annualFee: 6500, inst1: 3500, installment1: 3500, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_8', name: 'Gangasagar, Pah', nameEn: 'Gangasagar, Pah', nameHi: 'गंगासागर, पाह', annual: 6800, annualFee: 6800, inst1: 3800, installment1: 3800, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_shared_9', name: 'Dagrana, Daulatpura, Husanga, Didaura', nameEn: 'Dagrana, Daulatpura, Husanga, Didaura', nameHi: 'डगराना, दौलतपुरा, हुसंगा, दिदौरा', annual: 7500, annualFee: 7500, inst1: 3500, installment1: 3500, inst2: 2000, installment2: 2000, inst3: 2000, installment3: 2000 },
    { id: 't_shared_10', name: 'Billa, Bilata', nameEn: 'Billa, Bilata', nameHi: 'बिल्ला, बिलाटा', annual: 7800, annualFee: 7800, inst1: 3800, installment1: 3800, inst2: 2000, installment2: 2000, inst3: 2000, installment3: 2000 },
    { id: 't_shared_11', name: 'Khakron, Banoni, Naiguwa, Surikala', nameEn: 'Khakron, Banoni, Naiguwa, Surikala', nameHi: 'खाकरौन, बानौनी, नैर्गुवा, सूरीकलाँ', annual: 8000, annualFee: 8000, inst1: 3000, installment1: 3000, inst2: 2500, installment2: 2500, inst3: 2500, installment3: 2500 },
    { id: 't_shared_12', name: 'Gangchari / Dailwara', nameEn: 'Gangchari / Dailwara', nameHi: 'गंगचारी / दैलवारा', annual: 8100, annualFee: 8100, inst1: 3100, installment1: 3100, inst2: 2500, installment2: 2500, inst3: 2500, installment3: 2500 },
    { id: 't_shared_13', name: 'Gugarwara, Udaypura, Puradhan, Kua, Mirchwara', nameEn: 'Gugarwara, Udaypura, Puradhan, Kua, Mirchwara', nameHi: 'गुगरवारा, उदयपुरा, पुराधन, कुआँ, मिर्चवारा', annual: 8500, annualFee: 8500, inst1: 3500, installment1: 3500, inst2: 2500, installment2: 2500, inst3: 2500, installment3: 2500 },
    { id: 't_shared_14', name: 'Simiriya, Khanjaura, Maugan', nameEn: 'Simiriya, Khanjaura, Maugan', nameHi: 'सिमिरिया, खंजौरा, मौगान', annual: 9000, annualFee: 9000, inst1: 4000, installment1: 4000, inst2: 2500, installment2: 2500, inst3: 2500, installment3: 2500 },
    { id: 't_shared_15', name: 'Kailguwan, Kakdari', nameEn: 'Kailguwan, Kakdari', nameHi: 'कैलगुवां, ककडारी', annual: 9500, annualFee: 9500, inst1: 4500, installment1: 4500, inst2: 2500, installment2: 2500, inst3: 2500, installment3: 2500 }
  ],
  SCH_02: null,
  SCH_03: [
    { id: 't_jsb2_1', name: 'Badan / Dixitpura / Sordo Mohalla', nameEn: 'Badan / Dixitpura / Sordo Mohalla', nameHi: 'बदान / दीक्षितपुरा / सौरदो मुहल्ला', annual: 3500, annualFee: 3500, inst1: 1500, installment1: 1500, inst2: 1000, installment2: 1000, inst3: 1000, installment3: 1000 },
    { id: 't_jsb2_2', name: 'Chhirwan / Prajapati Mohalla', nameEn: 'Chhirwan / Prajapati Mohalla', nameHi: 'छिरवां / प्रजापति मुहल्ला', annual: 3500, annualFee: 3500, inst1: 1500, installment1: 1500, inst2: 1000, installment2: 1000, inst3: 1000, installment3: 1000 },
    { id: 't_jsb2_3', name: 'Kachhiyakhera', nameEn: 'Kachhiyakhera', nameHi: 'कछियाखेरा', annual: 3500, annualFee: 3500, inst1: 1500, installment1: 1500, inst2: 1000, installment2: 1000, inst3: 1000, installment3: 1000 },
    { id: 't_jsb2_4', name: 'Ladwari / Syag', nameEn: 'Ladwari / Syag', nameHi: 'लड़वारी / स्याग', annual: 5000, annualFee: 5000, inst1: 2000, installment1: 2000, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_jsb2_5', name: 'Ladwari / Syag (Harijan Basti)', nameEn: 'Ladwari / Syag (Harijan Basti)', nameHi: 'लड़वारी / स्याग (हरिजन बस्ती)', annual: 5500, annualFee: 5500, inst1: 2500, installment1: 2500, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_jsb2_6', name: 'Babakhera / Doodakhera', nameEn: 'Babakhera / Doodakhera', nameHi: 'बाबाखेरा / डूडाखेरा', annual: 5500, annualFee: 5500, inst1: 2500, installment1: 2500, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_jsb2_7', name: 'Narayanpur / Prempura', nameEn: 'Narayanpur / Prempura', nameHi: 'नारायणपुर / प्रेमपुरा', annual: 6000, annualFee: 6000, inst1: 3000, installment1: 3000, inst2: 1500, installment2: 1500, inst3: 1500, installment3: 1500 },
    { id: 't_jsb2_8', name: 'Lakhaura', nameEn: 'Lakhaura', nameHi: 'लखौरा', annual: 8000, annualFee: 8000, inst1: 4000, installment1: 4000, inst2: 2000, installment2: 2000, inst3: 2000, installment3: 2000 }
  ]
};
TRANSPORT_ROUTES.SCH_02 = TRANSPORT_ROUTES.SCH_01;

export function getTransportRoutes(schoolId) {
  if (schoolId === 'SCH_03') {
    return TRANSPORT_ROUTES.SCH_03;
  }
  return TRANSPORT_ROUTES.SCH_01;
}

export function getTransportRouteLabel(route, language = 'en') {
  if (!route) return '';
  if (language === 'hi') {
    return route.nameHi || route.name || route.nameEn || '';
  }
  return route.nameEn || route.name || '';
}


// ─── 8. Constants ─────────────────────────────────────────────────────────────

/**
 * The three tuition installment slots.
 * IDs are canonical keys used throughout the system.
 * dueMonth/dueDay are the default schedule positions.
 * Admission Fee is SEPARATE and must NOT appear here.
 */
export const INSTALLMENTS = [
  { id: 'july',      label: 'July Installment',                         dueMonth: '07', dueDay: '10' },
  { id: 'september', label: 'October Installment / अक्टूबर की किस्त', dueMonth: '10', dueDay: '10' },
  { id: 'december',  label: 'December Installment',                      dueMonth: '12', dueDay: '10' }
];

/**
 * Returns the canonical due date string for a given installment ID and academic year.
 * e.g. installmentDueDate('september', '2026-2027') → '2026-10-10'
 */
export function installmentDueDate(installmentId, academicYear) {
  const startYear = (academicYear || '2026-2027').split('-')[0];
  const inst = INSTALLMENTS.find(i => i.id === installmentId);
  if (!inst) return null;
  return `${startYear}-${inst.dueMonth}-${inst.dueDay}`;
}

/**
 * Frequency options for fee components (used in Settings UI).
 */
export const FEE_FREQUENCIES = [
  { value: 'every_installment',    label: 'All 3 Installments (Jul / Oct / Dec)' },
  { value: 'specific_installments', label: 'Specific Installments' },
  { value: 'one_time',             label: 'One Time' },
  { value: 'monthly',              label: 'Monthly' }
];

/**
 * Returns the default fee component templates for a given academic year.
 * Always call this function; do NOT use static component definitions that
 * bake in a specific year's dates.
 *
 * @param {String} academicYear - e.g. '2026-2027'
 * @returns {Array} component template objects
 */
export function getDefaultFeeComponents(academicYear) {
  const yr = (academicYear || '2026-2027').split('-')[0];
  return [
    {
      id: 'admission',
      name: 'Admission Fee',
      amount: 0,
      enabled: false,
      frequency: 'one_time',
      installments: [],          // Admission Fee is NOT an installment
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-07-10`, label: 'One Time' }]
    },
    {
      id: 'tuition',
      name: 'Tuition Fee',
      amount: 0,
      enabled: false,
      frequency: 'every_installment',
      installments: ['july', 'september', 'december'],
      dueDay: 10,
      penalty: 100,
      graceDays: 5,
      schedule: [
        { dueDate: `${yr}-07-10`, label: 'July Installment' },
        { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त' },
        { dueDate: `${yr}-12-10`, label: 'December Installment' }
      ]
    },
    {
      id: 'exam',
      name: 'Examination Fee',
      amount: 0,
      enabled: false,
      frequency: 'one_time',
      installments: ['december'],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-12-10`, label: 'December Installment' }]
    },
    {
      id: 'computer',
      name: 'Computer Fee',
      amount: 0,
      enabled: false,
      frequency: 'one_time',
      installments: ['july'],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-07-10`, label: 'July Installment' }]
    },
    {
      id: 'practical',
      name: 'Practical Fee',
      amount: 200,
      enabled: false,             // NOT PAYABLE / do not enable as payable charge by default
      frequency: 'one_time',
      installments: ['december'],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-12-10`, label: 'December Installment' }]
    },
    {
      id: 'registration',
      name: 'Registration Fee',
      amount: 100,
      enabled: false,
      frequency: 'one_time',
      installments: ['july'],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-07-10`, label: 'July Installment' }]
    },
    {
      id: 'test',
      name: 'Test Fee',
      amount: 200,
      enabled: false,
      frequency: 'one_time',
      installments: ['july'],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: [{ dueDate: `${yr}-07-10`, label: 'July Installment' }]
    },
    {
      id: 'transport',
      name: 'Transport Fee',
      amount: 0,
      enabled: false,
      frequency: 'monthly',
      installments: [],
      dueDay: 10,
      penalty: 0,
      graceDays: 5,
      schedule: []
    }
  ];
}

export function getJSICFeeComponents(className, academicYear) {
  const defaults = getDefaultFeeComponents(academicYear);
  const yr = (academicYear || '2026-2027').split('-')[0];

  let admission = 0;
  let hasAdmission = true;
  let tuition = 0;
  let exam = 0;
  let tuitionSchedule = [
    { dueDate: `${yr}-07-10`, label: 'July Installment', amount: 2000 },
    { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त', amount: 2000 },
    { dueDate: `${yr}-12-10`, label: 'December Installment', amount: 2000 }
  ];

  if (['Class 6', 'Class 7', 'Class 8'].includes(className)) {
    admission = className === 'Class 6' ? 1200 : 1000;
    tuition = 6000;
    exam = 500;
  } else if (['Class 9', 'Class 10'].includes(className)) {
    admission = className === 'Class 9' ? 1500 : 0;
    hasAdmission = className === 'Class 9'; // Class 10 has 0 default but is configurable
    tuition = 6000;
    exam = 500;
  } else if (['Class 11 Art', 'Class 11 Arts', 'Class 12 Art', 'Class 12 Arts', 'Class 11', 'Class 12'].includes(className)) {
    const is11 = className.includes('11');
    admission = is11 ? 1500 : 0;
    hasAdmission = is11;
    tuition = 6000;
    exam = 500;
  } else if (['Class 11 Science', 'Class 12 Science'].includes(className)) {
    const is11 = className.includes('11');
    admission = is11 ? 2000 : 0;
    hasAdmission = is11;
    tuition = 7500;
    exam = 1000;
    tuitionSchedule = [
      { dueDate: `${yr}-07-10`, label: 'July Installment', amount: 3000 },
      { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त', amount: 2500 },
      { dueDate: `${yr}-12-10`, label: 'December Installment', amount: 2000 }
    ];
  } else {
    // Fallback for primary classes if any
    admission = 1000;
    tuition = 6000;
    exam = 500;
  }

  return defaults.map(comp => {
    if (comp.id === 'admission') {
      return { ...comp, amount: admission, enabled: true }; // Always enabled/configurable, even if 0
    }
    if (comp.id === 'tuition') {
      return { ...comp, amount: tuition, schedule: tuitionSchedule, enabled: true };
    }
    if (comp.id === 'exam') {
      return { ...comp, amount: exam, enabled: true };
    }
    // Other fees remain as their template defaults (disabled)
    return comp;
  });
}

/**
 * @deprecated Use getDefaultFeeComponents(academicYear) instead.
 * Kept for backward-compat with any remaining static references.
 */
export const DEFAULT_FEE_COMPONENTS = getDefaultFeeComponents('2026-2027');

export function getJSPSFeeComponents(className, academicYear) {
  const defaults = getDefaultFeeComponents(academicYear);
  const yr = (academicYear || '2026-2027').split('-')[0];
  const yrNext = parseInt(yr) + 1;

  let admission = 0;
  let tuition = 0;
  let exam = 0;
  let inst1_total = 0, inst2_total = 0, inst3_total = 0;

  switch(className) {
    case 'Nursery': case 'LKG': admission=1700; tuition=6400; exam=600; inst1_total=3000; inst2_total=2000; inst3_total=2000; break;
    case 'UKG': admission=1800; tuition=6400; exam=600; inst1_total=3000; inst2_total=2000; inst3_total=2000; break;
    case 'Class 1': admission=2000; tuition=7400; exam=750; inst1_total=4150; inst2_total=2000; inst3_total=2000; break;
    case 'Class 2': admission=2000; tuition=7500; exam=750; inst1_total=4250; inst2_total=2000; inst3_total=2000; break;
    case 'Class 3': admission=2000; tuition=7600; exam=750; inst1_total=4350; inst2_total=2000; inst3_total=2000; break;
    case 'Class 4': admission=2000; tuition=7700; exam=750; inst1_total=4450; inst2_total=2000; inst3_total=2000; break;
    case 'Class 5': admission=2000; tuition=7800; exam=750; inst1_total=4550; inst2_total=2000; inst3_total=2000; break;
    case 'Class 6': admission=2000; tuition=8000; exam=750; inst1_total=3750; inst2_total=2500; inst3_total=2500; break;
    case 'Class 7': admission=2000; tuition=8200; exam=750; inst1_total=3950; inst2_total=2500; inst3_total=2500; break;
    case 'Class 8': admission=2000; tuition=8400; exam=750; inst1_total=4150; inst2_total=2500; inst3_total=2500; break;
    default: admission=2000; tuition=6400; exam=600; inst1_total=3000; inst2_total=2000; inst3_total=2000; break;
  }

  // The fee sheet combines Exam Fee into the 1st Installment payment amount.
  // We separate it for accounting but ensure the due dates align so the parent pays the expected total.
  const t1 = inst1_total - exam;
  const t2 = inst2_total;
  const t3 = inst3_total;

  const tuitionSchedule = [
    { dueDate: `${yr}-07-10`, label: '1st Installment (April/July)', amount: t1 },
    { dueDate: `${yr}-10-10`, label: '2nd Installment (September/October)', amount: t2 },
    { dueDate: `${yrNext}-01-10`, label: '3rd Installment (December/January)', amount: t3 }
  ];

  return defaults.map(comp => {
    if (comp.id === 'admission') {
      return { ...comp, amount: admission, enabled: true, isOneTime: true, condition: 'isNewAdmission' };
    }
    if (comp.id === 'tuition') {
      return { ...comp, amount: tuition, enabled: true, frequency: 'custom', schedule: tuitionSchedule, penalty: 100, graceDays: 10 };
    }
    if (comp.id === 'exam') {
      return { ...comp, amount: exam, enabled: true, frequency: 'custom', schedule: [{ dueDate: `${yr}-07-10`, label: 'Examination Fee', amount: exam }] };
    }
    return { ...comp, amount: 0, enabled: false };
  });
}

/**
 * Universal helper returning default fee components for any school branch (SCH_01, SCH_02, SCH_03, etc.)
 */
export function getSchoolDefaultFeeComponents(schoolId, className, academicYear) {
  if (schoolId === 'SCH_01') {
    return getJSPSFeeComponents(className, academicYear);
  }
  if (schoolId === 'SCH_02') {
    return getJSICFeeComponents(className, academicYear);
  }
  // SCH_03 (Jeevan Shilp Sanskarshala) or generic branch fallback:
  // If high school / intermediate classes, use secondary schedule; otherwise primary schedule
  if (['Class 9', 'Class 10', 'Class 11', 'Class 12', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'].includes(className)) {
    return getJSICFeeComponents(className, academicYear);
  }
  return getJSPSFeeComponents(className, academicYear);
}

