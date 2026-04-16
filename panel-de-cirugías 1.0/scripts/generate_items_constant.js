
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const excelPath = 'c:/Users/ignac/OneDrive/ITEO - Personal/Desarrollos/Coordinación quirofano - capital - internaciones/panel-de-cirugías 1.0/planilla excel de pedidos.xlsx';
const outputPath = 'c:/Users/ignac/OneDrive/ITEO - Personal/Desarrollos/Coordinación quirofano - capital - internaciones/panel-de-cirugías 1.0/constants/surgeryItems.ts';

try {
    const workbook = XLSX.readFile(excelPath);
    const targetName = 'items de cirugía';
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().trim() === targetName.toLowerCase().trim()) || workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const firstRowIndex = data.findIndex(row => row && row.length > 0);
    const header = data[firstRowIndex];
    const productColIndex = header.findIndex(h => typeof h === 'string' && (h.toLowerCase().includes('producto') || h.toLowerCase().includes('item') || h.toLowerCase().includes('nombre')));
    const targetCol = productColIndex !== -1 ? productColIndex : 1;

    const itemsSet = new Set();
    data.slice(firstRowIndex + 1).forEach(row => {
        const cell = row[targetCol];
        if (typeof cell === 'string' && cell.trim() !== '') {
            itemsSet.add(cell.trim().replace(/\s+/g, ' ')); // Normalize spaces
        }
    });

    const sortedItems = [...itemsSet].sort((a, b) => a.localeCompare(b));

    const fileContent = `export const SURGERY_ITEMS = ${JSON.stringify(sortedItems, null, 2)};\n`;

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, fileContent);
    console.log(`Successfully generated ${outputPath}`);
} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
