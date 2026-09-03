import React from 'react';
import { LayoutDashboard, Users, BookOpen, Settings, CreditCard, UserCheck, GraduationCap, Briefcase } from 'lucide-react';
import { getUserPermissions } from '../../utils/permissions';
import { t } from '../../utils/translations';

export default function Sidebar({ currentView, setCurrentView, currentUser, isMobileMenuOpen, setIsMobileMenuOpen, lang = 'en' }) {
  const permissions = getUserPermissions(currentUser);
  const dict = t[lang] || t.en;

  const navItems = [
    {
      id: 'dashboard',
      label: dict.dashboard || 'Dashboard',
      icon: LayoutDashboard,
      show: permissions.viewDashboardStats || currentUser?.role === 'Administrator' || currentUser?.role === 'Principal'
    },
    {
      id: 'teacher',
      label: dict.teacherWorkspace || 'Teacher Workspace',
      icon: UserCheck,
      show: currentUser?.role === 'Teacher' || currentUser?.role === 'Senior Teacher'
    },
    {
      id: 'students',
      label: dict.studentDirectory || 'Students Directory',
      icon: Users,
      show: permissions.viewStudents !== false
    },
    {
      id: 'finance',
      label: dict.feesAndFinance || 'Fees & Finance',
      icon: CreditCard,
      show: permissions.recordPayments || permissions.viewInvoices || permissions.viewDashboardStats || currentUser?.role === 'Accountant'
    },
    {
      id: 'academics',
      label: dict.academicsAndGrades || 'Academics & Grades',
      icon: GraduationCap,
      show: permissions.academics !== false
    },
    {
      id: 'staff',
      label: 'Staff & Salary',
      icon: Briefcase,
      show: currentUser?.role === 'Administrator' || currentUser?.role === 'Principal'
    },
    {
      id: 'settings',
      label: dict.schoolSettings || 'School Settings & Governance',
      icon: Settings,
      show: permissions.settings || currentUser?.role === 'Administrator' || currentUser?.role === 'Principal'
    }
  ];

  return (
    <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{
      width: 240,
      backgroundColor: 'var(--bg-card)',
      borderRight: '1px solid var(--border-light)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 12px',
      gap: 6
    }}>
      <div className="sidebar-header" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '8px 12px', letterSpacing: '0.5px' }}>
        {dict.mainNav}
      </div>

      <nav className="sidebar-nav tour-sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>      {navItems.filter(item => item.show).map(item => {
        const Icon = item.icon;
        const isActive = currentView === item.id || (item.id === 'finance' && ['ledger', 'record_payment', 'invoices'].includes(currentView));

        return (
          <button
            key={item.id}
            className={`nav-item tour-nav-${item.id} ${isActive ? 'active' : ''}`}
            onClick={() => {
              setCurrentView(item.id);
              setIsMobileMenuOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              fontSize: 14,
              fontWeight: isActive ? 800 : 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
      </nav>
    </aside>
  );
}

