const assert = require('assert');

class MockSettingsDB {
  constructor() {
    this.classes = new Set();
    this.sections = new Set();
    this.auditLogs = [];
    this.academicYears = new Map();
    this.schoolSettings = {};
  }

  // Add class with duplicate checking (case insensitive)
  addClass(className, user) {
    const trimmed = className.trim();
    if (!trimmed) throw new Error("Empty class name");
    
    for (let existing of this.classes) {
      if (existing.toLowerCase() === trimmed.toLowerCase()) {
        throw new Error("Class already exists");
      }
    }
    this.classes.add(trimmed);
    this.auditLogGovernance({ userId: user.id, role: user.role, schoolId: user.schoolId, action: 'ADD_CLASS', newValue: trimmed });
  }

  // Add section with duplicate checking
  addSection(sectionName, user) {
    const trimmed = sectionName.trim();
    if (!trimmed) throw new Error("Empty section name");
    
    for (let existing of this.sections) {
      if (existing.toLowerCase() === trimmed.toLowerCase()) {
        throw new Error("Section already exists");
      }
    }
    this.sections.add(trimmed);
    this.auditLogGovernance({ userId: user.id, role: user.role, schoolId: user.schoolId, action: 'ADD_SECTION', newValue: trimmed });
  }

  // Academic year management
  createAcademicYear(id, name, user) {
    if (this.academicYears.has(id)) throw new Error("Academic Year already exists");
    this.academicYears.set(id, { id, name });
    this.auditLogGovernance({ userId: user.id, role: user.role, schoolId: user.schoolId, action: 'CREATE_ACADEMIC_YEAR', newValue: id });
  }

  setActiveAcademicYear(schoolId, yearId, user) {
    if (!this.academicYears.has(yearId)) throw new Error("Academic Year does not exist");
    
    if (!this.schoolSettings[schoolId]) this.schoolSettings[schoolId] = {};
    const oldYear = this.schoolSettings[schoolId].activeAcademicYearId;
    this.schoolSettings[schoolId].activeAcademicYearId = yearId;
    
    this.auditLogGovernance({ userId: user.id, role: user.role, schoolId, action: 'SET_ACTIVE_ACADEMIC_YEAR', oldValue: oldYear, newValue: yearId });
  }

  auditLogGovernance(log) {
    this.auditLogs.push({ ...log, timestamp: new Date() });
  }
}

async function runTests() {
  console.log("Starting Settings & Governance Audit Tests...");
  const db = new MockSettingsDB();
  const adminUser = { id: 'admin1', role: 'Owner', schoolId: 'SCH_01' };

  // 1. Add Class with duplicate check
  db.addClass('Class 1', adminUser);
  assert.ok(db.classes.has('Class 1'), "Class 1 added");
  
  try {
    db.addClass('class 1', adminUser);
    assert.fail("Should throw on duplicate class");
  } catch (err) {
    assert.ok(err.message.includes("already exists"), "Case-insensitive duplicate check works for classes");
  }

  // 2. Add Section with duplicate check
  db.addSection('Section A', adminUser);
  assert.ok(db.sections.has('Section A'), "Section A added");
  
  try {
    db.addSection('section a', adminUser);
    assert.fail("Should throw on duplicate section");
  } catch (err) {
    assert.ok(err.message.includes("already exists"), "Case-insensitive duplicate check works for sections");
  }

  // 3. Academic Year Creation
  db.createAcademicYear('AY_2025_26', '2025-2026', adminUser);
  assert.ok(db.academicYears.has('AY_2025_26'), "Academic year created");
  
  // 4. Set active academic year
  db.setActiveAcademicYear('SCH_01', 'AY_2025_26', adminUser);
  assert.equal(db.schoolSettings['SCH_01'].activeAcademicYearId, 'AY_2025_26', "Active academic year set");

  // 5. Verify audit logs
  assert.equal(db.auditLogs.length, 4, "4 audit logs should be created");
  assert.equal(db.auditLogs[0].action, 'ADD_CLASS');
  assert.equal(db.auditLogs[1].action, 'ADD_SECTION');
  assert.equal(db.auditLogs[2].action, 'CREATE_ACADEMIC_YEAR');
  assert.equal(db.auditLogs[3].action, 'SET_ACTIVE_ACADEMIC_YEAR');
  assert.equal(db.auditLogs[3].newValue, 'AY_2025_26');

  console.log("Settings & Governance business tests PASS");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
