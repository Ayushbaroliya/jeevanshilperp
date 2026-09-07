# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: staff.spec.js >> Staff & Payroll Module E2E >> Owner can access payroll, mark attendance, and generate payroll
- Location: e2e\staff.spec.js:52:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[type="email"]')

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
  14  | test.describe('Staff & Payroll Module E2E', () => {
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
  28  |     const admin = await auth.createUser({ uid: 'admin123', email: 'admin@test.local', password: 'password' });
  29  |     await db.collection('users').doc(admin.uid).set({ role: 'Administrator', name: 'Admin', schoolId: 'SCH_01' });
  30  | 
  31  |     // 3. Seed Config
  32  |     await db.collection('school_settings').doc('schools').set({
  33  |       list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
  34  |     });
  35  | 
  36  |     // 4. Seed Staff
  37  |     await db.collection('staff').doc('staff123').set({
  38  |       uid: 'staff123',
  39  |       name: 'Rohan Sharma',
  40  |       role: 'Teacher',
  41  |       schoolId: 'SCH_01',
  42  |       status: 'Active',
  43  |       isActive: true
  44  |     });
  45  |     // Staff salary is private
  46  |     await db.collection('staff_salary').doc('staff123').set({
  47  |       baseSalary: 60000,
  48  |       schoolId: 'SCH_01'
  49  |     });
  50  |   });
  51  | 
  52  |   test('Owner can access payroll, mark attendance, and generate payroll', async ({ page }) => {
  53  |     await page.goto('http://localhost:5173');
> 54  |     await page.fill('input[type="email"]', 'owner@test.local');
      |                ^ Error: page.fill: Test timeout of 30000ms exceeded.
  55  |     await page.fill('input[type="password"]', 'password');
  56  |     await page.click('button[type="submit"]');
  57  |     
  58  |     await expect(page.locator('text=Staff & Salary')).toBeVisible();
  59  |     await page.click('text=Staff & Salary');
  60  |     
  61  |     await expect(page.locator('text=Consolidated HR View Active')).toBeVisible();
  62  |     
  63  |     // Select branch
  64  |     await page.click('text=Jeevan Shilp Public School');
  65  |     
  66  |     // Mark Attendance
  67  |     await expect(page.locator('text=Rohan Sharma')).toBeVisible();
  68  |     await page.selectOption('select', { label: 'Absent' });
  69  |     await page.click('button:has-text("Save All Attendance")');
  70  |     await expect(page.locator('text=Staff attendance saved successfully.')).toBeVisible();
  71  | 
  72  |     // Go to Salaries tab
  73  |     await page.click('text=Salary Management');
  74  |     await expect(page.locator('td', { hasText: '₹ 60,000' })).toBeVisible();
  75  |     
  76  |     // Go to Process Payroll
  77  |     await page.click('text=Process Payroll');
  78  |     await expect(page.locator('text=1 Days')).toBeVisible(); // 1 absent day
  79  |     await page.click('button:has-text("Confirm & Pay All")');
  80  |     
  81  |     await expect(page.locator('text=Payroll records saved successfully.')).toBeVisible();
  82  |   });
  83  | 
  84  |   test('Administrator can access attendance but not payroll/salary', async ({ page }) => {
  85  |     await page.goto('http://localhost:5173');
  86  |     await page.fill('input[type="email"]', 'admin@test.local');
  87  |     await page.fill('input[type="password"]', 'password');
  88  |     await page.click('button[type="submit"]');
  89  |     
  90  |     await expect(page.locator('text=Staff & Salary')).toBeVisible();
  91  |     await page.click('text=Staff & Salary');
  92  |     
  93  |     // Can mark attendance
  94  |     await expect(page.locator('text=Rohan Sharma')).toBeVisible();
  95  |     await expect(page.locator('text=Mark Attendance')).toBeVisible();
  96  |     
  97  |     // Cannot see salary/payroll tabs
  98  |     await expect(page.locator('text=Salary Management')).not.toBeVisible();
  99  |     await expect(page.locator('text=Process Payroll')).not.toBeVisible();
  100 |   });
  101 | });
  102 | 
```