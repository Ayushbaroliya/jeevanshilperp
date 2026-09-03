import { test, expect } from '@playwright/test';

test.describe('Finance Module', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("Fees & Finance")');
    await expect(page.locator('h1', { hasText: 'Classwise Due Fees Directory' })).toBeVisible();
  });

  test('should navigate between finance tabs', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Classwise Due Fees Directory' })).toBeVisible();

    await page.click('button:has-text("Collect Fee & Cut Receipt")');
    await expect(page.locator('h2', { hasText: 'Record New Fee Payment' })).toBeVisible();

    await page.click('button:has-text("Issued Receipts History")');
    await expect(page.locator('h2', { hasText: 'Fee Invoices & Receipts' })).toBeVisible();
    
    await page.click('button:has-text("All Pending Fees List")');
    await expect(page.locator('button:has-text("All Pending Fees List")')).toBeVisible();
  });

  test('should open collect fee tab when clicking Collect', async ({ page }) => {
    // Click Collect for the first student in the list
    await page.waitForSelector('button:has-text("Collect")');
    await page.locator('button:has-text("Collect")').first().click();
    
    // Verify it navigated to Record Payment tab
    await expect(page.locator('h2', { hasText: 'Record New Fee Payment' })).toBeVisible();
    await expect(page.locator('button:has-text("Issue Fee Receipt")')).toBeVisible();
  });

});
