const xlsx = require('xlsx');
const workbook = xlsx.readFile('Students_Class_Wise_Numeric_2026_27.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log("Sheet names:", workbook.SheetNames);
console.log("Number of records in first sheet:", data.length);
if (data.length > 0) {
  console.log("First record:", JSON.stringify(data[0], null, 2));
}
