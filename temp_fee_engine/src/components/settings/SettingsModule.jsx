import React, { useState, useEffect } from 'react';
import { X, Plus, Key, Shield, Trash2, Briefcase } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, updateDoc, doc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createStaffAuthAccount, db } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';
import { DEFAULT_ROLE_PERMISSIONS, getUserPermissions } from '../../utils/permissions';
import ManagePermissionsModal from './ManagePermissionsModal';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { FEE_FREQUENCIES, INSTALLMENTS, DEFAULT_FEE_COMPONENTS, normalizeClassFeeSettings } from '../../utils/feeEngine';

export default function SettingsModule({ lang, classes, setClasses, classSettings, setClassSettings, sections, setSections, onNavigate, setSelectedTeacher, selectedSchool, setSelectedSchool }) {
  const [activeTab, setActiveTab] = useState('school'); // 'school' | 'staff' | 'assignments'
  const [newClass, setNewClass] = useState('');
  const [newSection, setNewSection] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  
  // Assignments state
  const [assignmentsList, setAssignmentsList] = useState([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ class: classes[0] || '', section: '', teacherId: '' });

  // Staff Management state
  const [staffList, setStaffList] = useState([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Teacher', baseSalary: '', contact: '', password: '', schoolId: 'SCH_01' });
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
        staff.push({ id: doc.id, ...doc.data() });
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

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaff();
    } else if (activeTab === 'assignments') {
      fetchStaff();
      fetchAssignments();
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

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!newAssignment.class || !newAssignment.section || !newAssignment.teacherId) {
      alert("Please select Class, Section, and Teacher.");
      return;
    }

    const targetSections = newAssignment.section === 'ALL' 
      ? sections 
      : [newAssignment.section];
    
    const teacher = staffList.find(s => s.id === newAssignment.teacherId);
    let successCount = 0;

    for (const sec of targetSections) {
      const existing = assignmentsList.find(a => a.class === newAssignment.class && a.section === sec);
      if (existing) {
        if (!window.confirm(`Class ${newAssignment.class} (${sec}) already has a teacher assigned. Reassign?`)) {
          continue;
        }
        try {
          await deleteDoc(doc(db, "class_assignments", existing.id));
        } catch (err) {
          console.error("Error removing old assignment", err);
        }
      }
      
      try {
        await addDoc(collection(db, "class_assignments"), {
          class: newAssignment.class,
          section: sec,
          teacherId: teacher.id,
          teacherName: teacher.name,
          createdAt: new Date().toISOString(),
          schoolId: selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01'
        });
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
      alert("Failed to assign class teacher.");
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

  const handleAddClass = () => {
    if (newClass.trim() && !classes.includes(newClass.trim())) {
      setClasses([...classes, newClass.trim()]);
      setClassSettings(prev => ({
        ...prev,
        [newClass.trim()]: normalizeClassFeeSettings({ academicYear: '2026-27', components: DEFAULT_FEE_COMPONENTS.map(c => ({ ...c })) })
      }));
      setNewClass('');
    }
  };

  const handleRemoveClass = (cls) => {
    if (window.confirm(`Are you sure you want to remove ${cls}?`)) {
      setClasses(classes.filter(c => c !== cls));
    }
  };

  const handleAddSection = () => {
    if (newSection.trim() && !sections.includes(newSection.trim())) {
      setSections([...sections, newSection.trim()]);
      setNewSection('');
    }
  };

  const handleRemoveSection = (sec) => {
    if (window.confirm(`Are you sure you want to remove ${sec}?`)) {
      setSections(sections.filter(s => s !== sec));
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

    try {
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[newStaff.role] || DEFAULT_ROLE_PERMISSIONS.Teacher;
      const authUser = await createStaffAuthAccount(newStaff.contact.trim(), newStaff.password.trim());
      await addDoc(collection(db, 'staff'), {
        uid: authUser.uid,
        name: newStaff.name.trim(),
        role: newStaff.role,
        customPermissions: defaultPerms,
        contact: newStaff.contact.trim(),
        baseSalary: Number(newStaff.baseSalary),
        schoolId: newStaff.schoolId,
        createdAt: serverTimestamp(),
        lastPaidDate: null
      });
      await setDoc(doc(db, 'users', authUser.uid), {
        name: newStaff.name.trim(),
        role: newStaff.role,
        schoolId: newStaff.schoolId,
        customPermissions: defaultPerms
      });
      setIsAddingStaff(false);
      setNewStaff({ name: '', role: 'Teacher', baseSalary: '', contact: '', password: '', schoolId: 'SCH_01' });
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
      throw new Error('AUTH_PASSWORD_RESET_REQUIRES_BACKEND');
    } catch (err) {
      console.error("Error resetting password:", err);
      alert("Password reset requires the Firebase Admin/Cloud Function password-reset service. The staff profile was not changed.");
    }
  };

  const handleDeleteStaff = async (staffId, name, uid) => {
    if (!window.confirm(`Are you sure you want to remove teacher "${name}"? Access will be revoked.`)) return;

    try {
      await deleteDoc(doc(db, 'staff', staffId));
      if (uid) await deleteDoc(doc(db, 'users', uid));
      alert(`Teacher "${name}" removed successfully.`);
      fetchStaff();
    } catch (err) {
      console.error("Error removing staff:", err);
      alert("Failed to remove staff.");
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
          onClose={() => setPermissionModalStaff(null)}
          onSave={() => {
            setPermissionModalStaff(null);
            fetchStaff();
          }}
        />
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Class-Specific Fee Structure</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Configure exactly which fees apply to each class. Frequency controls when the charge is created; grace is the payment window after its due date.
                </p>
              </div>
            </div>

            {classes.map(cls => {
              const settings = normalizeClassFeeSettings(classSettings[cls] || {});
              const components = settings.components || DEFAULT_FEE_COMPONENTS;
              const updateComponent = (id, field, value) => {
                setClassSettings(prev => ({
                  ...prev,
                  [cls]: {
                    ...settings,
                    components: components.map(c => c.id === id ? { ...c, [field]: value } : c)
                  }
                }));
              };
              const toggleInstallment = (id, inst) => {
                const c = components.find(x => x.id === id);
                const current = c?.installments || [];
                const next = current.includes(inst) ? current.filter(x => x !== inst) : [...current, inst];
                updateComponent(id, 'installments', next);
              };
              return (
                <div key={cls} style={{ marginBottom: 20, border: '1px solid var(--border-light)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <strong>{cls}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Due day</span>
                      <input type="number" min="1" max="28" className="form-input" style={{ width: 62, padding: '6px 8px' }} value={settings.duePolicy?.defaultDueDay ?? 10} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), defaultDueDay: Number(e.target.value) || 10 } } }))} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sep penalty</span>
                      <input type="number" min="0" className="form-input" style={{ width: 70, padding: '6px 8px' }} value={settings.duePolicy?.septemberPenalty ?? 100} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), septemberPenalty: Number(e.target.value) || 0 } } }))} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Dec penalty</span>
                      <input type="number" min="0" className="form-input" style={{ width: 70, padding: '6px 8px' }} value={settings.duePolicy?.decemberPenalty ?? 500} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), decemberPenalty: Number(e.target.value) || 0 } } }))} />
                      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={settings.duePolicy?.decemberClearWaivesPenalty !== false} onChange={e => setClassSettings(prev => ({ ...prev, [cls]: { ...settings, duePolicy: { ...(settings.duePolicy || {}), decemberClearWaivesPenalty: e.target.checked } } }))} />Clear all in Dec waives penalty</label>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="modern-table">
                      <thead><tr><th>Use</th><th>Fee</th><th>Amount</th><th>Frequency</th><th>Installment / Schedule</th><th>Penalty</th><th>Grace (days)</th></tr></thead>
                      <tbody>
                        {components.map(c => (
                          <tr key={c.id}>
                            <td><input type="checkbox" checked={!!c.enabled} onChange={e => updateComponent(c.id, 'enabled', e.target.checked)} /></td>
                            <td style={{ fontWeight: 700, minWidth: 120 }}>{c.name}</td>
                            <td><input type="number" min="0" className="form-input" style={{ width: 110, padding: '6px 8px' }} value={c.amount ?? 0} onChange={e => updateComponent(c.id, 'amount', Number(e.target.value) || 0)} /></td>
                            <td>
                              <select className="form-input" style={{ minWidth: 150, padding: '6px 8px' }} value={c.frequency || 'one_time'} onChange={e => updateComponent(c.id, 'frequency', e.target.value)}>
                                {FEE_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                              </select>
                            </td>
                            <td style={{ minWidth: 220 }}>
                              {(c.frequency === 'specific_installments' || c.frequency === 'one_time' || c.frequency === 'every_installment') ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {INSTALLMENTS.map(i => <label key={i.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={(c.installments || []).includes(i.id)} onChange={() => toggleInstallment(c.id, i.id)} />{i.id === 'admission' ? '1st' : i.id === 'september' ? 'Sep' : 'Dec'}</label>)}
                                </div>
                              ) : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.frequency === 'monthly' ? 'Every month' : c.frequency === 'quarterly' ? 'Every quarter' : 'Configure custom schedule later'}</span>}
                            </td>
                            <td><input type="number" min="0" className="form-input" style={{ width: 95, padding: '6px 8px' }} value={c.penalty ?? 0} onChange={e => updateComponent(c.id, 'penalty', Number(e.target.value) || 0)} /></td>
                            <td><input type="number" min="0" className="form-input" style={{ width: 80, padding: '6px 8px' }} value={c.graceDays ?? 5} onChange={e => updateComponent(c.id, 'graceDays', Number(e.target.value) || 0)} /></td>
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
                  {staffList.filter(s => s.role === 'Teacher' || s.role === 'Senior Teacher').map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
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
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentsList.map(assignment => (
                      <tr key={assignment.id}>
                        <td style={{ fontWeight: 700 }}>{assignment.class}</td>
                        <td style={{ fontWeight: 700 }}>{assignment.section}</td>
                        <td style={{ fontWeight: 600 }}>{assignment.teacherName}</td>
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
