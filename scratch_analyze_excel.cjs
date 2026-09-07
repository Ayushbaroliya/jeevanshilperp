const xlsx = require('xlsx');

function analyze() {
  const wb = xlsx.readFile('jeevanshilppublic school.xlsx');
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  
  console.log('Total Rows:', data.length);
  if (data.length > 0) {
    console.log('Columns:', Object.keys(data[0]).join(', '));
  }
  
  const classDist = {};
  const sectionDist = {};
  
  data.forEach(row => {
    const cls = row['CLASS'] || row['Class'] || row['class'];
    const sec = row['SECTION'] || row['Section'] || row['section'] || 'No Section';
    
    if (cls) classDist[cls] = (classDist[cls] || 0) + 1;
    sectionDist[sec] = (sectionDist[sec] || 0) + 1;
  });
  
  console.log('\nClass Distribution:', classDist);
  console.log('Section Distribution:', sectionDist);
  
  console.log('\nFirst 3 rows sample:');
  console.log(data.slice(0, 3));
}

analyze();
