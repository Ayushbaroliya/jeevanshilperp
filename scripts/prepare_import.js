import xlsx from 'xlsx';
import fs from 'fs';

const file1 = 'jeevanshilppublic school.xlsx';
const file2 = 'jeevanshilp inter collage.xlsx';

function normalizeClass(rawClass) {
  if (!rawClass) return null;
  const str = String(rawClass).trim().toLowerCase();
  
  // Extract number
  const match = str.match(/\d+/);
  if (!match) return str; // fallback if no number found
  
  const num = match[0];
  return `Class ${num}`; // Standardizing to "Class 1", "Class 6", etc.
}

function processPublicSchool() {
  const workbook = xlsx.readFile(file1);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { range: 0 }); // Headers at row 1 (index 0)
  
  return rawData.map(row => {
    // Exact Headers: [ 'S.N.', 'Student Name', 'Father Name', 'Class', 'Mobile', 'Address' ]
    return {
      schoolId: 'SCH_01', // JSPS
      name: row['Student Name'] || 'Unknown',
      contact: row['Mobile'] || '',
      fatherName: row['Father Name'] || '',
      address: row['Address'] || '',
      enrollment: {
        class: normalizeClass(row['Class']),
        section: 'A', // Default section for Public School
        roll: String(row['S.N.'] || ''),
        status: 'Active',
        attendance: '100%'
      }
    };
  }).filter(s => s.name !== 'Unknown');
}

function processInterCollege() {
  const workbook = xlsx.readFile(file2);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { range: 3 }); // Headers at row 4 (index 3)
  
  return rawData.map(row => {
    // Exact Headers: [ 'S.No.', 'Class', 'Section', 'Student Name', "Father's Name", 'Stream', 'Class & Stream Group' ]
    let stream = row['Stream'] || '';
    if (stream === '-') stream = ''; // Normalize empty stream
    
    return {
      schoolId: 'SCH_02', // JSIC
      name: row['Student Name'] || 'Unknown',
      contact: '', // Mobile not provided in this sheet
      fatherName: row["Father's Name"] || '',
      stream: stream,
      enrollment: {
        class: normalizeClass(row['Class']),
        section: String(row['Section'] || 'A').trim(),
        roll: String(row['S.No.'] || ''),
        status: 'Active',
        attendance: '100%'
      }
    };
  }).filter(s => s.name !== 'Unknown');
}

try {
  console.log('Processing Public School...');
  const jspsStudents = processPublicSchool();
  console.log(`Processed ${jspsStudents.length} JSPS students.`);
  
  console.log('Processing Inter College...');
  const jsicStudents = processInterCollege();
  console.log(`Processed ${jsicStudents.length} JSIC students.`);
  
  const allStudents = [...jspsStudents, ...jsicStudents];
  console.log(`Total students parsed: ${allStudents.length}`);
  
  fs.writeFileSync('scripts/import_data.json', JSON.stringify(allStudents, null, 2));
  console.log('Successfully saved parsed students to scripts/import_data.json');
} catch (e) {
  console.error('Failed to parse Excel:', e);
}
