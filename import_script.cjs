const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const xlsx = require('xlsx');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = require('c:/Users/lenovo/Downloads/jeevanshilporg-51db8-firebase-adminsdk-fbsvc-722655f3ed.json');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

// Files
const jspsFile = 'jeevanshilppublic school.xlsx';
const jsicFile = 'JSIC_2026-27_Firestore_Import_Prepared.xlsx';

async function generateReport() {
  console.log("=========================================");
  console.log(" PRE-RESET DRY RUN REPORT");
  console.log("=========================================\n");

  // 1. Current Document Counts
  console.log("--- 1. CURRENT DATABASE COUNTS ---");
  const jspsStudents = await db.collection('students').where('schoolId', '==', 'SCH_01').count().get();
  const jsicStudents = await db.collection('students').where('schoolId', '==', 'SCH_02').count().get();
  const allStudents = await db.collection('students').count().get();
  
  const jspsEnroll = await db.collection('enrollments').where('schoolId', '==', 'SCH_01').count().get();
  const jsicEnroll = await db.collection('enrollments').where('schoolId', '==', 'SCH_02').count().get();
  const allEnroll = await db.collection('enrollments').count().get();

  console.log(`Students -> Total: ${allStudents.data().count}, JSPS (SCH_01): ${jspsStudents.data().count}, JSIC (SCH_02): ${jsicStudents.data().count}`);
  console.log(`Enrollments -> Total: ${allEnroll.data().count}, JSPS (SCH_01): ${jspsEnroll.data().count}, JSIC (SCH_02): ${jsicEnroll.data().count}`);

  // 2. Financial Records Check
  console.log("\n--- 2. FINANCIAL RECORDS CHECK ---");
  const charges = await db.collection('fee_charges').limit(1).get();
  const ledger = await db.collection('student_ledger').limit(1).get();
  const adjustments = await db.collection('fee_adjustments').limit(1).get();
  const invoices = await db.collection('invoices').limit(1).get();
  
  // We don't have fee_payments in the known code, but let's check it anyway
  let payments;
  try {
     payments = await db.collection('fee_payments').limit(1).get();
  } catch(e) {}

  let hasFinancials = false;
  if (!charges.empty) { console.log("WARNING: Found documents in fee_charges."); hasFinancials = true; }
  if (!ledger.empty) { console.log("WARNING: Found documents in student_ledger."); hasFinancials = true; }
  if (!adjustments.empty) { console.log("WARNING: Found documents in fee_adjustments."); hasFinancials = true; }
  if (!invoices.empty) { console.log("WARNING: Found documents in invoices."); hasFinancials = true; }
  if (payments && !payments.empty) { console.log("WARNING: Found documents in fee_payments."); hasFinancials = true; }

  if (!hasFinancials) {
    console.log("SUCCESS: No financial records found in main collections.");
  }

  // 3. Dry-Run Excel Parsing
  console.log("\n--- 3. EXCEL DATA DRY-RUN ---");
  
  function parseExcel(filename, headerIndex, schoolId) {
    console.log(`\nAnalyzing file: ${filename} (School: ${schoolId})`);
    if (!fs.existsSync(filename)) {
      console.log(`ERROR: File ${filename} not found.`);
      return null;
    }
    
    const workbook = xlsx.readFile(filename);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    console.log(`Total Source Rows (including headers): ${rawData.length}`);
    const dataObjects = xlsx.utils.sheet_to_json(sheet, { range: headerIndex });
    
    let validRows = 0;
    let missingCritical = 0;
    let duplicateNames = 0;
    let classCounts = {};
    let streamCounts = { 'Science': 0, 'Arts': 0, 'Commerce': 0, 'None': 0 };
    
    const seenNames = new Set();
    
    const parsedData = [];

    dataObjects.forEach((row, idx) => {
      const nameKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'name' || k.toLowerCase().includes('student name'));
      const classKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'class');
      const sectionKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'section');
      const streamKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'stream');
      
      const name = nameKey ? String(row[nameKey]).trim() : undefined;
      let cls = classKey ? String(row[classKey]).trim() : undefined;
      const sec = sectionKey ? String(row[sectionKey]).trim() : undefined;
      const stream = streamKey ? String(row[streamKey]).trim() : undefined;

      if (!name || !cls) {
        missingCritical++;
        return;
      }
      
      if (schoolId === 'SCH_02') {
        if (cls.includes('11')) {
           cls = 'Class 11';
        } else if (cls.includes('12')) {
           let foundStream = 'None';
           if (stream && stream.toLowerCase().includes('sci')) {
             foundStream = 'Science';
           } else if (stream && stream.toLowerCase().includes('art')) {
             foundStream = 'Arts';
           } else if (cls.toLowerCase().includes('sci')) {
             foundStream = 'Science';
           } else if (cls.toLowerCase().includes('art')) {
             foundStream = 'Arts';
           }
           streamCounts[foundStream]++;
           cls = `Class 12 ${foundStream !== 'None' ? foundStream : ''}`.trim();
        } else {
           cls = cls.replace(/^(class\s*)/i, 'Class ');
        }
      } else {
         cls = cls.replace(/^(class\s*)/i, 'Class ');
      }

      if (seenNames.has(name.toLowerCase())) {
        duplicateNames++;
      }
      seenNames.add(name.toLowerCase());
      
      classCounts[cls] = (classCounts[cls] || 0) + 1;
      validRows++;
      
      parsedData.push({ name, cls, sec, stream });
    });
    
    console.log(`Valid Rows for Import: ${validRows}`);
    console.log(`Rows Missing Name/Class: ${missingCritical}`);
    console.log(`Duplicate Names Warn: ${duplicateNames}`);
    console.log(`Class Counts:`, classCounts);
    if (schoolId === 'SCH_02') {
      console.log(`Stream Counts (Class 12 inferred from stream/class):`, streamCounts);
    }
    
    return parsedData;
  }

  const jspsData = parseExcel(jspsFile, 0, 'SCH_01');
  const jsicData = parseExcel(jsicFile, 0, 'SCH_02');

  console.log("\n=========================================");
  console.log(" END OF REPORT");
  console.log("=========================================\n");
  
  process.exit(0);
}

generateReport().catch(console.error);
