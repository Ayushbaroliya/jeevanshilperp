/**
 * Pure helpers for non-waterfall fee allocation.
 * These functions do not read/write Firestore and are safe to use with
 * historical records that do not yet contain allocation metadata.
 */
export function getChargeOutstanding(charge, allocatedPayments = 0) {
  const amount = Number(charge?.amount ?? charge?.totalAmount ?? charge?.feeAmount ?? 0) || 0;
  const alreadyPaid = Number(charge?.paidAmount ?? charge?.paid ?? 0) || 0;
  const allocated = Number(allocatedPayments) || 0;
  return Math.max(0, amount - alreadyPaid - allocated);
}

export function allocateSelectedCharges(charges, requestedAllocations) {
  const safeCharges = Array.isArray(charges) ? charges : [];
  const requested = requestedAllocations || {};
  const allocations = [];
  let total = 0;

  for (const charge of safeCharges) {
    const id = charge?.id;
    if (!id) continue;
    const outstanding = getChargeOutstanding(charge, charge.allocatedAmount || 0);
    const requestedAmount = Number(requested[id]) || 0;
    if (requestedAmount <= 0 || outstanding <= 0) continue;
    const allocatedAmount = Math.min(requestedAmount, outstanding);
    allocations.push({
      chargeId: id,
      componentId: charge.componentId || charge.type || 'fee',
      description: charge.description || charge.label || charge.name || 'Fee',
      amount: allocatedAmount,
      academicYearId: charge.academicYearId || charge.academicYear || null,
    });
    total += allocatedAmount;
  }

  return { allocations, total };
}

export function summarizeAllocation(allocations) {
  return (Array.isArray(allocations) ? allocations : []).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
}
