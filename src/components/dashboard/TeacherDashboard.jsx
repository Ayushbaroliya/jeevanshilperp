import React, { useState, useEffect } from 'react';
import { Check, BookOpen, Users, Bell, Clock, Calendar, ArrowRight, Award, Plus, X, AlertCircle } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { t } from '../../utils/translations';

export default function TeacherDashboard({ onNavigate, currentUser, lang = 'en' }) {
  const teacherName = currentUser?.name || 'Meena Sharma';
  const dict = t[lang] || t.en;
  
  const [assignedClasses, setAssignedClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMyClasses = async () => {
      if (!currentUser?.id) return;
      try {
        let q = query(
          collection(db, "class_assignments"),
          where("teacherId", "==", currentUser.id)
        );
        if (currentUser?.schoolId) {
          q = query(collection(db, "class_assignments"), where("teacherId", "==", currentUser.id), where("schoolId", "==", currentUser.schoolId));
        }
        const querySnapshot = await getDocs(q);
        const classes = [];
        querySnapshot.forEach((doc) => {
          classes.push({ id: doc.id, ...doc.data() });
        });
        setAssignedClasses(classes);
      } catch (err) {
        console.error("Error fetching assigned classes:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMyClasses();
  }, [currentUser]);

  const assignedText = assignedClasses.length > 0 
    ? assignedClasses.map(c => `${c.class} (${c.section})`).join(', ')
    : 'No classes assigned yet';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1120, margin: '0 auto' }}>
      
      {/* 1. Teacher Welcome Header */}
      <div className="glass-card" style={{
        padding: 28,
        borderRadius: 20
      }}>
        <div className="flex-responsive">
          <div>
            <span className="badge" style={{ backgroundColor: '#10b981', color: '#ffffff', fontWeight: 800, fontSize: 12, marginBottom: 8, display: 'inline-block' }}>
              {dict.teacherWorkspace}
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '4px 0 6px 0' }}>
              {lang === 'hi' ? `${teacherName}, आपका स्वागत है!` : `Welcome, ${teacherName}`}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
              {lang === 'hi' ? `कक्षा अध्यापक: ${assignedText}` : `Class Teacher: ${assignedText}`}
            </p>
          </div>

          <div className="header-actions-responsive">
            <button
              className="btn-primary"
              onClick={() => onNavigate('academics')}
              style={{ backgroundColor: '#10b981', borderColor: '#10b981', padding: '10px 18px', fontWeight: 800 }}
            >
              <Check size={18} /> {dict.markAttendance}
            </button>
            <button
              className="btn-primary"
              onClick={() => onNavigate('academics')}
              style={{ padding: '10px 18px', fontWeight: 800 }}
            >
              <BookOpen size={18} /> {dict.subjectGradebook}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Quick Action Shortcuts */}
      <div className="grid-responsive">
        <div
          className="glass-card"
          onClick={() => onNavigate('academics')}
          style={{ cursor: 'pointer', padding: 20, borderRadius: 16, border: '1px solid var(--border-light)', transition: 'all 0.2s ease' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Check size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px 0' }}>Class Attendance</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Submit morning & afternoon attendance.</p>
        </div>

        <div
          className="glass-card"
          onClick={() => onNavigate('academics')}
          style={{ cursor: 'pointer', padding: 20, borderRadius: 16, border: '1px solid var(--border-light)', transition: 'all 0.2s ease' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Award size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px 0' }}>Enter Test Scores</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Input quarterly, half yearly & final exam marks out of 100.</p>
        </div>

        <div
          className="glass-card"
          onClick={() => onNavigate('students')}
          style={{ cursor: 'pointer', padding: 20, borderRadius: 16, border: '1px solid var(--border-light)', transition: 'all 0.2s ease' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Users size={24} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px 0' }}>Class Students</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>View student profiles, roll numbers & contacts.</p>
        </div>


      </div>



        {/* Attendance Status Tracker Across Classes */}
        <div className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
          <div className="flex-responsive" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={20} color="#10b981" /> Daily Attendance Status
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Today</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading your classes...</div>
            ) : assignedClasses.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>You don't have any classes assigned to you yet.</div>
            ) : (
              assignedClasses.map((cls) => (
                <div key={cls.id} style={{ padding: 14, borderRadius: 12, backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <div className="flex-responsive">
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                      {cls.class} ({cls.section})
                    </span>
                    <button className="btn-primary" onClick={() => onNavigate('academics')} style={{ padding: '4px 12px', fontSize: 12 }}>
                      Take Attendance
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--warning)', marginTop: 6, fontWeight: 600 }}>
                    Attendance pending for today
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </div>
  );
}
