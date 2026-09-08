import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Sun, Moon, GraduationCap, Menu, LogOut, Shield, User, Briefcase, 
  X, Users, BookOpen, DollarSign, Settings as SettingsIcon, LayoutDashboard, ArrowRight, Download 
} from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';
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
  setSearchQuery,
  onNavigate,
  onSelectStudent
}) {
  const userRole = currentUser?.role || 'Administrator';
  const dict = t[lang] || t.en;

  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [matchingStudents, setMatchingStudents] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Monitor PWA installability and beforeinstallprompt event
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        setIsAppInstalled(true);
      }

      const handleBeforeInstall = (e) => {
        e.preventDefault();
        setInstallPrompt(e);
      };

      const handleInstalled = () => {
        setIsAppInstalled(true);
        setInstallPrompt(null);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      window.addEventListener('appinstalled', handleInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleInstalled);
      };
    }
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) {
      alert(lang === 'hi' 
        ? 'ऐप इंस्टॉल करने के लिए ब्राउज़र के एड्रेस बार (URL बार) में दाईं ओर दिख रहे इंस्टॉल आइकन (स्क्रीन/डाउन एरो) पर क्लिक करें, या ब्राउज़र मेनू (तीन डॉट्स) > "Install Jeevanshilp Group" चुनें।' 
        : 'To install the desktop app, click the Install icon (screen with down arrow) in your browser address bar, or open the browser menu (three dots) > "Install Jeevanshilp Group".');
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsAppInstalled(true);
    }
  };

  const getRoleBadgeColor = () => {
    switch (userRole) {
      case 'Administrator': return { bg: 'rgba(191, 87, 0, 0.1)', text: 'var(--brand-orange)', icon: Shield };
      case 'Accountant': return { bg: 'rgba(245, 158, 11, 0.1)', text: 'var(--warning)', icon: Briefcase };
      default: return { bg: 'rgba(16, 185, 129, 0.1)', text: 'var(--success)', icon: User };
    }
  };

  const badgeStyle = getRoleBadgeColor();
  const RoleIcon = badgeStyle.icon;

  // Handle click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live student search with debounce
  useEffect(() => {
    const trimmed = (searchQuery || '').trim();
    if (trimmed.length < 2) {
      setMatchingStudents([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        let q = collection(db, 'students');
        if (selectedSchool && selectedSchool !== 'ALL') {
          q = query(q, where('schoolId', '==', selectedSchool), limit(40));
        } else {
          q = query(q, limit(40));
        }
        const snap = await getDocs(q);
        const term = trimmed.toLowerCase();
        const matches = [];
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.status === 'Deleted' || data.status === 'archived' || data.isDeleted === true) return;
          const nameMatch = (data.name || '').toLowerCase().includes(term);
          const rollMatch = String(data.roll || '').toLowerCase().includes(term);
          const fatherMatch = (data.fatherName || data.parentName || '').toLowerCase().includes(term);
          const classMatch = (data.class || '').toLowerCase().includes(term);
          if (nameMatch || rollMatch || fatherMatch || classMatch) {
            matches.push({ id: docSnap.id, ...data });
          }
        });
        setMatchingStudents(matches.slice(0, 5));
      } catch (err) {
        // Fail gracefully (e.g. quota or offline) without breaking UI
        console.warn('Search query warning:', err.message);
        setMatchingStudents([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedSchool]);

  // Available app module shortcuts
  const appModules = [
    { id: 'dashboard', name: lang === 'hi' ? 'डैशबोर्ड' : 'Dashboard', keywords: ['dashboard', 'डैशबोर्ड', 'overview', 'home'], icon: LayoutDashboard },
    { id: 'students', name: lang === 'hi' ? 'छात्र निर्देशिका' : 'Students Directory', keywords: ['student', 'students', 'छात्र', 'directory', 'admission', 'enrollment'], icon: Users },
    { id: 'finance', name: lang === 'hi' ? 'फीस व वित्त' : 'Finance & Fee Collection', keywords: ['fee', 'fees', 'finance', 'receipt', 'payment', 'due', 'शुल्क', 'फीस'], icon: DollarSign },
    { id: 'academics', name: lang === 'hi' ? 'शैक्षणिक व उपस्थिति' : 'Academics & Attendance', keywords: ['academic', 'academics', 'attendance', 'marks', 'exam', 'उपस्थिति'], icon: BookOpen },
    { id: 'staff', name: lang === 'hi' ? 'स्टाफ व वेतन' : 'Staff & Salary', keywords: ['staff', 'salary', 'payroll', 'teacher', 'वेतन', 'कर्मचारी'], icon: Briefcase },
    { id: 'settings', name: lang === 'hi' ? 'सेटिंग्स व नियम' : 'Settings & Governance', keywords: ['setting', 'settings', 'class', 'classes', 'structure', 'सेटिंग्स'], icon: SettingsIcon }
  ];

  const qLower = (searchQuery || '').trim().toLowerCase();
  const matchingModules = qLower.length >= 2 
    ? appModules.filter(m => m.keywords.some(k => k.includes(qLower) || qLower.includes(k)))
    : [];

  // Build combined items for keyboard navigation
  const searchItems = [];
  if (qLower.length > 0) {
    searchItems.push({
      type: 'action',
      label: lang === 'hi' ? `"${searchQuery}" को छात्र निर्देशिका में खोजें` : `Search student directory for "${searchQuery}"`,
      action: () => {
        if (onNavigate) onNavigate('students');
        setIsOpen(false);
      }
    });

    matchingModules.forEach(mod => {
      searchItems.push({
        type: 'module',
        label: mod.name,
        icon: mod.icon,
        action: () => {
          if (onNavigate) onNavigate(mod.id);
          setIsOpen(false);
        }
      });
    });

    matchingStudents.forEach(st => {
      searchItems.push({
        type: 'student',
        label: st.name,
        student: st,
        action: () => {
          if (onSelectStudent) {
            onSelectStudent(st);
          } else if (onNavigate) {
            onNavigate('students');
          }
          setIsOpen(false);
        }
      });
    });
  }

  const handleKeyDown = (e) => {
    if (!isOpen || searchItems.length === 0) {
      if (e.key === 'Enter' && searchQuery && searchQuery.trim()) {
        if (onNavigate) onNavigate('students');
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % searchItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + searchItems.length) % searchItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchItems.length) {
        searchItems[highlightedIndex].action();
      } else if (onNavigate) {
        onNavigate('students');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    if (setSearchQuery) setSearchQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <header className="main-header topbar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 24px',
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-light)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      {/* Left Branding & School Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <button
          className="mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          <Menu size={22} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo.png"
            alt="Jeevan Shilp"
            style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-light)', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.2 }}>{dict.appName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lang === 'hi' ? 'स्कूल प्रशासन' : 'School Governance'}</div>
          </div>
        </div>

        {/* Branch Selector */}
        {(userRole === 'Owner' || userRole === 'Administrator' || userRole === 'Admin') ? (
          <select
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
            className="form-input tour-school-switcher"
            style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, width: 'auto', height: 38 }}
          >
            <option value="ALL">{dict.allSchools}</option>
            {SCHOOLS.map(sch => (
              <option key={sch.id} value={sch.id}>{sch.name} ({sch.code})</option>
            ))}
          </select>
        ) : (
          <div style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-light)', height: 38, display: 'flex', alignItems: 'center' }}>
            {SCHOOLS.find(s => s.id === currentUser?.schoolId)?.name || 'School Portal'}
          </div>
        )}
      </div>

      {/* Center Search Input with Responsive Width & Live Results Dropdown */}
      <div 
        ref={containerRef}
        className="topbar-search" 
        style={{ 
          flex: '1 1 auto', 
          maxWidth: 460, 
          minWidth: 220, 
          margin: '0 16px', 
          position: 'relative', 
          height: 40,
          display: 'flex', 
          alignItems: 'center' 
        }}
      >
        <Search 
          size={17} 
          style={{ 
            position: 'absolute', 
            left: 14, 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: isFocused ? 'var(--accent-primary)' : 'var(--text-secondary)', 
            pointerEvents: 'none', 
            zIndex: 2,
            transition: 'color 0.2s ease'
          }} 
        />
        <input
          ref={inputRef}
          type="text"
          className="form-input tour-global-search"
          placeholder={dict.searchPlaceholder}
          value={searchQuery || ''}
          onChange={(e) => {
            if (setSearchQuery) setSearchQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsFocused(true);
            if (searchQuery && searchQuery.trim()) setIsOpen(true);
          }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          style={{ 
            width: '100%',
            height: 40,
            paddingLeft: 40,
            paddingRight: searchQuery ? 38 : 14,
            fontSize: 13, 
            fontWeight: 500,
            borderRadius: 10,
            backgroundColor: 'var(--bg-secondary)',
            border: isFocused ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-light)',
            boxShadow: isFocused ? '0 0 0 3px rgba(191, 87, 0, 0.15)' : 'inset 0 1px 2px rgba(0,0,0,0.03)',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'all 0.2s ease'
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              zIndex: 2
            }}
            title="Clear search"
          >
            <X size={15} />
          </button>
        )}

        {/* Live Search Results Dropdown (Z-Index 1050 above dashboard) */}
        {isOpen && searchItems.length > 0 && (
          <div 
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
              zIndex: 1050,
              maxHeight: 380,
              overflowY: 'auto',
              padding: '6px 0'
            }}
          >
            {/* Direct Action Item */}
            <div
              onClick={() => searchItems[0].action()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                cursor: 'pointer',
                backgroundColor: highlightedIndex === 0 ? 'var(--bg-secondary)' : 'transparent',
                borderBottom: searchItems.length > 1 ? '1px solid var(--border-light)' : 'none',
                color: 'var(--accent-primary)',
                fontWeight: 700,
                fontSize: 13
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Search size={16} />
                <span>{searchItems[0].label}</span>
              </div>
              <ArrowRight size={14} />
            </div>

            {/* Modules Matches */}
            {matchingModules.length > 0 && (
              <div style={{ padding: '6px 0' }}>
                <div style={{ padding: '4px 14px', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Navigation
                </div>
                {matchingModules.map((mod, idx) => {
                  const itemIndex = 1 + idx;
                  const ModIcon = mod.icon;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => searchItems[itemIndex].action()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: highlightedIndex === itemIndex ? 'var(--bg-secondary)' : 'transparent',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <ModIcon size={16} color="var(--brand-orange)" />
                      <span>{mod.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Student Matches */}
            {matchingStudents.length > 0 && (
              <div style={{ padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ padding: '4px 14px', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Students ({matchingStudents.length})
                </div>
                {matchingStudents.map((st, sIdx) => {
                  const itemIndex = 1 + matchingModules.length + sIdx;
                  const sch = SCHOOLS.find(s => s.id === st.schoolId);
                  return (
                    <div
                      key={st.id}
                      onClick={() => searchItems[itemIndex].action()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        backgroundColor: highlightedIndex === itemIndex ? 'var(--bg-secondary)' : 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                          {st.name?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{st.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {st.class || 'N/A'} {st.section ? `(${st.section})` : ''} • Roll: {st.roll || 'N/A'}
                          </div>
                        </div>
                      </div>
                      {sch && (
                        <span className="badge" style={{ fontSize: 10, fontWeight: 700 }}>
                          {sch.code}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls & Profile */}
      <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {/* Desktop App Install Button */}
        {!isAppInstalled && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleInstallApp}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--brand-blue, #3b82f6)',
              borderColor: 'rgba(59, 130, 246, 0.35)',
              height: 38,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title={lang === 'hi' ? 'डेस्कटॉप ऐप डाउनलोड करें / इंस्टॉल करें' : 'Download Desktop App / Install'}
          >
            <Download size={16} />
            <span>{lang === 'hi' ? 'ऐप डाउनलोड करें' : 'Download App'}</span>
          </button>
        )}

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
            borderColor: lang === 'hi' ? 'var(--warning)' : 'var(--border-light)',
            height: 38
          }}
          title="Switch Language / भाषा बदलें"
        >
          {lang === 'en' ? '🇮🇳 हिंदी' : '🇬🇧 English'}
        </button>

        {/* Theme Toggle */}
        <button
          className="btn-secondary"
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{ padding: '8px', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          fontSize: 12,
          height: 38,
          boxSizing: 'border-box'
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
            borderColor: 'rgba(239, 68, 68, 0.2)',
            height: 38
          }}
          title={dict.logout}
        >
          <LogOut size={16} /> {dict.logout}
        </button>
      </div>
    </header>
  );
}

