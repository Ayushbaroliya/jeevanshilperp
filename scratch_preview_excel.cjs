const xlsx = require('xlsx');
const wb = xlsx.readFile('JSIC_2026-27_Firestore_Import_Prepared.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);
console.log(Object.keys(data[0] || {}));
console.log(JSON.stringify(data.slice(0, 3), null, 2));
