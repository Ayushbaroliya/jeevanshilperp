(async () => {
  // Use dynamic import since ledgerService is an ES module
  const { generateChargesForStudent, allocatePayment } = await import('./src/services/ledgerService.js');

  console.log("=== Testing Ledger Service ===");

  const student = { id: 'stu_001', name: 'John Doe' };
  const feeTemplate = {
    academicYear: '2026-2027',
    classId: 'Class 5',
    components: [
      {
        id: 'admission',
        name: 'Admission Fee',
        amount: 5000,
        schedule: [
          { dueDate: '2026-04-01', label: 'One Time' }
        ]
      },
      {
        id: 'tuition',
        name: 'Tuition Fee',
        amount: 2000,
        schedule: [
          { dueDate: '2026-04-10', label: 'April' },
          { dueDate: '2026-05-10', label: 'May' },
          { dueDate: '2026-06-10', label: 'June' }
        ]
      }
    ]
  };

  // Test 1: Generate Charges
  console.log("\n[Test 1] Generating Charges...");
  const charges = generateChargesForStudent(student, feeTemplate);
  console.log(`Generated ${charges.length} charges.`);
  if (charges.length !== 4) throw new Error("Expected 4 charges!");

  // Test 2: Partial Payment Allocation
  console.log("\n[Test 2] Allocating Partial Payment (₹6000)...");
  // Expected:
  // Admission (5000) -> 5000 paid, 0 due (Status: paid)
  // April Tuition (2000) -> 1000 paid, 1000 due (Status: partial)
  // May Tuition (2000) -> 0 paid, 2000 due (Status: unpaid)
  const result1 = allocatePayment(charges, 6000);
  console.log(`Allocations made:`, result1.allocations);
  
  const admissionCharge = result1.updatedCharges.find(c => c.componentId === 'admission');
  const aprilCharge = result1.updatedCharges.find(c => c.componentId === 'tuition' && c.dueDate === '2026-04-10');
  const mayCharge = result1.updatedCharges.find(c => c.componentId === 'tuition' && c.dueDate === '2026-05-10');

  if (admissionCharge.status !== 'paid') throw new Error("Admission charge should be paid!");
  if (aprilCharge.status !== 'partial') throw new Error("April charge should be partial!");
  if (aprilCharge.netDue !== 1000) throw new Error("April charge should have 1000 netDue!");
  if (mayCharge.status !== 'unpaid') throw new Error("May charge should be unpaid!");

  // Test 3: Subsequent Payment Allocation
  console.log("\n[Test 3] Allocating Second Payment (₹3000)...");
  // Applying on top of the previously updated charges
  const result2 = allocatePayment(result1.updatedCharges, 3000);
  const updatedApril = result2.updatedCharges.find(c => c.componentId === 'tuition' && c.dueDate === '2026-04-10');
  const updatedMay = result2.updatedCharges.find(c => c.componentId === 'tuition' && c.dueDate === '2026-05-10');

  if (updatedApril.status !== 'paid') throw new Error("April charge should now be paid!");
  if (updatedApril.netDue !== 0) throw new Error("April charge netDue should be 0!");
  if (updatedMay.status !== 'paid') throw new Error("May charge should now be paid!");
  if (updatedMay.netDue !== 0) throw new Error("May charge netDue should be 0!");

  console.log("\n✅ ALL TESTS PASSED!");
})();
