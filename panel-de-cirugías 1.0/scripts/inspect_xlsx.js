import XLSX from 'xlsx';
import path from 'path';

const files = [
    'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\Nomenclador AOTER.xlsx',
    'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\Nomencaldor OSER.xlsx'
];

files.forEach(file => {
    console.log(`\n--- Inspecting file: ${path.basename(file)} ---`);
    try {
        const workbook = XLSX.readFile(file);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('Headers:', data[0]);
        console.log('First 5 rows:');
        data.slice(1, 6).forEach((row, idx) => console.log(`${idx + 1}:`, row));
    } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
    }
});
