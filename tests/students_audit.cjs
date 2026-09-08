const assert = require('assert');

// Mock in-memory database simulation for student identity and enrollment architecture
class MockStudentDB {
  constructor() {
    this.students = new Map();
    this.enrollments = new Map();
    this.ledger = new Map();
  }

  // 1. Create Permanent Student Identity
  createStudent(studentData) {
    const studentId = `STU_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const record = {
      id: studentId,
      name: studentData.name,
      contact: studentData.contact || '',
      schoolId: studentData.schoolId,
      createdAt: new Date().toISOString()
    };
    this.students.set(studentId, record);
    return record;
  }

  // 2. Create Yearly Enrollment with 5-field Roll Number Uniqueness Guard
  createEnrollment(enrollData) {
    const { studentId, schoolId, academicYearId, className, section, roll } = enrollData;
    
    // Check 5-field uniqueness: schoolId + academicYearId + class + section + roll
    for (const [, enc] of this.enrollments) {
      if (
        enc.schoolId === schoolId &&
        enc.academicYearId === academicYearId &&
        enc.class === className &&
        enc.section === section &&
        enc.roll === String(roll) &&
        enc.status !== 'Withdrawn'
      ) {
        throw new Error(`Roll number "${roll}" already assigned in ${className} (${section}) for ${academicYearId}`);
      }
    }

    const enrollmentId = `ENR_${academicYearId}_${studentId}`;
    const enrollment = {
      id: enrollmentId,
      studentId,
      schoolId,
      academicYearId,
      class: className,
      section,
      roll: String(roll),
      status: 'Active',
      createdAt: new Date().toISOString()
    };
    this.enrollments.set(enrollmentId, enrollment);
    return enrollment;
  }

  // Update Enrollment Status (e.g. Promoted, Repeated, Left)
  updateEnrollmentStatus(enrollmentId, status) {
    const enc = this.enrollments.get(enrollmentId);
    if (!enc) throw new Error('Enrollment not found');
    enc.status = status;
    enc.updatedAt = new Date().toISOString();
    return enc;
  }

  softDeleteStudent(studentId, user) {
    const s = this.students.get(studentId);
    if (!s) throw new Error('Student not found');
    s.status = 'Deleted';
    s.isDeleted = true;
    s.deletedAt = new Date().toISOString();
    s.deletedBy = user?.name || user?.email || 'Admin';
    return s;
  }

  restoreStudent(studentId, user) {
    const s = this.students.get(studentId);
    if (!s) throw new Error('Student not found');
    s.status = 'Active';
    s.isDeleted = false;
    s.restoredAt = new Date().toISOString();
    s.restoredBy = user?.name || user?.email || 'Admin';
    return s;
  }

  permanentDeleteStudent(studentId, user) {
    if (user?.role !== 'Owner' && user?.role !== 'Director' && user?.role !== 'Administrator') {
      throw new Error('Unauthorized: Only Owner or Administrator can permanently delete');
    }
    const s = this.students.get(studentId);
    if (!s) throw new Error('Student not found');
    this.students.delete(studentId);
    return true;
  }

  getActiveStudents(schoolId) {
    return Array.from(this.students.values()).filter(s => 
      (!schoolId || s.schoolId === schoolId) &&
      s.status !== 'Deleted' &&
      s.status !== 'archived' &&
      !s.isDeleted
    );
  }

  getDeletedStudents(schoolId) {
    return Array.from(this.students.values()).filter(s =>
      (!schoolId || s.schoolId === schoolId) &&
      (s.status === 'Deleted' || s.isDeleted === true)
    );
  }

  executeSessionRollover({ schoolId, sourceYear, targetYear, decisions, user }) {
    const isOwner = user?.role === 'Owner' || user?.role === 'Director' || user?.email === 'jeevanshilporg@gmail.com';
    if (!isOwner) {
      throw new Error('Unauthorized: Only Group Owner or Director can execute year-end session rollover');
    }

    const results = { promoted: 0, repeated: 0, supplementary: 0, left: 0 };

    for (const [studentId, dec] of Object.entries(decisions)) {
      const student = this.students.get(studentId);
      if (!student) continue;

      const action = dec.action || 'PROMOTED';
      const enrollmentId = `${schoolId}_${targetYear}_${studentId}`;

      if (action === 'LEFT') {
        student.status = 'Left';
        results.left++;
      } else {
        const statusLabel = action === 'PROMOTED' ? 'Active' : action === 'REPEATED' ? 'Repeated' : 'Supplementary';
        const targetClass = dec.targetClass || student.class;
        const targetSection = dec.targetSection || student.section || 'Section A';
        const targetRoll = String(dec.targetRoll || student.roll || '');

        // Idempotent write: sets or updates without duplicating
        this.enrollments.set(enrollmentId, {
          id: enrollmentId,
          studentId: student.id,
          schoolId,
          academicYearId: targetYear,
          class: targetClass,
          section: targetSection,
          roll: targetRoll,
          status: statusLabel,
          promotedFromClass: student.class,
          promotedFromYear: sourceYear,
          updatedAt: new Date().toISOString()
        });

        student.class = targetClass;
        student.section = targetSection;
        student.roll = targetRoll;
        student.academicYear = targetYear;
        student.status = 'Active';

        if (action === 'PROMOTED') results.promoted++;
        else if (action === 'REPEATED') results.repeated++;
        else if (action === 'SUPPLEMENTARY') results.supplementary++;
      }
    }

    return results;
  }
}

function runStudentsAudit() {
  console.log("=== MODULE 2 — STUDENTS & YEARLY ENROLLMENT AUDIT ===");
  const db = new MockStudentDB();

  // Scenario 1: Permanent Identity & 2025-26 Enrollment
  const stuA = db.createStudent({ name: 'Student A', schoolId: 'SCH_01' });
  const enrA_2025 = db.createEnrollment({
    studentId: stuA.id,
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    className: 'Class 5',
    section: 'Section A',
    roll: 12
  });

  assert.strictEqual(enrA_2025.status, 'Active');
  assert.strictEqual(enrA_2025.roll, '12');
  console.log("✅ 1. Student A registered in Class 5A (Roll 12) for 2025-26");

  // Scenario 2: Roll-Number Collision in same academic year
  let collisionError = null;
  try {
    const stuTest = db.createStudent({ name: 'Duplicate Candidate', schoolId: 'SCH_01' });
    db.createEnrollment({
      studentId: stuTest.id,
      schoolId: 'SCH_01',
      academicYearId: 'AY_2025_26',
      className: 'Class 5',
      section: 'Section A',
      roll: 12
    });
  } catch (err) {
    collisionError = err.message;
  }
  assert.ok(collisionError && collisionError.includes('already assigned'));
  console.log("✅ 2. Duplicate roll number in same academic year strictly blocked");

  // Scenario 3: Student A leaves mid-year
  db.updateEnrollmentStatus(enrA_2025.id, 'Left');
  assert.strictEqual(db.enrollments.get(enrA_2025.id).status, 'Left');
  console.log("✅ 3. Student A marked as Left mid-year (historical 2025-26 record preserved)");

  // Scenario 4: Student B joins 2025-26
  const stuB = db.createStudent({ name: 'Student B', schoolId: 'SCH_01' });
  const enrB_2025 = db.createEnrollment({
    studentId: stuB.id,
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    className: 'Class 5',
    section: 'Section A',
    roll: 13
  });
  assert.strictEqual(enrB_2025.roll, '13');
  console.log("✅ 4. Student B joined 2025-26 as Roll 13");

  // Scenario 5: 2026-27 Session Lifecycle
  // Student A has NO new enrollment for 2026-27
  const enrollments2026 = [];
  
  // Student B is Promoted to Class 6A for 2026-27
  const enrB_2026 = db.createEnrollment({
    studentId: stuB.id,
    schoolId: 'SCH_01',
    academicYearId: 'AY_2026_27',
    className: 'Class 6',
    section: 'Section A',
    roll: 1
  });
  enrollments2026.push(enrB_2026);

  // Student C joins as Failed/Repeated in Class 5A for 2026-27 with Roll 1 (allowed because new academic year)
  const stuC = db.createStudent({ name: 'Student C', schoolId: 'SCH_01' });
  const enrC_2026 = db.createEnrollment({
    studentId: stuC.id,
    schoolId: 'SCH_01',
    academicYearId: 'AY_2026_27',
    className: 'Class 5',
    section: 'Section A',
    roll: 1
  });
  enrollments2026.push(enrC_2026);

  console.log("✅ 5. 2026-27 Enrollments created (Student B promoted, Student C repeated)");

  // Scenario 6: Historical Audit & Roll Number Cross-Year Isolation
  // Assert Student A has zero 2026-27 enrollments
  const stuA_2026 = Array.from(db.enrollments.values()).find(e => e.studentId === stuA.id && e.academicYearId === 'AY_2026_27');
  assert.strictEqual(stuA_2026, undefined);

  // Assert historical 2025-26 records are completely intact
  assert.strictEqual(db.enrollments.get(enrA_2025.id).status, 'Left');
  assert.strictEqual(db.enrollments.get(enrB_2025.id).class, 'Class 5');
  assert.strictEqual(db.enrollments.get(enrB_2025.id).roll, '13');

  console.log("✅ 6. Historical 2025-26 enrollments completely untouched and preserved");

  // Scenario 7: Soft Delete Student
  // Soft delete Student B
  db.ledger.set(`LED_${stuB.id}`, { studentId: stuB.id, amount: 5000, type: 'credit' });
  db.softDeleteStudent(stuB.id, { name: 'Principal Jane', role: 'Principal' });

  // Assert Student B is marked deleted with metadata
  const deletedStuB = db.students.get(stuB.id);
  assert.strictEqual(deletedStuB.status, 'Deleted');
  assert.strictEqual(deletedStuB.isDeleted, true);
  assert.strictEqual(deletedStuB.deletedBy, 'Principal Jane');
  assert.ok(deletedStuB.deletedAt);

  // Assert Student B immediately disappears from active students list
  const activeStudentsAfterSoftDelete = db.getActiveStudents('SCH_01');
  assert.ok(!activeStudentsAfterSoftDelete.some(s => s.id === stuB.id));

  // Assert Student B appears in Deleted Students (Recycle Bin)
  const deletedStudentsList = db.getDeletedStudents('SCH_01');
  assert.ok(deletedStudentsList.some(s => s.id === stuB.id));

  // Assert historical fee/ledger records remain untouched
  assert.strictEqual(db.ledger.get(`LED_${stuB.id}`).amount, 5000);
  console.log("✅ 7. Soft delete hides student from active lists, preserves historical records & adds to Recycle Bin");

  // Scenario 8: Restore Student from Recycle Bin
  db.restoreStudent(stuB.id, { name: 'Admin John', role: 'Administrator' });
  const restoredStuB = db.students.get(stuB.id);
  assert.strictEqual(restoredStuB.status, 'Active');
  assert.strictEqual(restoredStuB.isDeleted, false);
  assert.strictEqual(restoredStuB.restoredBy, 'Admin John');
  assert.ok(restoredStuB.restoredAt);

  // Student B is back in active list and gone from recycle bin
  assert.ok(db.getActiveStudents('SCH_01').some(s => s.id === stuB.id));
  assert.ok(!db.getDeletedStudents('SCH_01').some(s => s.id === stuB.id));
  console.log("✅ 8. Restore recovers student from Recycle Bin to active records");

  // Scenario 9: Permanent Deletion (Role Guarded & Preserves Historical Data)
  // Soft-delete Student C
  db.ledger.set(`LED_${stuC.id}`, { studentId: stuC.id, amount: 3500, type: 'credit' });
  db.softDeleteStudent(stuC.id, { name: 'Admin John', role: 'Administrator' });

  // Unauthorized role (Teacher) attempting permanent delete must be rejected
  let unauthorizedError = null;
  try {
    db.permanentDeleteStudent(stuC.id, { name: 'Teacher Dave', role: 'Teacher' });
  } catch (err) {
    unauthorizedError = err;
  }
  assert.ok(unauthorizedError !== null);
  assert.ok(unauthorizedError.message.includes('Unauthorized'));

  // Authorized Admin permanently deletes Student C
  const permDeleteSuccess = db.permanentDeleteStudent(stuC.id, { name: 'Admin John', role: 'Administrator' });
  assert.strictEqual(permDeleteSuccess, true);
  assert.strictEqual(db.students.has(stuC.id), false);

  // Student B and other students are completely unaffected
  assert.strictEqual(db.students.has(stuB.id), true);

  // Historical ledger records for Student C remain untouched
  assert.strictEqual(db.ledger.get(`LED_${stuC.id}`).amount, 3500);
  console.log("✅ 9. Permanent deletion strictly role-guarded (Admin/Owner only), removes document, preserves historical ledger");

  // Scenario 10: Year-End Rollover Owner-Only Authorization Guard
  const stuP1 = db.createStudent({ name: 'Promo Student 1', schoolId: 'SCH_01', class: 'Class 4', roll: '101' });
  const stuP2 = db.createStudent({ name: 'Promo Student 2', schoolId: 'SCH_01', class: 'Class 4', roll: '102' });
  const stuP3 = db.createStudent({ name: 'Promo Student 3', schoolId: 'SCH_01', class: 'Class 4', roll: '103' });
  const stuP4 = db.createStudent({ name: 'Promo Student 4', schoolId: 'SCH_01', class: 'Class 4', roll: '104' });

  // Baseline 2025-26 enrollments
  db.createEnrollment({ studentId: stuP1.id, schoolId: 'SCH_01', academicYearId: 'AY_2025_26', className: 'Class 4', section: 'Section A', roll: '101' });
  db.createEnrollment({ studentId: stuP2.id, schoolId: 'SCH_01', academicYearId: 'AY_2025_26', className: 'Class 4', section: 'Section A', roll: '102' });
  db.createEnrollment({ studentId: stuP3.id, schoolId: 'SCH_01', academicYearId: 'AY_2025_26', className: 'Class 4', section: 'Section A', roll: '103' });
  db.createEnrollment({ studentId: stuP4.id, schoolId: 'SCH_01', academicYearId: 'AY_2025_26', className: 'Class 4', section: 'Section A', roll: '104' });

  // Non-owner (Principal or Teacher) must be blocked
  let rolloverAuthError = null;
  try {
    db.executeSessionRollover({
      schoolId: 'SCH_01',
      sourceYear: 'AY_2025_26',
      targetYear: 'AY_2026_27',
      decisions: { [stuP1.id]: { action: 'PROMOTED', targetClass: 'Class 5' } },
      user: { name: 'Principal Jane', role: 'Principal' }
    });
  } catch (err) {
    rolloverAuthError = err;
  }
  assert.ok(rolloverAuthError !== null);
  assert.ok(rolloverAuthError.message.includes('Unauthorized'));
  console.log("✅ 10. Year-End session rollover strictly guarded for Group Owner only");

  // Scenario 11: Bulk Promotion Decision Matrix (Promoted, Repeated, Supplementary, Left)
  const rolloverDecisions = {
    [stuP1.id]: { action: 'PROMOTED', targetClass: 'Class 5', targetSection: 'Section A', targetRoll: '201' },
    [stuP2.id]: { action: 'REPEATED', targetClass: 'Class 4', targetSection: 'Section B', targetRoll: '202' },
    [stuP3.id]: { action: 'SUPPLEMENTARY', targetClass: 'Class 4', targetSection: 'Section A', targetRoll: '203' },
    [stuP4.id]: { action: 'LEFT' }
  };

  const rolloverResults = db.executeSessionRollover({
    schoolId: 'SCH_01',
    sourceYear: 'AY_2025_26',
    targetYear: 'AY_2026_27',
    decisions: rolloverDecisions,
    user: { name: 'Super Owner', role: 'Owner', email: 'jeevanshilporg@gmail.com' }
  });

  assert.strictEqual(rolloverResults.promoted, 1);
  assert.strictEqual(rolloverResults.repeated, 1);
  assert.strictEqual(rolloverResults.supplementary, 1);
  assert.strictEqual(rolloverResults.left, 1);

  // Verify stuP1 promoted to Class 5 in target year
  const enrP1 = db.enrollments.get(`SCH_01_AY_2026_27_${stuP1.id}`);
  assert.strictEqual(enrP1.class, 'Class 5');
  assert.strictEqual(enrP1.status, 'Active');
  assert.strictEqual(db.students.get(stuP1.id).class, 'Class 5');

  // Verify stuP2 repeated in Class 4 in target year
  const enrP2 = db.enrollments.get(`SCH_01_AY_2026_27_${stuP2.id}`);
  assert.strictEqual(enrP2.class, 'Class 4');
  assert.strictEqual(enrP2.status, 'Repeated');
  assert.strictEqual(db.students.get(stuP2.id).class, 'Class 4');

  // Verify stuP3 supplementary in Class 4 in target year
  const enrP3 = db.enrollments.get(`SCH_01_AY_2026_27_${stuP3.id}`);
  assert.strictEqual(enrP3.class, 'Class 4');
  assert.strictEqual(enrP3.status, 'Supplementary');

  // Verify stuP4 marked Left with no active target year enrollment
  assert.strictEqual(db.students.get(stuP4.id).status, 'Left');
  assert.strictEqual(db.enrollments.has(`SCH_01_AY_2026_27_${stuP4.id}`), false);

  // Verify historical 2025-26 enrollments are completely intact and untouched
  const histEnrP1 = Array.from(db.enrollments.values()).find(e => e.studentId === stuP1.id && e.academicYearId === 'AY_2025_26');
  assert.strictEqual(histEnrP1.class, 'Class 4');
  assert.strictEqual(histEnrP1.roll, '101');

  const histEnrP4 = Array.from(db.enrollments.values()).find(e => e.studentId === stuP4.id && e.academicYearId === 'AY_2025_26');
  assert.strictEqual(histEnrP4.class, 'Class 4');
  assert.ok(histEnrP4 !== undefined);

  console.log("✅ 11. Rollover accurately handles Promoted, Repeated, Supplementary, Left, and preserves historical enrollments");

  // Scenario 12: Idempotent Execution (Running rollover twice never creates duplicate records)
  const initialEnrollmentCount = db.enrollments.size;
  
  // Re-run exact same rollover
  db.executeSessionRollover({
    schoolId: 'SCH_01',
    sourceYear: 'AY_2025_26',
    targetYear: 'AY_2026_27',
    decisions: rolloverDecisions,
    user: { name: 'Super Owner', role: 'Owner' }
  });

  // Count of total enrollments in database must be exactly the same (no duplicate records created!)
  assert.strictEqual(db.enrollments.size, initialEnrollmentCount);
  console.log("✅ 12. Rollover is strictly idempotent — re-running never creates duplicate records");

  console.log("\n=== ALL MODULE 2 REGRESSION TESTS PASSED (12/12) ===");
}

runStudentsAudit();
