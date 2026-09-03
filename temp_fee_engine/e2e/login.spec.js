import { test, expect } from '@playwright/test';

test.describe('Authentication and Routing E2E', () => {

  test('should login as Owner successfully', async ({ page }) => {
    await page.goto('/');

    // Click the Owner portal
    await page.click('text=Owner / Super Admin');

    // Click Sign In (admin/admin is prefilled)
    await page.click('button:has-text("Sign In")');

    // Should redirect to Dashboard
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await expect(page.locator('h1')).toContainText('All 3 Campuses');
  });

  test('should login as Teacher successfully', async ({ page }) => {
    await page.goto('/');

    // Click a school portal
    await page.click('text=Jeevan Shilp Public School');

    // Fill Teacher demo credentials
    await page.fill('input[placeholder="e.g. 9876543210"]', '9999988888');
    await page.fill('input[placeholder="••••••••"]', 'password');
    await page.click('button:has-text("Sign In")');

    // Should redirect to Teacher Dashboard
    await expect(page.locator('text=Welcome, Meena Sharma')).toBeVisible();
  });

});
