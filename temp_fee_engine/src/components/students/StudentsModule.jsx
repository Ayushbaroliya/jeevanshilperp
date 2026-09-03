import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, FolderOpen, ChevronRight, Mic, Trash2, Edit2, X, AlertCircle, Sparkles, MessageCircle, Download, CreditCard, Calendar, BookOpen, Award, FileText, Receipt } from 'lucide-react';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { t } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';


export function StudentsDirectory({ onNavigate, lang, classes, sections, userPermissions, currentUser, onSelectStudent, selectedSchool, setSelectedSchool }) {
  const dict = t[lang] || t.en;
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSection, setSelectedSection] = useState('All');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [parentContact, setParentContact] = useState('');
  const [addSection, setAddSection] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);



  // Edit Student State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRoll, setEditRoll] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editContact, setEditContact] = useState('');

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
              q = query(q, where("schoolId", "==", selectedSchool), where("class", "==", selectedClass), where("section", "==", selectedSection));
            }
          } else {
            if (selectedSection === 'All') {
              q = query(q, where("class", "==", selectedClass));
            } else {
              q = query(q, where("class", "==", selectedClass), where("section", "==", selectedSection));
            }
          }
          
          const querySnapshot = await getDocs(q);
          const loadedStudents = [];
          querySnapshot.forEach((doc) => {
            loadedStudents.push({ id: doc.id, ...doc.data() });
          });

          setStudents(loadedStudents);
        } catch (error) {
          console.error("Error fetching students: ", error);
          setStudents([]);
        }
        setIsLoading(false);
      };
      fetchStudents();
    }
  }, [selectedClass, selectedSection, selectedSchool]);

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

    try {
      await addDoc(collection(db, "students"), {
        name: studentName,
        roll: rollNumber,
        contact: parentContact,
        class: selectedClass,
        section: addSection,
        status: 'Active',
        attendance: '100%',
        dueAmount: 1500, // Initial fee dues
        createdAt: new Date().toISOString(),
        schoolId: selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01'
      });
      
      if (!keepOpen) {
        setIsAddingStudent(false);
      } else {
        // Just flash a quick message for seamless adding
        const btn = document.getElementById('save-next-btn');
        if (btn) {
          const originalText = btn.innerText;
          btn.innerText = '✅ Saved!';
          setTimeout(() => { btn.innerText = originalText; }, 1000);
        }
      }
      
      setStudentName('');
      setRollNumber('');
      setParentContact('');

      if (selectedClass) {
        setIsLoading(true);
        let q;
        if (selectedSection === 'All') {
          q = query(collection(db, "students"), where("class", "==", selectedClass));
        } else {
          q = query(collection(db, "students"), where("class", "==", selectedClass), where("section", "==", selectedSection));
        }
        const querySnapshot = await getDocs(q);
        const loadedStudents = [];
        querySnapshot.forEach((doc) => {
          loadedStudents.push({ id: doc.id, ...doc.data() });
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
    if (window.confirm(`Are you sure you want to delete student "${name}"? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, "students", studentId));
        setStudents(prev => prev.filter(s => s.id !== studentId));
        alert(`Student "${name}" deleted successfully.`);
      } catch (err) {
        console.error("Error deleting student:", err);
      }
    }
  };

  const handleOpenEdit = (student, e) => {
    e.stopPropagation();
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditRoll(student.roll || '');
    setEditClass(student.class || selectedClass || 'Class 1');
    setEditSection(student.section || 'Section A');
    setEditContact(student.contact || '');
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      if (editingStudent) {
        await updateDoc(doc(db, "students", editingStudent.id), {
          name: editName,
          roll: editRoll,
          class: editClass,
          section: editSection,
          contact: editContact
        });
      }
      setStudents(prev => prev.map(s => s.id === editingStudent.id ? {
        ...s,
        name: editName,
        roll: editRoll,
        class: editClass,
        section: editSection,
        contact: editContact
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
          {selectedClass && !isAddingStudent && (userPermissions?.manageStudents !== false) && selectedSchool !== 'ALL' && (
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
          ) : students.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No students found in {selectedSection === 'All' ? 'this class' : selectedSection}.</div>
          ) : (
            <div className="grid-responsive">
              {students.map((student) => (
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
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span>Roll: {student.roll}</span>
                        <span>Sec: {student.section}</span>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', padding: '2px 8px' }}>{student.attendance || '100%'}</span>
                        <span className="badge" style={{ backgroundColor: student.dueAmount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: student.dueAmount > 0 ? 'var(--danger)' : 'var(--success)', padding: '2px 8px' }}>
                          Dues: ₹{student.dueAmount || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(userPermissions?.manageStudents !== false) && selectedSchool !== 'ALL' && (
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
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
export function StudentLedger({ onNavigate, lang = 'en', activeStudent, userPermissions }) {
  const dict = t[lang] || t.en;
  const [isEditingName, setIsEditingName] = useState(false);
  const [studentName, setStudentName] = useState(activeStudent?.name || 'Anjali Sharma');
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isReportCardModalOpen, setIsReportCardModalOpen] = useState(false);

  useEffect(() => {
    if (activeStudent?.name) {
      setStudentName(activeStudent.name);
    }
  }, [activeStudent]);

  const parentName = activeStudent?.parentName || "Suresh Sharma";
  const parentContact = activeStudent?.contact || "+91 98765 43210";
  const studentId = activeStudent?.id || "STU-2024-089";
  const studentClass = activeStudent?.class || "Class 5B";
  const dueAmount = activeStudent?.dueAmount !== undefined ? activeStudent.dueAmount : 1200;
  const attendance = activeStudent?.attendance || "92%";

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
                ₹ 0.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                No payments yet
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
                ₹ 0.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                No advance deposits
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
                Total Annual Tuition
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                ₹ 0.00
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Annual Billing
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
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', fontSize: 16, fontWeight: 900 }}>
                92% Overall
              </span>
            </div>

            {/* Quick Metrics Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center', margin: '20px 0' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>22</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Present</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--danger)' }}>2</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Absent</div>
              </div>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warning)' }}>1</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Late</div>
              </div>
            </div>

            {/* Mini Progress Bar */}
            <div style={{ height: 8, width: '100%', backgroundColor: 'var(--border-light)', borderRadius: 4, overflow: 'hidden', marginBottom: 20, display: 'flex' }}>
              <div style={{ width: '88%', backgroundColor: '#10b981' }} title="Present 88%" />
              <div style={{ width: '8%', backgroundColor: '#ef4444' }} title="Absent 8%" />
              <div style={{ width: '4%', backgroundColor: '#f59e0b' }} title="Late 4%" />
            </div>
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
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 16, fontWeight: 900 }}>
                81.3% Avg
              </span>
            </div>

            {/* Subject Highlights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                  <Award size={16} color="var(--success)" /> Top Subject
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--success)' }}>
                  Mathematics (90%)
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                  <AlertCircle size={16} color="var(--warning)" /> Needs Focus
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warning)' }}>
                  English (70%)
                </div>
              </div>
            </div>

            {/* Test Score Pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>
                Maths: 45/50
              </span>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>
                Science: 42/50
              </span>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}>
                English: 35/50
              </span>
            </div>
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
              <Receipt size={20} color="var(--brand-orange)" /> Payment & Transaction Details
            </h3>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              Showing last 3 transactions
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Transaction Date</th>
                  <th>Fee Reason / Category</th>
                  <th>Receipt Voucher No</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                    No transaction data available
                  </td>
                </tr>
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
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Attendance: Sept 2024</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Student: {studentName} ({studentClass})</span>
              </div>
            </div>

            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No attendance records available for this student.
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
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Full Subject Gradebook Report Card</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Exam: Mid-Term 1 (2024-2025)</span>
              </div>
            </div>

            <table className="modern-table" style={{ marginBottom: 20 }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Marks (Out of 100)</th>
                  <th>Grade</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
                    No exam records available for this student.
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', padding: 14, borderRadius: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Overall Cumulative Score</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-secondary)' }}>No Data</div>
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
