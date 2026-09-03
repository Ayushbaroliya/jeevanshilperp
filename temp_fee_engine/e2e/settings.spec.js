import { test, expect } from '@playwright/test';

test.describe('Settings Module', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("School Settings & Governance")');
    await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
  });

  test('should navigate between settings tabs', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Classes Directory' })).toBeVisible();

    await page.click('button:has-text("Staff Directory & Permissions")');
    await expect(page.locator('h2', { hasText: 'Staff & Access Rules' })).toBeVisible();
    
    await page.click('button:has-text("Class Teacher Assignments")');
    await expect(page.locator('h2', { hasText: 'Assign Class Teacher' })).toBeVisible();
  });

  test('should open add staff form', async ({ page }) => {
    await page.click('button:has-text("Staff Directory & Permissions")');
    await page.click('button:has-text("Register New Staff Member")');
    
    // Verify form is visible
    await expect(page.locator('h2', { hasText: 'Register Staff Account' })).toBeVisible();
    
    // Cancel
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h2', { hasText: 'Register Staff Account' })).not.toBeVisible();
  });

});
