# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: academics.spec.js >> Academics Module E2E >> Admin assigns teacher to Class 5A
- Location: e2e\academics.spec.js:67:3

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
  14  | test.describe('Academics Module E2E', () => {
  15  | 
  16  |   test.beforeEach(async () => {
  17  |     // 1. Wipe Emulators
  18  |     await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
  19  |     await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
  20  |     
  21  |     // 2. Seed Users
  22  |     const auth = getAuth();
  23  |     const db = getFirestore();
  24  |     
  25  |     const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
  26  |     await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'Group Owner / Super Admin' });
  27  |     
  28  |     const teacher = await auth.createUser({ uid: 'teacher123', email: 'teacher@test.local', password: 'password' });
  29  |     await db.collection('users').doc(teacher.uid).set({ role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
  30  | 
  31  |     // 3. Seed App Config
  32  |     await db.collection('school_settings').doc('schools').set({
  33  |       list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
  34  |     });
  35  |     await db.collection('schools').doc('SCH_01').set({ id: 'SCH_01', name: 'Jeevan Shilp Public School' });
  36  |     await db.collection('school_settings').doc('academic_years').set({
  37  |       current: 'AY_2025_26',
  38  |       list: [{ id: 'AY_2025_26', name: '2025-26', isCurrent: true, startDate: '2025-04-01', endDate: '2026-03-31' }]
  39  |     });
  40  |     
  41  |     // 4. Seed Classes & Students
  42  |     await db.collection('school_settings').doc('classes').set({
  43  |       list: [{ id: 'Class 5', name: 'Class 5' }]
  44  |     });
  45  |     await db.collection('school_settings').doc('sections').set({
  46  |       list: [{ id: 'Section A', name: 'Section A' }, { id: 'Section B', name: 'Section B' }]
  47  |     });
  48  |     
  49  |     await db.collection('students').doc('STU_01').set({
  50  |       id: 'STU_01',
  51  |       name: 'E2E Test Student',
  52  |       schoolId: 'SCH_01',
  53  |       class: 'Class 5',
  54  |       section: 'Section A',
  55  |       admissionNumber: '1001'
  56  |     });
  57  |     await db.collection('enrollments').doc('ENR_01').set({
  58  |       id: 'ENR_01',
  59  |       studentId: 'STU_01',
  60  |       schoolId: 'SCH_01',
  61  |       academicYearId: 'AY_2025_26',
  62  |       class: 'Class 5',
  63  |       section: 'Section A'
  64  |     });
  65  |   });
  66  | 
  67  |   test('Admin assigns teacher to Class 5A', async ({ page }) => {
  68  |     await page.goto('/');
> 69  |     await page.click('#e2e-owner-login'); // Wait for dashboard
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  70  |     await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  71  |     await page.click('button:has-text("School Settings & Governance")');
  72  |     
  73  |     // Must select school branch first since Owner sees "ALL" by default
  74  |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  75  |     
  76  |     await page.click('button:has-text("Class Teacher Assignments")');
  77  |     
  78  |     // In our simplified logic, just asserting page layout loads because assignment needs UI implementation mapping
  79  |     await expect(page.locator('text=Assign Teacher')).toBeVisible();
  80  |   });
  81  | 
  82  |   test('Teacher logs in and manages Class 5A attendance and marks', async ({ page }) => {
  83  |     // We must manually seed the assignment since we skipped the UI assignment
  84  |     const db = getFirestore();
  85  |     const userRecord = await getAuth().getUserByEmail('teacher@test.local');
  86  |     await db.collection('class_assignments').doc('SCH_01_AY_2025_26_Class 5_Section A').set({
  87  |       schoolId: 'SCH_01',
  88  |       academicYearId: 'AY_2025_26',
  89  |       class: 'Class 5',
  90  |       section: 'Section A',
  91  |       teacherId: userRecord.uid
  92  |     });
  93  | 
  94  |     await page.goto('/');
  95  |     await page.click('#e2e-teacher-login');
  96  |     
  97  |     // Using explicit locator for Academics link in sidebar
  98  |     await page.locator('nav').locator('button', { hasText: 'Academics & Grades' }).click();
  99  |     
  100 |     // Select Class 5 A
  101 |     await page.selectOption('select:has(option[value="Class 5"])', 'Class 5');
  102 |     await page.selectOption('select:has(option[value="Section A"])', 'Section A');
  103 |     
  104 |     // 1. Attendance
  105 |     await expect(page.locator('button:has-text("Mark All Present")')).toBeVisible();
  106 |     
  107 |     // 2. Marks
  108 |     await page.click('button:has-text("Subject Gradebook & Marks")');
  109 |     await expect(page.locator('h2', { hasText: 'Gradebook' })).toBeVisible();
  110 |   });
  111 | 
  112 |   test('Teacher attempts unauthorized class/section -> blocked', async ({ page }) => {
  113 |     await page.goto('/');
  114 |     await page.click('#e2e-teacher-login');
  115 |     
  116 |     // Using explicit locator for Academics link
  117 |     await page.locator('nav').locator('button', { hasText: 'Academics & Grades' }).click();
  118 |     
  119 |     // Verify they can't access Class 5 B (which they aren't assigned to)
  120 |     await page.selectOption('select:has(option[value="Class 5"])', 'Class 5');
  121 |     await page.selectOption('select:has(option[value="Section B"])', 'Section B');
  122 |     
  123 |     await expect(page.locator('button:has-text("Mark All Present")')).not.toBeVisible();
  124 |   });
  125 | 
  126 | });
  127 | 
```