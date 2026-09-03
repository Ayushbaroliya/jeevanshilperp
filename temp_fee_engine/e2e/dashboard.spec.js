import { test, expect } from '@playwright/test';

test.describe('Dashboard Interactions', () => {

  test.beforeEach(async ({ page }) => {
    // Login as Admin
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  });

  test('should navigate to Students Directory from quick actions', async ({ page }) => {
    await page.click('button.btn-primary:has-text("Register Student")');
    await expect(page.locator('h1.page-title', { hasText: 'Classes Directory' })).toBeVisible();
  });

  test('should navigate to Finance from collect fee action', async ({ page }) => {
    // Navigate back to dashboard to ensure we are on the right page
    await page.click('button:has-text("Dashboard")');
    await page.click('button.btn-secondary:has-text("Collect Fee")');
    await expect(page.locator('h1', { hasText: 'Classwise Due Fees Directory' })).toBeVisible();
  });

  test('should navigate to Settings from staff permissions action', async ({ page }) => {
    await page.click('button:has-text("Dashboard")');
    await page.click('button.btn-secondary:has-text("Staff & Permissions")');
    await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
  });

  test('should change selected campus data when clicking campus cards', async ({ page }) => {
    // Check initial state (All 3 Combined)
    await expect(page.locator('text=All 3 Schools Combined')).toBeVisible();
    
    // Click on Campus 1
    await page.click('div.glass-card:has-text("Jeevan Shilp Public School")');
    // Verify title changed
    await expect(page.locator('h1.page-title', { hasText: 'Jeevan Shilp Public School' })).toBeVisible();
    
    // Click on Campus 2
    await page.click('div.glass-card:has-text("Jeevan Shilp Inter College")');
    await expect(page.locator('h1.page-title', { hasText: 'Jeevan Shilp Inter College' })).toBeVisible();
  });

});
