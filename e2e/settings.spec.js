import { test, expect } from '@playwright/test';

test.describe('Settings Module', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-owner-login');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("School Settings & Governance")');
    await page.selectOption('select.tour-school-switcher', 'SCH_01');
    await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
  });

  test('should navigate between settings tabs', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Classes Directory' })).toBeVisible();

    await page.locator('button:has-text("Academic Years")').dispatchEvent('click');
    await expect(page.locator('h2', { hasText: 'Manage Academic Years' })).toBeVisible();

    await page.locator('button:has-text("Staff Directory & Permissions")').dispatchEvent('click');
    await expect(page.locator('h2', { hasText: 'Staff & Access Rules' })).toBeVisible();
    
    await page.locator('button:has-text("Class Teacher Assignments")').dispatchEvent('click');
    await expect(page.locator('h2', { hasText: 'Assign Class Teacher' })).toBeVisible();
  });

  test('should open add staff form', async ({ page }) => {
    await page.locator('button:has-text("Staff Directory & Permissions")').dispatchEvent('click');
    await expect(page.locator('h2', { hasText: 'Staff & Access Rules' })).toBeVisible();
    
    await page.locator('button:has-text("Register New Staff Member")').dispatchEvent('click');
    
    // Verify form is visible
    await expect(page.locator('h2', { hasText: 'Register Staff Account' })).toBeVisible();
    
    // Cancel
    await page.locator('button:has-text("Cancel")').dispatchEvent('click');
    await expect(page.locator('h2', { hasText: 'Register Staff Account' })).not.toBeVisible();
  });

});
