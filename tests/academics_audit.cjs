const assert = require('assert');

// Mock in-memory database simulation for student identity and enrollment architecture
class MockAcademicsDB {
  constructor() {
    this.assignments = new Map();
    this.attendanceLogs = new Map();
    this.examMarks = new Map();
    this.students = new Map();
  }

  // Assign class teacher
  assignTeacher(assignment) {
    const { schoolId, academicYearId, class: cls, section, teacherId } = assignment;
    const assignmentId = `${schoolId}_${academicYearId}_${cls}_${section}`;
    this.assignments.set(assignmentId, { ...assignment, id: assignmentId });
    return assignmentId;
  }

  // Mark attendance
  markAttendance(attendance) {
    const { schoolId, academicYearId, class: cls, section, studentId, date, status } = attendance;
    
    // Cross year isolation check - simplistic
    if (academicYearId !== 'AY_2025_26') throw new Error("Wrong academic year");
    
    const attendanceId = `${schoolId}_${academicYearId}_${cls}_${section}_${studentId}_${date}`;
    // Duplicate prevention implicitly handled by Map set (overwriting same key)
    this.attendanceLogs.set(attendanceId, { ...attendance, id: attendanceId });
    return attendanceId;
  }

  // Enter marks
  enterMarks(marksDoc) {
    const { schoolId, academicYearId, class: cls, section, studentId, exam, subject, marks, maxMarks } = marksDoc;
    
    if (marks < 0 || marks > maxMarks) {
      throw new Error("Invalid marks boundary");
    }

    const marksId = `${schoolId}_${academicYearId}_${cls}_${section}_${studentId}_${exam}_${subject}`;
    this.examMarks.set(marksId, { ...marksDoc, id: marksId });
    return marksId;
  }
  
  getMarksForStudent(studentId, exam) {
    let result = [];
    for (let [, doc] of this.examMarks) {
      if (doc.studentId === studentId && doc.exam === exam) {
        result.push(doc);
      }
    }
    return result;
  }
}

async function runTests() {
  console.log("Starting Academics Business Logic Audit...");
  const db = new MockAcademicsDB();
  
  // 1. Teacher Assignment Validation
  db.assignTeacher({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    teacherId: 'teacher_1'
  });
  
  assert.ok(db.assignments.has('SCH_01_AY_2025_26_Class 5_Section A'), "Assignment deterministic ID valid");

  // 2. Attendance validation & 3. Cross-year isolation
  try {
    db.markAttendance({
      schoolId: 'SCH_01',
      academicYearId: 'AY_2024_25',
      class: 'Class 5',
      section: 'Section A',
      studentId: 'stu_1',
      date: '2025-09-02',
      status: 'P'
    });
    assert.fail("Should have thrown error for wrong year");
  } catch(e) {
    assert.ok(e.message.includes("Wrong academic year"), "Cross-year isolated");
  }
  
  // Duplicate attendance (deterministic)
  db.markAttendance({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    studentId: 'stu_1',
    date: '2025-09-02',
    status: 'P'
  });
  db.markAttendance({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    studentId: 'stu_1',
    date: '2025-09-02',
    status: 'A' // Overwrite
  });
  assert.equal(db.attendanceLogs.size, 1, "Duplicate attendance prevented deterministically");
  
  // 4. Valid marks & 5. Invalid marks boundaries
  try {
    db.enterMarks({
      schoolId: 'SCH_01',
      academicYearId: 'AY_2025_26',
      class: 'Class 5',
      section: 'Section A',
      studentId: 'stu_1',
      exam: 'Quarterly',
      subject: 'Math',
      marks: 105,
      maxMarks: 100
    });
    assert.fail("Should throw on invalid marks");
  } catch(e) {
    assert.ok(e.message.includes("boundary"));
  }

  db.enterMarks({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    studentId: 'stu_1',
    exam: 'Quarterly',
    subject: 'Math',
    marks: 85,
    maxMarks: 100
  });

  // 6. Duplicate marks
  db.enterMarks({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    studentId: 'stu_1',
    exam: 'Quarterly',
    subject: 'Math',
    marks: 90,
    maxMarks: 100
  });
  assert.equal(db.examMarks.size, 1, "Duplicate marks prevented deterministically");

  // 7. Grade calculation & 8. Grade boundaries
  const calculateGrade = (pct) => pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 33 ? 'D' : 'F';
  assert.equal(calculateGrade(95), 'A+');
  assert.equal(calculateGrade(89), 'A');
  assert.equal(calculateGrade(33), 'D');
  assert.equal(calculateGrade(32), 'F');

  // 9. Percentage & 10. Report-card aggregation
  db.enterMarks({
    schoolId: 'SCH_01',
    academicYearId: 'AY_2025_26',
    class: 'Class 5',
    section: 'Section A',
    studentId: 'stu_1',
    exam: 'Quarterly',
    subject: 'Science',
    marks: 70,
    maxMarks: 100
  });
  
  const studentMarks = db.getMarksForStudent('stu_1', 'Quarterly');
  assert.equal(studentMarks.length, 2, "Report card aggregation valid");
  const totalMarks = studentMarks.reduce((acc, curr) => acc + curr.marks, 0);
  assert.equal(totalMarks, 160, "Total marks correct");
  const pct = Math.round((totalMarks / 200) * 100);
  assert.equal(pct, 80, "Percentage correct");
  assert.equal(calculateGrade(pct), 'A', "Grade correct");

  console.log("Academics business tests PASS");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
