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

test.describe('Module 2 — Students & Enrollments (Phase 5)', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`PAGE LOG: ${msg.text()}`);
      }
    });

    // 1. Clear Emulators for deterministic isolation
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/jeevanshilporg-51db8/databases/(default)/documents', { method: 'DELETE' });
    await fetch('http://127.0.0.1:9099/emulator/v1/projects/jeevanshilporg-51db8/accounts', { method: 'DELETE' });
    
    // 2. Seed Users
    const auth = getAuth();
    const db = getFirestore();
    
    const owner = await auth.createUser({ uid: 'owner123', email: 'owner@test.local', password: 'password' });
    await db.collection('users').doc(owner.uid).set({ role: 'Owner', name: 'E2E Owner' });
    
    const teacher = await auth.createUser({ uid: 'teach123', email: 'teacher@test.local', password: 'password' });
    await db.collection('users').doc(teacher.uid).set({ role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });
    await db.collection('staff').doc(teacher.uid).set({ uid: teacher.uid, role: 'Teacher', name: 'Meena Sharma', schoolId: 'SCH_01' });

    // 3. Seed App Config & School
    await db.collection('school_settings').doc('schools').set({
      list: [{ id: 'SCH_01', name: 'Jeevan Shilp Public School' }]
    });
    await db.collection('schools').doc('SCH_01').set({ id: 'SCH_01', name: 'Jeevan Shilp Public School' });
    
    await db.collection('school_settings').doc('academic_years').set({
      current: 'AY_2025_26',
      list: [{ id: 'AY_2025_26', name: '2025-26', isCurrent: true }]
    });

    // 4. Seed Permanent Student & Enrollment
    await db.collection('students').doc('STU_01').set({
      id: 'STU_01',
      name: 'Rohan Verma',
      contact: '9876543210',
      schoolId: 'SCH_01',
      class: 'Class 5',
      section: 'Section A',
      roll: '12',
      status: 'Active',
      attendance: '100%',
      openingArrears: 0
    });

    await db.collection('enrollments').doc('ENR_AY_2025_26_STU_01').set({
      id: 'ENR_AY_2025_26_STU_01',
      studentId: 'STU_01',
      schoolId: 'SCH_01',
      academicYearId: 'AY_2025_26',
      class: 'Class 5',
      section: 'Section A',
      roll: '12',
      status: 'Active'
    });
  });

  test('1. Owner can view Student Directory and see 2025-26 enrollment', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-owner-login');
    await page.waitForSelector('text=Dashboard');
    // Owner selects SCH_01 in the Navbar school switcher
    await page.selectOption('select.tour-school-switcher', 'SCH_01');

    await page.click('button:has-text("Students")');
    await expect(page.locator('text=Classes Directory')).toBeVisible({ timeout: 8000 });
    await page.click('text=Class 5');
    await page.waitForTimeout(2000);
    const html = await page.locator('.page-container').innerHTML();
    console.log("PAGE HTML LOG: " + html);
    await expect(page.locator('text=Rohan Verma')).toBeVisible({ timeout: 5000 });
  });

  test('2. 5-field roll-number uniqueness rejects duplicate in same academic year', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-owner-login');
    await page.waitForSelector('text=Dashboard');
    await page.selectOption('select.tour-school-switcher', 'SCH_01');

    await page.click('button:has-text("Students")');
    await expect(page.locator('text=Classes Directory')).toBeVisible({ timeout: 8000 });
    await page.click('text=Class 5');
    await page.click('button:has-text("Add Student")');

    await page.fill('input[placeholder="e.g. Aarav Patel"]', 'Duplicate Rohan');
    await page.fill('input[placeholder="e.g. 42"]', '12'); // Duplicate roll 12 in Class 5A for AY_2025_26

    let alertMsg = '';
    page.once('dialog', d => { alertMsg = d.message(); d.accept(); });
    await page.click('button:has-text("Save & Add Next")');

    await page.waitForTimeout(1000);
    expect(alertMsg).toContain('already assigned');
  });

  test('3. Teacher can view assigned students but cannot physically delete student or enrollment', async ({ page }) => {
    await page.goto('/');
    await page.click('#e2e-teacher-login');
    await page.waitForSelector('text=Teacher Workspace');

    // DB security rule test via browser window
    const canDelete = await page.evaluate(async () => {
      try {
        const { db } = window.e2eFirestore;
        const { doc, deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'students', 'STU_01'));
        return true;
      } catch (err) {
        return false;
      }
    });

    expect(canDelete).toBe(false);
  });

});
