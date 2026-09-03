import React from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

export default function RestrictedAccessView({ viewName, userRole, onNavigate }) {
  return (
    <div className="glass-card" style={{ padding: 48, textAlign: 'center', maxWidth: 560, margin: '40px auto' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Lock size={32} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
        Limited Access Granted
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
        Your account role (<strong>{userRole || 'Staff Member'}</strong>) does not have permission to access the <strong>{viewName}</strong> module.
      </p>
      <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)', textAlign: 'left', marginBottom: 24, fontSize: 13, border: '1px solid var(--border-light)' }}>
        <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
          <ShieldAlert size={16} color="var(--warning)" /> Permission Required
        </div>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          If you require access to this section, please ask the School Principal or Administrator to update your custom access permissions in the Staff Management settings.
        </p>
      </div>
      <button className="btn-primary" onClick={() => onNavigate('dashboard')}>
        Go to Available Dashboard
      </button>
    </div>
  );
}
