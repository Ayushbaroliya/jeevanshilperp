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
  console.log("\n=== ALL MODULE 2 REGRESSION TESTS PASSED (6/6) ===");
}

runStudentsAudit();
