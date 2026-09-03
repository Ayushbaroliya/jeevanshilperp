/**
 * ledgerService.js
 * 
 * Pure business logic for the new Materialized Ledger fee architecture.
 * These functions do NOT interact with Firebase directly, making them easy to unit test.
 */

/**
 * Generates an array of concrete Charge objects based on a student and a fee template.
 * 
 * @param {Object} student - { id, name, class, academicYear, ... }
 * @param {Object} feeTemplate - { classId, academicYear, components: [...] }
 * @returns {Array} List of charge objects ready to be saved to Firestore.
 */
export function generateChargesForStudent(student, feeTemplate) {
  if (!student || !feeTemplate || !feeTemplate.components) return [];

  const charges = [];
  const now = new Date().toISOString();

  for (const component of feeTemplate.components) {
    if (!component.schedule || component.schedule.length === 0) continue;

    for (const item of component.schedule) {
      // Create a deterministic unique ID for the charge to prevent duplicates
      const chargeId = `chg_${student.id}_${feeTemplate.academicYear}_${component.id}_${item.dueDate}`;

      charges.push({
        id: chargeId,
        studentId: student.id,
        academicYear: feeTemplate.academicYear,
        componentId: component.id,
        label: `${component.name} - ${item.label}`,
        originalAmount: component.amount,
        dueDate: item.dueDate,
        status: 'unpaid', // 'unpaid', 'partial', 'paid', 'void'
        allocatedPaid: 0,
        allocatedAdjusted: 0,
        netDue: component.amount,
        createdAt: now
      });
    }
  }

  return charges;
}

/**
 * Allocates a payment amount across a list of unpaid charges using FIFO (oldest first).
 * 
 * @param {Array} charges - List of charge objects for the student.
 * @param {Number} paymentAmount - The total amount paid.
 * @returns {Object} { updatedCharges, allocations, remainingUnallocated }
 */
export function allocatePayment(charges, paymentAmount) {
  // Sort charges by dueDate ascending (oldest first)
  const sortedCharges = [...charges].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  
  let remaining = Number(paymentAmount);
  const allocations = [];
  const updatedCharges = [];

  for (const charge of sortedCharges) {
    // We only process charges that have a netDue > 0
    if (charge.netDue <= 0 || charge.status === 'paid' || charge.status === 'void') {
      updatedCharges.push({ ...charge });
      continue;
    }

    if (remaining <= 0) {
      updatedCharges.push({ ...charge });
      continue;
    }

    // Determine how much to allocate to this specific charge
    const allocated = Math.min(charge.netDue, remaining);
    
    // Create the updated charge
    const newAllocatedPaid = charge.allocatedPaid + allocated;
    const newNetDue = charge.originalAmount - newAllocatedPaid - charge.allocatedAdjusted;
    
    let newStatus = 'unpaid';
    if (newNetDue <= 0) newStatus = 'paid';
    else if (newAllocatedPaid > 0) newStatus = 'partial';

    updatedCharges.push({
      ...charge,
      allocatedPaid: newAllocatedPaid,
      netDue: newNetDue,
      status: newStatus
    });

    // Record the allocation line item
    allocations.push({
      chargeId: charge.id,
      amount: allocated,
      componentId: charge.componentId
    });

    remaining -= allocated;
  }

  return {
    updatedCharges,
    allocations,
    remainingUnallocated: remaining
  };
}
