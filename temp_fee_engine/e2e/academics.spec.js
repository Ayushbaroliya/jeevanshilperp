import { test, expect } from '@playwright/test';

test.describe('Academics Module', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Owner / Super Admin');
    await page.click('button:has-text("Sign In")');
    await expect(page.locator('text=Group Owner / Super Admin')).toBeVisible();
    await page.click('button:has-text("Academics & Grades")');
    await expect(page.locator('h1', { hasText: 'Academics' })).toBeVisible();
  });

  test('should navigate between academics tabs', async ({ page }) => {
    // Daily Attendance is default
    await expect(page.locator('button:has-text("Mark All Present")')).toBeVisible();

    // Go to Gradebook
    await page.click('button:has-text("Subject Gradebook & Marks")');
    await expect(page.locator('h2', { hasText: 'Gradebook' })).toBeVisible();
    
    // Go back to Attendance
    await page.click('button:has-text("Daily Attendance")');
    await expect(page.locator('button:has-text("Mark All Absent")')).toBeVisible();
  });

  test('should show gradebook inputs', async ({ page }) => {
    await page.click('button:has-text("Subject Gradebook & Marks")');
    
    // Check if Save button appears
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });

});
