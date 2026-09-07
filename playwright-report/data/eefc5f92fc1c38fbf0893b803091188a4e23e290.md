# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.js >> Dashboard Role-Based Access Control >> Owner can see full dashboard including payroll and fees
- Location: e2e\dashboard.spec.js:5:3

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
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Dashboard Role-Based Access Control', () => {
  4  | 
  5  |   test('Owner can see full dashboard including payroll and fees', async ({ page }) => {
  6  |     await page.goto('http://localhost:5173');
> 7  |     await page.click('#e2e-owner-login');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  8  | 
  9  |     // Should route to dashboard by default
  10 |     await expect(page.locator('.page-subtitle').filter({ hasText: /Executive overview/i }).first()).toBeVisible({ timeout: 10000 });
  11 |     
  12 |     // Check for fee chart / pie chart
  13 |     await expect(page.locator('text=Group Revenue Comparison').first()).toBeVisible();
  14 | 
  15 |     // Check for payroll
  16 |     await page.click('button:has-text("Staff & Actions")');
  17 |     await expect(page.locator('text=Salary Management')).toBeVisible();
  18 |     await expect(page.locator('text=Manage Salaries')).toBeVisible();
  19 |   });
  20 | 
  21 |   test('Administrator can see operations dashboard but NO payroll', async ({ page }) => {
  22 |     await page.goto('http://localhost:5173');
  23 |     await page.click('#e2e-admin-login');
  24 | 
  25 |     await expect(page.locator('.page-title').filter({ hasText: /Operations Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
  26 |     
  27 |     // Check fee collection
  28 |     await expect(page.locator('text=Total Fee Collection')).toBeVisible();
  29 |     
  30 |     // Administrator should NOT see Payroll on the dashboard
  31 |     await expect(page.locator('text=Salary Management')).not.toBeVisible();
  32 |     await expect(page.locator('text=Pending Payouts')).not.toBeVisible();
  33 |   });
  34 | 
  35 |   test('Accountant defaults to Finance dashboard and sees NO payroll', async ({ page }) => {
  36 |     await page.goto('http://localhost:5173');
  37 |     await page.click('#e2e-accountant-login');
  38 | 
  39 |     await expect(page.locator('.page-title').filter({ hasText: /Finance Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
  40 |     
  41 |     await expect(page.locator('text=Total Fee Collection')).toBeVisible();
  42 |     await expect(page.locator('h3:has-text("Outstanding Dues")')).toBeVisible();
  43 | 
  44 |     // Accountant should NOT see Payroll or Staff Attendance
  45 |     await expect(page.locator('text=Salary Management')).not.toBeVisible();
  46 |     await expect(page.locator('text=Staff Attendance')).not.toBeVisible();
  47 |   });
  48 | 
  49 |   test('Teacher defaults to Teacher dashboard and sees NO finance/payroll', async ({ page }) => {
  50 |     await page.goto('http://localhost:5173');
  51 |     await page.click('#e2e-teacher-login');
  52 | 
  53 |     await expect(page.locator('h1').filter({ hasText: /Welcome/i }).first()).toBeVisible({ timeout: 10000 });
  54 |     
  55 |     // Teacher sees specific academic context
  56 |     await expect(page.locator('text=Class Attendance')).toBeVisible();
  57 |     await expect(page.locator('text=Subject Gradebook')).toBeVisible();
  58 | 
  59 |     // Teacher should NOT see Finance or Payroll
  60 |     await expect(page.locator('text=Total Fee Collection')).not.toBeVisible();
  61 |     await expect(page.locator('text=Salary Management')).not.toBeVisible();
  62 |   });
  63 | 
  64 | });
  65 | 
```