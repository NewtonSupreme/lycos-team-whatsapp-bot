const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'CLIENTE (1).xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('Row 0 (potential headers):', data[0]);
console.log('Row 1 (first data row?):', data[1]);
console.log('Row 2:', data[2]);
console.log('Total rows:', data.length);
