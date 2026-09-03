import React, { useState, useEffect } from 'react';
import { Users, BookOpen, Clock, Activity, Check, Calendar } from 'lucide-react';
import { fetchAuthoritativeFeeSummary } from './dashboardUtils';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';

export default function OperationsDashboard({ onNavigate, selectedSchool, classSettings, activeAcademicYearId, userPermissions }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    totalStudents: 0, 
    classesCount: 0, 
    totalFeeCollection: 0, 
    todayAttendancePercent: null 
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      
      // 1. Fetch Students
      let studentsQ = collection(db, 'students');
      if (selectedSchool !== 'ALL') {
        studentsQ = query(studentsQ, where('schoolId', '==', selectedSchool));
      }
      const studentsSnap = await getDocs(studentsQ);
      let totalStudents = 0;
      const uniqueClasses = new Set();
      studentsSnap.forEach(d => {
        totalStudents++;
        uniqueClasses.add(d.data().class);
      });

      // 2. Fetch Fee Summaries (Authoritative, No Payroll)
      const feeData = await fetchAuthoritativeFeeSummary(selectedSchool, activeAcademicYearId, classSettings);

      // 3. Fetch Today's Staff Attendance
      let attendancePercent = null;
      try {
        const today = new Date().toISOString().split('T')[0];
        let attQ = collection(db, 'staff_attendance');
        if (selectedSchool !== 'ALL') {
          attQ = query(attQ, where('schoolId', '==', selectedSchool));
        }
        const attSnap = await getDocs(attQ);
        let present = 0, total = 0;
        attSnap.forEach(d => {
          const dDate = d.data().date;
          if (dDate === today) {
            const s = (d.data().status || '').toLowerCase();
            total++;
            if (s === 'present' || s === '') present++;
          }
        });
        if (total > 0) attendancePercent = Math.round((present / total) * 100);
      } catch (err) {
        console.error('Error fetching staff attendance:', err);
      }

      setStats({
        totalStudents,
        classesCount: uniqueClasses.size,
        totalFeeCollection: feeData.totalFeeCollection,
        todayAttendancePercent: attendancePercent
      });
      setLoading(false);
    };
    fetchStats();
  }, [selectedSchool, classSettings, activeAcademicYearId]);

  const schoolName = selectedSchool === 'ALL' 
    ? 'All Campuses (Consolidated Group)' 
    : SCHOOLS.find(s => s.id === selectedSchool)?.name || 'Operations Dashboard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">{schoolName} - Operations Dashboard</h1>
        <p className="page-subtitle">School operations, attendance, and fee summaries</p>
      </div>

      <div className="grid-responsive">
        {/* Students */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Enrolled Students</h3>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {loading ? '...' : stats.totalStudents.toLocaleString()}
          </div>
        </div>

        {/* Classes */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Active Classes</h3>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {loading ? '...' : stats.classesCount}
          </div>
        </div>

        {/* Fees */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Total Fee Collection</h3>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)' }}>
            {loading ? '...' : `₹${stats.totalFeeCollection.toLocaleString()}`}
          </div>
        </div>

        {/* Attendance */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Staff Attendance (Today)</h3>
            </div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {loading ? '...' : stats.todayAttendancePercent !== null ? `${stats.todayAttendancePercent}%` : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
}
