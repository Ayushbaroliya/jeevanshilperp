import React, { useState } from 'react';
import { X, Shield } from 'lucide-react';
import { updateDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, getUserPermissions } from '../../utils/permissions';

export default function ManagePermissionsModal({ staff, onClose, onSave }) {
  const [role, setRole] = useState(staff.role || 'Teacher');
  const [permissions, setPermissions] = useState(() => {
    return getUserPermissions(staff);
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    const defaults = DEFAULT_ROLE_PERMISSIONS[newRole] || DEFAULT_ROLE_PERMISSIONS.Teacher;
    setPermissions(defaults);
  };

  const handleToggle = (key) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'staff', staff.id), {
        role,
        customPermissions: permissions,
        updatedAt: new Date().toISOString()
      });
      if (staff.uid) {
        await setDoc(doc(db, 'users', staff.uid), {
          name: staff.name || '',
          role,
          schoolId: staff.schoolId,
          customPermissions: permissions
        }, { merge: true });
      }
      alert(`Access permissions updated successfully for ${staff.name}!`);
      onSave();
    } catch (err) {
      console.error("Error updating permissions:", err);
      alert("Failed to save permissions.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: 24, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={20} color="var(--accent-primary)" /> Customize Access Permissions
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Manage limited access permissions for <strong>{staff.name}</strong> ({staff.contact})
        </p>

        <div style={{ marginBottom: 20 }}>
          <label className="form-label" style={{ fontWeight: 700 }}>Staff Role & Preset</label>
          <select className="form-input" value={role} onChange={e => handleRoleChange(e.target.value)}>
            <option value="Teacher">Teacher (Default: Academics & Students)</option>
            <option value="Senior Teacher">Senior Teacher (Academics & Add Students)</option>
            <option value="Accountant">Accountant (Default: Fee Collections, Invoices & Dues)</option>
            <option value="Administrator">Administrator (Full Access to All Modules)</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' }}>
            Module Permission Matrix
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              type="button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const allTrue = {};
                Object.keys(PERMISSION_KEYS).forEach(k => allTrue[k] = true);
                setPermissions(allTrue);
              }}
            >
              Select All
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => {
                const defaults = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.Teacher;
                setPermissions(defaults);
              }}
            >
              Reset Defaults
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {Object.values(PERMISSION_KEYS).map(item => {
            const isChecked = !!permissions[item.key];
            return (
              <div
                key={item.key}
                onClick={() => handleToggle(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  border: isChecked ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                  backgroundColor: isChecked ? 'rgba(191, 87, 0, 0.05)' : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  style={{ marginTop: 2, cursor: 'pointer', width: 16, height: 16 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="btn-primary" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving Rules...' : 'Save Access Rules'}
          </button>
        </div>
      </div>
    </div>
  );
}
