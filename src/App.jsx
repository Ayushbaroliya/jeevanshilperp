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
import { collection, getDocs, query, where, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
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

  const defaultClasses = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'];
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
    defaultClasses.forEach(c => {
      let admissionFee = 0;
      let julyFee = 0;
      let septFee = 0;
      let decFee = 0;
      let examFee = 0;
      let isEnabled = false;

      if (['Class 6', 'Class 7', 'Class 8'].includes(c)) {
        admissionFee = c === 'Class 6' ? 1200 : 1000;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 9', 'Class 10'].includes(c)) {
        admissionFee = 1500;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Art', 'Class 12 Art'].includes(c)) {
        admissionFee = 1500;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Science', 'Class 12 Science'].includes(c)) {
        admissionFee = 2000;
        julyFee = 3000; septFee = 2500; decFee = 2000; examFee = 1000; isEnabled = true;
      }

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
          // Tuition installments — July / September / December
          { id: 'july',      name: 'July Installment',      amount: julyFee, enabled: julyFee > 0, frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'september', name: 'September Installment',  amount: septFee, enabled: septFee > 0, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 100, graceDays: 5,
            schedule: [{ dueDate: '2026-09-10', label: 'September Installment' }] },
          { id: 'december',  name: 'December Installment',   amount: decFee,  enabled: decFee  > 0, frequency: 'one_time', installments: ['december'],  dueDay: 10, penalty: 500, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          // Optional fee components
          { id: 'exam',      name: 'Examination Fee', amount: examFee, enabled: examFee > 0, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'computer',  name: 'Computer Fee',    amount: 0,       enabled: false,        frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'practical', name: 'Practical Fee',   amount: 0,       enabled: false,        frequency: 'one_time', installments: ['december'],  dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'transport', name: 'Transport Fee',   amount: 0,       enabled: false,        frequency: 'monthly',  installments: [],            dueDay: 10, penalty: 0, graceDays: 5,
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
      return { SCH_01: 'AY_2025_26', SCH_02: 'AY_2025_26', SCH_03: 'AY_2025_26' };
    } catch {
      return { SCH_01: 'AY_2025_26', SCH_02: 'AY_2025_26', SCH_03: 'AY_2025_26' };
    }
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "school_settings", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.schoolClassSettings) setSchoolClassSettings(data.schoolClassSettings);
        if (data.schoolClasses) setSchoolClasses(data.schoolClasses);
        if (data.schoolSections) setSchoolSections(data.schoolSections);
        if (data.activeAcademicYearId) setActiveAcademicYearId(data.activeAcademicYearId);
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
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
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
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
            />
          )}
          {currentView === 'finance' && (
            <FinanceModule
              onNavigate={setCurrentView}
              userPermissions={userPermissions}
              lang={lang}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              classes={schoolClasses[selectedSchool] || []}
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
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
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
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
              activeAcademicYearId={activeAcademicYearId[selectedSchool] || 'AY_2025_26'}
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
            />
          )}
        </main>
      </div>
    </div>
  );
}

