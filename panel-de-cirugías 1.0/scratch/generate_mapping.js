import pkg from 'xlsx';
import fs from 'fs';
const { readFile, utils } = pkg;

const filePath = 'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\NUN AOTER Y NUN AOTER-OSER.xlsx';

try {
    const workbook = readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = utils.sheet_to_json(worksheet, { header: 1 });
    
    const mapping = {};
    const descriptions = {};

    // Skip header
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const aoterCode = row[0];
        const aoterDesc = row[1];
        const oserCode = row[2];
        const oserDesc = row[3];
        
        const unifiedId = aoterCode || oserCode || `ROW_${i}`;
        const unifiedDesc = aoterDesc || oserDesc || 'Sin descripción';
        
        if (aoterCode) {
            mapping[aoterCode] = unifiedId;
            descriptions[unifiedId] = unifiedDesc;
        }
        if (oserCode) {
            mapping[oserCode] = unifiedId;
            descriptions[unifiedId] = unifiedDesc;
        }
    }
    
    const output = {
        mapping,
        descriptions
    };
    
    fs.writeFileSync('src/data/nomenclador_mapping.json', JSON.stringify(output, null, 2));
    console.log('Mapping generated successfully to src/data/nomenclador_mapping.json');
} catch (error) {
    console.error('Error generating mapping:', error);
}
