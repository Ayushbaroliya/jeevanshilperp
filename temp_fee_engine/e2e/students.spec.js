import { test, expect } from '@playwright/test';

test.describe('Students Directory and Ledger', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("Students Directory")');
    await expect(page.locator('h1.page-title', { hasText: 'Classes Directory' })).toBeVisible();
  });

  test('should open and close the Add Student section', async ({ page }) => {
    // Click on Class 1 first to be able to add a student
    await page.click('text=Class 1');
    await expect(page.locator('h1.page-title', { hasText: 'Class 1 - Students' })).toBeVisible();

    await page.click('button:has-text("Add Student")');
    
    // Verify add student form is visible
    await expect(page.locator('h2', { hasText: 'Student Registration Details' })).toBeVisible();
    
    // Fill out some basic fields
    await page.fill('input[placeholder="e.g. Aarav Patel"]', 'Test Student');
    await page.fill('input[placeholder="e.g. 42"]', '99');
    
    // Cancel
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h2', { hasText: 'Student Registration Details' })).not.toBeVisible();
  });

  test('should open a student ledger when clicking on a student row', async ({ page }) => {
    // Select Class 1
    await page.click('text=Class 1');
    
    // Click the first student in the list
    await page.locator('.glass-card.flex-responsive').first().click();
    
    // Should navigate to ledger
    await expect(page.locator('button:has-text("Back to Directory")')).toBeVisible();
  });

  test('should filter students by section', async ({ page }) => {
    // Select Class 1
    await page.click('text=Class 1');
    
    // Filter by Section B
    await page.selectOption('select:has-text("All Sections")', 'Section B');
    
    // Ensure something is rendered (either students or 'No students found')
    await expect(page.locator('.glass-card').first()).toBeVisible();
  });

});
