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

function parseExcel(filename, headerIndex, schoolId) {
  if (!fs.existsSync(filename)) return null;
  const workbook = xlsx.readFile(filename);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const dataObjects = xlsx.utils.sheet_to_json(sheet, { range: headerIndex });
  
  const parsedData = [];
  dataObjects.forEach((row, idx) => {
    const nameKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'name' || k.toLowerCase().includes('student name'));
    const fatherKey = Object.keys(row).find(k => k.toLowerCase().includes('father'));
    const classKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'class');
    const sectionKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'section');
    const streamKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'stream');
    const rollKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'roll');
    
    const name = nameKey ? String(row[nameKey]).trim() : undefined;
    const father = fatherKey ? String(row[fatherKey]).trim() : undefined;
    let cls = classKey ? String(row[classKey]).trim() : undefined;
    const sec = sectionKey ? String(row[sectionKey]).trim() : undefined;
    const stream = streamKey ? String(row[streamKey]).trim() : undefined;
    const roll = rollKey ? String(row[rollKey]).trim() : '';

    if (!name || !cls) return; // skip invalid
    
    let finalStream = null;
    
    if (schoolId === 'SCH_02') {
      if (cls.includes('11')) {
         cls = 'Class 11';
      } else if (cls.includes('12')) {
         let foundStream = 'None';
         if (stream && stream.toLowerCase().includes('sci')) { foundStream = 'Science'; finalStream = 'Science'; }
         else if (stream && stream.toLowerCase().includes('art')) { foundStream = 'Arts'; finalStream = 'Arts'; }
         else if (cls.toLowerCase().includes('sci')) { foundStream = 'Science'; finalStream = 'Science'; }
         else if (cls.toLowerCase().includes('art')) { foundStream = 'Arts'; finalStream = 'Arts'; }
         cls = `Class 12 ${foundStream !== 'None' ? foundStream : ''}`.trim();
      } else {
         cls = cls.replace(/^(class\s*)/i, 'Class ');
      }
    } else {
       cls = cls.replace(/^(class\s*)/i, 'Class ');
    }

    parsedData.push({ 
       name, 
       fatherName: father || '', 
       class: cls, 
       section: sec || 'A', 
       stream: finalStream,
       roll: roll || '',
       schoolId
    });
  });
  return parsedData;
}

async function execute() {
  console.log("STARTING IMPORT PROCESS...");
  
  // 1. Double Check Financials
  const charges = await db.collection('fee_charges').limit(1).get();
  const ledger = await db.collection('student_ledger').limit(1).get();
  if (!charges.empty || !ledger.empty) {
     console.error("ABORT: Financial records exist.");
     process.exit(1);
  }

  // 2. Delete Operational Student and Enrollment Data
  console.log("Deleting current students and enrollments...");
  const deleteCollection = async (collName) => {
    let q = db.collection(collName);
    let snapshot = await q.get();
    while (!snapshot.empty) {
       const batch = db.batch();
       snapshot.forEach(d => {
         if (d.data().schoolId === 'SCH_01' || d.data().schoolId === 'SCH_02') {
             batch.delete(d.ref);
         }
       });
       await batch.commit();
       snapshot = await q.get(); // Loop until empty? No, this could loop forever if we skip some.
       // actually, it's safer to just fetch all and chunk them
       break;
    }
  };

  const deleteByChunks = async (collName) => {
     const snapshot = await db.collection(collName).get();
     let batches = [];
     let batch = db.batch();
     let count = 0;
     snapshot.forEach(d => {
       if (d.data().schoolId === 'SCH_01' || d.data().schoolId === 'SCH_02') {
         batch.delete(d.ref);
         count++;
         if (count === 500) {
           batches.push(batch.commit());
           batch = db.batch();
           count = 0;
         }
       }
     });
     if (count > 0) batches.push(batch.commit());
     await Promise.all(batches);
     console.log(`Deleted from ${collName}`);
  };

  await deleteByChunks('students');
  await deleteByChunks('enrollments');
  console.log("Deletion complete.");

  // 3. Prepare data
  const jspsData = parseExcel(jspsFile, 0, 'SCH_01');
  const jsicData = parseExcel(jsicFile, 0, 'SCH_02');
  const allData = [...jspsData, ...jsicData];

  console.log(`Preparing to insert ${allData.length} records...`);

  // 4. Insert data
  let batches = [];
  let batch = db.batch();
  let count = 0;
  
  const now = new Date().toISOString();

  for (let s of allData) {
     const studentRef = db.collection('students').doc();
     
     const studentDoc = {
       name: s.name,
       fatherName: s.fatherName,
       class: s.class,
       section: s.section,
       schoolId: s.schoolId,
       roll: s.roll,
       isNewAdmission: false,
       status: 'Active',
       createdAt: now
     };
     if (s.stream) studentDoc.stream = s.stream;
     
     batch.set(studentRef, studentDoc);
     count++;
     
     const enrollRef = db.collection('enrollments').doc();
     const enrollDoc = {
       studentId: studentRef.id,
       schoolId: s.schoolId,
       academicYearId: '2026-27',
       class: s.class,
       section: s.section,
       roll: s.roll,
       status: 'Active',
       attendance: '100%',
       createdAt: now
     };
     
     batch.set(enrollRef, enrollDoc);
     count++;
     
     if (count >= 400) {
       batches.push(batch.commit());
       batch = db.batch();
       count = 0;
     }
  }
  
  if (count > 0) batches.push(batch.commit());
  await Promise.all(batches);
  console.log("Insert complete.");
}

execute().catch(console.error);
