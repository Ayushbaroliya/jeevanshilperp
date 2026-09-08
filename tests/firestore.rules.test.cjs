const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { resolve } = require('path');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "jeevanshilporg-51db8",
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("School ERP Phase 4 Security Rules", () => {

  // Test Authentication Profiles
  const profiles = {
    unauthenticated: null,
    noRole: { uid: "norole123", email: "user@test.com" },
    owner: { uid: "owner123", email: "owner@test.com" },
    admin: { uid: "admin123", email: "admin@test.com" },
    accountant: { uid: "acct123", email: "acct@test.com" },
    teacher: { uid: "teacher123", email: "teacher@test.com" }
  };

  const setupProfiles = async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      
      // Owner
      await db.collection("users").doc("owner123").set({ role: "Owner" });
      
      // Admin (Assigned to SCH_01)
      await db.collection("users").doc("admin123").set({ role: "Administrator", schoolId: "SCH_01" });
      await db.collection("staff").doc("admin123").set({ role: "Administrator", schoolId: "SCH_01" });
      
      // Accountant (Assigned to SCH_01)
      await db.collection("users").doc("acct123").set({ role: "Accountant", schoolId: "SCH_01" });
      await db.collection("staff").doc("acct123").set({ role: "Accountant", schoolId: "SCH_01" });
      
      // Teacher (Assigned to SCH_01)
      await db.collection("users").doc("teacher123").set({ role: "Teacher", schoolId: "SCH_01" });
      await db.collection("staff").doc("teacher123").set({ role: "Teacher", schoolId: "SCH_01" });
    });
  };

  beforeEach(setupProfiles);

  describe("OWNER/DIRECTOR", () => {
    it("Can read financial data globally", async () => {
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(db.collection("student_ledger").get());
    });

    it("Can create payments globally", async () => {
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(db.collection("student_ledger").add({
        schoolId: "ANY_SCHOOL", type: "credit", amount: 100, studentId: "s1"
      }));
    });
  });

  describe("ACCOUNTANT", () => {
    it("Can read financial records within their assigned school", async () => {
      const db = testEnv.authenticatedContext("acct123").firestore();
      await assertSucceeds(db.collection("student_ledger").where("schoolId", "==", "SCH_01").get());
    });

    it("Cannot access another school's financial data", async () => {
      const db = testEnv.authenticatedContext("acct123").firestore();
      await assertFails(db.collection("student_ledger").where("schoolId", "==", "SCH_02").get());
    });

    it("Cannot elevate their own role", async () => {
      const db = testEnv.authenticatedContext("acct123").firestore();
      await assertFails(db.collection("users").doc("acct123").update({ role: "Owner" }));
    });
  });

  describe("TEACHER/SENIOR TEACHER", () => {
    it("Cannot read student_ledger", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("student_ledger").where("schoolId", "==", "SCH_01").get());
    });

    it("Cannot create financial transactions", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("student_ledger").add({
        schoolId: "SCH_01", type: "credit", amount: 100, studentId: "s1"
      }));
    });
  });

  describe("SECURITY EDGE CASES", () => {
    it("Unauthenticated user -> denied", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("student_ledger").get());
    });

    it("User changing their client-side role to Owner -> denied", async () => {
      // Trying to write to an invoice claiming they are an Owner, when DB says Teacher
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("fee_adjustments").add({
        schoolId: "SCH_01", amount: 100
      }));
    });

    it("Physical deletion of student profile -> allowed for Admin/Owner of same school, denied for Teacher / other roles", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("students").doc("s_del_01").set({ schoolId: "SCH_01", name: "Delete Test" });
        await context.firestore().collection("students").doc("s_del_02").set({ schoolId: "SCH_02", name: "Delete Test 2" });
        await context.firestore().collection("students").doc("s_del_noschool").set({ name: "No School Test" });
      });
      const teacherDb = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(teacherDb.collection("students").doc("s_del_01").delete());

      const acctDb = testEnv.authenticatedContext("acct123").firestore();
      await assertFails(acctDb.collection("students").doc("s_del_01").delete());

      // SCH_01 Admin CANNOT delete SCH_02 student (cross-school protection)
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("students").doc("s_del_02").delete());

      // Student without schoolId CANNOT be deleted
      await assertFails(adminDb.collection("students").doc("s_del_noschool").delete());

      // SCH_01 Admin CAN delete SCH_01 student
      await assertSucceeds(adminDb.collection("students").doc("s_del_01").delete());

      // Owner can delete student across schools
      const ownerDb = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(ownerDb.collection("students").doc("s_del_02").delete());

      // Owner authenticated by email (even without users/ doc) can delete student
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("students").doc("s_del_03").set({ schoolId: "SCH_01", name: "Delete Test 3" });
      });
      const emailOwnerDb = testEnv.authenticatedContext("email_owner", { email: "jeevanshilporg@gmail.com" }).firestore();
      await assertSucceeds(emailOwnerDb.collection("students").doc("s_del_03").delete());
    });

    it("Physical deletion of enrollment -> denied for all roles", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("enrollments").doc("e_del_01").set({ schoolId: "SCH_01", studentId: "s1" });
      });
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("enrollments").doc("e_del_01").delete());
    });

    it("Teacher attempting to create or delete student -> denied", async () => {
      const teacherDb = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(teacherDb.collection("students").add({ schoolId: "SCH_01", name: "Teacher Created" }));
    });
  });
  describe("ACADEMICS MODULE", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection("class_assignments").doc("SCH_01_AY_2025_26_Class 5_Section A").set({
          schoolId: "SCH_01",
          academicYearId: "AY_2025_26",
          class: "Class 5",
          section: "Section A",
          teacherId: "teacher123" // teacher123 is the assigned teacher
        });
        await db.collection("class_assignments").doc("SCH_01_AY_2025_26_Class 5_Section B").set({
          schoolId: "SCH_01",
          academicYearId: "AY_2025_26",
          class: "Class 5",
          section: "Section B",
          teacherId: "teacher999"
        });
      });
    });

    it("Owner allowed to create attendance", async () => {
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Admin allowed to create attendance within school", async () => {
      const db = testEnv.authenticatedContext("admin123").firestore();
      await assertSucceeds(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Assigned teacher allowed to create attendance for their class", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertSucceeds(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Assigned teacher denied to create attendance for wrong class/section", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section B" }));
    });

    it("Assigned teacher denied to create attendance for wrong year", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2026_27", class: "Class 5", section: "Section A" }));
    });

    it("Assigned teacher denied to create attendance for wrong school", async () => {
      const db = testEnv.authenticatedContext("teacher123").firestore();
      await assertFails(db.collection("attendance_logs").add({ schoolId: "SCH_02", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Unassigned teacher denied", async () => {
      const db = testEnv.authenticatedContext("teacher456").firestore();
      await assertFails(db.collection("exam_marks").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Accountant denied to create attendance", async () => {
      const db = testEnv.authenticatedContext("accountant123").firestore();
      await assertFails(db.collection("attendance_logs").add({ schoolId: "SCH_01", academicYearId: "AY_2025_26", class: "Class 5", section: "Section A" }));
    });

    it("Unauthenticated denied", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(db.collection("academic_attendance").add({ studentId: "s1" }));
    });
  });

  describe("MODULE 4: STAFF SALARY & PAYROLL", () => {
    it("Owner allowed to read and write staff_salary", async () => {
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(db.collection("staff_salary").doc("teacher123").set({ baseSalary: 50000 }));
      await assertSucceeds(db.collection("staff_salary").doc("teacher123").get());
    });

    it("Admin denied from reading or writing staff_salary", async () => {
      const db = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(db.collection("staff_salary").doc("teacher123").get());
      await assertFails(db.collection("staff_salary").doc("teacher123").set({ baseSalary: 60000 }));
    });

    it("Owner allowed to write and read payroll", async () => {
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(db.collection("payroll").add({ staffId: "teacher123", netPay: 40000 }));
      await assertSucceeds(db.collection("payroll").get());
    });

    it("Admin denied from writing or reading payroll", async () => {
      const db = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(db.collection("payroll").get());
      await assertFails(db.collection("payroll").add({ staffId: "teacher123", netPay: 40000 }));
    });
  });

  describe("MODULE 5: SETTINGS & GOVERNANCE", () => {
    it("Governance Audit: Admin can create audit log for themselves", async () => {
      const db = testEnv.authenticatedContext("admin123").firestore();
      await assertSucceeds(db.collection("governance_audit").add({ userId: "admin123", action: "TEST" }));
    });

    it("Governance Audit: Admin cannot fake audit log for another user", async () => {
      const db = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(db.collection("governance_audit").add({ userId: "owner123", action: "TEST" }));
    });

    it("Governance Audit: Owner/Admin cannot update or delete audit log", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection("governance_audit").doc("audit1").set({ userId: "admin123", action: "TEST" });
      });
      const db = testEnv.authenticatedContext("owner123").firestore();
      await assertFails(db.collection("governance_audit").doc("audit1").update({ action: "EDITED" }));
      await assertFails(db.collection("governance_audit").doc("audit1").delete());
    });

    it("Academic Years: Admin/Owner can create and read", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertSucceeds(adminDb.collection("academic_years").doc("AY_2026").set({ id: "AY_2026" }));
      await assertSucceeds(adminDb.collection("academic_years").get());
    });

    it("Academic Years: Teacher can read but not write", async () => {
      const teacherDb = testEnv.authenticatedContext("teacher123").firestore();
      await assertSucceeds(teacherDb.collection("academic_years").get());
      await assertFails(teacherDb.collection("academic_years").doc("AY_2027").set({ id: "AY_2027" }));
    });

    it("Self-role escalation blocked for Admin on users collection", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      // admin123 trying to change their own role to Owner
      await assertFails(adminDb.collection("users").doc("admin123").update({ role: "Owner" }));
      // admin123 trying to change someone else's role (should succeed if not Admin)
      await assertSucceeds(adminDb.collection("users").doc("teacher123").update({ role: "Senior Teacher" }));
    });

    it("Owner alone can grant Administrator privileges", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      // admin123 trying to make someone an Administrator
      await assertFails(adminDb.collection("users").doc("teacher123").update({ role: "Administrator" }));
      
      const ownerDb = testEnv.authenticatedContext("owner123").firestore();
      await assertSucceeds(ownerDb.collection("users").doc("teacher123").update({ role: "Administrator" }));
    });
  });

  describe("STRICT CROSS-SCHOOL (SCH_01 vs SCH_02) CREATE & UPDATE ISOLATION", () => {
    // admin123 is assigned to SCH_01
    // acct123 is assigned to SCH_01

    it("1. students: SCH_01 Admin CANNOT create SCH_02 student; CAN create SCH_01; CANNOT update to SCH_02", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("students").add({ schoolId: "SCH_02", name: "Cross School" }));
      await assertSucceeds(adminDb.collection("students").doc("stu_sch01").set({ schoolId: "SCH_01", name: "Valid Student" }));
      // Attempting to change schoolId to SCH_02 on update -> denied
      await assertFails(adminDb.collection("students").doc("stu_sch01").update({ schoolId: "SCH_02" }));
    });

    it("2. enrollments: SCH_01 Admin CANNOT create SCH_02 enrollment; CAN create SCH_01; CANNOT update to SCH_02", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("enrollments").add({ schoolId: "SCH_02", studentId: "s1" }));
      await assertSucceeds(adminDb.collection("enrollments").doc("enr_sch01").set({ schoolId: "SCH_01", studentId: "s1" }));
      await assertFails(adminDb.collection("enrollments").doc("enr_sch01").update({ schoolId: "SCH_02" }));
    });

    it("3. fee_charges: SCH_01 Admin CANNOT create SCH_02 charge; CAN create SCH_01; CANNOT update", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("fee_charges").add({ schoolId: "SCH_02", amount: 5000 }));
      await assertSucceeds(adminDb.collection("fee_charges").doc("chg_sch01").set({ schoolId: "SCH_01", amount: 5000 }));
      await assertFails(adminDb.collection("fee_charges").doc("chg_sch01").update({ amount: 6000 }));
    });

    it("4. payroll: SCH_01 Admin CANNOT create payroll for any school (Owner only); Owner CAN create", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      const ownerDb = testEnv.authenticatedContext("owner123").firestore();
      await assertFails(adminDb.collection("payroll").add({ schoolId: "SCH_01", staffId: "st1", netPay: 20000 }));
      await assertFails(adminDb.collection("payroll").add({ schoolId: "SCH_02", staffId: "st2", netPay: 20000 }));
      await assertSucceeds(ownerDb.collection("payroll").add({ schoolId: "SCH_01", staffId: "st1", netPay: 20000 }));
    });

    it("5. class_assignments: SCH_01 Admin CANNOT create SCH_02 assignment; CAN create SCH_01; CANNOT update to SCH_02", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("class_assignments").add({ schoolId: "SCH_02", class: "Class 1", section: "A" }));
      await assertSucceeds(adminDb.collection("class_assignments").doc("ca_sch01").set({ schoolId: "SCH_01", class: "Class 1", section: "A" }));
      await assertFails(adminDb.collection("class_assignments").doc("ca_sch01").update({ schoolId: "SCH_02" }));
    });

    it("6. attendance_logs: SCH_01 Admin CANNOT create SCH_02 attendance; CAN create SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("attendance_logs").add({ schoolId: "SCH_02", date: "2026-09-07" }));
      await assertSucceeds(adminDb.collection("attendance_logs").doc("att_sch01").set({ schoolId: "SCH_01", date: "2026-09-07" }));
      await assertFails(adminDb.collection("attendance_logs").doc("att_sch01").update({ schoolId: "SCH_02" }));
    });

    it("7. exam_marks: SCH_01 Admin CANNOT create SCH_02 marks; CAN create SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("exam_marks").add({ schoolId: "SCH_02", mark: 90 }));
      await assertSucceeds(adminDb.collection("exam_marks").doc("ex_sch01").set({ schoolId: "SCH_01", mark: 90 }));
      await assertFails(adminDb.collection("exam_marks").doc("ex_sch01").update({ schoolId: "SCH_02" }));
    });

    it("8. staff: SCH_01 Admin CANNOT create SCH_02 staff; CAN create SCH_01; CANNOT update to SCH_02", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("staff").add({ schoolId: "SCH_02", name: "Staff 2", role: "Teacher" }));
      await assertSucceeds(adminDb.collection("staff").doc("staff_sch01").set({ schoolId: "SCH_01", name: "Staff 1", role: "Teacher" }));
      await assertFails(adminDb.collection("staff").doc("staff_sch01").update({ schoolId: "SCH_02" }));
    });

    it("9. users: SCH_01 Admin CANNOT create user claiming SCH_02; CAN create with SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("users").doc("new_user_sch02").set({ schoolId: "SCH_02", role: "Teacher" }));
      await assertSucceeds(adminDb.collection("users").doc("new_user_sch01").set({ schoolId: "SCH_01", role: "Teacher" }));
      await assertFails(adminDb.collection("users").doc("new_user_sch01").update({ schoolId: "SCH_02" }));
    });

    it("10. fee_adjustments: SCH_01 Admin CANNOT create SCH_02 adjustment; CAN create SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      await assertFails(adminDb.collection("fee_adjustments").add({ schoolId: "SCH_02", amount: 100 }));
      await assertSucceeds(adminDb.collection("fee_adjustments").doc("fa_sch01").set({ schoolId: "SCH_01", amount: 100 }));
      await assertFails(adminDb.collection("fee_adjustments").doc("fa_sch01").update({ schoolId: "SCH_02" }));
    });

    it("11. student_ledger: SCH_01 Admin/Acct CANNOT create SCH_02 payment/charge; CAN create SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      const acctDb = testEnv.authenticatedContext("acct123").firestore();
      await assertFails(adminDb.collection("student_ledger").add({ schoolId: "SCH_02", amount: 100 }));
      await assertFails(acctDb.collection("student_ledger").add({ schoolId: "SCH_02", amount: 100 }));
      await assertSucceeds(acctDb.collection("student_ledger").doc("sl_sch01").set({ schoolId: "SCH_01", amount: 100 }));
      await assertFails(acctDb.collection("student_ledger").doc("sl_sch01").update({ schoolId: "SCH_02" }));
    });

    it("12. invoices: SCH_01 Admin/Acct CANNOT create SCH_02 invoice; CAN create SCH_01", async () => {
      const adminDb = testEnv.authenticatedContext("admin123").firestore();
      const acctDb = testEnv.authenticatedContext("acct123").firestore();
      await assertFails(adminDb.collection("invoices").add({ schoolId: "SCH_02", total: 1000 }));
      await assertFails(acctDb.collection("invoices").add({ schoolId: "SCH_02", total: 1000 }));
      await assertSucceeds(acctDb.collection("invoices").doc("inv_sch01").set({ schoolId: "SCH_01", total: 1000 }));
      await assertFails(acctDb.collection("invoices").doc("inv_sch01").update({ schoolId: "SCH_02" }));
    });
  });
});
