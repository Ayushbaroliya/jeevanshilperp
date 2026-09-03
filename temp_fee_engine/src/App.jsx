import React, { useState, useEffect } from 'react';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import LoginScreen from './components/auth/LoginScreen';
import AdminDashboard from './components/dashboard/AdminDashboard';
import TeacherDashboard from './components/dashboard/TeacherDashboard';
import { StudentsDirectory, StudentLedger } from './components/students/StudentsModule';
import FinanceModule from './components/finance/FinanceModule';
import AcademicsModule from './components/academics/AcademicsModule';
import SettingsModule from './components/settings/SettingsModule';
import StaffSalaryModule from './components/staff/StaffSalaryModule';
import RestrictedAccessView from './components/common/RestrictedAccessView';
import TourGuide from './components/common/TourGuide';
import { getUserPermissions } from './utils/permissions';
import { auth, db, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import './App.css';
import './mobile.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }
      try {
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL || 'jeevanshilporg@gmail.com';
        const ownerSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if ((ownerSnap.exists() && ownerSnap.data().role === 'Owner') || firebaseUser.email === ownerEmail) {
          const profile = ownerSnap.exists() ? ownerSnap.data() : { name: 'Group Owner' };
          setCurrentUser({ id: firebaseUser.uid, ...profile, role: 'Owner', schoolId: 'ALL' });
          setCurrentView('dashboard');
          return;
        }
        const staffSnap = await getDocs(query(collection(db, 'staff'), where('uid', '==', firebaseUser.uid)));
        if (!staffSnap.empty) {
          const staff = { id: staffSnap.docs[0].id, ...staffSnap.docs[0].data() };
          setCurrentUser(staff);
          setCurrentView(staff.role === 'Teacher' || staff.role === 'Senior Teacher' ? 'teacher' : staff.role === 'Accountant' ? 'finance' : 'dashboard');
        } else {
          await signOut(auth);
        }
      } catch (error) {
        console.error('Failed to restore authenticated session:', error);
        await signOut(auth);
      } finally {
        setAuthLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const [lang, setLang] = useState('en');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState(() => localStorage.getItem('eduerp_selected_school') || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStudent, setActiveStudent] = useState(null);

  const defaultClasses = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
  const defaultSections = ['Section A', 'Section B', 'Section C'];
  
  const [schoolClasses, setSchoolClasses] = useState(() => {
    try {
      const saved = localStorage.getItem('jeevan_school_classes');
      if (saved) return JSON.parse(saved);
      const old = localStorage.getItem('eduerp_classes');
      const base = old ? JSON.parse(old) : defaultClasses;
      return { SCH_01: [...base], SCH_02: [...base], SCH_03: [...base] };
    } catch {
      return { SCH_01: [...defaultClasses], SCH_02: [...defaultClasses], SCH_03: [...defaultClasses] };
    }
  });

  const [schoolSections, setSchoolSections] = useState(() => {
    try {
      const saved = localStorage.getItem('jeevan_school_sections');
      if (saved) return JSON.parse(saved);
      const old = localStorage.getItem('eduerp_sections');
      const base = old ? JSON.parse(old) : defaultSections;
      return { SCH_01: [...base], SCH_02: [...base], SCH_03: [...base] };
    } catch {
      return { SCH_01: [...defaultSections], SCH_02: [...defaultSections], SCH_03: [...defaultSections] };
    }
  });

  const [schoolClassSettings, setSchoolClassSettings] = useState(() => {
    const fallback = {};
    defaultClasses.forEach(c => fallback[c] = { academicYear: '2026-27', duePolicy: { defaultDueDay: 10, defaultGraceDays: 5, defaultPenalty: 0, septemberPenalty: 100, decemberPenalty: 500, decemberClearWaivesPenalty: true }, components: [
      { id: 'tuition', name: 'Tuition', amount: 1500, enabled: true, frequency: 'every_installment', installments: ['admission','september','december'], dueDay: 10, penalty: 100, graceDays: 5 },
      { id: 'admission', name: 'Admission', amount: 0, enabled: false, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
      { id: 'exam', name: 'Exam', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
      { id: 'computer', name: 'Computer', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
      { id: 'practical', name: 'Practical', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
      { id: 'transport', name: 'Transport', amount: 0, enabled: false, frequency: 'monthly', installments: [], dueDay: 10, penalty: 0, graceDays: 5 }
    ] });
    try {
      const saved = localStorage.getItem('jeevan_school_class_settings');
      if (saved) return JSON.parse(saved);
      const old = localStorage.getItem('eduerp_class_settings');
      const base = old ? { ...fallback, ...JSON.parse(old) } : fallback;
      return { SCH_01: {...base}, SCH_02: {...base}, SCH_03: {...base} };
    } catch {
      return { SCH_01: {...fallback}, SCH_02: {...fallback}, SCH_03: {...fallback} };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('jeevan_school_classes', JSON.stringify(schoolClasses));
      localStorage.setItem('jeevan_school_sections', JSON.stringify(schoolSections));
      localStorage.setItem('jeevan_school_class_settings', JSON.stringify(schoolClassSettings));
    } catch (e) {
      console.warn('Unable to persist local school settings:', e);
    }
  }, [schoolClasses, schoolSections, schoolClassSettings]);

  const setClassesForSchool = (schoolId, updater) => {
    setSchoolClasses(prev => ({
      ...prev,
      [schoolId]: typeof updater === 'function' ? updater(prev[schoolId] || []) : updater
    }));
  };

  const setSectionsForSchool = (schoolId, updater) => {
    setSchoolSections(prev => ({
      ...prev,
      [schoolId]: typeof updater === 'function' ? updater(prev[schoolId] || []) : updater
    }));
  };

  const setClassSettingsForSchool = (schoolId, updater) => {
    setSchoolClassSettings(prev => ({
      ...prev,
      [schoolId]: typeof updater === 'function' ? updater(prev[schoolId] || {}) : updater
    }));
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('eduerp_selected_school', selectedSchool);
  }, [selectedSchool]);

  const handleLoginSuccess = (userObj) => {
    setCurrentUser(userObj);
    if (userObj.schoolId && userObj.schoolId !== 'ALL') {
      setSelectedSchool(userObj.schoolId);
    } else {
      setSelectedSchool('ALL');
    }
    if (userObj?.role === 'Teacher') {
      setCurrentView('teacher');
    } else if (userObj?.role === 'Accountant') {
      setCurrentView('finance');
    } else {
      setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    signOut(auth).catch((error) => console.error('Sign-out failed:', error));
    setCurrentView('dashboard');
  };

  if (authLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading secure session...</div>;
  }

  // If user is not authenticated, render Login Home Screen
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const userPermissions = getUserPermissions(currentUser);

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TourGuide 
        run={currentUser?.isTourMode === true} 
        onFinish={() => {
          alert("Tour completed! Feel free to explore.");
        }} 
      />
      {/* Top Header Navigation */}
      <Navbar
        currentUser={currentUser}
        selectedSchool={selectedSchool}
        setSelectedSchool={setSelectedSchool}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        lang={lang}
        setLang={setLang}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        onLogout={handleLogout}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Main Layout Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - 65px)' }}>
        {/* Streamlined Accounts Sidebar */}
        <Sidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          currentUser={currentUser}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          lang={lang}
        />

        {/* Dedicated Accounts / Finance Main Workspace Content */}
        <main className="main-content page-container">
          {currentView === 'dashboard' && (
            <AdminDashboard
              onNavigate={setCurrentView}
              lang={lang}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              userPermissions={userPermissions}
              currentUser={currentUser}
            />
          )}
          {currentView === 'teacher' && (
            <TeacherDashboard
              onNavigate={setCurrentView}
              currentUser={currentUser}
              lang={lang}
            />
          )}
          {currentView === 'students' && (
            <StudentsDirectory
              onNavigate={setCurrentView}
              lang={lang}
              classes={schoolClasses[selectedSchool] || []}
              sections={schoolSections[selectedSchool] || []}
              userPermissions={userPermissions}
              currentUser={currentUser}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              onSelectStudent={(st) => {
                setActiveStudent(st);
                setCurrentView('ledger');
              }}
            />
          )}
          {currentView === 'ledger' && (
            <StudentLedger
              onNavigate={setCurrentView}
              lang={lang}
              activeStudent={activeStudent}
              userPermissions={userPermissions}
              selectedSchool={selectedSchool}
            />
          )}
          {currentView === 'finance' && (
            <FinanceModule
              onNavigate={setCurrentView}
              userPermissions={userPermissions}
              lang={lang}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
            />
          )}
          {currentView === 'academics' && (
            <AcademicsModule
              globalClasses={schoolClasses[selectedSchool] || []}
              globalSections={schoolSections[selectedSchool] || []}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              currentUser={currentUser}
              userPermissions={userPermissions}
            />
          )}
          {currentView === 'settings' && (
            <SettingsModule
              lang={lang}
              classes={schoolClasses[selectedSchool] || []}
              setClasses={(updater) => setClassesForSchool(selectedSchool, updater)}
              classSettings={schoolClassSettings[selectedSchool] || {}}
              setClassSettings={(updater) => setClassSettingsForSchool(selectedSchool, updater)}
              sections={schoolSections[selectedSchool] || []}
              setSections={(updater) => setSectionsForSchool(selectedSchool, updater)}
              onNavigate={setCurrentView}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
            />
          )}
          {currentView === 'staff' && (
            <StaffSalaryModule
              lang={lang}
              selectedSchool={selectedSchool}
              userPermissions={userPermissions}
            />
          )}
        </main>
      </div>
    </div>
  );
}

