import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Search, Filter, Download, UserCheck, Calendar, FileText, Plus, Calculator, AlertCircle, Save, X, Printer } from 'lucide-react';
import { collection, getDocs, addDoc, setDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { t } from '../../utils/translations';
import * as XLSX from 'xlsx';

const getLastSixMonths = () => {
  const months = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    months.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' })
    });
    d.setMonth(d.getMonth() - 1);
  }
  return months;
};

export default function StaffSalaryModule({ lang = 'en', selectedSchool, currentUser, onNavigate }) {
  const dict = t[lang] || t.en;
  
  // Only Owners/Directors can view/manage salary and payroll. Admins can only mark attendance.
  const isOwner = currentUser?.role === 'Owner' || currentUser?.role === 'Director';
  
  const [activeTab, setActiveTab] = useState('attendance');
  const [payrollData, setPayrollData] = useState({});

  const handlePayrollChange = (empId, field, value) => {
    setPayrollData(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: field === 'paymentDate' ? value : (Number(value) || 0)
      }
    }));
  };
  
  const [staffList, setStaffList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendance, setAttendance] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [isSavingPayroll, setIsSavingPayroll] = useState(false);
  const [message, setMessage] = useState('');
  const [payslipStaff, setPayslipStaff] = useState(null); // staff for payslip modal
  const [payrollMonth, setPayrollMonth] = useState(getLastSixMonths()[0].value);
  const [absentDaysByStaff, setAbsentDaysByStaff] = useState({});

  useEffect(() => {
    const loadStaff = async () => {
      setMessage('');
      if (!selectedSchool) {
        setStaffList([]);
        return;
      }
      setIsLoading(true);
      try {
        const q = selectedSchool === 'ALL'
          ? collection(db, 'staff')
          : query(collection(db, 'staff'), where('schoolId', '==', selectedSchool));
        const snapshot = await getDocs(q);
        const validStaff = [];
        
        let salaries = {};
        try {
          const salarySnapshot = await getDocs(collection(db, 'staff_salary'));
          salarySnapshot.forEach(d => {
            const data = d.data();
            if (data?.baseSalary !== undefined) {
              salaries[d.id] = Number(data.baseSalary);
              if (data.staffId) salaries[data.staffId] = Number(data.baseSalary);
              if (data.uid) salaries[data.uid] = Number(data.baseSalary);
            }
          });
        } catch (err) {
          console.error("Could not fetch salaries:", err);
        }

        snapshot.docs.forEach(d => {
          const data = d.data();
          if (data.status !== 'archived' && data.isActive !== false) {
            const resolvedSalary = salaries[d.id] ?? (data.uid ? salaries[data.uid] : undefined) ?? data.baseSalary ?? data.salary ?? 0;
            validStaff.push({ 
              id: d.id, 
              ...data,
              baseSalary: Number(resolvedSalary)
            });
          }
        });
        setStaffList(validStaff);
      } catch (error) {
        console.error('Error loading staff:', error);
        setMessage('Unable to load staff from the database.');
      } finally {
        setIsLoading(false);
      }
    };
    loadStaff();
  }, [selectedSchool]);

  useEffect(() => {
    const loadAbsentDays = async () => {
      if (!selectedSchool || selectedSchool === 'ALL') return;
      try {
        const q = query(
          collection(db, 'staff_attendance'), 
          where('schoolId', '==', selectedSchool)
        );
        const snapshot = await getDocs(q);
        const absentCount = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          // Check if date belongs to payrollMonth (YYYY-MM)
          if (data.date && data.date.startsWith(payrollMonth)) {
            if (data.status === 'Absent' || data.status === 'On Leave') {
              absentCount[data.staffId] = (absentCount[data.staffId] || 0) + 1;
            } else if (data.status === 'Half Day') {
              absentCount[data.staffId] = (absentCount[data.staffId] || 0) + 0.5;
            }
          }
        });
        setAbsentDaysByStaff(absentCount);
      } catch(err) {
        console.error('Error fetching absent days:', err);
      }
    };
    loadAbsentDays();
  }, [payrollMonth, selectedSchool]);

  const visibleStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(staff =>
      [staff.name, staff.contact, staff.role, staff.department, staff.id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    );
  }, [staffList, searchQuery]);

  const handleAttendanceChange = (staffId, field, value) => {
    setAttendance(prev => ({
      ...prev,
      [staffId]: { ...prev[staffId], [field]: value }
    }));
  };

  const saveAttendance = async () => {
    if (!selectedSchool || selectedSchool === 'ALL') return;
    setIsSavingAttendance(true);
    setMessage('');
    try {
      const date = new Date().toISOString().split('T')[0];
      const rows = visibleStaff.map(staff => ({
        staffId: staff.id,
        staffName: staff.name || '',
        schoolId: selectedSchool,
        date,
        checkIn: attendance[staff.id]?.checkIn || '',
        checkOut: attendance[staff.id]?.checkOut || '',
        status: attendance[staff.id]?.status || 'Present',
        createdAt: serverTimestamp()
      }));
      for (const row of rows) {
        await addDoc(collection(db, 'staff_attendance'), row);
      }
      setMessage('Staff attendance saved successfully.');
    } catch (error) {
      console.error('Error saving staff attendance:', error);
      setMessage('Failed to save staff attendance.');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const exportReport = () => {
    // 1. Prepare data
    const excelData = visibleStaff.map(staff => ({
      "Employee ID": staff.id || '',
      "Staff Name": staff.name || '',
      "Role": staff.role || '',
      "Department": staff.department || '',
      "Base Salary": Number(staff.baseSalary ?? staff.salary ?? 0)
    }));

    // 2. Create sheet and workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Staff Report");

    // 3. Adjust columns
    worksheet['!cols'] = [
      { wch: 25 }, // ID
      { wch: 30 }, // Name
      { wch: 20 }, // Role
      { wch: 20 }, // Dept
      { wch: 15 }  // Salary
    ];

    // 4. Download
    XLSX.writeFile(workbook, `staff-report-${selectedSchool}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Payslip print: inject a hidden iframe with print styles ────────────────
  const handlePrintPayslip = (staff) => {
    const data = payrollData[staff.id] || {};
    const base    = Number(data.salary ?? staff.baseSalary ?? staff.salary ?? 0);
    const bonus   = Number(data.bonus ?? 0);
    const ded     = Number(data.deductions ?? 0);
    const net     = Math.max(0, base + bonus - ded);
    const month   = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    const html = `
      <html><head><title>Payslip</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
        h2   { margin: 0 0 4px; font-size: 22px; }
        p    { margin: 2px 0; color: #555; font-size: 13px; }
        .divider { border-top: 2px solid #bf5700; margin: 18px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { padding: 10px 14px; font-size: 13px; }
        th   { background: #f5f5f5; text-align: left; font-weight: 700; }
        td.right { text-align: right; font-family: monospace; font-weight: 700; }
        .net { font-size: 18px; font-weight: 900; color: #bf5700; }
        .footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
      </style></head><body>
        <h2>Salary Payslip</h2>
        <p><strong>${staff.name || 'N/A'}</strong> &bull; ${staff.role || ''} &bull; ${staff.department || ''}</p>
        <p>Employee ID: ${staff.id}</p>
        <p>School: ${selectedSchool}</p>
        <p>Month: ${month}</p>
        <div class="divider"></div>
        <table>
          <tr><th>Component</th><th class="right">Amount (₹)</th></tr>
          <tr><td>Base Salary</td><td class="right">${base.toLocaleString()}</td></tr>
          <tr><td>Bonus / Allowance</td><td class="right">${bonus.toLocaleString()}</td></tr>
          <tr><td>Deductions (Leaves / Other)</td><td class="right">- ${ded.toLocaleString()}</td></tr>
          <tr><td><strong>Net Pay</strong></td><td class="right net">₹ ${net.toLocaleString()}</td></tr>
        </table>
        <p style="margin-top:20px;">Payment Date: ${data.paymentDate || 'Pending'}</p>
        <div class="footer">This is a computer-generated payslip and does not require a signature.</div>
      </body></html>`;

    const win = window.open('', '_blank', 'width=700,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 400);
    }
  };
  // ─────────────────────────────────────────────────────────────────

  const confirmPayroll = async () => {
    if (!selectedSchool || selectedSchool === 'ALL') {
      alert("Please select a specific school campus to process and save payroll.");
      return;
    }
    setIsSavingPayroll(true);
    setMessage('');
    try {
      const month = payrollMonth;
      const [yearStr, monthStr] = payrollMonth.split('-');
      const payableDays = new Date(Number(yearStr), Number(monthStr), 0).getDate();

      // Check existing payroll records for this month and school to prevent duplicates
      const existingQ = query(
        collection(db, 'payroll'),
        where('month', '==', month),
        where('schoolId', '==', selectedSchool)
      );
      const existingSnap = await getDocs(existingQ);
      const existingStaffIds = new Set();
      existingSnap.forEach(d => {
        const p = d.data();
        if (p.staffId) existingStaffIds.add(p.staffId);
      });

      let createdCount = 0;
      let skippedCount = 0;

      for (const staff of visibleStaff) {
        // Prevent duplicate payroll records: If a record already exists, NEVER overwrite it silently.
        // Treat it as an existing historical payroll record.
        if (existingStaffIds.has(staff.id)) {
          skippedCount++;
          continue;
        }

        const data = payrollData[staff.id] || {};
        const baseSalary = Number(data.salary ?? staff.baseSalary ?? 0);
        
        const dailyRate = baseSalary / payableDays;
        const absentDays = absentDaysByStaff[staff.id] || 0;
        const defaultDeductions = Math.round(absentDays * dailyRate);
        const deductions = Number(data.deductions ?? defaultDeductions);
        const bonus = Number(data.bonus ?? 0);
        const netPay = Math.max(0, baseSalary + bonus - deductions);

        const payrollDocId = `pay_${selectedSchool}_${month}_${staff.id}`;
        await setDoc(doc(db, 'payroll', payrollDocId), {
          id: payrollDocId,
          staffId: staff.id,
          staffName: staff.name || '',
          schoolId: selectedSchool,
          month,
          baseSalary,
          bonus,
          deductions,
          netPay,
          paymentDate: data.paymentDate || new Date().toISOString().slice(0, 10),
          status: 'Processed',
          createdAt: serverTimestamp()
        });
        createdCount++;
      }

      let msg = '';
      if (createdCount > 0 && skippedCount > 0) {
        msg = `Saved ${createdCount} payroll record(s). Skipped ${skippedCount} staff who already have processed payroll for ${month}.`;
      } else if (createdCount > 0) {
        msg = `Successfully saved ${createdCount} payroll records for ${month}.`;
      } else if (skippedCount > 0) {
        msg = `Payroll for all ${skippedCount} staff members in this branch has already been processed for ${month}. Existing historical records were preserved.`;
      } else {
        msg = 'No staff found to process payroll.';
      }
      setMessage(msg);
      alert(msg);
    } catch (error) {
      console.error('Error saving payroll:', error);
      setMessage('Failed to save payroll records: ' + error.message);
    } finally {
      setIsSavingPayroll(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={28} color="var(--brand-orange)" /> 
            Staff Salary & Attendance
          </h1>
          <p className="page-subtitle">Manage monthly payroll, track staff attendance, and generate payslips</p>
        </div>
        <div className="header-actions-responsive">
          <button className="btn-secondary" style={{ padding: '8px 16px' }} onClick={exportReport} disabled={!visibleStaff.length}>
            <Download size={18} /> Export Report
          </button>
          {isOwner && onNavigate && (
            <button
              className="btn-secondary"
              style={{ padding: '8px 16px', borderColor: 'var(--brand-orange)', color: 'var(--brand-orange)', fontWeight: 700 }}
              onClick={() => onNavigate('settings')}
              title="Go to Settings to add or manage staff members"
            >
              <Plus size={18} /> Add / Manage Staff
            </button>
          )}
          <button className="btn-primary" style={{ padding: '8px 16px', opacity: selectedSchool === 'ALL' ? 0.5 : 1, cursor: selectedSchool === 'ALL' ? 'not-allowed' : 'pointer' }} onClick={() => setActiveTab('process')} disabled={selectedSchool === 'ALL'}>
            <Plus size={18} /> Process Payroll
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px 0',
            fontSize: 15, fontWeight: 700,
            color: activeTab === 'attendance' ? 'var(--brand-orange)' : 'var(--text-primary)',
            borderBottom: activeTab === 'attendance' ? '3px solid var(--brand-orange)' : '3px solid transparent',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <UserCheck size={18} /> Mark Attendance
        </button>
        {isOwner && (
          <>
            <button
              onClick={() => setActiveTab('salaries')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px 0',
                fontSize: 15, fontWeight: 700,
                color: activeTab === 'salaries' ? 'var(--brand-orange)' : 'var(--text-primary)',
                borderBottom: activeTab === 'salaries' ? '3px solid var(--brand-orange)' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <DollarSign size={18} /> Salary Management
            </button>
            <button
              onClick={() => setActiveTab('process')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px 0',
                fontSize: 15, fontWeight: 700,
                color: activeTab === 'process' ? 'var(--brand-orange)' : 'var(--text-primary)',
                borderBottom: activeTab === 'process' ? '3px solid var(--brand-orange)' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <Calculator size={18} /> Process Payroll
            </button>
          </>
        )}
      </div>

      {selectedSchool === 'ALL' && (
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Consolidated HR View Active</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>You are viewing staff data across all campuses. To process payroll or mark attendance, please select a specific campus.</div>
          </div>
        </div>
      )}

      {message && (
        <div className="glass-card" role="status" style={{ padding: '12px 16px', borderRadius: 12 }}>
          {message}
        </div>
      )}
      {isLoading && (
        <div className="glass-card" role="status" style={{ padding: '16px', borderRadius: 12 }}>
          Loading staff records...
        </div>
      )}

      {/* Content */}
      {activeTab === 'salaries' && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
          <div className="flex-responsive" style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 300 }}>
              <input type="text" className="form-input" placeholder="Search staff by name, role or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: 36 }} />
              <Search size={18} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-secondary)' }} />
            </div>
            <button className="btn-secondary" style={{ padding: '8px 16px' }}>
              <Filter size={18} /> Filter by Dept
            </button>
          </div>

          <div className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Staff Name</th>
                  <th>Role / Dept</th>
                  <th style={{ textAlign: 'right' }}>Base Salary</th>
                  <th>Status (Oct)</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((staff) => (
                  <tr key={staff.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{staff.id}</td>
                    <td style={{ fontWeight: 700 }}>{staff.name}</td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{staff.role}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{staff.department}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>₹</span>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={staff.baseSalary || 0} 
                          onChange={async (e) => {
                            const newSalary = Number(e.target.value) || 0;
                            setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, baseSalary: newSalary } : s));
                            try {
                              const { doc, setDoc, updateDoc } = await import('firebase/firestore');
                              await updateDoc(doc(db, 'staff', staff.id), { baseSalary: newSalary });
                              await setDoc(doc(db, 'staff_salary', staff.id), { 
                                baseSalary: newSalary, 
                                schoolId: staff.schoolId,
                                staffId: staff.id,
                                uid: staff.uid || null
                              }, { merge: true });
                              if (staff.uid) {
                                await setDoc(doc(db, 'staff_salary', staff.uid), { 
                                  baseSalary: newSalary, 
                                  schoolId: staff.schoolId,
                                  staffId: staff.id,
                                  uid: staff.uid
                                }, { merge: true });
                              }
                            } catch(err) { console.error('Error saving staff salary:', err); }
                          }}
                          style={{ width: 100, textAlign: 'right', padding: '4px 8px', margin: 0 }} 
                        />
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${staff.status === 'Paid' ? 'success' : 'warning'}`}>
                        {staff.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => handlePrintPayslip(staff)}
                        title="Print Payslip"
                      >
                        <Printer size={14} /> Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
          <div className="flex-responsive" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={20} color="var(--brand-orange)" /> Today's Staff List / शिक्षक व कर्मचारी सूची ({new Date().toLocaleDateString()})
            </h3>
            <button className="btn-primary" style={{ padding: '8px 16px', opacity: selectedSchool === 'ALL' ? 0.5 : 1, cursor: selectedSchool === 'ALL' ? 'not-allowed' : 'pointer' }} onClick={saveAttendance} disabled={selectedSchool === 'ALL' || isSavingAttendance || !visibleStaff.length}>
              <Save size={16} /> {isSavingAttendance ? 'Saving...' : 'Save All Attendance'}
            </button>
          </div>

          <div className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Department</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Attendance Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((staff) => (
                  <tr key={staff.id}>
                    <td style={{ fontWeight: 700 }}>{staff.name}</td>
                    <td>{staff.department}</td>
                    <td>
                      <input type="time" className="form-input" value={attendance[staff.id]?.checkIn ?? '08:00'} onChange={(e) => handleAttendanceChange(staff.id, 'checkIn', e.target.value)} style={{ padding: '4px 8px', width: 110 }} />
                    </td>
                    <td>
                      <input type="time" className="form-input" value={attendance[staff.id]?.checkOut ?? '15:00'} onChange={(e) => handleAttendanceChange(staff.id, 'checkOut', e.target.value)} style={{ padding: '4px 8px', width: 110 }} />
                    </td>
                    <td>
                      <select className="form-input" value={attendance[staff.id]?.status ?? 'Present'} onChange={(e) => handleAttendanceChange(staff.id, 'status', e.target.value)} style={{ padding: '6px 12px', width: 130 }}>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Half Day">Half Day</option>
                        <option value="On Leave">On Leave</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'process' && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
          <div className="flex-responsive" style={{ marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={20} color="var(--brand-orange)" /> Run Monthly Payroll
              </h3>
              <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0', fontSize: 13 }}>Review and confirm salaries for current month</p>
            </div>
            <div className="header-actions-responsive">
              <select className="form-input" style={{ width: 150 }} value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)}>
                {getLastSixMonths().map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <button className="btn-primary" style={{ padding: '8px 16px', opacity: selectedSchool === 'ALL' ? 0.5 : 1, cursor: selectedSchool === 'ALL' ? 'not-allowed' : 'pointer' }} onClick={confirmPayroll} disabled={selectedSchool === 'ALL' || isSavingPayroll || !visibleStaff.length}>
                {isSavingPayroll ? 'Saving...' : 'Confirm & Pay All'}
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th style={{ textAlign: 'right' }}>Base Salary</th>
                  <th style={{ textAlign: 'right' }}>Bonus/Allowances</th>
                  <th style={{ textAlign: 'center' }}>Leave/Absent</th>
                  <th style={{ textAlign: 'right' }}>Deductions (Leaves)</th>
                  <th style={{ textAlign: 'right' }}>Net Payable</th>
                  <th>Payment Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((staff) => {
                  const data = payrollData[staff.id] || {};
                  const baseSalary = data.salary ?? staff.baseSalary ?? 0;
                  
                  // Month-aware deduction calculation
                  const [yearStr, monthStr] = payrollMonth.split('-');
                  // In a full implementation, you would subtract holidays configured in the school policy.
                  const payableDays = new Date(Number(yearStr), Number(monthStr), 0).getDate();
                  const dailyRate = baseSalary / payableDays;
                  
                  const bonus = data.bonus ?? 0;
                  const absentDays = absentDaysByStaff[staff.id] || 0;
                  const defaultDeductions = Math.round(absentDays * dailyRate);
                  const deductions = data.deductions ?? defaultDeductions;
                  const net = Math.max(0, baseSalary + bonus - deductions);
                  return (
                    <tr key={`payroll-${staff.id}`}>
                      <td style={{ fontWeight: 700 }}>
                        {staff.name}
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{staff.role}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>₹</span>
                          <input 
                            type="number" 
                            className="form-input" 
                            value={baseSalary} 
                            onChange={(e) => handlePayrollChange(staff.id, 'salary', e.target.value)}
                            style={{ width: 100, textAlign: 'right', padding: '4px 8px', margin: 0 }} 
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={bonus} 
                          onChange={(e) => handlePayrollChange(staff.id, 'bonus', e.target.value)}
                          style={{ width: 90, textAlign: 'right', padding: '4px 8px' }} 
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge" style={{ backgroundColor: absentDays > 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 163, 74, 0.1)', color: absentDays > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {absentDays} Days
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number" 
                          className="form-input" 
                          value={deductions} 
                          onChange={(e) => handlePayrollChange(staff.id, 'deductions', e.target.value)}
                          style={{ width: 90, textAlign: 'right', padding: '4px 8px' }} 
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-orange)' }}>
                        ₹ {net.toLocaleString()}
                      </td>
                      <td>
                        <input
                          type="date"
                          className="form-input"
                          value={data.paymentDate || new Date().toISOString().split('T')[0]}
                          onChange={(e) => handlePayrollChange(staff.id, 'paymentDate', e.target.value)}
                          style={{ width: 140, padding: '4px 8px' }}
                        />
                      </td>
                      <td>
                        <span className={`badge ${staff.status === 'Paid' ? 'success' : 'warning'}`}>
                          {staff.status === 'Paid' ? 'Processed' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
