import { test, expect } from '@playwright/test';

test.describe('Staff Module', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("Staff & Salary")');
    await expect(page.locator('h1.page-title', { hasText: 'Staff Salary & Attendance' })).toBeVisible();
  });

  test('should navigate between staff tabs', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Today\'s Staff Roster' })).toBeVisible();

    await page.click('button:has-text("Salary Management")');
    await expect(page.locator('button:has-text("Filter by Dept")')).toBeVisible();
    
    await page.click('button:has-text("Process Payroll")');
    await expect(page.locator('h3', { hasText: 'Run Monthly Payroll' })).toBeVisible();
  });

});
