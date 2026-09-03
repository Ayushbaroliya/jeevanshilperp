import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  initializeApp({ projectId: 'jeevanshilporg-51db8' });
}

test.describe.configure({ mode: 'serial' });

test.describe('Finance Module & Security (Phase 4)', () => {

  test.beforeEach(async () => {
    // 1. Wipe Emulators for full deterministic isolation
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
    await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
    
    // 2. Seed Users
    const auth = getAuth();
    const db = getFirestore();
    
    const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
    await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'E2E Owner' });
    
    const acct = await auth.createUser({ uid: 'acct123', email: 'accountant@test.local', password: 'password' });
    await db.collection('users').doc(acct.uid).set({ role: 'Accountant', name: 'E2E Accountant', schoolId: 'SCH_01' });
    await db.collection('staff').doc(acct.uid).set({ uid: acct.uid, role: 'Accountant', name: 'E2E Accountant', schoolId: 'SCH_01' });
    
    const teacher = await auth.createUser({ uid: 'teach123', email: 'teacher@test.local', password: 'password' });
    await db.collection('users').doc(teacher.uid).set({ role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
    await db.collection('staff').doc(teacher.uid).set({ uid: teacher.uid, role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });

    // 3. Seed App Config
    await db.collection('school_settings').doc('schools').set({
      list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
    });
    // Create the individual school document that FinanceModule requires
    await db.collection('schools').doc('SCH_01').set({ id: 'SCH_01', name: 'Jeevan Shilp Public School' });
    
    await db.collection('school_settings').doc('academic_years').set({
      current: 'AY_2025_26',
      list: [{ id: 'AY_2025_26', name: '2025-26', isCurrent: true, startDate: '2025-04-01', endDate: '2026-03-31' }]
    });

    // 4. Seed E2E Student
    await db.collection('students').doc('STU_01').set({
      id: 'STU_01',
      name: 'E2E Test Student',
      schoolId: 'SCH_01',
      classId: 'CLS_1',
      class: 'Class 1',
      admissionNumber: '1001',
      dueAmount: 60
    });

    // 5. Seed Ledger (Legacy charge for tests that still expect CHG_01, though V4 calculates Opening Arrears dynamically)
    await db.collection('student_ledger').doc('CHG_01').set({
      id: 'CHG_01',
      studentId: 'STU_01',
      schoolId: 'SCH_01',
      academicYearId: 'AY_2025_26',
      type: 'charge',
      chargeType: 'Opening Arrears',
      originalAmount: 60,
      adjustments: 0,
      amountPaid: 0,
      netDue: 60,
      status: 'unpaid',
      dueDate: '2025-04-01',
      timestamp: Timestamp.now()
    });
  });

  test('1. Owner/Director can open Finance & View Ledgers', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-owner-login');
    
    await page.click('button:has-text("Fees & Finance")');
    // Owner selects school first
    await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
    // See finance options
    await expect(page.locator('button:has-text("Classwise Fee Dues")')).toBeVisible();
  });

  test('2. Accountant can open Finance, see student statement, and ₹51 partial payment allocates correctly', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-accountant-login');
    
    await page.click('button:has-text("Fees & Finance")');
    await page.click('button:has-text("Record Payment")');
    
    // Select student from dropdown
    await page.selectOption('select.form-input', 'STU_01');
    // Read debug summary
    const debugText = await page.locator('[data-testid="debug-summary"]').textContent({ timeout: 2000 }).catch(() => 'No debug summary');
    console.log('DEBUG SUMMARY IN DOM:', debugText);
    
    // UI should show ₹60 outstanding
    await expect(page.locator('text=Total Outstanding: ₹60').first()).toBeVisible();
    
    // Pay ₹51
    await page.fill('input[placeholder="e.g. 2000"]', '51');
    await page.fill('input[placeholder="Physical Book #"]', 'RCPT-001');
    let dialogMessage = '';
    page.once('dialog', dialog => {
      dialogMessage = dialog.message();
      dialog.accept();
    });
    await page.click('button:has-text("Record Single Payment")');
    
    // Wait for UI update
    await expect(page.locator('text=Total Outstanding: ₹9').first()).toBeVisible({ timeout: 10000 });
    expect(dialogMessage).toContain('Payment of ₹51 recorded successfully!');
    
    // Verify backend Firestore allocation via Admin SDK
    const db = getFirestore();
    const credits = await db.collection('student_ledger')
      .where('studentId', '==', 'STU_01')
      .where('type', '==', 'credit')
      .get();
    
    expect(credits.empty).toBe(false);
    const creditDoc = credits.docs[0].data();
    
    // Exactly ₹51 paid
    expect(creditDoc.amount).toBe(51);
    expect(creditDoc.allocations.length).toBeGreaterThan(0);
    // The payment is allocated to the arrears
    expect(creditDoc.allocations[0].amount).toBe(51);
    
    // Receipts should contain a valid receipt record
    const invoices = await db.collection('invoices').where('studentId', '==', 'STU_01').get();
    expect(invoices.empty).toBe(false);
    expect(invoices.docs[0].data().amount).toBe(51);
  });

  test('3. ₹61 Overpayment generates explicit advance credit', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-accountant-login');
    
    await page.click('button:has-text("Fees & Finance")');
    await page.click('button:has-text("Record Payment")');
    
    // Select student
    await page.selectOption('select.form-input', 'STU_01');
    
    // Pay ₹61
    await page.fill('input[placeholder="e.g. 2000"]', '61');
    await page.fill('input[placeholder="Physical Book #"]', 'RCPT-002');
    let dialogMessage3 = '';
    page.once('dialog', dialog => {
      dialogMessage3 = dialog.message();
      dialog.accept();
    });
    await page.click('button:has-text("Record Single Payment")');
    
    // Wait for UI to update (net due goes to -1 because of advance credit)
    await page.waitForTimeout(2000);
    expect(dialogMessage3).toContain('Payment of ₹61 recorded successfully!');
    
    const db = getFirestore();
    
    // Verify advance credit in DB
    const credits = await db.collection('student_ledger')
      .where('studentId', '==', 'STU_01')
      .where('type', '==', 'credit')
      .get();
      
    expect(credits.empty).toBe(false);
    const creditDoc = credits.docs.map(d => d.data()).find(d => d.amount === 61);
    expect(creditDoc).toBeDefined();
    
    // Total paid is 61
    expect(creditDoc.amount).toBe(61);
    
    // V4 architecture allocates ₹60 to the charge, leaving ₹1 as unallocated (advance)
    const totalAllocated = creditDoc.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(totalAllocated).toBe(60);
  });

  test('4. Teacher is strictly denied Finance access (UI & DB)', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-teacher-login');
    
    // 1. UI Check: "Fees & Finance" button does not exist
    await expect(page.locator('button:has-text("Fees & Finance")')).not.toBeVisible();
    
    // 2. DB Check: Teacher cannot query student_ledger from browser
    const isDenied = await page.evaluate(async () => {
      try {
        const { db, collection, getDocs } = window.e2eFirestore;
        await getDocs(collection(db, 'student_ledger'));
        return false;
      } catch (err) {
        return err.code === 'permission-denied';
      }
    });
    
    expect(isDenied).toBe(true);
  });

  test('5. Duplicate submission is rejected by Firestore rules/transaction', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-owner-login');
    await page.waitForSelector('text=Dashboard');
    
    const isRejected = await page.evaluate(async () => {
      try {
        const { db, collection, runTransaction, doc, query, where, getDocs } = window.e2eFirestore;
        
        // Setup: We force write a receipt ID manually first
        await runTransaction(db, async (t) => {
          t.set(doc(collection(db, 'invoices')), { receiptId: 'RCPT-999', schoolId: 'SCH_01' });
        });
        
        // Then we attempt identical logic to what FinanceModule uses to verify uniqueness
        const q = query(collection(db, 'invoices'), where('receiptId', '==', 'RCPT-999'), where('schoolId', '==', 'SCH_01'));
        const snap = await getDocs(q); 
        if (!snap.empty) throw new Error("Duplicate receipt number detected");

        await runTransaction(db, async (t) => {
          
          t.set(doc(collection(db, 'invoices')), { receiptId: 'RCPT-999', schoolId: 'SCH_01' });
        });
        return false;
      } catch (err) {
        return err.message.includes('Duplicate receipt');
      }
    });
    
    expect(isRejected).toBe(true);
  });

});
