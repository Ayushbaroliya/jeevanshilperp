# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: students.spec.js >> Module 2 — Students & Enrollments (Phase 5) >> 1. Owner can view Student Directory and see 2025-26 enrollment
- Location: e2e\students.spec.js:75:3

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
  4   | import { getFirestore } from 'firebase-admin/firestore';
  5   | 
  6   | if (!getApps().length) {
  7   |   process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  8   |   process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  9   |   initializeApp({ projectId: 'jeevanshilporg-51db8' });
  10  | }
  11  | 
  12  | test.describe.configure({ mode: 'serial' });
  13  | 
  14  | test.describe('Module 2 — Students & Enrollments (Phase 5)', () => {
  15  | 
  16  |   test.beforeEach(async ({ page }) => {
  17  |     page.on('console', msg => {
  18  |       if (msg.type() === 'error' || msg.type() === 'warning') {
  19  |         console.log(`PAGE LOG: ${msg.text()}`);
  20  |       }
  21  |     });
  22  | 
  23  |     // 1. Clear Emulators for deterministic isolation
  24  |     await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
  25  |     await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
  26  |     
  27  |     // 2. Seed Users
  28  |     const auth = getAuth();
  29  |     const db = getFirestore();
  30  |     
  31  |     const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
  32  |     await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'E2E Owner' });
  33  |     
  34  |     const teacher = await auth.createUser({ uid: 'teach123', email: 'teacher@test.local', password: 'password' });
  35  |     await db.collection('users').doc(teacher.uid).set({ role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
  36  |     await db.collection('staff').doc(teacher.uid).set({ uid: teacher.uid, role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
  37  | 
  38  |     // 3. Seed App Config & School
  39  |     await db.collection('school_settings').doc('schools').set({
  40  |       list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
  41  |     });
  42  |     await db.collection('schools').doc('SCH_01').set({ id: 'SCH_01', name: 'Jeevan Shilp Public School' });
  43  |     
  44  |     await db.collection('school_settings').doc('academic_years').set({
  45  |       current: 'AY_2025_26',
  46  |       list: [{ id: 'AY_2025_26', name: '2025-26', isCurrent: true }]
  47  |     });
  48  | 
  49  |     // 4. Seed Permanent Student & Enrollment
  50  |     await db.collection('students').doc('STU_01').set({
  51  |       id: 'STU_01',
  52  |       name: 'Rohan Verma',
  53  |       contact: '9876543210',
  54  |       schoolId: 'SCH_01',
  55  |       class: 'Class 5',
  56  |       section: 'Section A',
  57  |       roll: '12',
  58  |       status: 'Active',
  59  |       attendance: '100%',
  60  |       openingArrears: 0
  61  |     });
  62  | 
  63  |     await db.collection('enrollments').doc('ENR_AY_2025_26_STU_01').set({
  64  |       id: 'ENR_AY_2025_26_STU_01',
  65  |       studentId: 'STU_01',
  66  |       schoolId: 'SCH_01',
  67  |       academicYearId: 'AY_2025_26',
  68  |       class: 'Class 5',
  69  |       section: 'Section A',
  70  |       roll: '12',
  71  |       status: 'Active'
  72  |     });
  73  |   });
  74  | 
  75  |   test('1. Owner can view Student Directory and see 2025-26 enrollment', async ({ page }) => {
  76  |     await page.goto('/');
> 77  |     await page.click('#e2e-owner-login');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  78  |     await page.waitForSelector('text=Dashboard');
  79  |     // Owner selects SCH_01 in the Navbar school switcher
  80  |     await page.selectOption('select.tour-school-switcher', 'SCH_01');
  81  | 
  82  |     await page.click('button:has-text("Students")');
  83  |     await expect(page.locator('text=Classes Directory')).toBeVisible({ timeout: 8000 });
  84  |     await page.click('text=Class 5');
  85  |     await page.waitForTimeout(2000);
  86  |     const html = await page.locator('.page-container').innerHTML();
  87  |     console.log("PAGE HTML LOG: " + html);
  88  |     await expect(page.locator('text=Rohan Verma')).toBeVisible({ timeout: 5000 });
  89  |   });
  90  | 
  91  |   test('2. 5-field roll-number uniqueness rejects duplicate in same academic year', async ({ page }) => {
  92  |     await page.goto('/');
  93  |     await page.click('#e2e-owner-login');
  94  |     await page.waitForSelector('text=Dashboard');
  95  |     await page.selectOption('select.tour-school-switcher', 'SCH_01');
  96  | 
  97  |     await page.click('button:has-text("Students")');
  98  |     await expect(page.locator('text=Classes Directory')).toBeVisible({ timeout: 8000 });
  99  |     await page.click('text=Class 5');
  100 |     await page.click('button:has-text("Add Student")');
  101 | 
  102 |     await page.fill('input[placeholder="e.g. Aarav Patel"]', 'Duplicate Rohan');
  103 |     await page.fill('input[placeholder="e.g. 42"]', '12'); // Duplicate roll 12 in Class 5A for AY_2025_26
  104 | 
  105 |     let alertMsg = '';
  106 |     page.once('dialog', d => { alertMsg = d.message(); d.accept(); });
  107 |     await page.click('button:has-text("Save & Add Next")');
  108 | 
  109 |     await page.waitForTimeout(1000);
  110 |     expect(alertMsg).toContain('already assigned');
  111 |   });
  112 | 
  113 |   test('3. Teacher can view assigned students but cannot physically delete student or enrollment', async ({ page }) => {
  114 |     await page.goto('/');
  115 |     await page.click('#e2e-teacher-login');
  116 |     await page.waitForSelector('text=Teacher Workspace');
  117 | 
  118 |     // DB security rule test via browser window
  119 |     const canDelete = await page.evaluate(async () => {
  120 |       try {
  121 |         const { db } = window.e2eFirestore;
  122 |         const { doc, deleteDoc } = await import('firebase/firestore');
  123 |         await deleteDoc(doc(db, 'students', 'STU_01'));
  124 |         return true;
  125 |       } catch (err) {
  126 |         return false;
  127 |       }
  128 |     });
  129 | 
  130 |     expect(canDelete).toBe(false);
  131 |   });
  132 | 
  133 | });
  134 | 
```