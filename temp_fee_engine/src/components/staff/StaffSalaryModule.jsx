import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Search, Filter, Download, UserCheck, Calendar, FileText, Plus, Calculator, AlertCircle, Save } from 'lucide-react';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { t } from '../../utils/translations';

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

export default function StaffSalaryModule({ lang = 'en', selectedSchool }) {
  const dict = t[lang] || t.en;
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
        setStaffList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error loading staff:', error);
        setMessage('Unable to load staff from the database.');
      } finally {
        setIsLoading(false);
      }
    };
    loadStaff();
  }, [selectedSchool]);

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
    const rows = visibleStaff.map(staff => [
      staff.id || '',
      staff.name || '',
      staff.role || '',
      staff.department || '',
      Number(staff.baseSalary ?? staff.salary ?? 0)
    ]);
    const csv = [
      ['Employee ID', 'Staff Name', 'Role', 'Department', 'Base Salary'],
      ...rows
    ].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `staff-report-${selectedSchool}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmPayroll = async () => {
    if (!selectedSchool || selectedSchool === 'ALL') return;
    setIsSavingPayroll(true);
    setMessage('');
    try {
      const month = new Date().toISOString().slice(0, 7);
      for (const staff of visibleStaff) {
        const data = payrollData[staff.id] || {};
        const baseSalary = Number(data.salary ?? staff.baseSalary ?? staff.salary ?? 0);
        const bonus = Number(data.bonus ?? 0);
        const deductions = Number(data.deductions ?? 0);
        const netPay = Math.max(0, baseSalary + bonus - deductions);
        await addDoc(collection(db, 'payroll'), {
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
      }
      setMessage('Payroll records saved successfully.');
    } catch (error) {
      console.error('Error saving payroll:', error);
      setMessage('Failed to save payroll records.');
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
                      ₹ {Number(staff.baseSalary ?? staff.salary ?? 0).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${staff.status === 'Paid' ? 'success' : 'warning'}`}>
                        {staff.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
                        <FileText size={14} /> Payslip
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
              <Calendar size={20} color="var(--brand-orange)" /> Today's Staff Roster ({new Date().toLocaleDateString()})
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
              <select className="form-input" style={{ width: 150 }}>
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
                  const baseSalary = data.salary ?? staff.salary;
                  const dailyRate = Math.round(baseSalary / 30);
                  const bonus = data.bonus ?? 0;
                  const defaultDeductions = (staff.absentDays || 0) * dailyRate;
                  const deductions = data.deductions ?? defaultDeductions;
                  const net = baseSalary + bonus - deductions;
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
                        <span className="badge" style={{ backgroundColor: staff.absentDays > 0 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 163, 74, 0.1)', color: staff.absentDays > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {staff.absentDays || 0} Days
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
