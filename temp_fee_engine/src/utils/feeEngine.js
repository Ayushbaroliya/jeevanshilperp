// V3 fee engine: class-specific components + smart frequency + ledger-based due calculation.
export const FEE_FREQUENCIES = [
  { value: 'one_time', label: 'One Time' },
  { value: 'every_installment', label: 'Every Installment' },
  { value: 'specific_installments', label: 'Specific Installments' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

export const INSTALLMENTS = [
  { id: 'admission', label: 'Admission / 1st' },
  { id: 'september', label: 'September / 2nd' },
  { id: 'december', label: 'December / 3rd' }
];

export const DEFAULT_FEE_COMPONENTS = [
  { id: 'tuition', name: 'Tuition', amount: 1500, enabled: true, frequency: 'every_installment', installments: ['admission', 'september', 'december'], dueDay: 10, penalty: 0, graceDays: 5 },
  { id: 'admission', name: 'Admission', amount: 0, enabled: false, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
  { id: 'exam', name: 'Exam', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
  { id: 'computer', name: 'Computer', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
  { id: 'practical', name: 'Practical', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
  { id: 'transport', name: 'Transport', amount: 0, enabled: false, frequency: 'monthly', installments: [], dueDay: 10, penalty: 0, graceDays: 5 }
];

export function normalizeClassFeeSettings(raw = {}) {
  if (Array.isArray(raw.components)) return { ...raw, components: raw.components };
  const tuition = Number(raw.fee || 0);
  const legacy = DEFAULT_FEE_COMPONENTS.map(c => ({ ...c }));
  legacy[0] = { ...legacy[0], amount: tuition || 0, penalty: Number(raw.penalty || 0), graceDays: Number(raw.grace || 5) };
  return {
    academicYear: raw.academicYear || getAcademicYear(),
    duePolicy: raw.duePolicy || { defaultDueDay: 10, defaultGraceDays: Number(raw.grace || 5), defaultPenalty: Number(raw.penalty || 0), septemberPenalty: 100, decemberPenalty: 500, decemberClearWaivesPenalty: true },
    components: legacy
  };
}

export function getAcademicYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function monthIndexFromAcademicStart(date) {
  return (date.getMonth() - 3 + 12) % 12;
}

function chargeDateForInstallment(installment, yearStart) {
  const dates = { admission: [yearStart, 3], september: [yearStart, 8], december: [yearStart, 11] };
  const [y, m] = dates[installment] || [yearStart, 3];
  return new Date(y, m, 10);
}

export function buildScheduledCharges(student, classSettings, asOf = new Date()) {
  const settings = normalizeClassFeeSettings(classSettings);
  const yearStart = Number(String(settings.academicYear || getAcademicYear(asOf)).slice(0, 4));
  const charges = [];
  for (const component of settings.components || []) {
    if (!component.enabled || Number(component.amount || 0) <= 0) continue;
    const amount = Number(component.amount || 0);
    const freq = component.frequency || 'one_time';
    if (freq === 'monthly') {
      for (let i = 0; i < 12; i++) {
        const d = new Date(yearStart, 3 + i, Number(component.dueDay || 10));
        if (d <= asOf) charges.push({ key: `${component.id}-${i}`, componentId: component.id, component: component.name, amount, dueDate: d.toISOString(), installment: null });
      }
    } else if (freq === 'quarterly') {
      [3, 6, 9, 0].forEach((m, idx) => {
        const y = m === 0 ? yearStart + 1 : yearStart;
        const d = new Date(y, m, Number(component.dueDay || 10));
        if (d <= asOf) charges.push({ key: `${component.id}-q${idx + 1}`, componentId: component.id, component: component.name, amount, dueDate: d.toISOString(), installment: null });
      });
    } else if (freq === 'every_installment') {
      for (const inst of ['admission', 'september', 'december']) {
        const d = chargeDateForInstallment(inst, yearStart);
        if (d <= asOf) charges.push({ key: `${component.id}-${inst}`, componentId: component.id, component: component.name, amount, dueDate: d.toISOString(), installment: inst });
      }
    } else if (freq === 'specific_installments') {
      for (const inst of component.installments || []) {
        const d = chargeDateForInstallment(inst, yearStart);
        if (d <= asOf) charges.push({ key: `${component.id}-${inst}`, componentId: component.id, component: component.name, amount, dueDate: d.toISOString(), installment: inst });
      }
    } else if (freq === 'custom') {
      for (const item of component.schedule || []) {
        const d = new Date(item.date);
        if (!Number.isNaN(d.getTime()) && d <= asOf) charges.push({ key: `${component.id}-${item.date}`, componentId: component.id, component: component.name, amount: Number(item.amount ?? amount), dueDate: d.toISOString(), installment: item.installment || null });
      }
    } else {
      // One-time fees are due at admission, or at their selected installment.
      const inst = (component.installments || ['admission'])[0];
      const admissionDate = student?.admissionDate ? new Date(student.admissionDate) : chargeDateForInstallment(inst, yearStart);
      if (admissionDate <= asOf) charges.push({ key: `${component.id}-once`, componentId: component.id, component: component.name, amount, dueDate: admissionDate.toISOString(), installment: inst });
    }
  }
  return charges;
}

export function calculateStudentDue({ student, classSettings, payments = [], adjustments = [], asOf = new Date() }) {
  const charges = buildScheduledCharges(student, classSettings, asOf);
  const paymentByComponent = {};
  const paymentTotal = payments.reduce((sum, p) => {
    const breakdown = p.feesBreakdown || {};
    Object.entries(breakdown).forEach(([key, value]) => { paymentByComponent[key] = (paymentByComponent[key] || 0) + Number(value || 0); });
    if (p.penaltyAmount) paymentByComponent.latePenalty = (paymentByComponent.latePenalty || 0) + Number(p.penaltyAmount || 0);
    return sum + Number(p.amount || 0);
  }, 0);

  const chargeTotals = {};
  charges.forEach(c => { chargeTotals[c.componentId] = (chargeTotals[c.componentId] || 0) + c.amount; });
  const concessions = {};
  adjustments.forEach(a => {
    const key = a.component === 'Late Penalty' ? 'latePenalty' : String(a.componentId || a.component || 'other').toLowerCase();
    concessions[key] = (concessions[key] || 0) + Number(a.amount || 0);
  });

  let scheduledDue = 0;
  Object.entries(chargeTotals).forEach(([key, amount]) => {
    scheduledDue += Math.max(0, amount - (paymentByComponent[key] || 0) - (concessions[key] || 0));
  });

  // Payments without a breakdown are treated as a general payment against the oldest balance.
  const itemizedPaid = Object.entries(paymentByComponent).reduce((s, [k, v]) => s + (k === 'latePenalty' ? 0 : v), 0);
  const generalPayments = Math.max(0, paymentTotal - itemizedPaid);
  scheduledDue = Math.max(0, scheduledDue - generalPayments);

  // Legacy/opening arrears are only used when explicitly supplied, so old dueAmount is not silently mixed with new charges.
  const openingArrears = Number(student?.openingArrears || 0);
  const latePenalty = calculateLatePenalty({ charges, classSettings, payments, adjustments, asOf });
  const adjustedPenalty = Math.max(0, latePenalty - (concessions.latePenalty || 0));
  const totalDue = Math.max(0, scheduledDue + openingArrears + adjustedPenalty);

  return { totalDue, scheduledDue, openingArrears, latePenalty: adjustedPenalty, charges, paymentTotal, adjustmentsTotal: Object.values(concessions).reduce((a, b) => a + b, 0) };
}

export function calculateLatePenalty({ charges, classSettings, payments = [], adjustments = [], asOf }) {
  const settings = normalizeClassFeeSettings(classSettings);
  let penalty = 0;
  const paymentBreakdown = payments.reduce((o, p) => {
    Object.entries(p.feesBreakdown || {}).forEach(([k, v]) => o[k] = (o[k] || 0) + Number(v || 0));
    return o;
  }, {});
  for (const c of charges) {
    const component = (settings.components || []).find(x => x.id === c.componentId);
    if (!component) continue;
    const paid = paymentBreakdown[c.componentId] || 0;
    const stillOpen = paid < c.amount;
    if (!stillOpen) continue;
    const grace = Number(component.graceDays ?? settings.duePolicy?.defaultGraceDays ?? 0);
    const due = new Date(c.dueDate);
    const deadline = new Date(due); deadline.setDate(deadline.getDate() + grace);
    if (asOf > deadline) {
      const configuredPenalty = component.penaltyByInstallment?.[c.installment];
      const penaltyAmount = configuredPenalty != null ? Number(configuredPenalty) : (c.installment === 'september' ? Number(settings.duePolicy?.septemberPenalty || 0) : c.installment === 'december' ? Number(settings.duePolicy?.decemberPenalty || 0) : Number(component.penalty || settings.duePolicy?.defaultPenalty || 0));
      penalty += penaltyAmount;
    }
  }
  return penalty;
}
