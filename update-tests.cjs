const fs = require('fs');
const path = require('path');

const e2eDir = path.join(__dirname, 'e2e');
const files = fs.readdirSync(e2eDir).filter(f => f.endsWith('.spec.js'));

for (const file of files) {
  const filePath = path.join(e2eDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace Owner login
  content = content.replace(/await page\.click\('text=Owner \/ Super Admin'\);\s+await page\.click\('button:has-text\("Sign In"\)'\);/g, 'await page.click(\'#e2e-owner-login\');');
  
  content = content.replace(/\/\/ Click the Owner portal\s+await page\.click\('text=Owner \/ Super Admin'\);\s+\/\/ Click Sign In \(admin\/admin is prefilled\)\s+await page\.click\('button:has-text\("Sign In"\)'\);/g, 'await page.click(\'#e2e-owner-login\');');

  // Replace Teacher login in login.spec.js
  content = content.replace(/\/\/ Click a school portal\s+await page\.click\('text=Jeevan Shilp Public School'\);\s+\/\/ Fill Teacher demo credentials\s+await page\.fill\('input\[placeholder="e\.g\. 9876543210"\]', '9999988888'\);\s+await page\.fill\('input\[placeholder="••••••••"\]', 'password'\);\s+await page\.click\('button:has-text\("Sign In"\)'\);/g, 'await page.click(\'#e2e-teacher-login\');');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}
