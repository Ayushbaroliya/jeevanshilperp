# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.js >> Navigation and Sidebar Routing >> should navigate to Students Directory
- Location: e2e\navigation.spec.js:13:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
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
  3  | test.describe('Navigation and Sidebar Routing', () => {
  4  | 
  5  |   test.beforeEach(async ({ page }) => {
  6  |     // Login as Admin before each navigation test
  7  |     await page.goto('/');
> 8  |     await page.click('#e2e-owner-login');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  9  |     // Wait for Dashboard to load
  10 |     await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  11 |   });
  12 | 
  13 |   test('should navigate to Students Directory', async ({ page }) => {
  14 |     await page.click('button:has-text("Students Directory")');
  15 |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  16 |     // Verify it navigates correctly
  17 |     await expect(page.locator('h1.page-title', { hasText: 'Classes Directory' })).toBeVisible();
  18 |   });
  19 | 
  20 |   test('should navigate to Fees & Finance', async ({ page }) => {
  21 |     await page.click('button:has-text("Fees & Finance")');
  22 |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  23 |     await expect(page.locator('h1', { hasText: 'Classwise Due Fees Directory' })).toBeVisible();
  24 |     await expect(page.locator('button:has-text("Collect Fee & Cut Receipt")')).toBeVisible();
  25 |   });
  26 | 
  27 |   test('should navigate to Academics & Grades', async ({ page }) => {
  28 |     await page.click('button:has-text("Academics & Grades")');
  29 |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  30 |     await expect(page.locator('h1', { hasText: 'Academics' })).toBeVisible();
  31 |     await expect(page.locator('button:has-text("Daily Attendance")')).toBeVisible();
  32 |   });
  33 | 
  34 |   test('should navigate to Staff & Salary', async ({ page }) => {
  35 |     await page.click('button:has-text("Staff & Salary")');
  36 |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  37 |     await expect(page.locator('h1.page-title', { hasText: 'Staff Salary & Attendance' })).toBeVisible();
  38 |   });
  39 | 
  40 |   test('should navigate to School Settings & Governance', async ({ page }) => {
  41 |     await page.click('button:has-text("School Settings & Governance")');
  42 |     await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
  43 |     await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
  44 |     await expect(page.locator('button:has-text("Class & Fee Structure")')).toBeVisible();
  45 |   });
  46 | 
  47 |   test('should navigate back to Dashboard', async ({ page }) => {
  48 |     await page.click('button:has-text("Students Directory")'); // Navigate away first
  49 |     await page.click('button:has-text("Dashboard")');
  50 |     await expect(page.locator('text=Executive overview')).toBeVisible();
  51 |   });
  52 | 
  53 | });
  54 | 
```