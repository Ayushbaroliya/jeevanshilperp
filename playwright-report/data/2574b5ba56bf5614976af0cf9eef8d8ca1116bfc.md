# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: finance.spec.js >> Finance Module & Security (Phase 4) >> 1. Owner/Director can open Finance & View Ledgers
- Location: e2e\finance.spec.js:77:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#e2e-owner-login')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - button "हिंदी में देखें" [ref=e5] [cursor=pointer]
  - generic [ref=e9]:
    - generic [ref=e10]:
      - heading "Jeevanshilp Group Portal Login" [level=1] [ref=e15]
      - paragraph [ref=e16]: Role-Based School Governance System
    - generic [ref=e17]:
      - paragraph [ref=e18]: "Please select your campus to log in securely:"
      - button "Jeevan Shilp Public School Staff & Faculty Portal" [ref=e19] [cursor=pointer]:
        - generic [ref=e25]:
          - generic [ref=e26]: Jeevan Shilp Public School
          - generic [ref=e27]: Staff & Faculty Portal
      - button "Jeevan Shilp Inter College Staff & Faculty Portal" [ref=e30] [cursor=pointer]:
        - generic [ref=e36]:
          - generic [ref=e37]: Jeevan Shilp Inter College
          - generic [ref=e38]: Staff & Faculty Portal
      - button "Jeevan Shilp Adarsh Shala Staff & Faculty Portal" [ref=e41] [cursor=pointer]:
        - generic [ref=e47]:
          - generic [ref=e48]: Jeevan Shilp Adarsh Shala
          - generic [ref=e49]: Staff & Faculty Portal
      - button "Group Owner Login Super Admin Access (All Branches)" [ref=e53] [cursor=pointer]:
        - generic [ref=e57]:
          - generic [ref=e58]: Group Owner Login
          - generic [ref=e59]: Super Admin Access (All Branches)
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { initializeApp, getApps } from 'firebase-admin/app';
  3   | import { getAuth } from 'firebase-admin/auth';
  4   | import { getFirestore, Timestamp } from 'firebase-admin/firestore';
  5   | 
  6   | if (!getApps().length) {
  7   |   process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  8   |   process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  9   |   initializeApp({ projectId: 'jeevanshilporg-51db8' });
  10  | }
  11  | 
  12  | test.describe.configure({ mode: 'serial' });
  13  | 
  14  | test.describe('Finance Module & Security (Phase 4)', () => {
  15  | 
  16  |   test.beforeEach(async () => {
  17  |     // 1. Wipe Emulators for full deterministic isolation
  18  |     await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
  19  |     await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
  20  |     
  21  |     // 2. Seed Users
  22  |     const auth = getAuth();
  23  |     const db = getFirestore();
  24  |     
  25  |     const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
  26  |     await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'E2E Owner' });
  27  |     
  28  |     const acct = await auth.createUser({ uid: 'acct123', email: 'accountant@test.local', password: 'password' });
  29  |     await db.collection('users').doc(acct.uid).set({ role: 'Accountant', name: 'E2E Accountant', schoolId: 'SCH_01' });
  30  |     await db.collection('staff').doc(acct.uid).set({ uid: acct.uid, role: 'Accountant', name: 'E2E Accountant', schoolId: 'SCH_01' });
  31  |     
  32  |     const teacher = await auth.createUser({ uid: 'teach123', email: 'teacher@test.local', password: 'password' });
  33  |     await db.collection('users').doc(teacher.uid).set({ role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
  34  |     await db.collection('staff').doc(teacher.uid).set({ uid: teacher.uid, role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
  35  | 
  36  |     // 3. Seed App Config
  37  |     await db.collection('school_settings').doc('schools').set({
  38  |       list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
  39  |     });
  40  |     // Create the individual school document that FinanceModule requires
  41  |     await db.collection('schools').doc('SCH_01').set({ id: 'SCH_01', name: 'Jeevan Shilp Public School' });
  42  |     
  43  |     await db.collection('school_settings').doc('academic_years').set({
  44  |       current: 'AY_2025_26',
  45  |       list: [{ id: 'AY_2025_26', name: '2025-26', isCurrent: true, startDate: '2025-04-01', endDate: '2026-03-31' }]
  46  |     });
  47  | 
  48  |     // 4. Seed E2E Student
  49  |     await db.collection('students').doc('STU_01').set({
  50  |       id: 'STU_01',
  51  |       name: 'E2E Test Student',
  52  |       schoolId: 'SCH_01',
  53  |       classId: 'CLS_1',
  54  |       class: 'Class 1',
  55  |       admissionNumber: '1001',
  56  |       dueAmount: 60
  57  |     });
  58  | 
  59  |     // 5. Seed Ledger (Legacy charge for tests that still expect CHG_01, though V4 calculates Opening Arrears dynamically)
  60  |     await db.collection('student_ledger').doc('CHG_01').set({
  61  |       id: 'CHG_01',
  62  |       studentId: 'STU_01',
  63  |       schoolId: 'SCH_01',
  64  |       academicYearId: 'AY_2025_26',
  65  |       type: 'charge',
  66  |       chargeType: 'Opening Arrears',
  67  |       originalAmount: 60,
  68  |       adjustments: 0,
  69  |       amountPaid: 0,
  70  |       netDue: 60,
  71  |       status: 'unpaid',
  72  |       dueDate: '2025-04-01',
  73  |       timestamp: Timestamp.now()
  74  |     });
  75  |   });
  76  | 
  77  |   test('1. Owner/Director can open Finance & View Ledgers', async ({ page }) => {
  78  |     await page.goto('/');
> 79  |     await page.click('#e2e-owner-login');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  80  |     
  81  |     await page.click('button:has-text("Fees & Finance")');
  82  |     // Owner selects school first
  83  |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  84  |     // See finance options
  85  |     await expect(page.locator('button:has-text("Classwise Fee Dues")')).toBeVisible();
  86  |   });
  87  | 
  88  |   test('2. Accountant can open Finance, see student statement, and ₹51 partial payment allocates correctly', async ({ page }) => {
  89  |     await page.goto('/');
  90  |     await page.click('#e2e-accountant-login');
  91  |     
  92  |     await page.click('button:has-text("Fees & Finance")');
  93  |     await page.click('button:has-text("Record Payment")');
  94  |     
  95  |     // Select student from dropdown
  96  |     await page.selectOption('select.form-input', 'STU_01');
  97  |     // Read debug summary
  98  |     const debugText = await page.locator('[data-testid="debug-summary"]').textContent({ timeout: 2000 }).catch(() => 'No debug summary');
  99  |     console.log('DEBUG SUMMARY IN DOM:', debugText);
  100 |     
  101 |     // UI should show ₹60 outstanding
  102 |     await expect(page.locator('text=Total Outstanding: ₹60').first()).toBeVisible();
  103 |     
  104 |     // Pay ₹51
  105 |     await page.fill('input[placeholder="e.g. 2000"]', '51');
  106 |     await page.fill('input[placeholder="Physical Book #"]', 'RCPT-001');
  107 |     let dialogMessage = '';
  108 |     page.once('dialog', dialog => {
  109 |       dialogMessage = dialog.message();
  110 |       dialog.accept();
  111 |     });
  112 |     await page.click('button:has-text("Record Single Payment")');
  113 |     
  114 |     // Wait for UI update
  115 |     await expect(page.locator('text=Total Outstanding: ₹9').first()).toBeVisible({ timeout: 10000 });
  116 |     expect(dialogMessage).toContain('Payment of ₹51 recorded successfully!');
  117 |     
  118 |     // Verify backend Firestore allocation via Admin SDK
  119 |     const db = getFirestore();
  120 |     const credits = await db.collection('student_ledger')
  121 |       .where('studentId', '==', 'STU_01')
  122 |       .where('type', '==', 'credit')
  123 |       .get();
  124 |     
  125 |     expect(credits.empty).toBe(false);
  126 |     const creditDoc = credits.docs[0].data();
  127 |     
  128 |     // Exactly ₹51 paid
  129 |     expect(creditDoc.amount).toBe(51);
  130 |     expect(creditDoc.allocations.length).toBeGreaterThan(0);
  131 |     // The payment is allocated to the arrears
  132 |     expect(creditDoc.allocations[0].amount).toBe(51);
  133 |     
  134 |     // Receipts should contain a valid receipt record
  135 |     const invoices = await db.collection('invoices').where('studentId', '==', 'STU_01').get();
  136 |     expect(invoices.empty).toBe(false);
  137 |     expect(invoices.docs[0].data().amount).toBe(51);
  138 |   });
  139 | 
  140 |   test('3. ₹61 Overpayment generates explicit advance credit', async ({ page }) => {
  141 |     await page.goto('/');
  142 |     await page.click('#e2e-accountant-login');
  143 |     
  144 |     await page.click('button:has-text("Fees & Finance")');
  145 |     await page.click('button:has-text("Record Payment")');
  146 |     
  147 |     // Select student
  148 |     await page.selectOption('select.form-input', 'STU_01');
  149 |     
  150 |     // Pay ₹61
  151 |     await page.fill('input[placeholder="e.g. 2000"]', '61');
  152 |     await page.fill('input[placeholder="Physical Book #"]', 'RCPT-002');
  153 |     let dialogMessage3 = '';
  154 |     page.once('dialog', dialog => {
  155 |       dialogMessage3 = dialog.message();
  156 |       dialog.accept();
  157 |     });
  158 |     await page.click('button:has-text("Record Single Payment")');
  159 |     
  160 |     // Wait for UI to update (net due goes to -1 because of advance credit)
  161 |     await page.waitForTimeout(2000);
  162 |     expect(dialogMessage3).toContain('Payment of ₹61 recorded successfully!');
  163 |     
  164 |     const db = getFirestore();
  165 |     
  166 |     // Verify advance credit in DB
  167 |     const credits = await db.collection('student_ledger')
  168 |       .where('studentId', '==', 'STU_01')
  169 |       .where('type', '==', 'credit')
  170 |       .get();
  171 |       
  172 |     expect(credits.empty).toBe(false);
  173 |     const creditDoc = credits.docs.map(d => d.data()).find(d => d.amount === 61);
  174 |     expect(creditDoc).toBeDefined();
  175 |     
  176 |     // Total paid is 61
  177 |     expect(creditDoc.amount).toBe(61);
  178 |     
  179 |     // V4 architecture allocates ₹60 to the charge, leaving ₹1 as unallocated (advance)
```