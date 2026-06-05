const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

const folder = 'd:/USER/Desktop/KPI_OPERACIONES';
const files = fs.readdirSync(folder).filter(f => f.endsWith('.xlsx'));

files.forEach(f => {
    console.log(`\n=========================================`);
    console.log(`File: ${f}`);
    const filePath = path.join(folder, f);
    try {
        const workbook = xlsx.readFile(filePath);
        console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);
        
        workbook.SheetNames.forEach(sheetName => {
            console.log(`\nSheet: ${sheetName}`);
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0 }); // Read top rows
            if (data.length > 0) {
                // Find first row with actual headers (sometimes there are empty rows at the top)
                let headerRow = data[0];
                for (let i = 0; i < Math.min(5, data.length); i++) {
                    if (data[i] && data[i].length > 0 && data[i].some(c => c)) {
                        headerRow = data[i];
                        break;
                    }
                }
                console.log(`Columns: ${JSON.stringify(headerRow)}`);
            } else {
                console.log('Empty sheet');
            }
        });
    } catch (e) {
        console.error(`Error processing ${f}:`, e.message);
    }
});
