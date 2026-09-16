import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Check, BookOpen, Calendar, Award, AlertCircle } from 'lucide-react';
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import SchoolFolderPicker from '../common/SchoolFolderPicker';

const normalizeSectionQuery = (sec) => {
  if (!sec) return '';
  return sec.replace(/^Section\s+/i, '').trim();
};

const DEFAULT_SUBJECTS = ['Mathematics', 'Science', 'English', 'Social Science', 'Hindi', 'Computer'];
const EXAM_TYPES = ['Quarterly', 'Half Yearly', 'Final Exam'];

export default function AcademicsModule({ globalClasses = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'], globalSections = ['Section A', 'Section B', 'Section C'], currentUser, userPermissions, selectedSchool, setSelectedSchool, activeAcademicYearId = 'AY_2026_27' }) {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'marks'
  const [selectedClass, setSelectedClass] = useState(globalClasses[0] || 'Class 1');
  const [selectedSection, setSelectedSection] = useState(globalSections[0] || 'Section A');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignments, setAssignments] = useState([]);

  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedExam, setSelectedExam] = useState('Quarterly');

  const [classStudents, setClassStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [marksMap, setMarksMap] = useState({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [isSavingMarks, setIsSavingMarks] = useState(false);

  // Dynamic subjects loaded from Firestore; fallback to DEFAULT_SUBJECTS for display only
  const [firestoreSubjects, setFirestoreSubjects] = useState([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  // Derived: subjects to show in UI — Firestore first, then defaults (NEVER written to DB)
  const availableSubjects = firestoreSubjects.length > 0
    ? firestoreSubjects.map(s => s.name)
    : DEFAULT_SUBJECTS;

  // ── Load Firestore subjects for this school/class ──────────────────────────
  useEffect(() => {
    const loadSubjects = async () => {
      const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : currentUser?.schoolId;
      if (!targetSchool) return;
      setIsLoadingSubjects(true);
      try {
        // Fetch subjects matching school; filter for this class or ALL in JS to avoid composite index
        const snap = await getDocs(query(collection(db, 'subjects'), where('schoolId', '==', targetSchool)));
        const list = [];
        snap.forEach(d => {
          const data = d.data();
          if (!data.isActive && data.status !== 'active' && data.isActive !== undefined) return;
          // Include if applicable to ALL classes or this specific class
          if (!data.class || data.class === 'ALL' || data.class === selectedClass) {
            list.push({ id: d.id, ...data });
          }
        });
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setFirestoreSubjects(list);
      } catch (err) {
        console.warn('Could not load subjects from Firestore, using defaults:', err.message);
        setFirestoreSubjects([]);
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    loadSubjects();
  }, [selectedSchool, selectedClass, currentUser?.schoolId]);

  // When availableSubjects change, make sure selectedSubject is valid
  useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects]);

  // ── Reset class/section on school switch ─────────────────────────────────
  useEffect(() => {
    if (globalClasses && globalClasses.length > 0) {
      setSelectedClass(globalClasses[0]);
    }
    if (globalSections && globalSections.length > 0) {
      setSelectedSection(globalSections[0]);
    }
  }, [selectedSchool]);

  // ── Load assignments ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : currentUser?.schoolId;
        const q = targetSchool
          ? query(collection(db, 'class_assignments'), where('schoolId', '==', targetSchool))
          : query(collection(db, 'class_assignments'));
        const querySnapshot = await getDocs(q);
        const assigns = [];
        querySnapshot.forEach((doc) => {
          assigns.push({ id: doc.id, ...doc.data() });
        });
        setAssignments(assigns);
      } catch (err) {
        console.error('Error fetching assignments:', err);
      }
    };
    fetchAssignments();
  }, [selectedSchool, currentUser]);

  // ── Load students; CLEAR stale attendance/marks on context switch ──────────
  useEffect(() => {
    // IMPORTANT: clear maps immediately to prevent stale data leaking across contexts
    setAttendanceMap({});
    setMarksMap({});
    setClassStudents([]);

    const fetchClassStudents = async () => {
      try {
        const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : currentUser?.schoolId;
        const normSec = normalizeSectionQuery(selectedSection);

        let q = query(
          collection(db, 'students'),
          where('class', '==', selectedClass),
          where('section', '==', normSec)
        );
        if (targetSchool) {
          q = query(
            collection(db, 'students'),
            where('class', '==', selectedClass),
            where('section', '==', normSec),
            where('schoolId', '==', targetSchool)
          );
        }
        const querySnapshot = await getDocs(q);
        const list = [];
        const initialAtt = {};
        const initialMarks = {};

        querySnapshot.forEach((d) => {
          const data = d.data();
          if (data.status === 'Deleted' || data.status === 'archived' || data.isDeleted === true) return;
          list.push({ id: d.id, ...data });
          initialAtt[d.id] = 'P';
          initialMarks[d.id] = '';
        });

        setClassStudents(list);
        setAttendanceMap(initialAtt);
        setMarksMap(initialMarks);
      } catch (err) {
        console.error('Error fetching students for academics:', err);
      }
    };
    fetchClassStudents();
  }, [selectedClass, selectedSection, selectedSchool]);

  // ── ALL guard ─────────────────────────────────────────────────────────────
  if (selectedSchool === 'ALL') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Academics & Activities</h1>
        </div>
        <SchoolFolderPicker
          title="Select Branch for Academics"
          description="Please select a specific school branch to manage attendance, grades, and activities."
          onSelectSchool={(schoolId) => setSelectedSchool && setSelectedSchool(schoolId)}
        />
      </div>
    );
  }

  // ── Authorization ─────────────────────────────────────────────────────────
  const isAttendanceAllowed = () => {
    if (!currentUser) return false;
    const role = currentUser.role;
    if (role === 'Administrator' || role === 'Principal' || role === 'Owner' || role === 'Director') return true;

    // Canonical Auth UID is the primary identity; staff doc id is secondary fallback
    const myUid = currentUser.uid;
    const myDocId = currentUser.id;
    const currentYear = activeAcademicYearId || 'AY_2026_27';
    const normSelectedSec = normalizeSectionQuery(selectedSection);
    const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : (currentUser?.schoolId || '');

    const assigned = assignments.find(a =>
      a.class === selectedClass &&
      (!a.section || a.section === 'All' || normalizeSectionQuery(a.section) === normSelectedSec) &&
      (!a.schoolId || a.schoolId === targetSchool) &&
      (!a.academicYearId || a.academicYearId === currentYear || a.academicYearId === 'AY_2025_26')
    );
    if (!assigned) return false;

    // Check against both uid (canonical) and id (legacy) to handle both storage formats
    const tid = assigned.teacherId;
    const tuid = assigned.teacherUid;
    return (myUid && (tid === myUid || tuid === myUid)) ||
           (myDocId && (tid === myDocId || tuid === myDocId));
  };

  const canMark = isAttendanceAllowed();

  // ── Attendance handlers ───────────────────────────────────────────────────
  const handleMarkAll = (status) => {
    const updated = {};
    classStudents.forEach(s => { updated[s.id] = status; });
    setAttendanceMap(updated);
  };

  const handleStatusChange = (studentId, status) => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendanceBatch = async () => {
    setIsSavingAttendance(true);
    try {
      const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : (currentUser?.schoolId || '');
      const academicYearId = activeAcademicYearId || 'AY_2026_27';
      const normSec = normalizeSectionQuery(selectedSection);
      const savedBy = currentUser?.uid || currentUser?.id || 'unknown';

      const savePromises = classStudents.map(student => {
        const status = attendanceMap[student.id] || 'P';
        const attendanceId = `${targetSchool}_${academicYearId}_${selectedClass}_${normSec || selectedSection}_${student.id}_${attendanceDate}`;
        return setDoc(doc(db, 'attendance_logs', attendanceId), {
          academicYearId,
          schoolId: targetSchool,
          class: selectedClass,
          section: selectedSection,
          normalizedSection: normSec,
          studentId: student.id,
          date: attendanceDate,
          status,
          savedBy,
          createdAt: new Date().toISOString()
        });
      });

      await Promise.all(savePromises);
      alert(`Attendance saved for ${selectedClass} (${selectedSection}) on ${attendanceDate}!`);
    } catch (err) {
      console.error('Error saving attendance:', err);
      alert('Failed to save attendance. Check Firestore rules / network.');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // ── Marks handlers ────────────────────────────────────────────────────────
  const handleSaveSubjectMarksBatch = async () => {
    if (!selectedSubject) { alert('Please select a subject first.'); return; }
    setIsSavingMarks(true);
    try {
      const targetSchool = (selectedSchool && selectedSchool !== 'ALL') ? selectedSchool : (currentUser?.schoolId || '');
      const academicYearId = activeAcademicYearId || 'AY_2026_27';
      const savedBy = currentUser?.uid || currentUser?.id || 'unknown';

      const savePromises = classStudents.map(student => {
        const score = marksMap[student.id];
        if (score === undefined || score === '') return Promise.resolve(); // Skip blank

        const marksId = `${targetSchool}_${academicYearId}_${selectedClass}_${selectedSection}_${student.id}_${selectedExam}_${selectedSubject}`;
        return setDoc(doc(db, 'exam_marks', marksId), {
          academicYearId,
          schoolId: targetSchool,
          class: selectedClass,
          section: selectedSection,
          studentId: student.id,
          subject: selectedSubject,
          exam: selectedExam,
          marks: Number(score),
          maxMarks: 100,
          savedBy,
          createdAt: new Date().toISOString()
        });
      });

      await Promise.all(savePromises);
      alert(`Marks saved for ${selectedSubject} (${selectedExam})!`);
    } catch (err) {
      console.error('Error saving marks:', err);
      alert('Failed to save subject marks. Check Firestore rules / network.');
    } finally {
      setIsSavingMarks(false);
    }
  };

  const validScores = Object.values(marksMap)
    .filter(v => v !== '' && !isNaN(Number(v)))
    .map(v => Number(v));
  const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
  const topScore = validScores.length > 0 ? Math.max(...validScores) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Academics</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Manage class attendance and student marks</p>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: 8, backgroundColor: 'var(--bg-secondary)', padding: 4, borderRadius: 12 }}>
          <button
            className={activeTab === 'attendance' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('attendance')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            <Calendar size={16} /> Daily Attendance
          </button>
          <button
            className={activeTab === 'marks' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('marks')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            <Award size={16} /> Subject Gradebook & Marks
          </button>
        </div>
      </div>

      {selectedSchool === 'ALL' && (
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Consolidated Academic View Active</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>You are viewing academic data across all campuses. To manage attendance or gradebook, please select a specific campus.</div>
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'center' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Class</label>
                <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                  {globalClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Section</label>
                <select className="form-input" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                  {globalSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Attendance Date</label>
                <input type="date" className="form-input" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <button className="btn-secondary" style={{ padding: '10px 12px', fontSize: 12 }} onClick={() => handleMarkAll('P')} disabled={!canMark}>Mark All Present</button>
                <button className="btn-secondary" style={{ padding: '10px 12px', fontSize: 12 }} onClick={() => handleMarkAll('A')} disabled={!canMark}>Mark All Absent</button>
              </div>
            </div>
          </div>

          {!canMark && (
            <div className="glass-card" style={{ padding: '12px 20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)', fontWeight: 600 }}>
              Access Denied: Only the assigned Class Teacher or an Administrator can mark attendance for this class.
            </div>
          )}

          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Attendance: {selectedClass} ({selectedSection})
              </h2>
              <button
                className="btn-primary"
                onClick={handleSaveAttendanceBatch}
                disabled={isSavingAttendance || !canMark || selectedSchool === 'ALL'}
                style={{ opacity: (isSavingAttendance || !canMark || selectedSchool === 'ALL') ? 0.5 : 1, cursor: (isSavingAttendance || !canMark || selectedSchool === 'ALL') ? 'not-allowed' : 'pointer' }}
              >
                <Check size={18} /> {isSavingAttendance ? 'Saving...' : 'Save'}
              </button>
            </div>

            {classStudents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No students enrolled in {selectedClass}. Register students first in Student Directory.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Student Name</th>
                      <th style={{ textAlign: 'center' }}>Mark Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(student => {
                      const currentStatus = attendanceMap[student.id] || 'P';
                      return (
                        <tr key={student.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{student.roll || 'N/A'}</td>
                          <td style={{ fontWeight: 600 }}>{student.name}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: 8 }}>
                              {[{ key: 'P', label: 'Present', color: '#10b981' }, { key: 'A', label: 'Absent', color: '#ef4444' }, { key: 'L', label: 'Late', color: '#f59e0b' }].map(({ key, label, color }) => (
                                <button
                                  key={key}
                                  type="button"
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: 'none',
                                    fontWeight: 700,
                                    cursor: canMark ? 'pointer' : 'not-allowed',
                                    opacity: canMark ? 1 : 0.6,
                                    backgroundColor: currentStatus === key ? color : 'var(--bg-secondary)',
                                    color: currentStatus === key ? '#fff' : 'var(--text-secondary)',
                                    transition: 'background 0.15s'
                                  }}
                                  onClick={() => canMark && handleStatusChange(student.id, key)}
                                  disabled={!canMark}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gradebook / Marks Tab */}
      {activeTab === 'marks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'center' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Class</label>
                <select className="form-input" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                  {globalClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Section</label>
                <select className="form-input" value={selectedSection} onChange={e => setSelectedSection(e.target.value)}>
                  {globalSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Subject {isLoadingSubjects && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>loading...</span>}</label>
                <select className="form-input" value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                  {firestoreSubjects.length === 0 && (
                    <option value="" disabled>— Default subjects (no custom configured) —</option>
                  )}
                  {availableSubjects.map(subj => <option key={subj} value={subj}>{subj}</option>)}
                </select>
                {firestoreSubjects.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    ℹ️ Using built-in defaults. Add custom subjects in Settings → Subject Management.
                  </div>
                )}
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Exam Type</label>
                <select className="form-input" value={selectedExam} onChange={e => setSelectedExam(e.target.value)}>
                  {EXAM_TYPES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Stats Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div className="glass-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Class Average Score</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-orange)', marginTop: 4 }}>{avgScore} / 100</div>
            </div>
            <div className="glass-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Highest Marks</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>{topScore} / 100</div>
            </div>
            <div className="glass-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Passing Criteria</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-primary)', marginTop: 4 }}>35% Minimum</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {selectedSubject || '—'} Gradebook ({selectedExam}) — {selectedClass} {selectedSection}
              </h2>
              <button
                className="btn-primary"
                onClick={handleSaveSubjectMarksBatch}
                disabled={isSavingMarks || selectedSchool === 'ALL' || !selectedSubject}
                style={{ opacity: (isSavingMarks || selectedSchool === 'ALL' || !selectedSubject) ? 0.5 : 1, cursor: (isSavingMarks || selectedSchool === 'ALL' || !selectedSubject) ? 'not-allowed' : 'pointer' }}
              >
                <Check size={18} /> {isSavingMarks ? 'Saving...' : 'Save'}
              </button>
            </div>

            {classStudents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No students enrolled in {selectedClass}. Register students first.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Student Name</th>
                      <th>Subject</th>
                      <th>Marks Obtained (Out of 100)</th>
                      <th style={{ textAlign: 'right' }}>Grade Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(student => {
                      const raw = marksMap[student.id];
                      const score = raw === '' || raw === undefined ? null : Number(raw);
                      const isPass = score !== null && score >= 35;
                      const grade = score === null ? '—' : score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B+' : score >= 60 ? 'B' : score >= 50 ? 'C' : score >= 33 ? 'D' : 'F';

                      return (
                        <tr key={student.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{student.roll || 'N/A'}</td>
                          <td style={{ fontWeight: 600 }}>{student.name}</td>
                          <td><span className="badge" style={{ backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', fontWeight: 700 }}>{selectedSubject}</span></td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className="form-input"
                              style={{ width: 100, fontWeight: 700, textAlign: 'center' }}
                              value={marksMap[student.id] !== undefined ? marksMap[student.id] : ''}
                              placeholder="—"
                              onChange={e => {
                                const val = e.target.value;
                                setMarksMap(prev => ({ ...prev, [student.id]: val }));
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {score !== null ? (
                              <>
                                <span className="badge" style={{ backgroundColor: isPass ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: isPass ? 'var(--success)' : 'var(--danger)', fontWeight: 700, marginRight: 8 }}>
                                  {isPass ? 'PASS' : 'FAIL'}
                                </span>
                                <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-blue)', fontWeight: 700 }}>
                                  {grade}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Not entered</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
