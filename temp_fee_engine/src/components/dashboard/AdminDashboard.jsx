import React, { useState, useEffect } from 'react';
import { GraduationCap, Check, BookOpen, Users, Receipt, Bell, BarChart2, PieChart as PieIcon, Plus, Briefcase, FileText, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';
import { DEFAULT_ROLE_PERMISSIONS } from '../../utils/permissions';

export default function AdminDashboard({ onNavigate, lang, selectedSchool, setSelectedSchool, userPermissions, currentUser }) {
  const [activeTab, setActiveTab] = useState('Overview');

  const [totalStudents, setTotalStudents] = useState(0);
  const [schoolStudentCounts, setSchoolStudentCounts] = useState({});
  const [recentStudents, setRecentStudents] = useState([]);

  const [singleSchoolFinancialData, setSingleSchoolFinancialData] = useState([]);
  const [multiSchoolComparisonData, setMultiSchoolComparisonData] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        let studentsQ = collection(db, 'students');
        const allStudentsSnap = await getDocs(studentsQ);
        let total = 0;
        let counts = {};
        allStudentsSnap.forEach(doc => {
          const s = doc.data();
          counts[s.schoolId] = (counts[s.schoolId] || 0) + 1;
          if (selectedSchool === 'ALL' || selectedSchool === s.schoolId) {
             total++;
          }
        });
        setTotalStudents(total);
        setSchoolStudentCounts(counts);

        let recentQ = query(collection(db, 'students'), orderBy('createdAt', 'desc'), limit(4));
        if (selectedSchool !== 'ALL') {
          recentQ = query(collection(db, 'students'), where('schoolId', '==', selectedSchool), orderBy('createdAt', 'desc'), limit(4));
        }
        const recentSnapshot = await getDocs(recentQ);
        const recent = [];
        recentSnapshot.forEach(doc => {
          recent.push({ id: doc.id, ...doc.data() });
        });
        setRecentStudents(recent);

        // Fetch Invoices for Charts
        const invoicesQ = collection(db, 'invoices');
        const invoicesSnap = await getDocs(invoicesQ);
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const multiMap = {}; // { 'Aug': { PublicSchool: 0, InterCollege: 0, Branch2: 0 } }
        const singleMap = {}; // { 'Aug': { Revenue: 0, Expenses: 0 } }
        
        invoicesSnap.forEach(doc => {
          const data = doc.data();
          const amt = Number(data.amount) || 0;
          if (amt <= 0) return;
          const d = new Date(data.date);
          const m = monthNames[d.getMonth()];
          
          // Multi
          if (!multiMap[m]) multiMap[m] = { month: m, PublicSchool: 0, InterCollege: 0, Branch2: 0 };
          if (data.schoolId === 'SCH_01') multiMap[m].PublicSchool += amt;
          if (data.schoolId === 'SCH_02') multiMap[m].InterCollege += amt;
          if (data.schoolId === 'SCH_03') multiMap[m].Branch2 += amt;
          
          // Single
          if (selectedSchool === 'ALL' || selectedSchool === data.schoolId) {
            if (!singleMap[m]) singleMap[m] = { month: m, Revenue: 0, Expenses: 0 };
            singleMap[m].Revenue += amt;
            singleMap[m].Expenses += amt * 0.75;
          }
        });
        
        setMultiSchoolComparisonData(Object.values(multiMap));
        setSingleSchoolFinancialData(Object.values(singleMap));

      } catch (e) {
        console.error("Error fetching dashboard data:", e);
      }
    };
    fetchDashboardData();
  }, [selectedSchool]);

  const perms = userPermissions || DEFAULT_ROLE_PERMISSIONS.Administrator;

  const duesPieData = [
    { name: 'Paid', value: 0, color: '#10b981' },
    { name: 'Unpaid', value: 0, color: '#ef4444' }
  ];

  // If user does not have permission to view confidential financial dashboard stats:
  if (!perms.viewDashboardStats) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Welcome Header */}
        <div className="glass-card" style={{ padding: 28, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
          <div className="flex-responsive">
            <div>
              <span className="badge" style={{ backgroundColor: 'var(--brand-orange)', color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 8, display: 'inline-block' }}>
                Limited Access Staff Dashboard
              </span>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0' }}>
                Welcome back, {currentUser?.name || 'Teacher / Staff Member'}!
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
                Role: <strong>{currentUser?.role || 'Teacher'}</strong> • Accessing role-scoped workspace.
              </p>
            </div>
            {perms.academics && (
              <button className="btn-primary" onClick={() => onNavigate('academics')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px' }}>
                <GraduationCap size={18} /> Open Academics & Attendance
              </button>
            )}
          </div>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="grid-responsive tour-quick-actions">
          {perms.academics && (
            <div
              className="glass-card"
              onClick={() => onNavigate('academics')}
              style={{ cursor: 'pointer', padding: 20, transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Check size={24} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Mark Student Attendance</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Record daily class attendance for your assigned sections.</p>
            </div>
          )}

          {perms.academics && (
            <div
              className="glass-card"
              onClick={() => onNavigate('academics')}
              style={{ cursor: 'pointer', padding: 20, transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <BookOpen size={24} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Subject Gradebook</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Enter exam scores for quarterly, half yearly, and final exams.</p>
            </div>
          )}

          {perms.viewStudents && (
            <div
              className="glass-card"
              onClick={() => onNavigate('students')}
              style={{ cursor: 'pointer', padding: 20, transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Users size={24} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Student Directory</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Browse enrolled student lists and view class student profiles.</p>
            </div>
          )}

          {perms.recordPayments && (
            <div
              className="glass-card"
              onClick={() => onNavigate('finance')}
              style={{ cursor: 'pointer', padding: 20, transition: 'all 0.2s ease', border: '1px solid var(--border-light)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Receipt size={24} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Record Fee Payment</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Collect cash/UPI payments and issue instant digital fee receipts.</p>
            </div>
          )}
        </div>

        {/* Academic Notices Widget */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} color="var(--accent-primary)" /> School Announcements & Reminders
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 14, borderRadius: 10, borderLeft: '4px solid var(--brand-orange)' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Mid-Term Examination Schedule Announced</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Please ensure all internal assessment marks are entered prior to Friday.</div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 14, borderRadius: 10, borderLeft: '4px solid var(--success)' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Daily Attendance Reminder</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Submit class attendance before 10:30 AM every morning.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }



  const activeSchoolName = selectedSchool === 'ALL'
    ? 'All 3 Campuses (Consolidated Group)'
    : SCHOOLS.find(s => s.id === selectedSchool)?.name || 'School Dashboard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Streamlined Header */}
      <div className="page-header" style={{ marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">{activeSchoolName}</h1>
          <p className="page-subtitle">Executive overview, financial metrics, and operational hub</p>
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
            {totalStudents > 0 ? totalStudents.toLocaleString() : '0'} Students
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Real-time aggregated view</div>
        </div>

        {/* Cards 1, 2, 3: Individual Schools */}
        {SCHOOLS.map((school, i) => {
          const studentCounts = schoolStudentCounts[school.id] || 0;
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
                {studentCounts} Students
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
                <Bar dataKey="Branch2" name="Jeevan Shilp 2nd Branch" fill="#f97316" radius={[4, 4, 0, 0]} />
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
              <span className="badge success" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>Today: 95% Present</span>
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
              <span className="badge warning" style={{ fontSize: 10, marginTop: 4, display: 'inline-block' }}>Pending Payouts: 2</span>
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
              <span>Paid (0%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <span>Pending Dues (0%)</span>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
