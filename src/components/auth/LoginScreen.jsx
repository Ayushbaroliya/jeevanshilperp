import React, { useState } from 'react';
import { GraduationCap, Shield, User, Briefcase, Lock, ArrowRight, CheckCircle2, Key, Sliders, LogIn, Phone, Globe, Building2 } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db, staffAuthEmail, normalizeLoginId, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from '../../firebase';
import { DEFAULT_ROLE_PERMISSIONS } from '../../utils/permissions';
import { t, SCHOOLS } from '../../utils/translations';

export default function LoginScreen({ onLoginSuccess }) {
  const [lang, setLang] = useState('en');
  const dict = t[lang] || t.en;
  
  // null means showing the 4 portals. Otherwise 'SCH_01', 'SCH_02', 'SCH_03', or 'OWNER'
  const [activePortal, setActivePortal] = useState(null); 
  
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleStaffLogin = async (e) => {
    e.preventDefault();
    const cleanInput = normalizeLoginId(mobile.trim());
    if (!cleanInput || !password.trim()) {
      setErrorMsg(lang === 'hi' ? 'कृपया पंजीकृत 10 अंकों का मोबाइल नंबर और पासवर्ड दर्ज करें।' : 'Please enter your Mobile Number and password.');
      return;
    }
    setErrorMsg('');
    setIsLoggingIn(true);

    try {
      const email = staffAuthEmail(cleanInput);
      const credential = await signInWithEmailAndPassword(auth, email, password.trim());
      const userUid = credential.user.uid;

      // Resilient Staff Profile Lookup:
      // 1. Query staff collection by uid
      let staffDoc = null;
      let staffData = null;

      const qUid = query(collection(db, 'staff'), where('uid', '==', userUid));
      const uidSnap = await getDocs(qUid);
      if (!uidSnap.empty) {
        staffDoc = uidSnap.docs[0];
        staffData = staffDoc.data();
      } else {
        // Fallback A: document ID == userUid
        try {
          const directSnap = await getDoc(doc(db, 'staff', userUid));
          if (directSnap.exists()) {
            staffDoc = directSnap;
            staffData = directSnap.data();
          }
        } catch (_) {}

        // Fallback B: query by contact or loginId
        if (!staffDoc) {
          try {
            const qContact = query(collection(db, 'staff'), where('contact', '==', cleanInput));
            const contactSnap = await getDocs(qContact);
            if (!contactSnap.empty) {
              staffDoc = contactSnap.docs[0];
              staffData = contactSnap.data();
              // Auto-link UID for future instant lookups
              try {
                const { setDoc, doc: fDoc } = await import('firebase/firestore');
                await setDoc(fDoc(db, 'staff', staffDoc.id), { uid: userUid }, { merge: true });
              } catch (_) {}
            }
          } catch (_) {}
        }
      }

      if (!staffDoc || !staffData) {
        // Fallback C: check users collection
        try {
          const userDocSnap = await getDoc(doc(db, 'users', userUid));
          if (userDocSnap.exists()) {
            staffData = userDocSnap.data();
            staffDoc = { id: userUid, data: () => staffData };
          }
        } catch (_) {}
      }

      if (!staffDoc || !staffData) {
        await signOut(auth);
        throw new Error('STAFF_PROFILE_NOT_FOUND');
      }

      // Smart Multi-Campus Routing:
      // If staff belongs to another campus, route them seamlessly to their registered school!
      const targetSchool = staffData.schoolId || activePortal;
      const staff = { 
        id: staffDoc.id, 
        ...staffData, 
        uid: userUid, 
        schoolId: targetSchool 
      };

      onLoginSuccess(staff);
    } catch (err) {
      console.error('Staff login error:', err);
      let message;
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
        message = lang === 'hi' 
          ? 'गलत मोबाइल नंबर या पासवर्ड। कृपया पुनः जांचें।' 
          : 'Invalid Mobile Number or password. Please check your credentials.';
      } else if (err?.code === 'auth/too-many-requests') {
        message = lang === 'hi' 
          ? 'बहुत अधिक असफल प्रयास। कृपया कुछ मिनट बाद पुनः प्रयास करें।' 
          : 'Too many failed login attempts. Please try again later.';
      } else if (err?.code === 'auth/user-disabled') {
        message = lang === 'hi' 
          ? 'यह खाता व्यवस्थापक द्वारा निष्क्रिय कर दिया गया है।' 
          : 'This staff account has been deactivated. Please contact administration.';
      } else if (err?.message === 'STAFF_PROFILE_NOT_FOUND') {
        message = lang === 'hi'
          ? 'प्रमाणीकरण सफल हुआ, लेकिन इस खाते के लिए कोई स्टाफ प्रोफ़ाइल नहीं मिली।'
          : 'Authenticated successfully, but no staff profile is linked to this account.';
      } else {
        message = lang === 'hi' ? 'लॉगिन विफल। कृपया मोबाइल नंबर और पासवर्ड जांचें।' : 'Login failed. Check your Mobile Number and password.';
      }
      setErrorMsg(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOwnerLogin = async (e) => {
    e.preventDefault();
    if (!mobile.trim() || !password.trim()) {
      setErrorMsg('Please enter Owner credentials.');
      return;
    }
    setErrorMsg('');
    setIsLoggingIn(true);

    let ownerEmail;
    try {

      ownerEmail = mobile.trim();
      if (ownerEmail.toLowerCase() === 'admin' && import.meta.env.VITE_ENABLE_DEMO_LOGIN) {
        ownerEmail = import.meta.env.VITE_OWNER_EMAIL || 'jeevanshilporg@gmail.com';
      } else if (!ownerEmail.includes('@')) {
        ownerEmail = staffAuthEmail(ownerEmail);
      }
      
      const credential = await signInWithEmailAndPassword(auth, ownerEmail, password.trim());
      const profileSnap = await getDoc(doc(db, 'users', credential.user.uid));
      let profile = profileSnap.exists() ? profileSnap.data() : {};
      
      const configuredOwnerEmail = import.meta.env.VITE_OWNER_EMAIL || 'jeevanshilporg@gmail.com';
      
      if (credential.user.email === configuredOwnerEmail) {
        profile = { ...profile, role: 'Owner', name: profile.name || 'Group Owner' };
      } else if (profile.role !== 'Owner') {
        await signOut(auth);
        throw new Error('NOT_OWNER');
      }
      
      onLoginSuccess({ id: credential.user.uid, ...profile, role: 'Owner', schoolId: 'ALL' });
    } catch (err) {
      console.error('Owner login error:', err);
      let errorText = err?.message || 'Owner login failed.';
      if (err?.code === 'auth/user-not-found') {
        // Attempt to create the Owner account on the fly
        try {
          const newCred = await createUserWithEmailAndPassword(auth, ownerEmail, password.trim());
          const profileSnap = await getDoc(doc(db, 'users', newCred.user.uid));
          let profile = profileSnap.exists() ? profileSnap.data() : {};
          profile = { ...profile, role: 'Owner', name: profile.name || 'Group Owner' };
          onLoginSuccess({ id: newCred.user.uid, ...profile, role: 'Owner', schoolId: 'ALL' });
          return;
        } catch (createErr) {
          console.error('Failed to create Owner account:', createErr);
          errorText = 'Unable to create Owner account.';
        }
      } else if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        errorText = 'Invalid Owner credentials.';
      } else if (err?.message === 'NOT_OWNER') {
        errorText = 'You are not authorized as an Owner.';
      }
      setErrorMsg(errorText);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const renderPortalSelection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, textAlign: 'center' }}>
        Please select your campus to log in securely:
      </p>

      {SCHOOLS.map(school => (
        <button
          key={school.id}
          type="button"
          className="glass-card"
          onClick={() => { setActivePortal(school.id); setErrorMsg(''); setMobile(''); setPassword(''); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            border: '1px solid var(--border-light)',
            borderRadius: 14,
            transition: 'all 0.2s ease',
            backgroundColor: 'var(--bg-secondary)'
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--brand-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{school.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Staff & Faculty Portal</div>
          </div>
          <ArrowRight size={18} color="var(--text-secondary)" />
        </button>
      ))}

              
        <div style={{ height: 1, backgroundColor: 'var(--border-light)', margin: '8px 0' }} />
        
        <button
          type="button"
          id="owner-portal-btn"
          className="glass-card"
          onClick={() => { setActivePortal('OWNER'); setErrorMsg(''); setMobile(''); setPassword(''); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            textAlign: 'left',
            cursor: 'pointer',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: 14,
            transition: 'all 0.2s ease',
            backgroundColor: 'rgba(139, 92, 246, 0.05)'
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#8B5CF6' }}>Group Owner Login</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Super Admin Access (All Branches)</div>
          </div>
          <ArrowRight size={18} color="#8B5CF6" />
        </button>
    </div>
  );

  const renderLoginForm = () => {
    const isOwner = activePortal === 'OWNER';
    const schoolName = isOwner ? 'Owner / Super Admin' : SCHOOLS.find(s => s.id === activePortal)?.name;

    return (
      <div>
        <button 
          type="button"
          onClick={() => setActivePortal(null)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}
        >
          ← Back to Portals
        </button>

        <div style={{
          backgroundColor: isOwner ? 'rgba(191, 87, 0, 0.05)' : 'var(--bg-secondary)',
          border: isOwner ? '1px solid rgba(191, 87, 0, 0.2)' : '1px solid var(--border-light)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 800, color: isOwner ? 'var(--brand-orange)' : 'var(--text-primary)', fontSize: 16 }}>
            {schoolName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {isOwner ? 'Enter master credentials' : 'Enter your Login ID and password'}
          </div>
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--danger)',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            textAlign: 'center'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={isOwner ? handleOwnerLogin : handleStaffLogin}>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label" style={{ fontWeight: 700 }}>{isOwner ? 'Username' : (lang === 'hi' ? '10 अंकों का मोबाइल नंबर' : '10-Digit Mobile Number')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder={isOwner ? "admin" : "e.g. 9876543210"}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
              <User size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
              <Lock size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isLoggingIn}
            style={{ width: '100%', padding: '12px', fontSize: 15, justifyContent: 'center', backgroundColor: isOwner ? 'var(--brand-orange)' : undefined }}
          >
            {isLoggingIn ? 'Verifying Account...' : 'Sign In'} <ArrowRight size={18} />
          </button>
        </form>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-secondary)',
      padding: '24px 16px',
      position: 'relative'
    }}>
      {/* Top Right Language Switcher on Login Screen */}
      <div style={{ position: 'absolute', top: 20, right: 24 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 800,
            backgroundColor: lang === 'hi' ? 'rgba(245, 158, 11, 0.15)' : '#ffffff',
            color: lang === 'hi' ? 'var(--warning)' : 'var(--text-primary)',
            borderRadius: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
          }}
        >
          <Globe size={16} /> {lang === 'en' ? 'हिंदी में देखें' : 'Switch to English'}
        </button>
      </div>

      <div className="glass-card" style={{
        width: '100%',
        maxWidth: 480,
        padding: '36px 32px',
        borderRadius: 24,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.4)'
      }}>
        {/* Branding Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/logo.jpg"
            alt="Jeevan Shilp Inter College"
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              objectFit: 'cover',
              margin: '0 auto 16px',
              display: 'block',
              border: '3px solid #fff',
              boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
            }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.5px' }}>
            {dict.loginTitle}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {dict.loginSubtitle}
          </p>
        </div>

        {activePortal === null ? renderPortalSelection() : renderLoginForm()}

      </div>
    </div>
  );
}

