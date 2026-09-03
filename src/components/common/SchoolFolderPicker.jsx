import React from 'react';
import { FolderOpen } from 'lucide-react';
import { SCHOOLS } from '../../utils/translations';

export default function SchoolFolderPicker({ title, description, onSelectSchool }) {
  return (
    <div className="glass-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>{description}</p>
      
      <div className="grid-responsive" style={{ maxWidth: 900, margin: '0 auto' }}>
        {SCHOOLS.map(school => (
          <div 
             key={school.id} 
             onClick={() => onSelectSchool(school.id)}
             style={{ 
               padding: '32px 24px', 
               cursor: 'pointer', 
               display: 'flex', 
               flexDirection: 'column', 
               alignItems: 'center', 
               gap: 16, 
               backgroundColor: 'var(--bg-secondary)',
               border: '2px solid transparent',
               borderRadius: 16,
               transition: 'all 0.2s ease',
               boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.transform = 'translateY(-4px)';
               e.currentTarget.style.borderColor = 'var(--brand-orange)';
               e.currentTarget.style.boxShadow = '0 12px 24px rgba(191, 87, 0, 0.15)';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.transform = 'translateY(0)';
               e.currentTarget.style.borderColor = 'transparent';
               e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
             }}
          >
             <FolderOpen size={64} color="var(--brand-orange)" />
             <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>{school.name}</div>
             <div className="badge" style={{ backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)' }}>
               {school.city} • {school.code}
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
