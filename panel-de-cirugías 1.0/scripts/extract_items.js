
import XLSX from 'xlsx';

const filePath = 'c:/Users/ignac/OneDrive/ITEO - Personal/Desarrollos/Coordinación quirofano - capital - internaciones/panel-de-cirugías 1.0/planilla excel de pedidos.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const targetName = 'items de cirugía';
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().trim() === targetName.toLowerCase().trim()) || workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Skip empty rows and find header
    const firstRowIndex = data.findIndex(row => row && row.length > 0);
    if (firstRowIndex === -1) process.exit(1);

    const header = data[firstRowIndex];
    // Find column with "Producto" or "Nombre" or just use column 1
    const productColIndex = header.findIndex(h => typeof h === 'string' && (h.toLowerCase().includes('producto') || h.toLowerCase().includes('item') || h.toLowerCase().includes('nombre')));
    const targetCol = productColIndex !== -1 ? productColIndex : 1;

    const items = data
        .slice(firstRowIndex + 1)
        .map(row => row[targetCol])
        .filter(cell => typeof cell === 'string' && cell.trim() !== '')
        .map(cell => cell.trim());

    console.log(JSON.stringify([...new Set(items)].sort(), null, 2));
} catch (error) {
    process.exit(1);
}
