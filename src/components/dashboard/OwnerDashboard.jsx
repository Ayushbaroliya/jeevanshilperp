import React, { useState, useEffect } from 'react';
import { GraduationCap, Check, BookOpen, Users, Receipt, Bell, BarChart2, PieChart as PieIcon, Plus, Briefcase, FileText, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';
import { DEFAULT_ROLE_PERMISSIONS } from '../../utils/permissions';

export default function OwnerDashboard({ onNavigate, lang, selectedSchool, setSelectedSchool, userPermissions, currentUser, activeAcademicYearId, classSettings }) {
  const [activeTab, setActiveTab] = useState('Overview');

  const [consolidatedStudents, setConsolidatedStudents] = useState(null);
  const [schoolStudentCounts, setSchoolStudentCounts] = useState({});
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState(null);
  const [recentStudents, setRecentStudents] = useState([]);

  const [singleSchoolFinancialData, setSingleSchoolFinancialData] = useState([]);
  const [multiSchoolComparisonData, setMultiSchoolComparisonData] = useState([]);

  const [todayAttendancePercent, setTodayAttendancePercent] = useState(null);
  const [pendingPayoutsCount, setPendingPayoutsCount] = useState(null);
  const [duesPaid, setDuesPaid] = useState(0);
  const [duesUnpaid, setDuesUnpaid] = useState(0);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setStudentsLoading(true);
      setStudentsError(null);
      try {
        let studentsQ = collection(db, 'students');
        const allStudentsSnap = await getDocs(studentsQ);
        let counts = { SCH_01: 0, SCH_02: 0, SCH_03: 0 };
        allStudentsSnap.forEach(doc => {
          const s = doc.data();
          if (s.status !== 'Deleted' && s.status !== 'archived' && !s.isDeleted) {
            const sid = s.schoolId || 'SCH_01';
            counts[sid] = (counts[sid] || 0) + 1;
          }
        });
        
        const totalConsolidated = (counts.SCH_01 || 0) + (counts.SCH_02 || 0) + (counts.SCH_03 || 0);

        setConsolidatedStudents(totalConsolidated);
        setSchoolStudentCounts(counts);
        setStudentsLoading(false);

        let recentQ = query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(10));
        if (selectedSchool !== 'ALL') {
          recentQ = query(collection(db, 'students'), where('schoolId', '==', selectedSchool), orderBy('createdAt', 'desc'), limit(10));
        }
        const recentSnapshot = await getDocs(recentQ);
        const recent = [];
        recentSnapshot.forEach(doc => {
          const s = doc.data();
          if (s.status !== 'Deleted' && s.status !== 'archived' && !s.isDeleted && recent.length < 4) {
            recent.push({ id: doc.id, ...s });
          }
        });
        setRecentStudents(recent);

        // Fetch Invoices for Charts
        const invoicesSnap = await getDocs(collection(db, 'invoices'));
        const payrollSnap = await getDocs(collection(db, 'payroll'));
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const multiMap = {}; // { 'Aug': { PublicSchool: 0, InterCollege: 0, Branch2: 0 } }
        const singleMap = {}; // { 'Aug': { Revenue: 0, Expenses: 0 } }
        
        invoicesSnap.forEach(doc => {
          const data = doc.data();
          const amt = Number(data.amount) || 0;
          if (amt <= 0) return;
          const d = new Date(data.date);
          const m = monthNames[d.getMonth()];
          
          if (!multiMap[m]) multiMap[m] = { month: m, PublicSchool: 0, InterCollege: 0, Branch2: 0 };
          if (data.schoolId === 'SCH_01') multiMap[m].PublicSchool += amt;
          if (data.schoolId === 'SCH_02') multiMap[m].InterCollege += amt;
          if (data.schoolId === 'SCH_03') multiMap[m].Branch2 += amt;
          
          if (selectedSchool === 'ALL' || selectedSchool === data.schoolId) {
            if (!singleMap[m]) singleMap[m] = { month: m, Revenue: 0, Expenses: 0 };
            singleMap[m].Revenue += amt;
          }
        });
        
        payrollSnap.forEach(doc => {
          const data = doc.data();
          const amt = Number(data.netPay) || 0;
          if (amt <= 0) return;
          const mParts = (data.month || '').split('-');
          if (mParts.length !== 2) return;
          const monthIndex = Number(mParts[1]) - 1;
          const m = monthNames[monthIndex];
          if (!m) return;
          
          if (selectedSchool === 'ALL' || selectedSchool === data.schoolId) {
            if (!singleMap[m]) singleMap[m] = { month: m, Revenue: 0, Expenses: 0 };
            singleMap[m].Expenses += amt;
          }
        });
        
        setMultiSchoolComparisonData(Object.values(multiMap));
        setSingleSchoolFinancialData(Object.values(singleMap));

      } catch (e) {
        console.error("Error fetching dashboard data:", e);
        setStudentsLoading(false);
        setStudentsError("Live connection unavailable");
        setConsolidatedStudents(null);
        setSchoolStudentCounts({});
      }
    };
    fetchDashboardData();
  }, [selectedSchool]);

  useEffect(() => {
    const fetchTodayAttendance = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const q = query(collection(db, 'staff_attendance'), where('date', '==', today));
        const snap = await getDocs(q);
        let present = 0, total = 0;
        snap.forEach(d => {
          const s = (d.data().status || '').toLowerCase();
          total++;
          if (s === 'present' || s === '') present++;
        });
        setTodayAttendancePercent(total > 0 ? Math.round((present / total) * 100) : null);
      } catch (err) {
        console.error('Error fetching staff attendance:', err);
      }
    };
    fetchTodayAttendance();
  }, [selectedSchool]);

  useEffect(() => {
    const fetchPendingPayouts = async () => {
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        let staffQ = collection(db, 'staff');
        if (selectedSchool && selectedSchool !== 'ALL') {
          staffQ = query(staffQ, where('schoolId', '==', selectedSchool));
        }
        const staffSnap = await getDocs(staffQ);
        let activeStaff = 0;
        staffSnap.forEach(d => {
          const data = d.data();
          if (data.status !== 'archived' && data.isActive !== false) activeStaff++;
        });

        const payrollQ = query(collection(db, 'payroll'), where('month', '==', currentMonth));
        const payrollSnap = await getDocs(payrollQ);
        let processedCount = 0;
        payrollSnap.forEach(() => processedCount++);

        setPendingPayoutsCount(Math.max(0, activeStaff - processedCount));
      } catch (err) {
        console.error('Error fetching payroll data:', err);
      }
    };
    fetchPendingPayouts();
  }, [selectedSchool]);

  useEffect(() => {
    import('./dashboardUtils').then(({ fetchAuthoritativeFeeSummary }) => {
      fetchAuthoritativeFeeSummary(selectedSchool, activeAcademicYearId, classSettings).then(data => {
        setDuesPaid(data.totalFeeCollection);
        setDuesUnpaid(data.totalOutstanding);
      });
    }).catch(console.error);
  }, [selectedSchool, activeAcademicYearId, classSettings]);

  const duesPieData = [
    { name: 'Paid', value: duesPaid, color: '#10b981' },
    { name: 'Unpaid', value: duesUnpaid, color: '#ef4444' }
  ];
  const activeSchoolName = selectedSchool === 'ALL'
    ? 'All 3 Campuses (Consolidated Group)'
    : SCHOOLS.find(s => s.id === selectedSchool)?.name || 'School Dashboard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Streamlined Header */}
      <div className="page-header" style={{ marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">{activeSchoolName}</h1>
          <p className="page-subtitle">Welcome back, {currentUser?.name || 'Administrator'}</p>
        </div>
      </div>

      {selectedSchool === 'ALL' && (
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Consolidated View Active</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>You are viewing aggregated data across all campuses. To perform operational tasks, please select a specific campus.</div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 8, overflowX: 'auto' }}>
        {['Overview', 'Finance', 'Staff & Actions'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === tab ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: 20,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && (
        <>
          {/* 4 Interactive Campus Cards */}
      <div className="grid-responsive tour-school-selector">
        {/* Card 0: Consolidated View */}
        <div
          className="glass-card"
          onClick={() => setSelectedSchool('ALL')}
          style={{
            cursor: 'pointer',
            padding: 16,
            borderRadius: 14,
            border: selectedSchool === 'ALL' ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
            backgroundColor: selectedSchool === 'ALL' ? 'rgba(191, 87, 0, 0.08)' : undefined
          }}
        >
          <div className="flex-responsive" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Consolidated</span>
            <span className="badge" style={{ backgroundColor: selectedSchool === 'ALL' ? 'var(--brand-orange)' : 'var(--bg-secondary)', color: selectedSchool === 'ALL' ? '#fff' : 'var(--text-primary)', fontSize: 10, fontWeight: 700 }}>
              {selectedSchool === 'ALL' ? 'ACTIVE' : 'ALL 3'}
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>All 3 Schools Combined</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-orange)', marginTop: 8 }}>
            {studentsLoading 
              ? 'Loading...' 
              : studentsError 
                ? 'Unavailable' 
                : `${(consolidatedStudents ?? 0).toLocaleString()} Students`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {studentsError ? 'Live connection error' : 'Real-time aggregated view'}
          </div>
        </div>

        {/* Cards 1, 2, 3: Individual Schools */}
        {SCHOOLS.map((school, i) => {
          const studentCounts = schoolStudentCounts[school.id];
          const isSelected = selectedSchool === school.id;

          return (
            <div
              key={school.id}
              className="glass-card"
              onClick={() => setSelectedSchool(school.id)}
              style={{
                cursor: 'pointer',
                padding: 16,
                borderRadius: 14,
                border: isSelected ? '2px solid var(--success)' : '1px solid var(--border-light)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : undefined
              }}
            >
              <div className="flex-responsive" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>Campus</span>
                <span className="badge" style={{ backgroundColor: isSelected ? 'var(--brand-green)' : 'var(--bg-secondary)', color: isSelected ? '#fff' : 'var(--text-primary)', fontSize: 10, fontWeight: 700 }}>
                  {isSelected ? 'ACTIVE' : school.code}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{school.name}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 8 }}>
                {studentsLoading 
                  ? 'Loading...' 
                  : studentsError 
                    ? 'Unavailable' 
                    : `${(studentCounts ?? 0).toLocaleString()} Students`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Simplified Main Financial Chart */}
      <div className="glass-card tour-financial-charts" style={{ padding: 20 }}>
        <div className="flex-responsive" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={18} color="var(--accent-primary)" />
            {selectedSchool === 'ALL' ? 'Group Revenue Comparison Across 3 Schools (₹)' : 'Monthly Revenue & Expenses (₹)'}
          </h2>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            {selectedSchool === 'ALL' ? (
              <BarChart data={multiSchoolComparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip formatter={(value) => `₹ ${value.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="PublicSchool" name="Jeevan Shilp Public School" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="InterCollege" name="Jeevan Shilp Inter College" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Branch2" name="Jeevan Shilp Adarsh Shala" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={singleSchoolFinancialData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={11} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip formatter={(value) => `₹ ${value.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Revenue" name="Fee Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" name="Salary Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
      </>
      )}

      {activeTab === 'Staff & Actions' && (
        <>
      {/* Admin Staff Management Section */}
      <div className="grid-responsive">
        <div className="glass-card" style={{ padding: 20, cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Teacher Attendance</h3>
              <span className="badge success" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                {todayAttendancePercent !== null ? `Today: ${todayAttendancePercent}% Present` : 'No data today'}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0 0' }}>Mark daily attendance for teachers and staff. View leave requests and attendance history.</p>
          <button className="btn-secondary" onClick={() => onNavigate('staff')} style={{ width: '100%', marginTop: 12, justifyContent: 'center', fontSize: 13, padding: '8px 12px' }}>
            Open Staff Attendance
          </button>
        </div>

        <div className="glass-card" onClick={() => onNavigate('staff')} style={{ padding: 20, cursor: 'pointer', transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Salary Management</h3>
              <span className={`badge ${pendingPayoutsCount > 0 ? 'warning' : 'success'}`} style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                {pendingPayoutsCount !== null ? (pendingPayoutsCount > 0 ? `Pending Payouts: ${pendingPayoutsCount}` : 'All Processed') : 'Loading...'}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0 0' }}>Process monthly salaries, view payslips, and manage staff compensation details.</p>
          <button className="btn-secondary" onClick={() => onNavigate('staff')} style={{ width: '100%', marginTop: 12, justifyContent: 'center', fontSize: 13, padding: '8px 12px' }}>
            Manage Salaries
          </button>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="glass-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h2>
        <div className="grid-responsive" style={{ gap: 10 }}>
          <button className="btn-primary" onClick={() => onNavigate('students')} style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13 }}>
            <Plus size={16} /> Register Student
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('finance')} style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13 }}>
            <Receipt size={16} /> Collect Fee
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('settings')} style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13 }}>
            <Briefcase size={16} /> Staff & Permissions
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('finance')} style={{ justifyContent: 'center', padding: '10px 12px', fontSize: 13 }}>
            <FileText size={16} /> View Due Fees
          </button>
        </div>
      </div>
      </>
      )}

      {activeTab === 'Finance' && (
      <div className="grid-responsive">
        {/* Bottom 2-Column Grid */}
        {/* Fee Collection Status */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PieIcon size={16} color="var(--accent-primary)" /> Collection Ratio
          </h2>
          <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={duesPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {duesPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: 12, fontWeight: 600, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span>Paid ({(duesPaid + duesUnpaid) > 0 ? Math.round((duesPaid / (duesPaid + duesUnpaid)) * 100) : 0}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
                <span>Pending Dues ({(duesPaid + duesUnpaid) > 0 ? Math.round((duesUnpaid / (duesPaid + duesUnpaid)) * 100) : 0}%)</span>
              </div>
            </div>
        </div>
      </div>
      )}
    </div>
  );
}
