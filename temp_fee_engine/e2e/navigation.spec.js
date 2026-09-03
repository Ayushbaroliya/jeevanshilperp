import { test, expect } from '@playwright/test';

test.describe('Navigation and Sidebar Routing', () => {

  test.beforeEach(async ({ page }) => {
    // Login as Admin before each navigation test
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    // Wait for Dashboard to load
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
  });

  test('should navigate to Students Directory', async ({ page }) => {
    await page.click('button:has-text("Students Directory")');
    // Verify it navigates correctly
    await expect(page.locator('h1.page-title', { hasText: 'Classes Directory' })).toBeVisible();
  });

  test('should navigate to Fees & Finance', async ({ page }) => {
    await page.click('button:has-text("Fees & Finance")');
    await expect(page.locator('h1', { hasText: 'Classwise Due Fees Directory' })).toBeVisible();
    await expect(page.locator('button:has-text("Collect Fee & Cut Receipt")')).toBeVisible();
  });

  test('should navigate to Academics & Grades', async ({ page }) => {
    await page.click('button:has-text("Academics & Grades")');
    await expect(page.locator('h1', { hasText: 'Academics' })).toBeVisible();
    await expect(page.locator('button:has-text("Daily Attendance")')).toBeVisible();
  });

  test('should navigate to Staff & Salary', async ({ page }) => {
    await page.click('button:has-text("Staff & Salary")');
    await expect(page.locator('h1.page-title', { hasText: 'Staff Salary & Attendance' })).toBeVisible();
  });

  test('should navigate to School Settings & Governance', async ({ page }) => {
    await page.click('button:has-text("School Settings & Governance")');
    await expect(page.locator('h1', { hasText: 'School Settings & Governance' })).toBeVisible();
    await expect(page.locator('button:has-text("Class & Fee Structure")')).toBeVisible();
  });

  test('should navigate back to Dashboard', async ({ page }) => {
    await page.click('button:has-text("Students Directory")'); // Navigate away first
    await page.click('button:has-text("Dashboard")');
    await expect(page.locator('text=Executive overview')).toBeVisible();
  });

});
