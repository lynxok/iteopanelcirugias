
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../planilla excel de pedidos.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = 'Items de cirugía';

    if (!workbook.SheetNames.includes(sheetName)) {
        console.error(`Sheet "${sheetName}" not found. Available sheets:`, workbook.SheetNames);
        process.exit(1);
    }

    const sheet = workbook.Sheets[sheetName];
    // Get range
    const range = XLSX.utils.decode_range(sheet['!ref']);

    // Read first 10 rows
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0 }).slice(0, 10);

    console.log('--- First 5 rows of "items de cirugía" ---');
    console.log(JSON.stringify(data, null, 2));

} catch (error) {
    console.error('Error reading excel:', error);
}
