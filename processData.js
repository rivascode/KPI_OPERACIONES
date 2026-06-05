const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

const folder = 'd:/USER/Desktop/KPI_OPERACIONES';

function readExcel(filename, sheetIndex = 0) {
    const filePath = path.join(folder, filename);
    if (!fs.existsSync(filePath)) return [];
    try {
        const workbook = xlsx.readFile(filePath, { cellDates: true });
        const sheetName = workbook.SheetNames[sheetIndex];
        const sheet = workbook.Sheets[sheetName];
        
        // Find header row manually since it's sometimes not the first row
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0 });
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            if (data[i] && data[i].length > 2 && data[i].some(c => c && typeof c === 'string' && c.trim().length > 0)) {
                headerRowIdx = i;
                break;
            }
        }
        
        return xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx, defval: null });
    } catch (e) {
        console.error(`Error reading ${filename}:`, e.message);
        return [];
    }
}

const operaciones = [];

function cleanKey(k) {
    return k ? k.toString().trim().toUpperCase().replace(/\n/g, ' ') : '';
}

function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString();
    // try to parse if string
    const dObj = new Date(d);
    if (!isNaN(dObj)) return dObj.toISOString();
    return null;
}

// Helper to clean Sede based on the user's specific mapping (filtering out derived values completely)
function cleanSede(val) {
    if (!val) return 'NO DEFINIDA';
    const raw = val.toString().trim().toUpperCase();
    
    const mapping = {
        // AEREA CALLAO / CALLAO
        'AEREA CALLAO / CALLAO': 'AEREA CALLAO / CALLAO',
        'CALLAO': 'AEREA CALLAO / CALLAO', // Aereos Callao default
        
        // MARITIMA CALLAO
        'MARITIMA CALLAO': 'MARITIMA CALLAO',
        'MARITIMA CALLAO / CALLAO': 'MARITIMA CALLAO',
        'CHIMBOTE / CALLAO': 'MARITIMA CALLAO',
        'SALAVERRY / CALLAO': 'MARITIMA CALLAO',
        'PISCO / CALLAO': 'MARITIMA CALLAO',
        'CHANCAY / CALLAO': 'MARITIMA CALLAO',
        'CHICLAYO / CALLAO': 'MARITIMA CALLAO',
        'MOLLENDO - MATARANI / CALLAO': 'MARITIMA CALLAO',
        'PAITA / CALLAO': 'MARITIMA CALLAO',
        'AREQUIPA / CALLAO': 'MARITIMA CALLAO',
        
        // PAITA
        'PAITA': 'PAITA',
        'PAITA / PAITA': 'PAITA',
        'SALAVERRY / PAITA': 'PAITA',
        'CHICLAYO / PAITA': 'PAITA',
        'PISCO / PAITA': 'PAITA',
        'CHANCAY / PAITA': 'PAITA',
        'PAITA-DESAGUADERO': 'PAITA',
        
        // PISCO
        'PISCO': 'PISCO',
        'PISCO / PISCO': 'PISCO',
        'MARITIMA CALLAO / PISCO': 'PISCO',
        'TACNA / PISCO': 'PISCO',
        
        // CHANCAY
        'CHANCAY': 'CHANCAY',
        'CHANCAY / CHANCAY': 'CHANCAY',
        'CHICLAYO / CHANCAY': 'CHANCAY',
        'MARITIMA CALLAO / CHANCAY': 'CHANCAY',
        'CHIMBOTE / CHANCAY': 'CHANCAY',
        'PISCO / CHANCAY': 'CHANCAY',
        'AEREA CALLAO / CHANCAY': 'CHANCAY',
        'PAITA / CHANCAY': 'CHANCAY',
        'MOLLENDO - MATARANI / CHANCAY': 'CHANCAY',
        'SALAVERRY / CHANCAY': 'CHANCAY',
        
        // CHIMBOTE-SALAVERRY-CHICLAYO
        'CHIMBOTE': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        'SALAVERRY': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        'CHICLAYO': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        
        // TACNA
        'TACNA': 'TACNA',
        'CHICLAYO / TACNA': 'TACNA',
        'CHICLAYO-TACNA': 'TACNA',
        'PAITA-TACNA': 'TACNA',
        'TACNA-TACNA': 'TACNA',
        'MOLLENDO - MATARANI-TACNA': 'TACNA',
        
        // AREQUIPA
        'AREQUIPA': 'AREQUIPA',
        'MOLLENDO - MATARANI': 'AREQUIPA'
    };
    
    return mapping[raw] || raw;
}

// 1. FACTURACION
const facturacion = readExcel('FACTURACION 2026-04-01 00_00_00 al 2026-05-31 23_59_59.xlsx');
facturacion.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['OPERADOR']] && !row[keys['SECTORISTA']]) return;
    
    operaciones.push({
        origen: 'Facturacion',
        fecha: parseDate(row[keys['FECHA DE REG. DEL BK']] || row[keys['FECHA DE NUMERACION']]),
        colaborador: row[keys['SECTORISTA']],
        operador: row[keys['OPERADOR']],
        cliente: row[keys['EMBARCADOR']],
        tipoEmbarque: row[keys['TIPO DE EMBARQUE']],
        sede: row[keys['ADUANA']],
        puerto: row[keys['TERMINAL EMBARQUE']],
        booking: row[keys['BK']],
        estadoKPI: null
    });
});

// 2. DATOS FINALES
const datosFinales = readExcel('ENVIO DATOS FINALES 2026-04-01 al 2026-05-31.xlsx');
datosFinales.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['SECTORISTA']] && !row[keys['OPER']]) return;
    
    operaciones.push({
        origen: 'Datos Finales',
        fecha: parseDate(row[keys['INGRESO A PUERTO']] || row[keys['ENVIO DATOS FINALES']]),
        colaborador: row[keys['SECTORISTA']],
        operador: row[keys['OPER']],
        cliente: row[keys['EMBARCADOR']],
        tipoEmbarque: row[keys['TIPO DE EMB.']],
        sede: row[keys['ADUANA']],
        puerto: row[keys['PUERTO']],
        booking: row[keys['BOOKING']],
        estadoKPI: null
    });
});

// 3. AEREOS (Aereos are Callao aéreo)
const aereos = readExcel('Reporte_Aereos (3).xlsx');
aereos.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['OPERADOR']] && !row[keys['SHIPPER']]) return;
    
    operaciones.push({
        origen: 'Aereos',
        fecha: parseDate(row[keys['FECHA REGISTRO']]),
        colaborador: row[keys['USUARIO']] || 'No Definido',
        operador: row[keys['OPERADOR']],
        cliente: row[keys['SHIPPER']],
        tipoEmbarque: 'AÉREO',
        sede: 'AEREA CALLAO / CALLAO', // Map to master name directly
        puerto: row[keys['TERMINAL DE EMBARQUE']],
        booking: row[keys['AWB']],
        estadoKPI: row[keys['KPI']]
    });
});

// 4. TERRESTRES
const terrestres = readExcel('Reporte_Terrestres.xlsx');
terrestres.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['COORDINADOR']] && !row[keys['EXPORTADOR']]) return;
    
    operaciones.push({
        origen: 'Terrestres',
        fecha: parseDate(row[keys['FECHA REGISTRO']] || row[keys['FECHA']]),
        colaborador: row[keys['COORDINADOR']],
        operador: row[keys['OPL']] || row[keys['TRANSPORTE']],
        cliente: row[keys['EXPORTADOR']],
        tipoEmbarque: 'TERRESTRE',
        sede: row[keys['ADUANA']],
        puerto: 'FRONTERA',
        booking: row[keys['ORDEN']],
        estadoKPI: null
    });
});

// 5. INCIDENCIAS
const incidenciasRaw = readExcel('REPORTE INCIDENCIAS OPERATIVAS 01-04-2026 al 31-05-2026.xlsx');
const incidencias = [];
incidenciasRaw.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['OPERADOR']] && !row[keys['EXPORTADOR']]) return;
    
    incidencias.push({
        fecha: parseDate(row[keys['FECHA DE INCIDENCIA']]),
        operador: row[keys['OPERADOR']],
        cliente: row[keys['EXPORTADOR']],
        booking: row[keys['BOOKING']],
        observacion: row[keys['OBSERVACION DE INCIDENCIA']],
        estado: row[keys['FECHA DE RESOLUCION']] ? 'Resuelto' : 'Pendiente'
    });
});

// 6. MATRICES
const matricesRaw = readExcel('CONTROL DE MATRICES.xlsx', 0);
const matrices = [];
matricesRaw.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['BOOKING']]) return;
    matrices.push({
        booking: row[keys['BOOKING']].toString().trim().toUpperCase(),
        usuario: row[keys['USUARIO']] ? row[keys['USUARIO']].toString().trim().toUpperCase() : 'NO DEFINIDO',
        fecha: parseDate(row[keys['M. PREL FECHA- HORA']] || row[keys['M. FINAL FECHA-HORA']] || row[keys['FECHA ENVIO DF']] || row[keys['FECHA INGRESO A PUERTO']]),
        puerto: row[keys['PUERTO']] ? row[keys['PUERTO']].toString().trim().toUpperCase() : 'NO DEFINIDO',
        cliente: row[keys['CLIENTE ']] ? row[keys['CLIENTE ']].toString().trim().toUpperCase() : (row[keys['CLIENTE']] ? row[keys['CLIENTE']].toString().trim().toUpperCase() : 'NO DEFINIDO'),
        operador: row[keys['OPERADOR']] ? row[keys['OPERADOR']].toString().trim().toUpperCase() : 'NO DEFINIDO'
    });
});

// 7. VGM
const vgmRaw = readExcel('CONTROL DE VGM.xlsx', 0);
const vgm = [];
vgmRaw.forEach(row => {
    const keys = Object.keys(row).reduce((acc, k) => { acc[cleanKey(k)] = k; return acc; }, {});
    if (!row[keys['BOOKING']]) return;
    vgm.push({
        booking: row[keys['BOOKING']].toString().trim().toUpperCase(),
        usuario: row[keys['USUARIO']] ? row[keys['USUARIO']].toString().trim().toUpperCase() : 'NO DEFINIDO',
        fecha: parseDate(row[keys['V. PREL FECHA- HORA']] || row[keys['V. FINAL FECHA-HORA']]),
        puerto: row[keys['PUERTO']] ? row[keys['PUERTO']].toString().trim().toUpperCase() : 'NO DEFINIDO',
        cliente: row[keys['CLIENTE ']] ? row[keys['CLIENTE ']].toString().trim().toUpperCase() : (row[keys['CLIENTE']] ? row[keys['CLIENTE']].toString().trim().toUpperCase() : 'NO DEFINIDO'),
        operador: row[keys['OPERADOR']] ? row[keys['OPERADOR']].toString().trim().toUpperCase() : 'NO DEFINIDO'
    });
});

// Reassignment mapping for Luis Esteban operations
// Map each of Luis Esteban's operators to the primary collaborator who handles that operator in Callao/Pisco
const luisEstebanReassignmentMap = {
    'VE SOLUCIONES LOGISTICAS': 'ANDRES PAUCAR',
    'MAERSK LOGISTICS & SERVICES PERU S.A.': 'GINA LOPEZ SAENZ',
    'LA HANSEATICA S A': 'GEORGE AYASTA',
    'UNIMAR LOGISTICA S.A.': 'GEORGE AYASTA',
    'DLG TRANSPORT S.A.C.': 'LESLYE MARTINEZ',
    'MODAL TRADE PERU SA': 'SANDRA SOLANO FLORES',
    'ALEXIM PERU S.R.L.': 'ADRIANA ZULOAGA',
    'DP WORLD LOGISTICS': 'ADRIANA ZULOAGA'
};

// Post process and clean up data
const cleanedOperaciones = operaciones.map(o => {
    let colab = o.colaborador ? o.colaborador.toString().trim().toUpperCase() : 'NO DEFINIDO';
    const opClean = o.operador ? o.operador.toString().trim().toUpperCase() : '';
    
    // Reassign Luis Esteban's operations to the primary collaborator for that operator
    if (colab === 'LUIS ESTEBAN' && luisEstebanReassignmentMap[opClean]) {
        colab = luisEstebanReassignmentMap[opClean];
    }
    
    return {
        id: Math.random().toString(36).substr(2, 9),
        fecha: o.fecha || new Date('2026-04-01').toISOString(),
        colaborador: colab,
        operador: o.operador ? o.operador.toString().trim().toUpperCase() : 'NO DEFINIDO',
        cliente: o.cliente ? o.cliente.toString().trim().toUpperCase() : 'NO DEFINIDO',
        tipoEmbarque: o.tipoEmbarque ? o.tipoEmbarque.toString().trim().toUpperCase() : 'NO DEFINIDO',
        sede: cleanSede(o.sede), // Clean Sede globally using helper
        puerto: o.puerto ? o.puerto.toString().trim().toUpperCase() : 'NO DEFINIDO',
        booking: o.booking ? o.booking.toString().trim().toUpperCase() : 'NO DEFINIDO',
        estadoKPI: o.estadoKPI ? o.estadoKPI.toString().trim().toUpperCase() : 'NO MEDIDO',
        origen: o.origen
    };
});

const consolidated = {
    operaciones: cleanedOperaciones,
    incidencias: incidencias.map(i => ({
        ...i,
        operador: i.operador ? i.operador.toString().trim().toUpperCase() : 'NO DEFINIDO',
        cliente: i.cliente ? i.cliente.toString().trim().toUpperCase() : 'NO DEFINIDO'
    })),
    matrices: matrices,
    vgm: vgm
};

fs.writeFileSync(path.join(folder, 'dashboard', 'public', 'kpi_data.json'), JSON.stringify(consolidated, null, 2));
console.log('Data successfully processed and saved to dashboard/public/kpi_data.json');
