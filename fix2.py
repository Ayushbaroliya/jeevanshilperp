import re

with open('src/components/auth/LoginScreen.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('{(import.meta.env.VITE_E2E_TESTING || import.meta.env.DEV) && (', '{(import.meta.env.VITE_E2E_TESTING) && (')

with open('src/components/auth/LoginScreen.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success!')
