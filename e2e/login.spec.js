import { test, expect } from '@playwright/test';

test.describe('Authentication and Routing E2E', () => {

  test('should login as Owner successfully', async ({ page }) => {
    await page.goto('/');

    await page.click('#e2e-owner-login');

    // Should redirect to Dashboard
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await expect(page.locator('h1')).toContainText('All 3 Campuses');
  });

  test('should login as Teacher successfully', async ({ page }) => {
    await page.goto('/');

    await page.click('#e2e-teacher-login');

    // Should redirect to Teacher Dashboard
    await expect(page.locator('text=Welcome, Meena Sharma')).toBeVisible();
  });

});
