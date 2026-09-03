import { test, expect } from '@playwright/test';

test.describe('Dashboard Role-Based Access Control', () => {

  test('Owner can see full dashboard including payroll and fees', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('#e2e-owner-login');

    // Should route to dashboard by default
    await expect(page.locator('.page-subtitle').filter({ hasText: /Executive overview/i }).first()).toBeVisible({ timeout: 10000 });
    
    // Check for fee chart / pie chart
    await expect(page.locator('text=Group Revenue Comparison').first()).toBeVisible();

    // Check for payroll
    await page.click('button:has-text("Staff & Actions")');
    await expect(page.locator('text=Salary Management')).toBeVisible();
    await expect(page.locator('text=Manage Salaries')).toBeVisible();
  });

  test('Administrator can see operations dashboard but NO payroll', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('#e2e-admin-login');

    await expect(page.locator('.page-title').filter({ hasText: /Operations Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
    
    // Check fee collection
    await expect(page.locator('text=Total Fee Collection')).toBeVisible();
    
    // Administrator should NOT see Payroll on the dashboard
    await expect(page.locator('text=Salary Management')).not.toBeVisible();
    await expect(page.locator('text=Pending Payouts')).not.toBeVisible();
  });

  test('Accountant defaults to Finance dashboard and sees NO payroll', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('#e2e-accountant-login');

    await expect(page.locator('.page-title').filter({ hasText: /Finance Dashboard/i }).first()).toBeVisible({ timeout: 10000 });
    
    await expect(page.locator('text=Total Fee Collection')).toBeVisible();
    await expect(page.locator('h3:has-text("Outstanding Dues")')).toBeVisible();

    // Accountant should NOT see Payroll or Staff Attendance
    await expect(page.locator('text=Salary Management')).not.toBeVisible();
    await expect(page.locator('text=Staff Attendance')).not.toBeVisible();
  });

  test('Teacher defaults to Teacher dashboard and sees NO finance/payroll', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('#e2e-teacher-login');

    await expect(page.locator('h1').filter({ hasText: /Welcome/i }).first()).toBeVisible({ timeout: 10000 });
    
    // Teacher sees specific academic context
    await expect(page.locator('text=Class Attendance')).toBeVisible();
    await expect(page.locator('text=Subject Gradebook')).toBeVisible();

    // Teacher should NOT see Finance or Payroll
    await expect(page.locator('text=Total Fee Collection')).not.toBeVisible();
    await expect(page.locator('text=Salary Management')).not.toBeVisible();
  });

});
