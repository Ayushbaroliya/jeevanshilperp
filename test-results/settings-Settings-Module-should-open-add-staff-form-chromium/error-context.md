# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.js >> Settings Module >> should open add staff form
- Location: e2e\settings.spec.js:27:3

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
  3  | test.describe('Settings Module', () => {
  4  | 
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await page.goto('/');
> 7  |     await page.click('#e2e-owner-login');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  8  |     await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  9  |     await page.click('button:has-text("School Settings & Governance")');
  10 |     await page.selectOption('select.tour-school-switcher', 'SCH_01');
  11 |     await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
  12 |   });
  13 | 
  14 |   test('should navigate between settings tabs', async ({ page }) => {
  15 |     await expect(page.locator('h2', { hasText: 'Classes Directory' })).toBeVisible();
  16 | 
  17 |     await page.locator('button:has-text("Academic Years")').dispatchEvent('click');
  18 |     await expect(page.locator('h2', { hasText: 'Manage Academic Years' })).toBeVisible();
  19 | 
  20 |     await page.locator('button:has-text("Staff Directory & Permissions")').dispatchEvent('click');
  21 |     await expect(page.locator('h2', { hasText: 'Staff & Access Rules' })).toBeVisible();
  22 |     
  23 |     await page.locator('button:has-text("Class Teacher Assignments")').dispatchEvent('click');
  24 |     await expect(page.locator('h2', { hasText: 'Assign Class Teacher' })).toBeVisible();
  25 |   });
  26 | 
  27 |   test('should open add staff form', async ({ page }) => {
  28 |     await page.locator('button:has-text("Staff Directory & Permissions")').dispatchEvent('click');
  29 |     await expect(page.locator('h2', { hasText: 'Staff & Access Rules' })).toBeVisible();
  30 |     
  31 |     await page.locator('button:has-text("Register New Staff Member")').dispatchEvent('click');
  32 |     
  33 |     // Verify form is visible
  34 |     await expect(page.locator('h2', { hasText: 'Register Staff Account' })).toBeVisible();
  35 |     
  36 |     // Cancel
  37 |     await page.locator('button:has-text("Cancel")').dispatchEvent('click');
  38 |     await expect(page.locator('h2', { hasText: 'Register Staff Account' })).not.toBeVisible();
  39 |   });
  40 | 
  41 | });
  42 | 
```