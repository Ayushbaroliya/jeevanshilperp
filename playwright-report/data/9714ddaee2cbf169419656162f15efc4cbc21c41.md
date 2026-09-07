# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.js >> Authentication and Routing E2E >> should login as Teacher successfully
- Location: e2e\login.spec.js:15:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#e2e-teacher-login')

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
  3  | test.describe('Authentication and Routing E2E', () => {
  4  | 
  5  |   test('should login as Owner successfully', async ({ page }) => {
  6  |     await page.goto('/');
  7  | 
  8  |     await page.click('#e2e-owner-login');
  9  | 
  10 |     // Should redirect to Dashboard
  11 |     await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  12 |     await expect(page.locator('h1')).toContainText('All 3 Campuses');
  13 |   });
  14 | 
  15 |   test('should login as Teacher successfully', async ({ page }) => {
  16 |     await page.goto('/');
  17 | 
> 18 |     await page.click('#e2e-teacher-login');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  19 | 
  20 |     // Should redirect to Teacher Dashboard
  21 |     await expect(page.locator('text=Welcome, Meena Sharma')).toBeVisible();
  22 |   });
  23 | 
  24 | });
  25 | 
```