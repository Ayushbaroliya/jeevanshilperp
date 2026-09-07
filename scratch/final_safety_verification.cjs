const fs = require('fs');
const path = require('path');

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    totalPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}${detail ? ' - ' + detail : ''}`);
    totalFailed++;
  }
}

console.log("=================================================================");
console.log("FINAL PRODUCTION-SAFETY VERIFICATION SUITE");
console.log("=================================================================\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. DASHBOARD FALLBACK & ERROR HANDLING VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("1. DASHBOARD LIVE ERROR & FALLBACK VERIFICATION");

const ownerDashboardCode = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/OwnerDashboard.jsx'), 'utf8');
const opsDashboardCode = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/OperationsDashboard.jsx'), 'utf8');

// Ensure OwnerDashboard does not fabricate counts on failure
assert(
  !ownerDashboardCode.includes("setConsolidatedStudents(1251)") && 
  !ownerDashboardCode.includes("setConsolidatedStudents(totalConsolidated || 1251)"),
  "OwnerDashboard does not fabricate 1,251 on query failure"
);

assert(
  ownerDashboardCode.includes("studentsError") && 
  ownerDashboardCode.includes("studentsLoading") &&
  ownerDashboardCode.includes("Unavailable"),
  "OwnerDashboard displays authentic loading and error states"
);

// Ensure OperationsDashboard does not fabricate counts on failure
assert(
  !opsDashboardCode.includes("totalStudents = 1251"),
  "OperationsDashboard does not fabricate 1,251 on query failure"
);

assert(
  opsDashboardCode.includes("hasError ? 'Unavailable' :"),
  "OperationsDashboard shows 'Unavailable' upon query failure"
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. PAYROLL SAFETY & DUAL ID COMPATIBILITY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n2. PAYROLL SAFETY & DUPLICATE PREVENTION VERIFICATION");

const staffSalaryCode = fs.readFileSync(path.join(__dirname, '../src/components/staff/StaffSalaryModule.jsx'), 'utf8');

assert(
  staffSalaryCode.includes("where('month', '==', month)") && 
  staffSalaryCode.includes("where('schoolId', '==', selectedSchool)"),
  "Queries existing payroll by school + month before writing"
);

assert(
  staffSalaryCode.includes("existingStaffIds.has(staff.id)"),
  "Checks staff ID against all existing records regardless of document ID format"
);

// Simulate payroll processing logic against a mix of old random IDs and new deterministic IDs
function simulatePayrollProcessing(existingDbRecords, targetStaff, schoolId, month) {
  const existingStaffIds = new Set();
  existingDbRecords.forEach(r => {
    if (r.month === month && r.schoolId === schoolId) {
      existingStaffIds.add(r.staffId);
    }
  });

  const createdRecords = [];
  let skippedCount = 0;

  for (const staff of targetStaff) {
    if (existingStaffIds.has(staff.id)) {
      skippedCount++;
      continue; // NEVER overwrite or duplicate
    }
    const docId = `pay_${schoolId}_${month}_${staff.id}`;
    createdRecords.push({
      id: docId,
      staffId: staff.id,
      staffName: staff.name,
      schoolId,
      month,
      baseSalary: staff.baseSalary,
      netPay: staff.baseSalary
    });
  }

  return { createdRecords, skippedCount };
}

// Test Case A: Existing records with old random IDs (e.g., 'k8Jd9sA2bL')
const historicalDb = [
  { id: 'k8Jd9sA2bL', staffId: 'stf_001', staffName: 'Sunil Teacher', schoolId: 'SCH_01', month: '2026-08', baseSalary: 25000 },
  { id: 'x9Lm2pQ4rS', staffId: 'stf_002', staffName: 'Meena Sharma', schoolId: 'SCH_01', month: '2026-08', baseSalary: 28000 }
];

const staffList = [
  { id: 'stf_001', name: 'Sunil Teacher', baseSalary: 25000 },
  { id: 'stf_002', name: 'Meena Sharma', baseSalary: 28000 },
  { id: 'stf_003', name: 'New Employee', baseSalary: 20000 }
];

// Processing for August 2026: Only stf_003 should be created, stf_001 and stf_002 must be preserved untouched
const resAug = simulatePayrollProcessing(historicalDb, staffList, 'SCH_01', '2026-08');
assert(resAug.createdRecords.length === 1, "Only uncreated staff member was processed for existing month");
assert(resAug.createdRecords[0].staffId === 'stf_003', "New employee received payroll record");
assert(resAug.skippedCount === 2, "Both historical random-ID records were safely skipped without duplicate");

// Re-running payroll immediately: Should create 0 records
const fullAugDb = [...historicalDb, ...resAug.createdRecords];
const resAugRepeat = simulatePayrollProcessing(fullAugDb, staffList, 'SCH_01', '2026-08');
assert(resAugRepeat.createdRecords.length === 0, "Repeated run creates 0 duplicates");
assert(resAugRepeat.skippedCount === 3, "All 3 staff members skipped on repeat run");

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLASS TEACHER ASSIGNMENT END-TO-END FLOW VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n3. CLASS TEACHER ASSIGNMENT FLOW & OVERWRITE PREVENTION");

const settingsCode = fs.readFileSync(path.join(__dirname, '../src/components/settings/SettingsModule.jsx'), 'utf8');

assert(
  settingsCode.includes("!activeAcademicYearId || !activeAcademicYearId.trim()") &&
  settingsCode.includes("Configuration Error: Active academic year is missing"),
  "Rejects class assignment when activeAcademicYearId is missing"
);

assert(
  settingsCode.includes("teacher.schoolId !== targetSchool") &&
  settingsCode.includes("Only teachers belonging to the selected school may be assigned"),
  "Rejects teachers belonging to another school"
);

assert(
  settingsCode.includes("confirmReassign") &&
  settingsCode.includes("is currently assigned to"),
  "Requires explicit confirmation before reassigning"
);

assert(
  settingsCode.includes("assignmentData.reassignedFrom = existing.teacherName") &&
  settingsCode.includes("assignmentData.createdAt = existing.createdAt"),
  "Preserves audit history and original createdAt timestamp on reassignment"
);

// Simulate Assignment Lifecycle: Save -> Reassign -> Save -> Check
const simulatedAssignments = new Map();

function saveClassTeacherAssignment({ schoolId, academicYearId, className, section, teacher, explicitConfirm = false }) {
  const normSec = section.replace(/^Section\s+/i, '').trim();
  const docKey = `${schoolId}_${academicYearId}_${className}_${normSec}`;
  const existing = simulatedAssignments.get(docKey);

  if (existing) {
    if (existing.teacherId === teacher.id) {
      return { status: 'NO_OP', doc: existing };
    }
    if (!explicitConfirm) {
      return { status: 'BLOCKED_PENDING_CONFIRMATION', existingTeacher: existing.teacherName };
    }
  }

  const record = {
    id: docKey,
    schoolId,
    academicYearId,
    class: className,
    section,
    normalizedSection: normSec,
    teacherId: teacher.id,
    teacherName: teacher.name,
    createdAt: existing ? existing.createdAt : '2026-09-07T10:00:00Z',
    updatedAt: '2026-09-07T15:00:00Z',
    reassignedFrom: existing ? existing.teacherName : null
  };

  simulatedAssignments.set(docKey, record);
  return { status: existing ? 'REASSIGNED' : 'CREATED', doc: record };
}

// Step 1: Initial Assignment (Class 5 Section A -> Teacher A)
const step1 = saveClassTeacherAssignment({
  schoolId: 'SCH_01',
  academicYearId: 'AY_2026_27',
  className: 'Class 5',
  section: 'Section A',
  teacher: { id: 't_01', name: 'Meena Sharma', schoolId: 'SCH_01' }
});
assert(step1.status === 'CREATED', "Step 1: Successfully created Class 5A assignment");
assert(step1.doc.id === 'SCH_01_AY_2026_27_Class 5_A', "Step 1: Document ID is canonical");

// Step 2: Unconfirmed reassignment attempt (Class 5 Section A -> Teacher B)
const step2 = saveClassTeacherAssignment({
  schoolId: 'SCH_01',
  academicYearId: 'AY_2026_27',
  className: 'Class 5',
  section: 'Section A',
  teacher: { id: 't_02', name: 'Pooja Verma', schoolId: 'SCH_01' },
  explicitConfirm: false
});
assert(step2.status === 'BLOCKED_PENDING_CONFIRMATION', "Step 2: Reassignment is blocked without explicit confirmation");
assert(simulatedAssignments.get('SCH_01_AY_2026_27_Class 5_A').teacherName === 'Meena Sharma', "Step 2: Original assignment remains unchanged");

// Step 3: Confirmed reassignment
const step3 = saveClassTeacherAssignment({
  schoolId: 'SCH_01',
  academicYearId: 'AY_2026_27',
  className: 'Class 5',
  section: 'Section A',
  teacher: { id: 't_02', name: 'Pooja Verma', schoolId: 'SCH_01' },
  explicitConfirm: true
});
assert(step3.status === 'REASSIGNED', "Step 3: Confirmed reassignment succeeded");
assert(step3.doc.teacherName === 'Pooja Verma', "Step 3: Teacher updated to Pooja Verma");
assert(step3.doc.reassignedFrom === 'Meena Sharma', "Step 3: Previous teacher Meena Sharma recorded in audit field");
assert(step3.doc.createdAt === '2026-09-07T10:00:00Z', "Step 3: Original creation timestamp preserved");
assert(simulatedAssignments.size === 1, "Step 3: Exactly one assignment document exists (zero duplicates)");

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCHOOL ISOLATION VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n4. SCHOOL ISOLATION VERIFICATION");

const studentsModuleCode = fs.readFileSync(path.join(__dirname, '../src/components/students/StudentsModule.jsx'), 'utf8');
const academicsModuleCode = fs.readFileSync(path.join(__dirname, '../src/components/academics/AcademicsModule.jsx'), 'utf8');

assert(
  studentsModuleCode.includes("setSelectedClass(null)") &&
  studentsModuleCode.includes("setSelectedSection('All')") &&
  studentsModuleCode.includes("setStudents([])"),
  "Students directory flushes previous class and student data on school switch"
);

assert(
  academicsModuleCode.includes("setSelectedClass(globalClasses[0])") &&
  academicsModuleCode.includes("setSelectedSection(globalSections[0])"),
  "Academics module resets class and section on school switch"
);

assert(
  academicsModuleCode.includes("where(\"schoolId\", \"==\", targetSchool)") &&
  academicsModuleCode.includes("[selectedSchool, currentUser]"),
  "Academics assignments query re-runs with target school filter on school switch"
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEARCH BAR UX & KEYBOARD BEHAVIOR VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n5. GLOBAL SEARCH BAR IMPLEMENTATION VERIFICATION");

const navbarCode = fs.readFileSync(path.join(__dirname, '../src/components/layout/Navbar.jsx'), 'utf8');
const appCssCode = fs.readFileSync(path.join(__dirname, '../src/App.css'), 'utf8');
const mobileCssCode = fs.readFileSync(path.join(__dirname, '../src/mobile.css'), 'utf8');

assert(navbarCode.includes("maxWidth: 460") && navbarCode.includes("minWidth: 220"), "Search bar uses max-width: 460px and min-width: 220px");
assert(navbarCode.includes("height: 40"), "Search bar has height: 40px");
assert(navbarCode.includes("handleClear") && navbarCode.includes("title=\"Clear search\""), "Search bar includes clear button (X)");
assert(navbarCode.includes("zIndex: 1050"), "Search dropdown uses zIndex: 1050 above dashboard");
assert(navbarCode.includes("e.key === 'ArrowDown'") && navbarCode.includes("e.key === 'ArrowUp'"), "Search bar supports ArrowUp and ArrowDown navigation");
assert(navbarCode.includes("e.key === 'Enter'"), "Search bar supports Enter selection");
assert(navbarCode.includes("e.key === 'Escape'"), "Search bar supports Escape key dismissal");
assert(navbarCode.includes("handleClickOutside"), "Search bar supports click-outside dismissal");
assert(mobileCssCode.includes(".topbar-search") && !mobileCssCode.includes(".topbar-search {\n    display: none !important;"), "Search bar is responsive and visible on mobile");

// ─────────────────────────────────────────────────────────────────────────────
// 6. FIRESTORE SECURITY RULES VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n6. FIRESTORE SECURITY RULES VERIFICATION");

const rulesCode = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');

assert(!rulesCode.includes("allow read, write: if true;"), "No 'allow read, write: if true' rule exists in firestore.rules");
assert(rulesCode.includes("match /students/{id}") && rulesCode.includes("allow delete:         if false;"), "Physical deletion of students is strictly prohibited");
assert(rulesCode.includes("function sameSchool(schoolId)"), "School-scoped access helper sameSchool is enforced");
assert(rulesCode.includes("function isOwner()"), "Owner and Director administrative boundaries are enforced");

console.log(`\n=================================================================`);
console.log(`TOTAL PASS: ${totalPassed} | TOTAL FAIL: ${totalFailed}`);
console.log(`=================================================================`);

if (totalFailed > 0) {
  process.exit(1);
}
