import React from 'react';
import { Search, Sun, Moon, GraduationCap, Menu, LogOut, Shield, User, Briefcase } from 'lucide-react';
import { SCHOOLS, t } from '../../utils/translations';

export default function Navbar({
  currentUser,
  selectedSchool,
  setSelectedSchool,
  isDarkMode,
  setIsDarkMode,
  lang,
  setLang,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  onLogout,
  searchQuery,
  setSearchQuery
}) {
  const userRole = currentUser?.role || 'Administrator';
  const dict = t[lang] || t.en;

  const getRoleBadgeColor = () => {
    switch (userRole) {
      case 'Administrator': return { bg: 'rgba(191, 87, 0, 0.1)', text: 'var(--brand-orange)', icon: Shield };
      case 'Accountant': return { bg: 'rgba(245, 158, 11, 0.1)', text: 'var(--warning)', icon: Briefcase };
      default: return { bg: 'rgba(16, 185, 129, 0.1)', text: 'var(--success)', icon: User };
    }
  };

  const badgeStyle = getRoleBadgeColor();
  const RoleIcon = badgeStyle.icon;

  return (
    <header className="main-header topbar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-light)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Left Branding & School Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          className="mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <Menu size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--brand-orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.2 }}>{dict.appName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lang === 'hi' ? 'स्कूल प्रशासन' : 'School Governance'}</div>
          </div>
        </div>

        {/* Branch Selector */}
        {(userRole === 'Owner' || userRole === 'Administrator') ? (
          <select
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
            className="form-input tour-school-switcher"
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, width: 'auto' }}
          >
            <option value="ALL">{dict.allSchools}</option>
            {SCHOOLS.map(sch => (
              <option key={sch.id} value={sch.id}>{sch.name} ({sch.code})</option>
            ))}
          </select>
        ) : (
          <div style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
            {SCHOOLS.find(s => s.id === currentUser?.schoolId)?.name || 'School Portal'}
          </div>
        )}
      </div>

      {/* Center Search Input */}
      <div className="topbar-search" style={{ flex: 1, maxWidth: 360, margin: '0 24px', position: 'relative' }}>
        <input
          type="text"
          className="form-input tour-global-search"
          placeholder={dict.searchPlaceholder}
          value={searchQuery || ''}
          onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
          style={{ 
            width: '100%',
            paddingLeft: 36, 
            fontSize: 13, 
            borderRadius: 20,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
            boxSizing: 'border-box'
          }}
        />
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
      </div>

      {/* Right Controls & Profile */}
      <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Language Switcher Button */}
        <button
          className="btn-secondary"
          onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 800,
            backgroundColor: lang === 'hi' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-secondary)',
            color: lang === 'hi' ? 'var(--warning)' : 'var(--text-primary)',
            borderColor: lang === 'hi' ? 'var(--warning)' : 'var(--border-light)'
          }}
          title="Switch Language / भाषा बदलें"
        >
          {lang === 'en' ? '🇮🇳 हिंदी' : '🇬🇧 English'}
        </button>

        {/* Theme Toggle */}
        <button
          className="btn-secondary"
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{ padding: '8px', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Toggle Dark Mode"
        >
          {isDarkMode ? <Sun size={18} color="var(--warning)" /> : <Moon size={18} />}
        </button>

        {/* User Role Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          backgroundColor: badgeStyle.bg,
          color: badgeStyle.text,
          fontWeight: 700,
          fontSize: 12
        }}>
          <RoleIcon size={14} />
          <span>{currentUser?.name || userRole}</span>
        </div>

        {/* Logout Button */}
        <button
          className="btn-secondary"
          onClick={onLogout}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--danger)',
            borderColor: 'rgba(239, 68, 68, 0.2)'
          }}
          title={dict.logout}
        >
          <LogOut size={16} /> {dict.logout}
        </button>
      </div>
    </header>
  );
}
