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
import ErrorBoundary from './components/common/ErrorBoundary';
import { getUserPermissions } from './utils/permissions';
import { auth, db, signOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { normalizeClassFeeSettings } from './utils/feeEngine';
import './App.css';
import './mobile.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isInitialAuthRef = React.useRef(true);

  const [currentViewRaw, setCurrentViewRaw] = useState('dashboard');
  const setCurrentView = (val) => {
    console.warn("APP LOG: currentView changed to: " + val);
    setCurrentViewRaw(val);
  };
  const currentView = currentViewRaw;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        isInitialAuthRef.current = false;
        return;
      }
      try {
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL || 'jeevanshilporg@gmail.com';
        const ownerSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if ((ownerSnap.exists() && ownerSnap.data().role === 'Owner') || firebaseUser.email === ownerEmail) {
          const profile = ownerSnap.exists() ? ownerSnap.data() : { name: 'Group Owner' };
          setCurrentUser({ id: firebaseUser.uid, ...profile, role: 'Owner', schoolId: 'ALL' });
          if (isInitialAuthRef.current) {
            console.warn("APP LOG: setting currentView to dashboard for Owner (Initial)");
            setCurrentView('dashboard');
            isInitialAuthRef.current = false;
          }
          return;
        }
        let staffQuery;
        if (ownerSnap.exists() && ownerSnap.data().schoolId) {
          staffQuery = query(collection(db, 'staff'), where('uid', '==', firebaseUser.uid), where('schoolId', '==', ownerSnap.data().schoolId));
        } else {
          staffQuery = query(collection(db, 'staff'), where('uid', '==', firebaseUser.uid));
        }
        const staffSnap = await getDocs(staffQuery);
        
        if (!staffSnap.empty) {
          const staff = { id: staffSnap.docs[0].id, ...staffSnap.docs[0].data() };
          setCurrentUser(staff);
          if (isInitialAuthRef.current) {
            const v = staff.role === 'Teacher' || staff.role === 'Senior Teacher' ? 'teacher' : 'dashboard';
            console.warn("APP LOG: setting currentView to " + v + " for Staff (Initial)");
            setCurrentView(v);
            isInitialAuthRef.current = false;
          }
        } else if (ownerSnap.exists()) {
          const profile = ownerSnap.data();
          const staff = { id: firebaseUser.uid, ...profile, uid: firebaseUser.uid };
          setCurrentUser(staff);
          if (isInitialAuthRef.current) {
            const v = staff.role === 'Teacher' || staff.role === 'Senior Teacher' ? 'teacher' : 'dashboard';
            console.warn("APP LOG: setting currentView to " + v + " for User (Fallback)");
            setCurrentView(v);
            isInitialAuthRef.current = false;
          }
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

  const defaultJSPSClasses = ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'];
  const defaultJSICClasses = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'];
  const defaultJSB2Classes = ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];
  const defaultClasses = defaultJSPSClasses;
  const defaultSections = ['Section A', 'Section B', 'Section C'];
  
  const [schoolClasses, setSchoolClasses] = useState(() => {
    try {
      const saved = localStorage.getItem('jeevan_school_classes');
      if (saved) return JSON.parse(saved);
      return { SCH_01: [...defaultJSPSClasses], SCH_02: [...defaultJSICClasses], SCH_03: [...defaultJSB2Classes] };
    } catch {
      return { SCH_01: [...defaultJSPSClasses], SCH_02: [...defaultJSICClasses], SCH_03: [...defaultJSB2Classes] };
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
    defaultClasses.forEach(c => {
      let admissionFee = 0;
      let tuitionFee = 0;
      let examFee = 0;
      let isEnabled = false;

      if (['Class 6', 'Class 7', 'Class 8'].includes(c)) {
        admissionFee = c === 'Class 6' ? 1200 : 1000;
        tuitionFee = 6000; examFee = 500; isEnabled = true;
      } else if (['Class 9', 'Class 10'].includes(c)) {
        admissionFee = 1500;
        tuitionFee = 6000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Art', 'Class 12 Art'].includes(c)) {
        admissionFee = 1500;
        tuitionFee = 6000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Science', 'Class 12 Science'].includes(c)) {
        admissionFee = 2000;
        tuitionFee = 7500; examFee = 1000; isEnabled = true;
      }

      const isScience = ['Class 11 Science', 'Class 12 Science'].includes(c);
      const tuitionSchedule = isScience
        ? [
            { dueDate: '2026-07-10', label: 'July Installment', amount: 3000 },
            { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 2500 },
            { dueDate: '2026-12-10', label: 'December Installment', amount: 2000 }
          ]
        : [
            { dueDate: '2026-07-10', label: 'July Installment', amount: 2000 },
            { dueDate: '2026-10-10', label: 'October Installment / अक्टूबर की किस्त', amount: 2000 },
            { dueDate: '2026-12-10', label: 'December Installment', amount: 2000 }
          ];

      fallback[c] = {
        academicYear: '2026-2027',
        duePolicy: {
          defaultDueDay: 10,
          septemberGraceDays: 5,
          septemberPenalty: 100,
          decemberGraceDays: 5,
          decemberPenalty: 500,
          decemberClearWaivesPenalty: true
        },
        components: [
          // Admission Fee — separate one-time component, NOT an installment
          { id: 'admission', name: 'Admission Fee', amount: admissionFee, enabled: admissionFee > 0, frequency: 'one_time', installments: [], dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
          // Tuition Fee — single component spanning all 3 installments
          { id: 'tuition', name: 'Tuition Fee', amount: tuitionFee, enabled: tuitionFee > 0, frequency: 'every_installment', installments: ['july', 'september', 'december'], dueDay: 10, penalty: 100, graceDays: 5,
            schedule: tuitionSchedule },
          // Optional fee components
          { id: 'exam',         name: 'Examination Fee', amount: examFee, enabled: examFee > 0, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'computer',     name: 'Computer Fee',    amount: 0,       enabled: false,        frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'practical',    name: 'Practical Fee',   amount: 200,     enabled: false,        frequency: 'one_time', installments: ['december'],  dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'registration', name: 'Registration Fee',amount: 100,     enabled: false,        frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'test',         name: 'Test Fee',        amount: 200,     enabled: false,        frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'transport',    name: 'Transport Fee',   amount: 0,       enabled: false,        frequency: 'monthly',  installments: [],            dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [] }
        ]
      };
    });
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

  const [activeAcademicYearId, setActiveAcademicYearId] = useState(() => {
    try {
      const saved = localStorage.getItem('jeevan_active_academic_year');
      if (saved) return JSON.parse(saved);
      return { SCH_01: 'AY_2026_27', SCH_02: 'AY_2026_27', SCH_03: 'AY_2026_27' };
    } catch {
      return { SCH_01: 'AY_2026_27', SCH_02: 'AY_2026_27', SCH_03: 'AY_2026_27' };
    }
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "school_settings", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.schoolClassSettings) {
          // Migrate legacy component structures (e.g. separate july/sept/dec rows,
          // wrong tuition installments) as they enter React state, so the UI and
          // any downstream saves always see the canonical shape.
          const migrated = {};
          for (const [schoolId, perClassMap] of Object.entries(data.schoolClassSettings)) {
            migrated[schoolId] = {};
            for (const [cls, classSetting] of Object.entries(perClassMap || {})) {
              migrated[schoolId][cls] = normalizeClassFeeSettings(classSetting);
            }
          }
          setSchoolClassSettings(prev => ({
            ...prev,
            ...migrated
          }));
        }
        if (data.schoolClasses) {
          setSchoolClasses(prev => ({
            ...prev,
            ...data.schoolClasses
          }));
        }
        if (data.schoolSections) {
          setSchoolSections(prev => ({
            ...prev,
            ...data.schoolSections
          }));
        }
        if (data.activeAcademicYearId) {
          setActiveAcademicYearId(prev => ({
            ...prev,
            ...data.activeAcademicYearId
          }));
        }
      }
    }, (error) => {
      console.warn("Settings snapshot permission denied (expected during E2E):", error.message);
    });
    return () => unsub();
  }, []);

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

  useEffect(() => {
    localStorage.setItem('jeevan_school_classes', JSON.stringify(schoolClasses));
  }, [schoolClasses]);

  useEffect(() => {
    localStorage.setItem('jeevan_school_sections', JSON.stringify(schoolSections));
  }, [schoolSections]);

  useEffect(() => {
    localStorage.setItem('jeevan_school_class_settings', JSON.stringify(schoolClassSettings));
  }, [schoolClassSettings]);

  useEffect(() => {
    localStorage.setItem('jeevan_active_academic_year', JSON.stringify(activeAcademicYearId));
  }, [activeAcademicYearId]);

  const handleLoginSuccess = (userObj) => {
    setCurrentUser(userObj);
    if (userObj.schoolId && userObj.schoolId !== 'ALL') {
      setSelectedSchool(userObj.schoolId);
    } else {
      setSelectedSchool('ALL');
    }
    if (userObj?.role === 'Teacher') {
      setCurrentView('teacher');
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
        onNavigate={setCurrentView}
        onSelectStudent={(st) => {
          setActiveStudent(st);
          setCurrentView('ledger');
        }}
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
          <ErrorBoundary onReset={() => setCurrentView('dashboard')}>
          {currentView === 'dashboard' && (
            <AdminDashboard
              onNavigate={setCurrentView}
              lang={lang}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              userPermissions={userPermissions}
              currentUser={currentUser}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
            />
          )}
          {currentView === 'teacher' && (
            <TeacherDashboard
              onNavigate={setCurrentView}
              currentUser={currentUser}
              lang={lang}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
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
              classSettings={schoolClassSettings[selectedSchool] || {}}
              setSelectedSchool={setSelectedSchool}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2026_27'}
              searchQuery={searchQuery}
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
              currentUser={currentUser}
              selectedSchool={selectedSchool}
              classSettings={schoolClassSettings[selectedSchool] || {}}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2026_27'}
            />
          )}
          {currentView === 'finance' && (
            <FinanceModule
              currentUser={currentUser}
              onNavigate={setCurrentView}
              userPermissions={userPermissions}
              lang={lang}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              classes={schoolClasses[selectedSchool] || []}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2026_27'}
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
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2026_27'}
            />
          )}
          {currentView === 'settings' && (
            userPermissions.settings ? (
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
              currentUser={currentUser}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2026_27'}
            />
            ) : <RestrictedAccessView userRole={currentUser?.role} viewName="Settings & Governance" />
          )}
          {currentView === 'staff' && (
            <StaffSalaryModule
              lang={lang}
              selectedSchool={selectedSchool}
              userPermissions={userPermissions}
              currentUser={currentUser}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
              onNavigate={setCurrentView}
            />
          )}
        </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

