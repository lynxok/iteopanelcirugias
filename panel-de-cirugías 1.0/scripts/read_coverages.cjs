const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'coberturas-iteo.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // La cabecera parece ser: CÓDIGO, NOMBRE, TIPO, RAZÓN SOCIAL, CUIT
    // El nombre está en la columna índice 1 (segunda columna)

    console.log('--- START DATA ---');
    const NAMES_INDEX = 1;
    const names = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row && row[NAMES_INDEX]) {
            const name = row[NAMES_INDEX].toString().trim();
            if (name && name !== 'NOMBRE') {
                names.push(name);
            }
        }
    }

    // Eliminar duplicados
    const uniqueNames = [...new Set(names)].sort();

    uniqueNames.forEach(name => {
        console.log(name);
    });
    console.log('--- END DATA ---');
} catch (error) {
    console.error('Error reading excel:', error.message);
}
