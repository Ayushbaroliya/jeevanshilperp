const xlsx = require('xlsx');
const fs = require('fs');

async function doDryRun() {
  const wb = xlsx.readFile('jeevanshilppublic school.xlsx');
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
  
  const report = {
    A_Excel: { totalRows: rawData.length, validRows: 0, invalidRows: 0, duplicateRows: 0, missingFields: 0, duplicates: [] },
    B_JSPS: { studentsToImport: 0, classCounts: {}, sectionCounts: {} },
    C_Enrollments: { toCreate: 0, duplicatesDetected: 0 },
    D_Fees: { classConfigs: {}, newAdmissions: 0, continuing: 0, chargeCount: 0, expectedTotalAmount: 0, examChargeCount: 0, tuitionChargeCount: 0, admissionChargeCount: 0, duplicateChargeIds: 0 }
  };
  
  // Mapping logic
  const classMap = {
    '1st': 'Class 1',
    '2nd': 'Class 2',
    '3rd': 'Class 3',
    '4th': 'Class 4',
    '5th': 'Class 5',
    '6th': 'Class 6',
    '7th': 'Class 7',
    '8th': 'Class 8'
  };

  const seenKeys = new Set();
  const studentsToImport = [];

  rawData.forEach((row, i) => {
    let rawClass = row['CLASS'] || row['Class'] || row['class'];
    const mappedClass = classMap[rawClass] || rawClass;
    const name = row['Student Name']?.trim();
    const fatherName = row['Father Name']?.trim();
    
    if (!name || !mappedClass) {
      report.A_Excel.invalidRows++;
      report.A_Excel.missingFields++;
      return;
    }
    
    const uniqueKey = `${name}_${fatherName}_${mappedClass}`.toLowerCase().replace(/\s+/g, '');
    if (seenKeys.has(uniqueKey)) {
      report.A_Excel.duplicateRows++;
      report.A_Excel.invalidRows++;
      report.A_Excel.duplicates.push(uniqueKey);
      return;
    }
    seenKeys.add(uniqueKey);
    
    report.A_Excel.validRows++;
    report.B_JSPS.classCounts[mappedClass] = (report.B_JSPS.classCounts[mappedClass] || 0) + 1;
    report.B_JSPS.sectionCounts['A'] = (report.B_JSPS.sectionCounts['A'] || 0) + 1; // Assuming default section A since none in excel
    
    studentsToImport.push({
      id: `sim_stu_${i}`,
      name,
      fatherName,
      class: mappedClass,
      isNewAdmission: false // The prompt says: "If the source does not contain reliable admission status, do NOT invent it."
    });
  });

  report.B_JSPS.studentsToImport = studentsToImport.length;
  report.C_Enrollments.toCreate = studentsToImport.length;

  // Simulate Fee Generation
  const { generateChargeSchedule, getJSPSFeeComponents, normalizeClassFeeSettings } = require('./src/utils/feeEngine.js');
  
  const generatedChargeIds = new Set();
  
  studentsToImport.forEach(student => {
    report.D_Fees.continuing++; // Assuming continuing because no indicator
    const rawComponents = getJSPSFeeComponents(student.class, '2026-2027');
    const feeTemplate = normalizeClassFeeSettings({ components: rawComponents }, '2026-2027');
    report.D_Fees.classConfigs[student.class] = feeTemplate.components.filter(c => c.enabled).length + ' active components';
    
    const charges = generateChargeSchedule(student, feeTemplate, '2026-2027');
    
    charges.forEach(charge => {
      if (generatedChargeIds.has(charge.id)) {
        report.D_Fees.duplicateChargeIds++;
      }
      generatedChargeIds.add(charge.id);
      report.D_Fees.chargeCount++;
      report.D_Fees.expectedTotalAmount += charge.originalAmount;
      
      if (charge.componentId === 'exam') report.D_Fees.examChargeCount++;
      if (charge.componentId === 'tuition') report.D_Fees.tuitionChargeCount++;
      if (charge.componentId === 'admission') report.D_Fees.admissionChargeCount++;
    });
  });

  console.log(JSON.stringify(report, null, 2));
}

doDryRun().catch(console.error);
