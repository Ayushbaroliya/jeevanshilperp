import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, FolderOpen, ChevronRight, Mic, Trash2, Edit2, X, AlertCircle, Sparkles, MessageCircle, Download, CreditCard, Calendar, BookOpen, Award, FileText, Receipt } from 'lucide-react';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { t } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { calculateStudentDue, normalizeClassFeeSettings, generateChargeSchedule, getJSPSFeeComponents, getJSICFeeComponents, applyPaymentsAndAdjustments, summarizeDues } from '../../utils/feeEngine';
import { generateStudentProfilePDF, generateFeeReceipt } from '../../utils/pdfGenerator';

const normalizeSectionQuery = (sec) => {
  if (!sec) return '';
  return sec.replace(/^Section\s+/i, '').trim();
};

export function StudentsDirectory({ onNavigate, lang, classes, sections, userPermissions, currentUser, onSelectStudent, selectedSchool, setSelectedSchool, classSettings = {}, searchQuery = '', activeAcademicYearId = '2026-2027' }) {
  const dict = t[lang] || t.en;
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSection, setSelectedSection] = useState('All');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [parentContact, setParentContact] = useState('');
  const [addSection, setAddSection] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);



  const [isNewAdmission, setIsNewAdmission] = useState(false);

  // Edit Student State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFatherName, setEditFatherName] = useState('');
  const [editRoll, setEditRoll] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editIsNewAdmission, setEditIsNewAdmission] = useState(false);

  const [teacherAssignments, setTeacherAssignments] = useState([]);

  useEffect(() => {
    if (currentUser?.role === 'Teacher' || currentUser?.role === 'Senior Teacher') {
      const fetchMyClasses = async () => {
        try {
          let q = query(collection(db, "class_assignments"), where("teacherId", "==", currentUser.id));
          if (currentUser?.schoolId) {
            q = query(collection(db, "class_assignments"), where("teacherId", "==", currentUser.id), where("schoolId", "==", currentUser.schoolId));
          }
          const querySnapshot = await getDocs(q);
          const assignments = [];
          querySnapshot.forEach(doc => assignments.push(doc.data()));
          setTeacherAssignments(assignments);
        } catch (err) {
          console.error("Error fetching assigned classes:", err);
        }
      };
      fetchMyClasses();
    }
  }, [currentUser]);

  const hasStudentEditPermission = (studentClass, studentSection) => {
    if (userPermissions?.manageStudents === false) return false;
    if (selectedSchool === 'ALL') return false;
    if (currentUser?.role !== 'Teacher' && currentUser?.role !== 'Senior Teacher') return true;
    
    // For teachers, they must be assigned to this class and section
    return teacherAssignments.some(assignment => {
      const classMatch = assignment.class === studentClass;
      // If assignment has no section, or section is 'All', or section matches exactly
      const normalizedAssignmentSection = normalizeSectionQuery(assignment.section);
      const normalizedStudentSection = normalizeSectionQuery(studentSection);
      const sectionMatch = !assignment.section || assignment.section === 'All' || !studentSection || studentSection === 'All' || normalizedAssignmentSection === normalizedStudentSection;
      return classMatch && sectionMatch;
    });
  };

  // Cleanly reset class and student directory view upon switching schools
  useEffect(() => {
    setSelectedClass(null);
    setSelectedSection('All');
    setStudents([]);
  }, [selectedSchool]);

  // Support Escape key to close modal windows
  useEffect(() => {
    const handleModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingStudent) setEditingStudent(null);
        if (isAddingStudent) setIsAddingStudent(false);
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [editingStudent, isAddingStudent]);

  useEffect(() => {
    if (isAddingStudent && sections && sections.length > 0 && !addSection) {
      setAddSection(sections[0]);
    }
  }, [isAddingStudent, sections, addSection]);

  useEffect(() => {
    if (selectedClass) {
      const fetchStudents = async () => {
        setIsLoading(true);
        try {
          let q = collection(db, "students");
          
          if (selectedSchool && selectedSchool !== 'ALL') {
            if (selectedSection === 'All') {
              q = query(q, where("schoolId", "==", selectedSchool), where("class", "==", selectedClass));
            } else {
              q = query(q, where("schoolId", "==", selectedSchool), where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
            }
          } else {
            if (selectedSection === 'All') {
              q = query(q, where("class", "==", selectedClass));
            } else {
              q = query(q, where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
            }
          }
          
          const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
          let chargeQuery = collection(db, 'fee_charges');
          if (selectedSchool && selectedSchool !== 'ALL') {
            chargeQuery = query(chargeQuery, where('schoolId', '==', selectedSchool), where('academicYearId', '==', canonicalYearId));
          } else {
            chargeQuery = query(chargeQuery, where('academicYearId', '==', canonicalYearId));
          }

          const queries = [
            getDocs(q),
            getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
            getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
            getDocs(chargeQuery)
          ];

          const results = await Promise.all(queries);
          const querySnapshot = results[0];
          const paymentSnap = results[1];
          const adjustmentSnap = results[2];
          const chargesSnap = results[3];
          
          const paymentsByStudent = {};
          paymentSnap.forEach(d => { const p = d.data(); (paymentsByStudent[p.studentId] ||= []).push(p); });
          
          const adjustmentsByStudent = {};
          adjustmentSnap.forEach(d => { const a = d.data(); (adjustmentsByStudent[a.studentId] ||= []).push(a); });

          const chargesByStudent = {};
          if (chargesSnap) {
            chargesSnap.forEach(d => { const c = d.data(); (chargesByStudent[c.studentId] ||= []).push({ id: d.id, ...c }); });
          }

          const loadedStudents = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status !== 'Deleted' && data.status !== 'archived') {
              const sSettings = normalizeClassFeeSettings(classSettings[data.class] || {});
              const result = calculateStudentDue({
                student: { id: docSnap.id, ...data },
                charges: chargesByStudent[docSnap.id],
                classSettings: sSettings,
                payments: paymentsByStudent[docSnap.id] || [],
                adjustments: adjustmentsByStudent[docSnap.id] || []
              });
              const liveDue = result.totalDue;
              loadedStudents.push({ id: docSnap.id, ...data, liveDue });
            }
          });
          
          // Check if Teacher has assigned classes logic
          if (currentUser && currentUser.role === 'Teacher' && teacherAssignments.length > 0) {
            setStudents(loadedStudents.filter(student => hasStudentEditPermission(student.class, student.section)));
          } else {
            setStudents(loadedStudents);
          }
        } catch (error) {
          console.error("Error fetching students: ", error);
          setStudents([]);
        }
        setIsLoading(false);
      };
      fetchStudents();
    }
  }, [selectedClass, selectedSection, selectedSchool, teacherAssignments, classSettings]);

  // Filter loaded students by the global top search bar query
  const filteredStudents = searchQuery.trim()
    ? students.filter(s => {
        const q = searchQuery.trim().toLowerCase();
        return (
          (s.name || '').toLowerCase().includes(q) ||
          (s.roll || '').toString().toLowerCase().includes(q) ||
          (s.section || '').toLowerCase().includes(q) ||
          (s.contact || '').toLowerCase().includes(q)
        );
      })
    : students;

  // If ALL schools are selected, force user to pick a school first
  if (selectedSchool === 'ALL') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="icon-btn" onClick={() => onNavigate('dashboard')} style={{ backgroundColor: 'var(--bg-secondary)', padding: 10 }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Student Directory</h1>
        </div>
        <SchoolFolderPicker 
          title="Select Branch for Student Directory" 
          description="Please select a specific school branch to view and manage its students."
          onSelectSchool={(schoolId) => setSelectedSchool && setSelectedSchool(schoolId)}
        />
      </div>
    );
  }

  const handleSaveStudent = async (keepOpen = false) => {
    if (!studentName || !rollNumber) {
      alert("Name and Roll Number are required!");
      return;
    }

    const targetSchool = selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01';
    const targetAcademicYear = activeAcademicYearId || 'AY_2026_27'; // Current academic year context
    const targetAcademicYearLabel = targetAcademicYear === 'AY_2026_27' ? '2026-2027' : '2025-2026';

    // ── 5-field Duplicate Roll-Number Guard (schoolId + academicYearId + class + section + roll) ──
    try {
      const dupQ = query(
        collection(db, "enrollments"),
        where("schoolId",       "==", targetSchool),
        where("academicYearId", "==", targetAcademicYear),
        where("class",          "==", selectedClass),
        where("section",        "==", normalizeSectionQuery(addSection)),
        where("roll",           "==", rollNumber)
      );
      const dupSnap = await getDocs(dupQ);
      const hasDup = dupSnap.docs.some(d => d.data().status !== 'Left' && d.data().status !== 'Withdrawn');
      if (hasDup) {
        alert(`Roll number "${rollNumber}" is already assigned to another student in ${selectedClass} (${addSection}) for ${targetAcademicYear}. Please use a different roll number.`);
        return;
      }
    } catch (dupErr) {
      console.error("Duplicate roll check failed:", dupErr);
    }
    // ────────────────────────────────────────────────────────────────

    try {
      // 1. Create Permanent Student Record
      const studentDocRef = await addDoc(collection(db, "students"), {
        name: studentName,
        fatherName: fatherName,
        roll: rollNumber,
        contact: parentContact,
        class: selectedClass,
        section: normalizeSectionQuery(addSection),
        schoolId: targetSchool,
        isNewAdmission: isNewAdmission,
        academicYear: targetAcademicYearLabel,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      // 2. Create Yearly Enrollment Record
      await addDoc(collection(db, "enrollments"), {
        studentId: studentDocRef.id,
        schoolId: targetSchool,
        academicYearId: targetAcademicYear,
        class: selectedClass,
        section: normalizeSectionQuery(addSection),
        roll: rollNumber,
        fatherName: fatherName,
        status: 'Active',
        attendance: '100%',
        isNewAdmission: isNewAdmission,
        createdAt: new Date().toISOString()
      });

      // 3. Generate permanent fee_charges snapshot from class settings
      let classFeeConfig = classSettings?.[selectedClass];
      if (!classFeeConfig || !classFeeConfig.components || classFeeConfig.components.length === 0) {
        const defaultComps = targetSchool === 'SCH_01'
          ? getJSPSFeeComponents(selectedClass, targetAcademicYearLabel)
          : getJSICFeeComponents(selectedClass, targetAcademicYearLabel);
        classFeeConfig = { components: defaultComps };
      }
      const feeTemplate = normalizeClassFeeSettings(classFeeConfig, targetAcademicYearLabel);
      const mockStudent = {
        id: studentDocRef.id,
        isNewAdmission: isNewAdmission,
        academicYear: targetAcademicYearLabel
      };
      const initialCharges = generateChargeSchedule(mockStudent, feeTemplate, targetAcademicYearLabel);

      if (initialCharges && initialCharges.length > 0) {
        const chargeBatch = writeBatch(db);
        for (const charge of initialCharges) {
          const chargeRef = doc(collection(db, "fee_charges"));
          chargeBatch.set(chargeRef, {
            id: charge.id,
            studentId: studentDocRef.id,
            academicYear: targetAcademicYearLabel,
            academicYearId: targetAcademicYear,
            schoolId: targetSchool,
            class: selectedClass,
            section: normalizeSectionQuery(addSection),
            componentId: charge.componentId,
            label: charge.label,
            originalAmount: charge.originalAmount,
            dueDate: charge.dueDate,
            status: 'unpaid',
            allocatedPaid: 0,
            allocatedAdjusted: 0,
            netDue: charge.originalAmount,
            type: charge.type || 'standard',
            createdAt: new Date().toISOString()
          });
        }
        await chargeBatch.commit();
      }
      
      if (!keepOpen) {
        setIsAddingStudent(false);
      } else {
        const btn = document.getElementById('save-next-btn');
        if (btn) {
          const originalText = btn.innerText;
          btn.innerText = '✅ Saved!';
          setTimeout(() => { btn.innerText = originalText; }, 1000);
        }
      }
      
      setStudentName('');
      setFatherName('');
      setRollNumber('');
      setParentContact('');
      setIsNewAdmission(false);

      if (selectedClass) {
        setIsLoading(true);
        let q;
        if (selectedSection === 'All') {
          q = query(collection(db, "students"), where("class", "==", selectedClass));
        } else {
          q = query(collection(db, "students"), where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
        }
        const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
        let chargeQuery = collection(db, 'fee_charges');
        if (targetSchool && targetSchool !== 'ALL') {
          chargeQuery = query(chargeQuery, where('schoolId', '==', targetSchool), where('academicYearId', '==', canonicalYearId));
        } else {
          chargeQuery = query(chargeQuery, where('academicYearId', '==', canonicalYearId));
        }

        const [querySnapshot, paymentSnap, adjustmentSnap, chargeSnap] = await Promise.all([
          getDocs(q),
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
          getDocs(chargeQuery)
        ]);
        
        const paymentsByStudent = {};
        paymentSnap.forEach(d => { const p = d.data(); (paymentsByStudent[p.studentId] ||= []).push(p); });
        
        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => { const a = d.data(); (adjustmentsByStudent[a.studentId] ||= []).push(a); });

        const chargesByStudent = {};
        chargeSnap.forEach(d => { const c = d.data(); (chargesByStudent[c.studentId] ||= []).push({ id: d.id, ...c }); });

        const loadedStudents = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.status !== 'Deleted' && data.status !== 'archived') {
            const sSettings = normalizeClassFeeSettings(classSettings[data.class] || {});
            const result = calculateStudentDue({
              student: { id: doc.id, ...data },
              charges: chargesByStudent[doc.id],
              classSettings: sSettings,
              payments: paymentsByStudent[doc.id] || [],
              adjustments: adjustmentsByStudent[doc.id] || []
            });
            const liveDue = result.totalDue;
            
            loadedStudents.push({ id: doc.id, ...data, liveDue });
          }
        });
        setStudents(loadedStudents);
        setIsLoading(false);
      }
    } catch (e) {
      console.error("Error adding student: ", e);
      alert("Error adding student.");
    }
  };

  const handleBack = () => {
    if (isAddingStudent) {
      setIsAddingStudent(false);
    } else if (selectedClass) {
      setSelectedClass(null);
      setSelectedSection('All');
    } else {
      onNavigate('dashboard');
    }
  };

  const toggleVoiceTyping = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice typing is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const formatted = transcript.charAt(0).toUpperCase() + transcript.slice(1);
      setStudentName(formatted);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  const handleDeleteStudent = async (studentId, name) => {
    if (window.confirm(`Mark student "${name}" as Left/Withdrawn? Historical financial records will be preserved.`)) {
      try {
        await updateDoc(doc(db, "students", studentId), {
          status: 'Left',
          leftAt: new Date().toISOString()
        });

        try {
          const { logAuditAction } = await import('../../utils/auditLogger');
          await logAuditAction({
            action: 'STUDENT_MARKED_LEFT',
            performedBy: currentUser?.name || currentUser?.uid || 'Unknown',
            schoolId: selectedSchool,
            details: { studentId, studentName: name }
          });
        } catch (e) {
          console.error("Audit log failed:", e);
        }

        setStudents(prev => prev.filter(s => s.id !== studentId));
        alert(`Student "${name}" marked as Left. Historical records preserved.`);
      } catch (err) {
        console.error("Error updating student status:", err);
      }
    }
  };

  const handleOpenEdit = (student, e) => {
    e.stopPropagation();
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditFatherName(student.fatherName || student.parentName || '');
    setEditRoll(student.roll || '');
    setEditClass(student.class || selectedClass || 'Class 1');
    setEditSection(student.section || 'Section A');
    setEditContact(student.contact || '');
    setEditIsNewAdmission(student.isNewAdmission === true || student.admissionType === 'new');
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;

    // ── Duplicate roll number guard (skip own record) ────────────────
    if (editRoll.trim()) {
      try {
        const q = query(collection(db, "students"), 
          where("schoolId", "==", editingStudent.schoolId || selectedSchool || 'SCH_01'),
          where("class",    "==", editClass),
          where("section",  "==", normalizeSectionQuery(editSection)),
          where("roll",     "==", editRoll.trim())
        );
        const dupSnap = await getDocs(q);
        const hasDup = dupSnap.docs.some(
          d => d.id !== editingStudent.id && d.data().status !== 'archived' && d.data().status !== 'Deleted'
        );
        if (hasDup) {
          alert(`Roll number "${editRoll}" is already assigned to another student in ${editClass} (${editSection}). Please use a different roll number.`);
          return;
        }
      } catch (dupErr) {
        console.error("Duplicate roll check failed:", dupErr);
      }
    }
    // ────────────────────────────────────────────────────────────────

    try {
      if (editingStudent) {
        await updateDoc(doc(db, "students", editingStudent.id), {
          name: editName,
          fatherName: editFatherName,
          roll: editRoll,
          class: editClass,
          section: normalizeSectionQuery(editSection),
          contact: editContact,
          isNewAdmission: editIsNewAdmission
        });
      }
      setStudents(prev => prev.map(s => s.id === editingStudent.id ? {
        ...s,
        name: editName,
        fatherName: editFatherName,
        roll: editRoll,
        class: editClass,
        section: normalizeSectionQuery(editSection),
        contact: editContact,
        isNewAdmission: editIsNewAdmission
      } : s));
      alert("Student information updated successfully!");
      setEditingStudent(null);
    } catch (err) {
      console.error("Error updating student:", err);
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          {selectedClass || isAddingStudent ? (
            <button className="btn-secondary" onClick={handleBack} style={{ marginBottom: 16 }}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : null}
          <h1 className="page-title">
            {isAddingStudent
              ? 'Add New Student'
              : !selectedClass
                ? 'Classes Directory'
                : `${selectedClass} - Students`}
          </h1>
          <p className="page-subtitle">
            {isAddingStudent
              ? `Register a new student for ${selectedClass}`
              : !selectedClass
                ? 'Select a class to view its students'
                : 'Filter by section, click a student to view details, or delete'}
          </p>
        </div>

        <div className="header-actions-responsive">
          {selectedClass && !isAddingStudent && hasStudentEditPermission(selectedClass, selectedSection) && (
            <button className="btn-info" onClick={() => setIsAddingStudent(true)}>
              <Plus size={18} /> Add Student
            </button>
          )}
        </div>
      </div>

      {selectedSchool === 'ALL' && !isAddingStudent && !selectedClass && (
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: 12, marginBottom: 24, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Consolidated View Active</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>You are viewing data across all campuses. To add new students or perform operational tasks, please select a specific campus from the top navigation menu.</div>
          </div>
        </div>
      )}

      {isAddingStudent && (
        <div className="glass-card">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Student Registration Details</h2>
          <div className="grid-responsive">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Aarav Patel"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  style={{ paddingRight: 40, width: '100%', borderColor: isListening ? 'var(--danger)' : undefined }}
                />
                <button
                  className={`icon-btn ${isListening ? 'mic-listening' : ''}`}
                  onClick={toggleVoiceTyping}
                  style={{ position: 'absolute', right: 8, color: isListening ? 'var(--danger)' : 'var(--text-secondary)', transition: 'all 0.3s ease' }}
                  title="Use Voice Typing"
                >
                  <Mic size={18} />
                </button>
              </div>
              {isListening && <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'block', fontWeight: 600 }}>Listening... Speak now</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Roll Number</label>
              <input type="text" className="form-input" placeholder="e.g. 42" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Parent Contact</label>
              <input type="text" className="form-input" placeholder="+91..." value={parentContact} onChange={(e) => setParentContact(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Section</label>
              <select className="form-input" value={addSection} onChange={(e) => setAddSection(e.target.value)}>
                {sections && sections.length > 0 ? sections.map(sec => <option key={sec} value={sec}>{sec}</option>) : <option>No Sections Available</option>}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={isNewAdmission}
                  onChange={(e) => setIsNewAdmission(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span>☐ New Admission / नया प्रवेश</span>
              </label>
            </div>
          </div>

          <div className="header-actions-responsive" style={{ marginTop: 24, justifyContent: 'flex-end', display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setIsAddingStudent(false)}>Cancel</button>
            <button id="save-next-btn" className="btn-secondary" onClick={() => handleSaveStudent(true)} style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>Save & Add Next</button>
            <button className="btn-primary" onClick={() => handleSaveStudent(false)}>Save & Close</button>
          </div>
        </div>
      )}

      {!isAddingStudent && !selectedClass && (
        <div className="grid-responsive">
          {classes && classes.map(cls => (
            <div
              key={cls}
              className="glass-card"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20 }}
              onClick={() => setSelectedClass(cls)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FolderOpen size={24} color="var(--accent-primary)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{cls}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Manage Enrollments
                  </div>
                </div>
              </div>
              <ChevronRight size={20} color="var(--text-secondary)" />
            </div>
          ))}
        </div>
      )}

      {!isAddingStudent && selectedClass && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Section:</span>
            <select 
              className="form-input" 
              style={{ width: 150, padding: '8px 12px' }} 
              value={selectedSection} 
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              <option value="All">All Sections</option>
              {sections && sections.map(sec => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading students...</div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              {searchQuery.trim() ? `No students match "${searchQuery}"` : `No students found in ${selectedSection === 'All' ? 'this class' : selectedSection}.`}
            </div>
          ) : (
            <div className="grid-responsive">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="glass-card flex-responsive"
                  onClick={() => {
                    if (onSelectStudent) onSelectStudent(student);
                    onNavigate('ledger');
                  }}
                  style={{ cursor: 'pointer', padding: 20 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{student.name}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>Roll: {student.roll}</span>
                        <span>Sec: {student.section}</span>
                        <span>{student.fatherName || student.parentName ? `Father: ${student.fatherName || student.parentName}` : 'No Father Name'}</span>
                        {student.contact && <span>📞 {student.contact}</span>}
                        <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', padding: '2px 8px' }}>{student.attendance || '100%'}</span>
                        <span className="badge" style={{ backgroundColor: student.liveDue > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: student.liveDue > 0 ? 'var(--danger)' : 'var(--success)', padding: '2px 8px' }}>
                          Dues: ₹{student.liveDue || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasStudentEditPermission(student.class, student.section) && (
                      <>
                        <button
                          className="icon-btn"
                          title="Edit Student Info"
                          style={{ color: 'var(--brand-orange)', padding: 6 }}
                          onClick={(e) => handleOpenEdit(student, e)}
                        >
                          <Edit2 size={18} />
                        </button>
                        {(currentUser?.role === 'Administrator' || currentUser?.role === 'Principal') && (
                          <button
                            className="icon-btn"
                            title="Delete Student"
                            style={{ color: 'var(--danger)', padding: 6 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStudent(student.id, student.name);
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </>
                    )}
                    <ChevronRight size={20} color="var(--text-secondary)" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Student Info Modal */}
      {editingStudent && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setEditingStudent(null); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 28, position: 'relative' }}>
            <button onClick={() => setEditingStudent(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>

            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Edit2 size={22} color="var(--brand-orange)" /> Edit Student Record
            </h3>

            <form onSubmit={handleSaveStudentEdit}>
              <div className="grid-responsive">
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Father's Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editFatherName}
                    onChange={(e) => setEditFatherName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Roll Number</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editRoll}
                    onChange={(e) => setEditRoll(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Class</label>
                  <select
                    className="form-input"
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value)}
                  >
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Section</label>
                  <select
                    className="form-input"
                    value={editSection}
                    onChange={(e) => setEditSection(e.target.value)}
                  >
                    {sections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" style={{ fontWeight: 700 }}>Parent Mobile Contact</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={editIsNewAdmission}
                      onChange={(e) => setEditIsNewAdmission(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <span>☐ New Admission / नया प्रवेश</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                <button className="btn-secondary" type="button" onClick={() => setEditingStudent(null)}>Cancel</button>
                <button className="btn-primary" type="submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Senior Product Designer SaaS Redesign of Student Dashboard Profile
export function StudentLedger({ onNavigate, lang = 'en', activeStudent, userPermissions, selectedSchool, activeAcademicYearId }) {
  const dict = t[lang] || t.en;
  const [isEditingName, setIsEditingName] = useState(false);
  const [studentName, setStudentName] = useState(activeStudent?.name || 'Anjali Sharma');
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isReportCardModalOpen, setIsReportCardModalOpen] = useState(false);

  // ── Real data state ──────────────────────────────────────────────
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0, total: 0, percent: 0 });
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [marksData, setMarksData] = useState([]); // array of { subject, marks, total, grade }
  const [marksAvg, setMarksAvg] = useState(0);
  const [topSubject, setTopSubject] = useState(null);
  const [weakSubject, setWeakSubject] = useState(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [annualFee, setAnnualFee] = useState(0);
  const [annualTuitionFee, setAnnualTuitionFee] = useState(0);
  const [liveDue, setLiveDue] = useState(activeStudent?.liveDue ?? activeStudent?.openingArrears ?? activeStudent?.dueAmount ?? 0);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [calendarDays, setCalendarDays] = useState([]);
  const [selectedExamView, setSelectedExamView] = useState('Quarterly');
  const examOptions = ['Quarterly', 'Half Yearly', 'Final Exam'];

  useEffect(() => {
    if (activeStudent?.name) {
      setStudentName(activeStudent.name);
    }
  }, [activeStudent]);

  // ── Fetch attendance data ──────────────────────────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;
    const fetchAttendance = async () => {
      try {
        const constraints = [where('studentId', '==', activeStudent.id)];
        if (activeStudent.schoolId) constraints.push(where('schoolId', '==', activeStudent.schoolId));
        const q = query(collection(db, 'attendance_logs'), ...constraints);
        const snap = await getDocs(q);
        const logs = [];
        let present = 0, absent = 0, late = 0;
        snap.forEach(d => {
          const data = d.data();
          logs.push({ id: d.id, ...data });
          const s = (data.status || '').toLowerCase();
          if (s === 'present') present++;
          else if (s === 'absent') absent++;
          else if (s === 'late' || s === 'half day') late++;
          else present++; // default to present
        });
        const total = present + absent + late;
        setAttendanceStats({ present, absent, late, total, percent: total > 0 ? Math.round((present / total) * 100) : 0 });
        setAttendanceLogs(logs);
      } catch (err) {
        console.error('Error fetching attendance:', err);
      }
    };
    fetchAttendance();
  }, [activeStudent?.id, activeStudent?.schoolId]);

  // ── Fetch exam marks ───────────────────────────────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;
    const fetchMarks = async () => {
      try {
        const constraints = [where('studentId', '==', activeStudent.id)];
        if (activeStudent.schoolId) constraints.push(where('schoolId', '==', activeStudent.schoolId));
        const q = query(collection(db, 'exam_marks'), ...constraints);
        const snap = await getDocs(q);
        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));
        setMarksData(all);

        // Compute stats from most recent exam marks
        if (all.length > 0) {
          const latestExam = all.filter(m => m.exam === selectedExamView);
          const pool = latestExam.length > 0 ? latestExam : all;
          const totalMarks = pool.reduce((sum, m) => sum + (Number(m.marks) || 0), 0);
          const totalMax = pool.reduce((sum, m) => sum + (Number(m.totalMarks) || Number(m.maxMarks) || 100), 0);
          const avg = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100 * 10) / 10 : 0;
          setMarksAvg(avg);

          const subjectScores = pool.map(m => ({
            subject: m.subject,
            pct: (Number(m.totalMarks) || Number(m.maxMarks) || 100) > 0
              ? Math.round((Number(m.marks) || 0) / (Number(m.totalMarks) || Number(m.maxMarks) || 100) * 100)
              : 0,
            marks: Number(m.marks) || 0,
            total: Number(m.totalMarks) || Number(m.maxMarks) || 100
          }));
          if (subjectScores.length > 0) {
            const sorted = [...subjectScores].sort((a, b) => b.pct - a.pct);
            setTopSubject(sorted[0]);
            setWeakSubject(sorted[sorted.length - 1]);
          }
        } else {
          setMarksAvg(0);
          setTopSubject(null);
          setWeakSubject(null);
        }
      } catch (err) {
        console.error('Error fetching marks:', err);
      }
    };
    fetchMarks();
  }, [activeStudent?.id, activeStudent?.schoolId, selectedExamView]);

  // ── Fetch financial data (invoices / payments) ─────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;
    const fetchFinancials = async () => {
      try {
        let invoiceQ = query(collection(db, 'invoices'), where('studentId', '==', activeStudent.id));
        if (activeStudent.schoolId) {
          invoiceQ = query(invoiceQ, where('schoolId', '==', activeStudent.schoolId));
        }
        const snap = await getDocs(invoiceQ);
        let invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Fallback: If no invoices found in invoices collection, check student_ledger for credit transactions
        if (invoices.length === 0) {
          let ledgerQ = query(collection(db, 'student_ledger'), where('studentId', '==', activeStudent.id), where('type', '==', 'credit'));
          if (activeStudent.schoolId) {
            ledgerQ = query(ledgerQ, where('schoolId', '==', activeStudent.schoolId));
          }
          const ledgerSnap = await getDocs(ledgerQ);
          invoices = ledgerSnap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              receiptNo: data.receiptNumber || data.receiptId || d.id.slice(0, 10),
              receiptId: data.receiptNumber || data.receiptId || d.id.slice(0, 10),
              amount: data.amount,
              date: data.date,
              status: 'Paid',
              allocations: data.allocations || []
            };
          });
        }

        // Fetch fee adjustments (waivers) to include in the ledger history
        let adjustmentQ = query(collection(db, 'fee_adjustments'), where('studentId', '==', activeStudent.id), where('status', '==', 'approved'));
        if (activeStudent.schoolId) {
          adjustmentQ = query(adjustmentQ, where('schoolId', '==', activeStudent.schoolId));
        }
        const [adjSnap, chargeSnap] = await Promise.all([
          getDocs(adjustmentQ),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', activeStudent.id)))
        ]);

        const rawAdjustments = adjSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const adjustments = rawAdjustments.map(data => ({
          id: data.id,
          date: data.createdAt || data.date,
          description: `Fee Waiver (${data.reason || 'Reason not recorded'})`,
          feeType: `Fee Waiver (${data.reason || 'Reason not recorded'})`,
          amount: data.amount,
          status: 'Approved',
          type: 'waiver',
          receiptNo: 'WAIVER-' + data.id.slice(0, 5),
          receiptId: 'WAIVER-' + data.id.slice(0, 5)
        }));

        const combinedHistory = [...invoices, ...adjustments];
        combinedHistory.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        let paid = 0;
        invoices.forEach(inv => {
          paid += Number(inv.amount) || 0;
        });
        setTotalPaid(paid);
        setPaymentHistory(combinedHistory);

        const dbCharges = chargeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (dbCharges.length > 0) {
          const res = applyPaymentsAndAdjustments(dbCharges, invoices, rawAdjustments);
          const summary = summarizeDues(activeStudent, res.ledger, res.advanceCredit);
          
          setLiveDue(summary.totalDue);
          setTotalPaid(summary.totalPaid);
          setWalletBalance(summary.advanceCredit);

          const totalChargesAmount = dbCharges.reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
          const totalTuitionAmount = dbCharges.filter(c => c.componentId === 'tuition').reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);

          setAnnualFee(totalChargesAmount);
          setAnnualTuitionFee(totalTuitionAmount);
        } else {
          // Fallback if no permanent charges exist
          const studentDue = activeStudent?.liveDue ?? activeStudent?.openingArrears ?? activeStudent?.dueAmount ?? 0;
          setLiveDue(Number(studentDue));
          const annual = paid + Number(studentDue);
          setAnnualFee(annual);
          setAnnualTuitionFee(annual);
          const wallet = paid > annual ? paid - annual : 0;
          setWalletBalance(wallet);
        }
      } catch (err) {
        console.error('Error fetching financials:', err);
      }
    };
    fetchFinancials();
  }, [activeStudent?.id, activeStudent?.schoolId]);

  // ── Calendar data for modal ────────────────────────────────────
  useEffect(() => {
    if (!isCalendarModalOpen || !activeStudent?.id) return;
    const [year, month] = calendarMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const days = [];
    // Fill leading blanks
    for (let i = 0; i < firstDay; i++) days.push(null);
    // Fill actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = attendanceLogs.find(l => l.date === dateStr);
      days.push({ day: d, status: log ? log.status : null, date: dateStr });
    }
    setCalendarDays(days);
  }, [isCalendarModalOpen, calendarMonth, attendanceLogs, activeStudent?.id]);

  const parentName = activeStudent?.parentName || "N/A";
  const parentContact = activeStudent?.contact || "N/A";
  const studentId = activeStudent?.id || "N/A";
  const studentClass = activeStudent?.class || "N/A";
  const dueAmount = liveDue;

  const handleSaveName = () => {
    setIsEditingName(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1120, margin: '0 auto', paddingBottom: 40 }}>
      {/* 1. Header Navigation & High-Contrast Student Title */}
      <div>
        <button
          className="btn-secondary"
          onClick={() => onNavigate('students')}
          style={{ marginBottom: 16, padding: '6px 12px', fontSize: 13, fontWeight: 600 }}
        >
          <ArrowLeft size={16} /> {lang === 'hi' ? 'निर्देशिका पर वापस जाएं' : 'Back to Directory'}
        </button>

        <div className="flex-responsive" style={{ alignItems: 'flex-start' }}>
          {/* Group 1: Student Avatar & 32px Typography */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: 'var(--brand-orange)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 900,
              boxShadow: '0 8px 20px rgba(191, 87, 0, 0.25)'
            }}>
              {studentName.charAt(0)}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isEditingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      style={{ fontSize: 26, fontWeight: 900, padding: '4px 10px', width: 260 }}
                      autoFocus
                    />
                    <button className="btn-primary" onClick={handleSaveName} style={{ padding: '6px 14px' }}>{dict.save}</button>
                  </div>
                ) : (
                  <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' }}>
                    {studentName}
                  </h1>
                )}
                {!isEditingName && (
                  <button className="icon-btn" onClick={() => setIsEditingName(true)} title="Edit Student Name">
                    <Edit2 size={18} color="var(--text-secondary)" />
                  </button>
                )}
              </div>

              {/* Metadata Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13 }}>
                  {studentClass}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ID: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{studentId}</span>
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>•</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {dict.parentName}: <strong>{parentName}</strong> ({parentContact})
                </span>
              </div>
            </div>
          </div>

          {/* Group 2: Right Side CTAs Hierarchy */}
          <div className="header-actions-responsive">
            {/* Primary Action Button */}
            <button
              className="btn-primary"
              onClick={() => onNavigate('finance')}
              style={{
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                color: '#ffffff',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 800,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Plus size={18} /> {dict.recordPayment}
            </button>

            {/* Secondary Action Button */}
            <button
              className="btn-secondary"
              onClick={() => window.open(`https://wa.me/919876543210?text=Hello%20${encodeURIComponent(parentName)},%20this%20is%20a%20notification%20regarding%20${encodeURIComponent(studentName)}'s%20school%20fees.`, '_blank')}
              style={{ borderColor: '#25D366', color: '#25D366', fontWeight: 700, padding: '10px 16px', fontSize: 13 }}
            >
              <MessageCircle size={18} /> {dict.whatsApp}
            </button>

            {/* Tertiary Action Button */}
            <button
              className="btn-secondary"
              title="Export Profile PDF"
              onClick={() => generateStudentProfilePDF(
                { name: studentName, id: studentId, class: studentClass, contact: parentContact, parentName },
                { attendancePercent: attendanceStats.percent, marksAvg, paid: totalPaid, due: annualFee - totalPaid }
              )}
              style={{ padding: '10px', color: 'var(--text-secondary)' }}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Hero Financial Summary Card (Finance First) */}
      {userPermissions?.viewInvoices !== false && (
        <div className="glass-card" style={{
          padding: 24,
          borderRadius: 20,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)'
        }}>
          <div className="flex-responsive" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  {dict.financialSummary}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Academic Year</span>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={() => onNavigate('finance')}
              style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontSize: 13, fontWeight: 700, padding: '8px 16px' }}
            >
              <CreditCard size={16} /> {dict.recordPayment}
            </button>
          </div>

          {/* 4 Metric Columns */}
          <div className="grid-responsive">
            {/* Outstanding Due */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: 16,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: 12, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                {dict.outstandingDue}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                ₹ {dueAmount ? Number(dueAmount).toLocaleString() : '0'}.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, fontWeight: 600 }}>
                {dueAmount ? 'Immediate action required' : 'No outstanding dues'}
              </div>
            </div>

            {/* Paid Amount */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: 16,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: 12, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                {dict.totalFeesPaid}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                ₹ {totalPaid > 0 ? totalPaid.toLocaleString() : '0'}.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {totalPaid > 0 ? `${paymentHistory.length} transaction(s) recorded` : 'No payments yet'}
              </div>
            </div>

            {/* Wallet Balance */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: 16,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: 12, color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                {dict.walletBalance}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--brand-orange)' }}>
                ₹ {walletBalance > 0 ? walletBalance.toLocaleString() : '0'}.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {walletBalance > 0 ? 'Advance deposit available' : 'No advance deposits'}
              </div>
            </div>

            {/* Total Annual Fee */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: 16,
              borderRadius: 14,
              border: '1px solid var(--border-light)'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                {dict.totalTuition}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                ₹ {annualFee > 0 ? annualFee.toLocaleString() : '0'}.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {annualTuitionFee > 0 && annualTuitionFee !== annualFee ? `Tuition: ₹${annualTuitionFee.toLocaleString()} • Total: ₹${annualFee.toLocaleString()}` : 'Annual Billing'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Middle 2-Column Grid (Summarized Attendance & Academic Performance) */}
      <div className="grid-responsive">
        
        {/* Summarized Attendance Card (Reduced Cognitive Load) */}
        <div className="glass-card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="flex-responsive" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={20} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Attendance Summary
                </h3>
              </div>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: attendanceStats.total > 0 ? 'var(--success)' : 'var(--text-secondary)', fontSize: 16, fontWeight: 900 }}>
                {attendanceStats.total > 0 ? `${attendanceStats.percent}% Overall` : 'No Data'}
              </span>
            </div>

            {/* Quick Metrics Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center', margin: '20px 0' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>{attendanceStats.present}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Present</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--danger)' }}>{attendanceStats.absent}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Absent</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warning)' }}>{attendanceStats.late}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Late</div>
              </div>
            </div>

            {/* Mini Progress Bar */}
            {attendanceStats.total > 0 ? (
              <div style={{ height: 8, width: '100%', backgroundColor: 'var(--border-light)', borderRadius: 4, overflow: 'hidden', marginBottom: 20, display: 'flex' }}>
                <div style={{ width: `${Math.round((attendanceStats.present / attendanceStats.total) * 100)}%`, backgroundColor: '#10b981' }} title={`Present ${Math.round((attendanceStats.present / attendanceStats.total) * 100)}%`} />
                <div style={{ width: `${Math.round((attendanceStats.absent / attendanceStats.total) * 100)}%`, backgroundColor: '#ef4444' }} title={`Absent ${Math.round((attendanceStats.absent / attendanceStats.total) * 100)}%`} />
                <div style={{ width: `${Math.round((attendanceStats.late / attendanceStats.total) * 100)}%`, backgroundColor: '#f59e0b' }} title={`Late ${Math.round((attendanceStats.late / attendanceStats.total) * 100)}%`} />
              </div>
            ) : (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
                No attendance records found for this student.
              </div>
            )}
          </div>

          <button
            className="btn-secondary"
            onClick={() => setIsCalendarModalOpen(true)}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, fontWeight: 700 }}
          >
            <Calendar size={16} /> View Full Monthly Calendar
          </button>
        </div>

        {/* Summarized Academic Marks Card (Compact Performance) */}
        <div className="glass-card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={20} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Academic Performance
                </h3>
              </div>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: marksData.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 16, fontWeight: 900 }}>
                {marksData.length > 0 ? `${marksAvg}% Avg` : 'No Data'}
              </span>
            </div>

            {/* Subject Highlights */}
            {marksData.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
                {topSubject && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                      <Award size={16} color="var(--success)" /> Top Subject
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>
                      {topSubject.subject} ({topSubject.pct}%)
                    </div>
                  </div>
                )}

                {weakSubject && weakSubject.subject !== topSubject?.subject && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                      <AlertCircle size={16} color="var(--warning)" /> Needs Focus
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warning)' }}>
                      {weakSubject.subject} ({weakSubject.pct}%)
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, margin: '16px 0' }}>
                No exam records available for this student.
              </div>
            )}

            {/* Test Score Pills */}
            {marksData.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {marksData
                  .filter(m => m.exam === selectedExamView || !marksData.some(x => x.exam === selectedExamView))
                  .slice(0, 6)
                  .map((m, i) => (
                    <span key={i} className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>
                      {m.subject}: {m.marks}/{m.totalMarks || m.maxMarks || 100}
                    </span>
                  ))}
              </div>
            )}
            {marksData.length === 0 && <div style={{ marginBottom: 20 }} />}
          </div>

          <button
            className="btn-secondary"
            onClick={() => setIsReportCardModalOpen(true)}
            style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, fontWeight: 700 }}
          >
            <FileText size={16} /> View Full Gradebook Report Card
          </button>
        </div>

      </div>

      {/* 4. Stripe / Linear Style Payment History Table */}
      {userPermissions?.viewInvoices !== false && (
        <div className="glass-card" style={{ padding: 24, borderRadius: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Receipt size={20} color="var(--brand-orange)" /> {dict.paymentLedger}
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {paymentHistory.length > 0 ? `Showing last ${paymentHistory.length} transaction(s)` : 'No transactions'}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>{dict.transactionDate}</th>
                  <th>{dict.feeCategory}</th>
                  <th>{dict.receiptNo}</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>{dict.amountPaid}</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.length > 0 ? paymentHistory.map((inv, i) => (
                  <tr key={inv.id || i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}</td>
                    <td style={{ fontWeight: 600 }}>{inv.feeType || inv.description || inv.category || (inv.allocations && inv.allocations.length > 0 ? inv.allocations.map(a => a.label || a.componentId).join(', ') : 'Fee Payment')}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{inv.receiptId || inv.receiptNo || inv.voucherNo || inv.id?.slice(0, 10) || 'N/A'}</td>
                    <td>
                      <span className={`badge ${inv.status === 'Reversed' || inv.status === 'Cancelled' ? 'warning' : 'success'}`}>
                        {inv.status || 'Paid'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                      ₹ {Number(inv.amount || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => generateFeeReceipt(inv, { name: studentName, class: studentClass, id: studentId, contact: parentContact })} title="Print Receipt">
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                      No transaction data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Full Monthly Attendance Calendar Modal */}
      {isCalendarModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 520, padding: 24, position: 'relative' }}>
            <button onClick={() => setIsCalendarModalOpen(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Calendar size={22} color="var(--brand-orange)" />
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Attendance Calendar</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Student: {studentName} ({studentClass})</span>
              </div>
            </div>

            {/* Month Picker */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <input type="month" className="form-input" value={calendarMonth} onChange={e => setCalendarMonth(e.target.value)} style={{ width: 200, textAlign: 'center', fontWeight: 700 }} />
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', marginBottom: 16 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', padding: 4 }}>{d}</div>
              ))}
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`blank-${i}`} />;
                const s = (day.status || '').toLowerCase();
                const bg = s === 'present' ? 'rgba(16, 185, 129, 0.15)'
                  : s === 'absent' ? 'rgba(239, 68, 68, 0.15)'
                  : (s === 'late' || s === 'half day') ? 'rgba(245, 158, 11, 0.15)'
                  : 'var(--bg-secondary)';
                const color = s === 'present' ? 'var(--success)'
                  : s === 'absent' ? 'var(--danger)'
                  : (s === 'late' || s === 'half day') ? 'var(--warning)'
                  : 'var(--text-secondary)';
                return (
                  <div key={day.date} style={{ backgroundColor: bg, color, borderRadius: 8, padding: '6px 2px', fontSize: 13, fontWeight: 700 }} title={day.status || 'No record'}>
                    {day.day}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 11, fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(16, 185, 129, 0.5)' }} /> Present</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(239, 68, 68, 0.5)' }} /> Absent</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'rgba(245, 158, 11, 0.5)' }} /> Late</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'var(--bg-secondary)' }} /> No Data</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Report Card Modal */}
      {isReportCardModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 560, padding: 24, position: 'relative' }}>
            <button onClick={() => setIsReportCardModalOpen(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Award size={22} color="var(--brand-orange)" />
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Full Subject Gradebook Report Card</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Exam:</span>
                  <select className="form-input" value={selectedExamView} onChange={e => setSelectedExamView(e.target.value)} style={{ padding: '2px 8px', fontSize: 12, width: 'auto' }}>
                    {examOptions.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <table className="modern-table" style={{ marginBottom: 20 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Marks</th>
                  <th>Grade</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = marksData.filter(m => m.exam === selectedExamView);
                  const pool = filtered.length > 0 ? filtered : marksData;
                  if (pool.length === 0) return (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                        No exam records available for this student.
                      </td>
                    </tr>
                  );
                  return pool.map((m, i) => {
                    const max = Number(m.totalMarks) || Number(m.maxMarks) || 100;
                    const marks = Number(m.marks) || 0;
                    const pct = max > 0 ? Math.round((marks / max) * 100) : 0;
                    const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 33 ? 'D' : 'F';
                    return (
                      <tr key={m.id || i}>
                        <td style={{ fontWeight: 700 }}>{m.subject}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{marks} / {max}</td>
                        <td>
                          <span className="badge" style={{ backgroundColor: pct >= 60 ? 'rgba(16, 185, 129, 0.1)' : pct >= 33 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: pct >= 60 ? 'var(--success)' : pct >= 33 ? 'var(--warning)' : 'var(--danger)', fontWeight: 700 }}>
                            {grade}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 33 ? 'var(--success)' : 'var(--danger)' }}>
                            {pct >= 33 ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', padding: 14, borderRadius: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Overall Cumulative Score</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: marksData.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {marksData.length > 0 ? `${marksAvg}%` : 'No Data'}
                </div>
              </div>
              <button className="btn-secondary" onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 700 }}>
                <Download size={16} /> Print Marksheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
