import React, { useState, useEffect } from 'react';
import { X, Plus, Key, Shield, Trash2, Briefcase, Save } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, updateDoc, doc, deleteDoc, serverTimestamp, setDoc, where , writeBatch} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { createStaffAuthAccount, db, functions } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';
import { DEFAULT_ROLE_PERMISSIONS, getUserPermissions } from '../../utils/permissions';
import { auditLogGovernance } from '../../utils/audit';
import ManagePermissionsModal from './ManagePermissionsModal';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { FEE_FREQUENCIES, INSTALLMENTS, DEFAULT_FEE_COMPONENTS, getDefaultFeeComponents, getJSICFeeComponents, getJSPSFeeComponents, normalizeClassFeeSettings } from '../../utils/feeEngine';

export default function SettingsModule({ lang, classes, setClasses, classSettings, setClassSettings, sections, setSections, onNavigate, setSelectedTeacher, selectedSchool, setSelectedSchool, currentUser, activeAcademicYearId }) {
  const [activeTab, setActiveTab] = useState('school'); // 'school' | 'staff' | 'assignments' | 'academic'
  const [newClass, setNewClass] = useState('');
  const [newSection, setNewSection] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  
  // Academic Years state
  const [academicYearsList, setAcademicYearsList] = useState([]);
  const [newAcademicYear, setNewAcademicYear] = useState({ id: '', name: '' });
  const [isLoadingAcademicYears, setIsLoadingAcademicYears] = useState(false);

  // Assignments state
  const [assignmentsList, setAssignmentsList] = useState([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ class: classes[0] || '', section: '', teacherId: '' });

  // Staff Management state
  const [staffList, setStaffList] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Teacher', baseSalary: '', contact: '', password: '', schoolId: selectedSchool === 'ALL' ? 'SCH_01' : selectedSchool });
  const [resetModalStaff, setResetModalStaff] = useState(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [permissionModalStaff, setPermissionModalStaff] = useState(null);

  const fetchStaff = async () => {
    setIsLoadingStaff(true);
    try {
      let q = query(collection(db, "staff"), orderBy("createdAt", "desc"));
      if (selectedSchool && selectedSchool !== 'ALL') {
        q = query(collection(db, "staff"), where("schoolId", "==", selectedSchool), orderBy("createdAt", "desc"));
      }
      const querySnapshot = await getDocs(q);
      const staff = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status !== 'archived' && data.isActive !== false) {
          staff.push({ id: doc.id, ...data });
        }
      });
      setStaffList(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const fetchAssignments = async () => {
    setIsLoadingAssignments(true);
    try {
      let q = query(collection(db, "class_assignments"));
      if (selectedSchool && selectedSchool !== 'ALL') {
        q = query(collection(db, "class_assignments"), where("schoolId", "==", selectedSchool));
      }
      const querySnapshot = await getDocs(q);
      const assigns = [];
      querySnapshot.forEach((doc) => {
        assigns.push({ id: doc.id, ...doc.data() });
      });
      setAssignmentsList(assigns);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const fetchAcademicYears = async () => {
    setIsLoadingAcademicYears(true);
    try {
      const q = query(collection(db, "academic_years"), orderBy("id", "desc"));
      const querySnapshot = await getDocs(q);
      const years = [];
      querySnapshot.forEach((doc) => {
        years.push({ id: doc.id, ...doc.data() });
      });
      setAcademicYearsList(years);
    } catch (error) {
      console.error("Error fetching academic years:", error);
    } finally {
      setIsLoadingAcademicYears(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaff();
    } else if (activeTab === 'assignments') {
      fetchStaff();
      fetchAssignments();
    } else if (activeTab === 'academic') {
      fetchAcademicYears();
    }
  }, [activeTab, selectedSchool]);

  // If ALL schools are selected, force user to pick a school first
  if (selectedSchool === 'ALL') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>School Settings & Staff</h1>
        </div>
        <SchoolFolderPicker 
          title="Select Branch for Configuration" 
          description="Please select a specific school branch to manage its staff, teachers, and assignments."
          onSelectSchool={(schoolId) => setSelectedSchool && setSelectedSchool(schoolId)}
        />
      </div>
    );
  }

const normalizeSectionQuery = (sec) => {
  if (!sec) return '';
  return sec.replace(/^Section\s+/i, '').trim();
};

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignment.class || !newAssignment.section || !newAssignment.teacherId) {
      alert("Please select Class, Section, and Teacher.");
      return;
    }

    if (!activeAcademicYearId || !activeAcademicYearId.trim()) {
      alert("Configuration Error: Active academic year is missing for this school. Please configure and set the active academic year in the Academic Years tab first.");
      return;
    }

    const targetSchool = selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01';
    const teacher = staffList.find(s => s.id === newAssignment.teacherId);
    if (!teacher) {
      alert("Selected teacher not found.");
      return;
    }

    if (teacher.schoolId && teacher.schoolId !== 'ALL' && teacher.schoolId !== targetSchool) {
      alert(`Teacher ${teacher.name} belongs to ${teacher.schoolId}, not ${targetSchool}. Only teachers belonging to the selected school may be assigned.`);
      return;
    }

    const targetSections = newAssignment.section === 'ALL' 
      ? sections 
      : [newAssignment.section];
    
    let successCount = 0;

    for (const sec of targetSections) {
      const normSec = normalizeSectionQuery(sec);
      const existing = assignmentsList.find(a => 
        a.class === newAssignment.class && 
        (normalizeSectionQuery(a.section) === normSec || a.section === sec) &&
        (a.schoolId === targetSchool) &&
        (a.academicYearId === activeAcademicYearId)
      );

      if (existing) {
        if (existing.teacherId === teacher.id) {
          // Already assigned to this exact teacher for this academic year
          continue;
        }
        const confirmReassign = window.confirm(
          `Class ${newAssignment.class} (${sec}) in ${targetSchool} is currently assigned to "${existing.teacherName}".\n\nDo you want to explicitly reassign this section to "${teacher.name}"?`
        );
        if (!confirmReassign) {
          continue;
        }
      }
      
      try {
        const assignmentId = `${targetSchool}_${activeAcademicYearId}_${newAssignment.class}_${normSec || sec}`;
        const assignmentData = {
          class: newAssignment.class,
          section: sec,
          normalizedSection: normSec,
          teacherId: teacher.id,
          teacherName: teacher.name,
          academicYearId: activeAcademicYearId,
          schoolId: targetSchool,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.name || currentUser?.email || 'Administrator'
        };

        if (existing) {
          assignmentData.createdAt = existing.createdAt || new Date().toISOString();
          assignmentData.reassignedFrom = existing.teacherName;
          assignmentData.previousTeacherId = existing.teacherId;
        } else {
          assignmentData.createdAt = new Date().toISOString();
        }

        await setDoc(doc(db, "class_assignments", assignmentId), assignmentData, { merge: true });
        successCount++;
      } catch (error) {
        console.error("Error adding assignment:", error);
      }
    }

    if (successCount > 0) {
      alert(`Successfully assigned Class Teacher to ${successCount} section(s)!`);
      setNewAssignment({ class: classes[0] || '', section: '', teacherId: '' });
      fetchAssignments();
    } else if (targetSections.length > 0) {
      alert("No changes made or section is already assigned to this teacher.");
    }
  };

  const handleRemoveAssignment = async (id) => {
    if (window.confirm("Remove this class teacher assignment?")) {
      try {
        await deleteDoc(doc(db, "class_assignments", id));
        fetchAssignments();
      } catch (error) {
        console.error("Error removing assignment", error);
      }
    }
  };

  // Helper to persist class/section structural changes to Firestore immediately
  const persistStructureToFirestore = async (updatedClasses, updatedSections) => {
    try {
      await setDoc(doc(db, "school_settings", "settings"), {
        schoolClasses: {
          [selectedSchool]: updatedClasses
        },
        schoolSections: {
          [selectedSchool]: updatedSections
        }
      }, { merge: true });
    } catch (e) {
      console.error('Auto-save classes/sections failed:', e);
    }
  };

  const handleAddClass = async () => {
    const classTrimmed = newClass.trim();
    if (classTrimmed && !classes.some(c => c.toLowerCase() === classTrimmed.toLowerCase())) {
      const updated = [...classes, classTrimmed];
      setClasses(updated);
      const defaultComps = selectedSchool === 'SCH_01'
        ? getJSPSFeeComponents(classTrimmed, activeAcademicYearId || '2026-2027')
        : getJSICFeeComponents(classTrimmed, activeAcademicYearId || '2026-2027');
      setClassSettings(prev => ({
        ...prev,
        [classTrimmed]: normalizeClassFeeSettings({ academicYear: activeAcademicYearId || '2026-2027', components: defaultComps }, activeAcademicYearId || '2026-2027')
      }));
      setNewClass('');
      await persistStructureToFirestore(updated, sections);
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'ADD_CLASS', newValue: classTrimmed });
    } else if (classTrimmed) {
      alert("Class already exists.");
    }
  };

  const handleRemoveClass = async (cls) => {
    if (window.confirm(`Are you sure you want to remove ${cls}?`)) {
      const updated = classes.filter(c => c !== cls);
      setClasses(updated);
      await persistStructureToFirestore(updated, sections);
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'REMOVE_CLASS', oldValue: cls });
    }
  };

  const handleAddSection = async () => {
    const sectionTrimmed = newSection.trim();
    if (sectionTrimmed && !sections.some(s => s.toLowerCase() === sectionTrimmed.toLowerCase())) {
      const updated = [...sections, sectionTrimmed];
      setSections(updated);
      setNewSection('');
      await persistStructureToFirestore(classes, updated);
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'ADD_SECTION', newValue: sectionTrimmed });
    } else if (sectionTrimmed) {
      alert("Section already exists.");
    }
  };

  const handleRemoveSection = async (sec) => {
    if (window.confirm(`Are you sure you want to remove ${sec}?`)) {
      const updated = sections.filter(s => s !== sec);
      setSections(updated);
      await persistStructureToFirestore(classes, updated);
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'REMOVE_SECTION', oldValue: sec });
    }
  };

  const handleUpdateSetting = (cls, field, value) => {
    setClassSettings(prev => ({
      ...prev,
      [cls]: {
        ...(prev[cls] || {}),
        [field]: value
      }
    }));
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.role || !newStaff.baseSalary || !newStaff.contact || !newStaff.password) {
      alert("Please fill all required fields including Mobile Contact & Password!");
      return;
    }
    if (newStaff.password.length < 6) {
      alert("Firebase requires passwords to be at least 6 characters long.");
      return;
    }

    try {
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[newStaff.role] || DEFAULT_ROLE_PERMISSIONS.Teacher;
      const authUser = await createStaffAuthAccount(newStaff.contact.trim(), newStaff.password.trim());
      await addDoc(collection(db, 'staff'), {
        uid: authUser.uid,
        name: newStaff.name.trim(),
        role: newStaff.role,
        customPermissions: defaultPerms,
        contact: newStaff.contact.trim(),
        schoolId: newStaff.schoolId,
        createdAt: serverTimestamp(),
        lastPaidDate: null
      });
      await setDoc(doc(db, 'staff_salary', authUser.uid), {
        baseSalary: Number(newStaff.baseSalary),
        schoolId: newStaff.schoolId
      });
      await setDoc(doc(db, 'users', authUser.uid), {
        name: newStaff.name.trim(),
        role: newStaff.role,
        schoolId: newStaff.schoolId,
        customPermissions: defaultPerms
      });
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: newStaff.schoolId, action: 'CREATE_STAFF', targetId: authUser.uid, newValue: newStaff.role });
      setIsAddingStaff(false);
      setNewStaff({ name: '', role: 'Teacher', baseSalary: '', contact: '', password: '', schoolId: selectedSchool === 'ALL' ? 'SCH_01' : selectedSchool });
      alert("Staff registered successfully!");
      fetchStaff();
    } catch (error) {
      console.error("Error adding staff:", error);
      alert("Failed to register staff.");
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetModalStaff || !newResetPassword) return;

    try {
      const resetFn = httpsCallable(functions, 'adminUpdateUserPassword');
      await resetFn({ uid: resetModalStaff.uid, newPassword: newResetPassword });
      alert("Password updated successfully via Cloud Function.");
      setResetModalStaff(null);
      setNewResetPassword('');
    } catch (err) {
      console.error("Error resetting password:", err);
      alert(`Failed to reset password: ${err.message}`);
    }
  };

  const handleDeleteStaff = async (staffId, name, uid) => {
    if (!window.confirm(`Are you sure you want to deactivate teacher "${name}"? Access will be revoked.`)) return;

    try {
      if (uid) {
        const deactivateFn = httpsCallable(functions, 'adminDeactivateStaff');
        await deactivateFn({ uid });
      }
      // Soft delete in staff collection
      await updateDoc(doc(db, 'staff', staffId), { status: 'archived', isActive: false });
      await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'DEACTIVATE_STAFF', targetId: staffId });
      
      alert(`Teacher "${name}" deactivated successfully.`);
      fetchStaff();
    } catch (err) {
      console.error("Error removing staff:", err);
      alert("Failed to deactivate staff.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>School Settings & Governance</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Manage classes, fee rules, and staff access permissions</p>
        </div>

        <div style={{ display: 'flex', gap: 8, backgroundColor: 'var(--bg-secondary)', padding: 4, borderRadius: 12 }}>
          <button
            className={activeTab === 'school' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('school')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            🏫 Class & Fee Structure
          </button>
          <button
            className={activeTab === 'academic' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('academic')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            📅 Academic Years
          </button>
          <button
            className={activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('staff')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            👥 Staff Directory & Permissions
          </button>
          <button
            className={activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('assignments')}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
          >
            📋 Class Teacher Assignments
          </button>
        </div>
      </div>

      {permissionModalStaff && (
        <ManagePermissionsModal
          staff={permissionModalStaff}
          currentUser={currentUser}
          onClose={() => setPermissionModalStaff(null)}
          onSave={() => {
            setPermissionModalStaff(null);
            fetchStaff();
          }}
        />
      )}

      {/* Academic Years Tab */}
      {activeTab === 'academic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Manage Academic Years</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newAcademicYear.id || !newAcademicYear.name) return;
              try {
                await setDoc(doc(db, "academic_years", newAcademicYear.id), {
                  id: newAcademicYear.id,
                  name: newAcademicYear.name,
                  createdAt: serverTimestamp()
                });
                await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'CREATE_ACADEMIC_YEAR', newValue: newAcademicYear.id });
                setNewAcademicYear({ id: '', name: '' });
                fetchAcademicYears();
                alert("Academic Year created.");
              } catch (err) {
                console.error(err);
                alert("Failed to create academic year.");
              }
            }} style={{ display: 'flex', gap: 16, alignItems: 'end', marginBottom: 24 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Canonical ID (e.g. AY_2026_27)</label>
                <input type="text" className="form-input" value={newAcademicYear.id} onChange={e => setNewAcademicYear({...newAcademicYear, id: e.target.value})} required />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Display Name (e.g. 2026-2027)</label>
                <input type="text" className="form-input" value={newAcademicYear.name} onChange={e => setNewAcademicYear({...newAcademicYear, name: e.target.value})} required />
              </div>
              <button type="submit" className="btn-primary">Create Year</button>
            </form>

            {isLoadingAcademicYears ? (
              <div>Loading...</div>
            ) : (
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Academic Year ID</th>
                    <th>Display Name</th>
                    <th>Status in {SCHOOLS.find(s => s.id === selectedSchool)?.name || selectedSchool}</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {academicYearsList.map(ay => (
                    <tr key={ay.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{ay.id}</td>
                      <td style={{ fontWeight: 700 }}>{ay.name}</td>
                      <td>
                        {activeAcademicYearId === ay.id ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>Active Current Year</span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }}>Historical / Inactive</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {activeAcademicYearId !== ay.id && (
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              if (window.confirm(`Set ${ay.name} as the active year for this school?`)) {
                                try {
                                  await setDoc(doc(db, "school_settings", "settings"), {
                                    activeAcademicYearId: {
                                      [selectedSchool]: ay.id
                                    }
                                  }, { merge: true });
                                  await auditLogGovernance({ userId: currentUser?.id, role: currentUser?.role, schoolId: selectedSchool, action: 'SET_ACTIVE_ACADEMIC_YEAR', oldValue: activeAcademicYearId, newValue: ay.id });
                                  alert(`Active year updated for ${selectedSchool}.`);
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                          >
                            Set as Active
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* School Setup Tab */}
      {activeTab === 'school' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div className="glass-card">
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Classes Directory</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Class 11"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                />
                <button className="btn-primary" onClick={handleAddClass}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {classes.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--border-light)', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                    {c}
                    <X size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => handleRemoveClass(c)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card">
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Sections Directory</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Section D"
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
                />
                <button className="btn-primary" onClick={handleAddSection}>Add</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sections.map(s => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--border-light)', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                    {s}
                    <X size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => handleRemoveSection(s)} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-light)' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Class-Specific Fee Structure</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Configure fee components, amounts, installment schedules, due days, and late fees for each class.
                </p>
              </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠️ Warning: Saving will instantly update student dues across the entire system based on the configuration below.
                  </span>
                  <button 
                    className="btn-primary" 
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to save this configuration? This will instantly affect all due fees.")) return;
                      try {
                        const normalizedMap = {};
                        for (const cls of classes) {
                          let cfg = classSettings[cls] || {};
                          let settings = normalizeClassFeeSettings(cfg, activeAcademicYearId);
                          if (!settings.components || settings.components.length === 0 || !settings.components.some(c => c.id === 'tuition' && c.amount > 0)) {
                             settings.components = selectedSchool === 'SCH_01'
                               ? getJSPSFeeComponents(cls, activeAcademicYearId)
                               : getJSICFeeComponents(cls, activeAcademicYearId);
                          }
                          normalizedMap[cls] = settings;
                        }
                        await setDoc(doc(db, "school_settings", "settings"), {
                          schoolClassSettings: {
                            [selectedSchool]: normalizedMap
                          },
                          schoolClasses: {
                            [selectedSchool]: classes
                          },
                          schoolSections: {
                            [selectedSchool]: sections
                          }
                        }, { merge: true });
                        alert("Settings saved to Cloud successfully!");
                      } catch (e) {
                        alert("Error saving settings: " + e.message);
                        console.error(e);
                      }
                    }}
                    style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', padding: '10px 20px', fontSize: 14, fontWeight: 700 }}
                  >
                    <Save size={18} /> Save Configuration
                  </button>
                </div>
            </div>

            {classes.map(cls => {
              const settings = normalizeClassFeeSettings(classSettings[cls] || {});
              const defaultComps = selectedSchool === 'SCH_01'
                ? getJSPSFeeComponents(cls, activeAcademicYearId)
                : getJSICFeeComponents(cls, activeAcademicYearId);
              const components = settings.components?.length ? settings.components : defaultComps;
              const updateComponent = (id, updates) => {
                setClassSettings(prev => ({
                  ...prev,
                  [cls]: {
                    ...settings,
                    components: components.map(c => c.id === id ? { ...c, ...updates } : c)
                  }
                }));
              };
              const toggleInstallment = (id, inst) => {
                const c = components.find(x => x.id === id);
                const current = c?.installments || [];
                const next = current.includes(inst) ? current.filter(x => x !== inst) : [...current, inst];
                updateComponent(id, { installments: next });
              };
              return (
                <div key={cls} style={{ marginBottom: 24, border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ padding: '14px 18px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{cls}</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Class Policy & Late Fee Rules</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Due Day of Month:</span>
                        <input type="number" min="1" max="28" className="form-input" style={{ width: 62, padding: '4px 8px' }} value={settings.duePolicy?.defaultDueDay ?? 10} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), defaultDueDay: Number(e.target.value) || 10 } } }))} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>October Late Fee / अक्टूबर की लेट फीस:</span>
                        <span style={{ fontSize: 11 }}>₹</span>
                        <input type="number" min="0" className="form-input" style={{ width: 70, padding: '4px 8px' }} value={settings.duePolicy?.septemberPenalty ?? 100} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), septemberPenalty: Number(e.target.value) || 0 } } }))} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>December Late Fee / दिसंबर की लेट फीस:</span>
                        <span style={{ fontSize: 11 }}>₹</span>
                        <input type="number" min="0" className="form-input" style={{ width: 70, padding: '4px 8px' }} value={settings.duePolicy?.decemberPenalty ?? 500} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), decemberPenalty: Number(e.target.value) || 0 } } }))} />
                      </div>
                      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settings.duePolicy?.decemberClearWaivesPenalty !== false} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), decemberClearWaivesPenalty: e.target.checked } } }))} />
                        <span>Clear all in Dec removes late fee / दिसंबर में सब जमा होने पर लेट फीस हटेगी</span>
                      </label>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                    <table className="modern-table" style={{ width: '100%', minWidth: 820 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 45, textAlign: 'center' }}>Use</th>
                          <th style={{ minWidth: 140 }}>Fee Name</th>
                          <th style={{ minWidth: 110 }}>Amount (₹)</th>
                          <th style={{ minWidth: 160 }}>Frequency</th>
                          <th style={{ minWidth: 320 }}>Installment / Schedule</th>
                          <th style={{ minWidth: 100 }}>Late Fee (₹)</th>
                          <th style={{ minWidth: 90 }}>Grace (Days)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map(c => (
                          <tr key={c.id}>
                            <td><input type="checkbox" checked={!!c.enabled} onChange={e => updateComponent(c.id, { enabled: e.target.checked })} /></td>
                            <td style={{ fontWeight: 700, minWidth: 120 }}>{c.name}</td>
                            <td>
                              <input 
                                type="number" 
                                min="0" 
                                className="form-input" 
                                style={{ width: 110, padding: '6px 8px' }} 
                                value={c.amount ?? 0} 
                                onChange={e => {
                                  const val = Number(e.target.value) || 0;
                                  if (c.id === 'tuition') {
                                    const yr = (activeAcademicYearId || '2026').match(/\d{4}/)?.[0] || '2026';
                                    let jA, oA, dA;
                                    if (val === 7500) {
                                      jA = 3000; oA = 2500; dA = 2000;
                                    } else {
                                      const third = Math.round(val / 3);
                                      jA = third; oA = third; dA = val - (third * 2);
                                    }
                                    const updatedSched = [
                                      { dueDate: `${yr}-07-10`, label: 'July Installment', amount: jA },
                                      { dueDate: `${yr}-10-10`, label: 'October Installment / अक्टूबर की किस्त', amount: oA },
                                      { dueDate: `${yr}-12-10`, label: 'December Installment', amount: dA }
                                    ];
                                    updateComponent(c.id, { amount: val, schedule: updatedSched, ...(val > 0 && !c.enabled ? { enabled: true } : {}) });
                                  } else {
                                    updateComponent(c.id, { amount: val, ...(val > 0 && !c.enabled ? { enabled: true } : {}) });
                                  }
                                }} 
                              />
                            </td>
                            <td>
                              <select className="form-input" style={{ minWidth: 150, padding: '6px 8px' }} value={c.frequency || 'one_time'} onChange={e => updateComponent(c.id, { frequency: e.target.value })}>
                                {FEE_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </select>
                            </td>
                            <td style={{ minWidth: 260 }}>
                              {c.id === 'tuition' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {INSTALLMENTS.map(inst => {
                                    const isChecked = (c.installments || []).includes(inst.id);
                                    const schedItem = (c.schedule || []).find(s => 
                                      (inst.id === 'july' && s.dueDate?.includes('-07-')) ||
                                      (inst.id === 'september' && (s.dueDate?.includes('-09-') || s.dueDate?.includes('-10-'))) ||
                                      (inst.id === 'december' && s.dueDate?.includes('-12-'))
                                    );
                                    const currentInstAmt = schedItem?.amount ?? (c.amount ? Math.round(c.amount / 3) : 0);
                                    
                                    return (
                                      <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', minWidth: 140 }}>
                                          <input type="checkbox" checked={isChecked} onChange={() => toggleInstallment(c.id, inst.id)} />
                                          <span>{inst.label}</span>
                                        </label>
                                        {isChecked && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>₹</span>
                                            <input
                                              type="number"
                                              min="0"
                                              className="form-input"
                                              style={{ width: 85, padding: '4px 6px', fontSize: 12 }}
                                              value={currentInstAmt}
                                              onChange={(e) => {
                                                const newAmt = Number(e.target.value) || 0;
                                                const yr = (activeAcademicYearId || '2026').match(/\d{4}/)?.[0] || '2026';
                                                const targetDueDate = `${yr}-${inst.dueMonth}-${inst.dueDay}`;
                                                
                                                let updatedSched = [...(c.schedule || [])];
                                                const existingIdx = updatedSched.findIndex(s => 
                                                  (inst.id === 'july' && s.dueDate?.includes('-07-')) ||
                                                  (inst.id === 'september' && (s.dueDate?.includes('-09-') || s.dueDate?.includes('-10-'))) ||
                                                  (inst.id === 'december' && s.dueDate?.includes('-12-'))
                                                );
                                                
                                                if (existingIdx >= 0) {
                                                  updatedSched[existingIdx] = { ...updatedSched[existingIdx], dueDate: targetDueDate, label: inst.label, amount: newAmt };
                                                } else {
                                                  updatedSched.push({ dueDate: targetDueDate, label: inst.label, amount: newAmt });
                                                }
                                                
                                                const totalAmt = updatedSched.reduce((sum, item) => sum + (item.amount || 0), 0);
                                                updateComponent(c.id, { schedule: updatedSched, amount: totalAmt });
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (c.frequency === 'specific_installments' || c.frequency === 'one_time' || c.frequency === 'every_installment') ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {INSTALLMENTS.map(i => <label key={i.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <input type="checkbox" checked={(c.installments || []).includes(i.id)} onChange={() => toggleInstallment(c.id, i.id)} />
                                    {i.label}
                                  </label>)}
                                </div>
                              ) : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.frequency === 'monthly' ? 'Every month' : 'Configure custom schedule later'}</span>}
                            </td>
                            <td><input type="number" min="0" className="form-input" style={{ width: 95, padding: '6px 8px' }} value={c.penalty ?? 0} onChange={e => updateComponent(c.id, { penalty: Number(e.target.value) || 0 })} /></td>
                            <td><input type="number" min="0" className="form-input" style={{ width: 80, padding: '6px 8px' }} value={c.graceDays ?? 5} onChange={e => updateComponent(c.id, { graceDays: Number(e.target.value) || 0 })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Staff Management Tab */}
      {activeTab === 'staff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Staff & Access Rules</h2>
            <button className="btn-primary" onClick={() => setIsAddingStaff(!isAddingStaff)}>
              {isAddingStaff ? <X size={16} /> : <Plus size={16} />}
              {isAddingStaff ? 'Cancel' : 'Register New Staff Member'}
            </button>
          </div>

          {resetModalStaff && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="glass-card" style={{ width: 360, padding: 28, position: 'relative' }}>
                <button onClick={() => setResetModalStaff(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key size={18} color="var(--accent-primary)" /> Reset Staff Password
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Set a new password for <strong>{resetModalStaff.name}</strong> ({resetModalStaff.contact}).
                </p>
                <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="form-label">New Password</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. StaffPass@123"
                      value={newResetPassword}
                      onChange={e => setNewResetPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                    Update Password
                  </button>
                </form>
              </div>
            </div>
          )}

          {isAddingStaff && (
            <div className="glass-card">
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Register Staff Account</h2>
              <form onSubmit={handleAddStaff} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Full Name</label>
                  <input type="text" className="form-input" value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} required placeholder="e.g. Ramesh Verma" />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Role / Designation</label>
                  <select className="form-input" value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}>
                    <option value="Teacher">Teacher</option>
                    <option value="Senior Teacher">Senior Teacher</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Administrator">Administrator</option>
                    <option value="Peon">Peon</option>
                    <option value="Driver">Driver</option>
                    <option value="Watchman">Watchman</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Campus / Branch</label>
                  <select className="form-input" value={newStaff.schoolId} onChange={e => setNewStaff({ ...newStaff, schoolId: e.target.value })}>
                    {SCHOOLS.map(school => (
                      <option key={school.id} value={school.id}>{school.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Login ID (e.g. Username or Mobile)</label>
                  <input type="text" className="form-input" value={newStaff.contact} onChange={e => setNewStaff({ ...newStaff, contact: e.target.value })} required placeholder="e.g. 9876543210 or john.doe" />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Password</label>
                  <input type="password" className="form-input" value={newStaff.password} onChange={e => setNewStaff({ ...newStaff, password: e.target.value })} required placeholder="Password" />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Base Salary (₹)</label>
                  <input type="number" className="form-input" value={newStaff.baseSalary} onChange={e => setNewStaff({ ...newStaff, baseSalary: e.target.value })} required placeholder="e.g. 25000" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gridColumn: '1 / -1' }}>
                  <button type="submit" className="btn-primary" style={{ width: '200px' }}>Save Staff Record</button>
                </div>
              </form>
            </div>
          )}

          <div className="glass-card">
            {isLoadingStaff ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading staff records...</div>
            ) : staffList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No staff records registered yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role & Permissions</th>
                      <th>Login ID</th>
                      <th>Base Salary</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map(staff => {
                      const perms = getUserPermissions(staff);
                      const activePermCount = Object.values(perms).filter(Boolean).length;
                      return (
                        <tr key={staff.id}>
                          <td style={{ fontWeight: 700 }}>{staff.name}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="badge">{staff.role}</span>
                              <span className="badge" style={{ backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', fontSize: 11, fontWeight: 700 }}>
                                🛡️ {activePermCount}/9 Perms
                              </span>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>👤 {staff.contact || 'N/A'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>₹ {Number(staff.baseSalary || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', fontWeight: 700 }}
                              title="Customize Access Permissions"
                              onClick={() => setPermissionModalStaff(staff)}
                            >
                              <Shield size={14} /> Permissions
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                              title="Reset Password"
                              onClick={() => {
                                setResetModalStaff(staff);
                                setNewResetPassword('');
                              }}
                            >
                              <Key size={14} /> Password
                            </button>
                            <button
                              className="icon-btn"
                              style={{ color: 'var(--danger)', padding: 6 }}
                              title="Remove Staff"
                              onClick={() => handleDeleteStaff(staff.id, staff.name, staff.uid)}
                            >
                              <Trash2 size={16} />
                            </button>
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

      {/* Class Teacher Assignments Tab */}
      {activeTab === 'assignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass-card">
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Assign Class Teacher</h2>
            <form onSubmit={handleAddAssignment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Class</label>
                <select className="form-input" value={newAssignment.class} onChange={e => setNewAssignment({ ...newAssignment, class: e.target.value })}>
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Section</label>
                <select 
                  className="form-input" 
                  value={newAssignment.section} 
                  onChange={e => setNewAssignment({ ...newAssignment, section: e.target.value })}
                >
                  <option value="">Select Section</option>
                  <option value="ALL">ALL Sections</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Select Teacher</label>
                <select className="form-input" value={newAssignment.teacherId} onChange={e => setNewAssignment({ ...newAssignment, teacherId: e.target.value })}>
                  <option value="">Select Teacher</option>
                  {staffList
                    .filter(s => (s.role === 'Teacher' || s.role === 'Senior Teacher') && (!s.schoolId || s.schoolId === 'ALL' || s.schoolId === selectedSchool))
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.schoolId === 'ALL' ? 'All Campuses' : t.schoolId})</option>
                    ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">Assign Teacher</button>
            </form>
          </div>

          <div className="glass-card">
            {isLoadingAssignments ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading assignments...</div>
            ) : assignmentsList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                No class teachers assigned yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Section</th>
                      <th>Assigned Teacher</th>
                      <th>Academic Year</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentsList.map(assignment => (
                      <tr key={assignment.id}>
                        <td style={{ fontWeight: 700 }}>{assignment.class}</td>
                        <td style={{ fontWeight: 700 }}>{assignment.section}</td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{assignment.teacherName}</div>
                          {assignment.reassignedFrom && (
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              Reassigned from {assignment.reassignedFrom}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: 11, fontWeight: 700 }}>
                            {assignment.academicYearId || activeAcademicYearId || 'AY_2026_27'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--danger)', padding: 6 }}
                            title="Remove Assignment"
                            onClick={() => handleRemoveAssignment(assignment.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
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
