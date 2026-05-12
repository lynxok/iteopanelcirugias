import pkg from 'xlsx';
const { readFile, utils } = pkg;

const filePath = 'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\NUN AOTER Y NUN AOTER-OSER.xlsx';

try {
    const workbook = readFile(filePath);
    console.log('Sheets:', workbook.SheetNames);
    
    // Read the first sheet to see the first few rows
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    const data = utils.sheet_to_json(worksheet, { header: 1 }).slice(0, 10);
    console.log('Sample data (first 10 rows):', JSON.stringify(data, null, 2));
} catch (error) {
    console.error('Error reading excel:', error);
}
