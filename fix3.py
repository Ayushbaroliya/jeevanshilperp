import re

with open('src/components/auth/LoginScreen.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''
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
        </button>'''

pattern = r"<div style={{ height: 1, backgroundColor: 'var\(--border-light\)', margin: '8px 0' }} />[\s\S]*?\{\(import\.meta\.env\.VITE_E2E_TESTING\) && \([\s\S]*?</button>\s*</div>\s*\)}"

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content)
    with open('src/components/auth/LoginScreen.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success LoginScreen!')
else:
    print('Failed to find pattern in LoginScreen')
