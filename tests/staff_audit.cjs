const assert = require('assert');

// Mock in-memory database simulation for staff payroll architecture
class MockStaffDB {
  constructor() {
    this.staff = new Map();
    this.staffSalaries = new Map();
    this.staffAttendance = new Map();
    this.payroll = new Map();
    this.schoolHolidays = new Map(); // month -> number of holidays
  }

  // Register staff
  addStaff(staffDoc) {
    const { id, name, role, schoolId } = staffDoc;
    this.staff.set(id, { id, name, role, schoolId });
  }

  // Set Salary
  setStaffSalary(id, salary) {
    this.staffSalaries.set(id, { id, baseSalary: salary });
  }

  // Set Holidays for a month (mocking a school calendar policy)
  setHolidays(month, count) {
    this.schoolHolidays.set(month, count);
  }

  // Mark attendance
  markAttendance(attendanceDoc) {
    const { staffId, date, status } = attendanceDoc;
    const attId = `${staffId}_${date}`;
    this.staffAttendance.set(attId, attendanceDoc);
  }

  // Helper to get payable days according to school policy
  getPayableDays(month) {
    // month format: "YYYY-MM"
    const [year, m] = month.split('-').map(Number);
    // Total calendar days in the month
    const totalDays = new Date(year, m, 0).getDate();
    // Fetch holidays from calendar policy
    const holidays = this.schoolHolidays.get(month) || 0;
    // Payable working days = total days - holidays
    // (If weekends are unpaid, they would be included in the holidays count)
    return totalDays - holidays;
  }

  // Process Payroll
  processPayroll(month, schoolId) {
    let processed = 0;
    const payableDays = this.getPayableDays(month);

    for (const [staffId, staff] of this.staff) {
      if (staff.schoolId !== schoolId) continue;
      
      const salaryDoc = this.staffSalaries.get(staffId);
      const baseSalary = salaryDoc ? salaryDoc.baseSalary : 0;
      
      // Month-aware divisor
      const dailyRate = (baseSalary / payableDays);
      
      let absentDays = 0;
      for (const [attId, att] of this.staffAttendance) {
        if (att.staffId === staffId && att.date.startsWith(month)) {
          if (att.status === 'Absent' || att.status === 'On Leave') absentDays += 1;
          if (att.status === 'Half Day') absentDays += 0.5;
        }
      }

      const deductions = Math.round(absentDays * dailyRate);
      const netPay = Math.max(0, baseSalary - deductions);

      const payrollId = `${schoolId}_${staffId}_${month}`;
      this.payroll.set(payrollId, {
        staffId, month, baseSalary, deductions, netPay, payableDays
      });
      processed++;
    }
    return processed;
  }
}

async function runTests() {
  console.log("Starting Staff & Payroll Logic Audit (Month-Aware Calculation)...");
  const db = new MockStaffDB();
  
  // Setup staff
  db.addStaff({ id: 'staff_1', name: 'John Doe', role: 'Teacher', schoolId: 'SCH_01' });
  db.setStaffSalary('staff_1', 62000); // Base salary

  // TEST 1: 31-day month (e.g., October 2025)
  // Base = 62000, Days = 31 -> Rate = 2000/day
  // 1 Absent -> 2000 deduction
  db.markAttendance({ staffId: 'staff_1', date: '2025-10-01', status: 'Absent' });
  db.processPayroll('2025-10', 'SCH_01');
  const octPayroll = db.payroll.get('SCH_01_staff_1_2025-10');
  assert.equal(octPayroll.payableDays, 31, "October should have 31 days");
  assert.equal(octPayroll.deductions, 2000, "1 day absent in 31-day month with 62k salary = 2000");
  assert.equal(octPayroll.netPay, 60000);

  // TEST 2: 30-day month (e.g., September 2025)
  // Base = 62000, Days = 30 -> Rate = 2066.66/day
  // 1 Half Day -> 0.5 * 2066.66 = 1033 deduction
  db.markAttendance({ staffId: 'staff_1', date: '2025-09-01', status: 'Half Day' });
  db.processPayroll('2025-09', 'SCH_01');
  const sepPayroll = db.payroll.get('SCH_01_staff_1_2025-09');
  assert.equal(sepPayroll.payableDays, 30, "September should have 30 days");
  assert.equal(sepPayroll.deductions, 1033, "Half day in 30-day month = 1033 deduction");

  // TEST 3: February 28 days (e.g., Feb 2026)
  // Base = 62000, Days = 28 -> Rate = 2214.28/day
  // 0 unpaid leave
  db.processPayroll('2026-02', 'SCH_01');
  const feb28Payroll = db.payroll.get('SCH_01_staff_1_2026-02');
  assert.equal(feb28Payroll.payableDays, 28, "Feb 2026 should have 28 days");
  assert.equal(feb28Payroll.deductions, 0, "Zero unpaid leave = 0 deduction");
  assert.equal(feb28Payroll.netPay, 62000, "Net pay equals base salary");

  // TEST 4: February 29 days (Leap year, e.g., Feb 2024)
  // Base = 62000, Days = 29 -> Rate = 2137.93/day
  // 2 Absent -> 4276 deduction
  db.markAttendance({ staffId: 'staff_1', date: '2024-02-10', status: 'Absent' });
  db.markAttendance({ staffId: 'staff_1', date: '2024-02-11', status: 'Absent' });
  db.processPayroll('2024-02', 'SCH_01');
  const feb29Payroll = db.payroll.get('SCH_01_staff_1_2024-02');
  assert.equal(feb29Payroll.payableDays, 29, "Feb 2024 should have 29 days");
  assert.equal(feb29Payroll.deductions, 4276, "2 days absent in 29-day month = 4276 deduction");

  // TEST 5: Working-day/Holiday handling (School policy explicitly removes 4 Sundays from payable days in November)
  // Base = 62000, Days in Nov = 30. Holidays = 4 -> Payable days = 26.
  // Rate = 62000 / 26 = 2384.61/day
  // 1 Absent -> 2385 deduction
  db.setHolidays('2025-11', 4);
  db.markAttendance({ staffId: 'staff_1', date: '2025-11-05', status: 'Absent' });
  db.processPayroll('2025-11', 'SCH_01');
  const novPayroll = db.payroll.get('SCH_01_staff_1_2025-11');
  assert.equal(novPayroll.payableDays, 26, "Nov 2025 with 4 holidays = 26 payable days");
  assert.equal(novPayroll.deductions, 2385, "1 day absent out of 26 payable days = 2385 deduction");

  // TEST 6: Historical Immutability Check
  // Change salary next month
  db.setStaffSalary('staff_1', 90000);
  
  const historicalPayroll = db.payroll.get('SCH_01_staff_1_2025-10');
  assert.equal(historicalPayroll.baseSalary, 62000, "Historical payroll base salary must be immutable");
  assert.equal(historicalPayroll.netPay, 60000, "Historical payroll net pay must be immutable");

  console.log("All Staff & Payroll Logic tests passed.");
}

runTests().catch(console.error);
