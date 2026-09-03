import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  initializeApp({ projectId: 'jeevanshilporg-51db8' });
}

test.describe.configure({ mode: 'serial' });

test.describe('Staff & Payroll Module E2E', () => {

  test.beforeEach(async () => {
    // 1. Wipe Emulators
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
    await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
    
    // 2. Seed Users
    const auth = getAuth();
    const db = getFirestore();
    
    const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
    await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'Group Owner / Super Admin' });
    
    const admin = await auth.createUser({ uid: 'admin123', email: 'admin@test.local', password: 'password' });
    await db.collection('users').doc(admin.uid).set({ role: 'Administrator', name: 'Admin', schoolId: 'SCH_01' });

    // 3. Seed Config
    await db.collection('school_settings').doc('schools').set({
      list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
    });

    // 4. Seed Staff
    await db.collection('staff').doc('staff123').set({
      uid: 'staff123',
      name: 'Rohan Sharma',
      role: 'Teacher',
      schoolId: 'SCH_01',
      status: 'Active',
      isActive: true
    });
    // Staff salary is private
    await db.collection('staff_salary').doc('staff123').set({
      baseSalary: 60000,
      schoolId: 'SCH_01'
    });
  });

  test('Owner can access payroll, mark attendance, and generate payroll', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', 'owner@test.local');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Staff & Salary')).toBeVisible();
    await page.click('text=Staff & Salary');
    
    await expect(page.locator('text=Consolidated HR View Active')).toBeVisible();
    
    // Select branch
    await page.click('text=Jeevan Shilp Public School');
    
    // Mark Attendance
    await expect(page.locator('text=Rohan Sharma')).toBeVisible();
    await page.selectOption('select', { label: 'Absent' });
    await page.click('button:has-text("Save All Attendance")');
    await expect(page.locator('text=Staff attendance saved successfully.')).toBeVisible();

    // Go to Salaries tab
    await page.click('text=Salary Management');
    await expect(page.locator('td', { hasText: '₹ 60,000' })).toBeVisible();
    
    // Go to Process Payroll
    await page.click('text=Process Payroll');
    await expect(page.locator('text=1 Days')).toBeVisible(); // 1 absent day
    await page.click('button:has-text("Confirm & Pay All")');
    
    await expect(page.locator('text=Payroll records saved successfully.')).toBeVisible();
  });

  test('Administrator can access attendance but not payroll/salary', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', 'admin@test.local');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Staff & Salary')).toBeVisible();
    await page.click('text=Staff & Salary');
    
    // Can mark attendance
    await expect(page.locator('text=Rohan Sharma')).toBeVisible();
    await expect(page.locator('text=Mark Attendance')).toBeVisible();
    
    // Cannot see salary/payroll tabs
    await expect(page.locator('text=Salary Management')).not.toBeVisible();
    await expect(page.locator('text=Process Payroll')).not.toBeVisible();
  });
});
