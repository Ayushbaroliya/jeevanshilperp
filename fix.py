import re

with open('src/components/auth/LoginScreen.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''        <div style={{ height: 1, backgroundColor: 'var(--border-light)', margin: '8px 0' }} />

        {(import.meta.env.VITE_E2E_TESTING || import.meta.env.DEV) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: 1, marginBottom: 4 }}>
              Developer / Demo Access
            </div>
            
            <button
              type="button" id="e2e-owner-login" className="glass-card"
              onClick={async () => {
                if (import.meta.env.VITE_E2E_TESTING) {
                  const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
                  const { doc, setDoc } = await import('firebase/firestore');
                  let cred;
                  try {
                    cred = await signInWithEmailAndPassword(auth, "owner@test.local", "password");
                  } catch (e) {
                    cred = await createUserWithEmailAndPassword(auth, "owner@test.local", "password");
                    await setDoc(doc(db, 'users', cred.user.uid), { role: 'Owner', name: 'Group Owner / Super Admin' });
                  }
                  onLoginSuccess({ id: cred.user.uid, uid: cred.user.uid, name: 'Group Owner / Super Admin', role: 'Owner', schoolId: 'ALL' });
                } else {
                  onLoginSuccess({ id: 'demo-owner', uid: 'demo-owner', name: 'Demo Owner', role: 'Owner', schoolId: 'ALL', isTourMode: true });
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 14, backgroundColor: 'rgba(139, 92, 246, 0.05)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#8B5CF6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Shield size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#8B5CF6' }}>Group Owner Login</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Super Admin Access (All Branches)</div>
              </div>
              <ArrowRight size={18} color="#8B5CF6" />
            </button>
            
            <button
              type="button" id="e2e-admin-login" className="glass-card"
              onClick={async () => {
                if (import.meta.env.VITE_E2E_TESTING) {
                  const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
                  const { doc, setDoc } = await import('firebase/firestore');
                  let cred;
                  try {
                    cred = await signInWithEmailAndPassword(auth, "admin@test.local", "password");
                  } catch (e) {
                    cred = await createUserWithEmailAndPassword(auth, "admin@test.local", "password");
                    await setDoc(doc(db, 'staff', cred.user.uid), { uid: cred.user.uid, role: 'Administrator', schoolId: 'SCH_01', name: 'E2E Admin' });
                  }
                  onLoginSuccess({ id: cred.user.uid, uid: cred.user.uid, name: 'E2E Admin', role: 'Administrator', schoolId: 'SCH_01' });
                } else {
                  onLoginSuccess({ id: 'demo-admin', uid: 'demo-admin', name: 'Demo Admin', role: 'Administrator', schoolId: 'SCH_01', isTourMode: true });
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 14, backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#3B82F6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#3B82F6' }}>Administrator Login</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Principal Access (SCH_01)</div>
              </div>
              <ArrowRight size={18} color="#3B82F6" />
            </button>

            <button
              type="button" id="e2e-accountant-login" className="glass-card"
              onClick={async () => {
                if (import.meta.env.VITE_E2E_TESTING) {
                  const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
                  const { doc, setDoc } = await import('firebase/firestore');
                  let cred;
                  try {
                    cred = await signInWithEmailAndPassword(auth, "accountant@test.local", "password");
                  } catch (e) {
                    cred = await createUserWithEmailAndPassword(auth, "accountant@test.local", "password");
                    await setDoc(doc(db, 'staff', cred.user.uid), { uid: cred.user.uid, role: 'Accountant', schoolId: 'SCH_01', name: 'E2E Accountant' });
                  }
                  onLoginSuccess({ id: cred.user.uid, uid: cred.user.uid, name: 'E2E Accountant', role: 'Accountant', schoolId: 'SCH_01' });
                } else {
                  onLoginSuccess({ id: 'demo-accountant', uid: 'demo-accountant', name: 'Demo Accountant', role: 'Accountant', schoolId: 'SCH_01', isTourMode: true });
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 14, backgroundColor: 'rgba(245, 158, 11, 0.05)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F59E0B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sliders size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#F59E0B' }}>Accountant Login</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Finance Dept Access (SCH_01)</div>
              </div>
              <ArrowRight size={18} color="#F59E0B" />
            </button>

            <button
              type="button" id="e2e-teacher-login" className="glass-card"
              onClick={async () => {
                if (import.meta.env.VITE_E2E_TESTING) {
                  const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
                  const { doc, setDoc } = await import('firebase/firestore');
                  let cred;
                  try {
                    cred = await signInWithEmailAndPassword(auth, "teacher@test.local", "password");
                  } catch (e) {
                    cred = await createUserWithEmailAndPassword(auth, "teacher@test.local", "password");
                    await setDoc(doc(db, 'staff', cred.user.uid), { uid: cred.user.uid, role: 'Teacher', schoolId: 'SCH_01', name: 'Meena Sharma' });
                  }
                  onLoginSuccess({ id: cred.user.uid, uid: cred.user.uid, name: 'Meena Sharma', role: 'Teacher', schoolId: 'SCH_01' });
                } else {
                  onLoginSuccess({ id: 'demo-teacher', uid: 'demo-teacher', name: 'Demo Teacher', role: 'Teacher', schoolId: 'SCH_01', isTourMode: true });
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(236, 72, 153, 0.3)', borderRadius: 14, backgroundColor: 'rgba(236, 72, 153, 0.05)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EC4899', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#EC4899' }}>Teacher Login</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Academic Access (SCH_01)</div>
              </div>
              <ArrowRight size={18} color="#EC4899" />
            </button>

            <button
              type="button"
              className="glass-card"
              onClick={() => {
                onLoginSuccess({
                  id: 'tour-guide',
                  uid: 'tour-guide',
                  name: 'Tour Guide',
                  role: 'Administrator',
                  schoolId: 'SCH_01',
                  isTourMode: true
                });
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', cursor: 'pointer', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 14, backgroundColor: 'rgba(16, 185, 129, 0.05)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--brand-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--brand-green)' }}>Interactive Guided Tour</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Offline Demo Mode</div>
              </div>
              <ArrowRight size={18} color="var(--brand-green)" />
            </button>
          </div>
        )}'''

pattern = r"<div style={{ height: 1, backgroundColor: 'var\(--border-light\)', margin: '8px 0' }} />[\s\S]*?import\.meta\.env\.DEV[\s\S]*?</button>\s*\)}"

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content)
    with open('src/components/auth/LoginScreen.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success!')
else:
    print('Failed to find pattern')
