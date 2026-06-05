const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

const projectRoot = 'd:/USER/Desktop/KPI_OPERACIONES';
const reportesFolder = path.join(projectRoot, 'reportes');

function cleanKey(k) {
    return k ? k.toString().trim().toUpperCase().replace(/\n/g, ' ') : '';
}

function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString();
    const dObj = new Date(d);
    if (!isNaN(dObj)) return dObj.toISOString();
    return null;
}

// Sede Mapping Logic
function cleanSede(val) {
    if (!val) return 'NO DEFINIDA';
    const raw = val.toString().trim().toUpperCase();
    
    const mapping = {
        'AEREA CALLAO / CALLAO': 'AEREA CALLAO / CALLAO',
        'CALLAO': 'AEREA CALLAO / CALLAO',
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
        'PAITA': 'PAITA',
        'PAITA / PAITA': 'PAITA',
        'SALAVERRY / PAITA': 'PAITA',
        'CHICLAYO / PAITA': 'PAITA',
        'PISCO / PAITA': 'PAITA',
        'CHANCAY / PAITA': 'PAITA',
        'PAITA-DESAGUADERO': 'PAITA',
        'PISCO': 'PISCO',
        'PISCO / PISCO': 'PISCO',
        'MARITIMA CALLAO / PISCO': 'PISCO',
        'TACNA / PISCO': 'PISCO',
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
        'CHIMBOTE': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        'SALAVERRY': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        'CHICLAYO': 'CHIMBOTE-SALAVERRY-CHICLAYO',
        'TACNA': 'TACNA',
        'CHICLAYO / TACNA': 'TACNA',
        'CHICLAYO-TACNA': 'TACNA',
        'PAITA-TACNA': 'TACNA',
        'TACNA-TACNA': 'TACNA',
        'MOLLENDO - MATARANI-TACNA': 'TACNA',
        'AREQUIPA': 'AREQUIPA',
        'MOLLENDO - MATARANI': 'AREQUIPA'
    };
    
    return mapping[raw] || raw;
}

// Luis Esteban Reassignment Map
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

const operaciones = [];
const incidencias = [];
const matrices = [];
const vgm = [];

// Main processor function
async function processAllReports() {
    if (!fs.existsSync(reportesFolder)) {
        console.error(`Error: La carpeta 'reportes' no existe en ${projectRoot}`);
        return;
    }

    const files = fs.readdirSync(reportesFolder).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
    console.log(`Buscando reportes en: ${reportesFolder}`);
    console.log(`Se encontraron ${files.length} archivos para procesar.`);

    files.forEach(filename => {
        const filePath = path.join(reportesFolder, filename);
        try {
            const workbook = xlsx.readFile(filePath, { cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
            let headerIdx = 0;
            for (let i = 0; i < Math.min(5, rawRows.length); i++) {
                if (rawRows[i] && rawRows[i].length > 2 && rawRows[i].some(c => c && typeof c === 'string')) {
                    headerIdx = i;
                    break;
                }
            }

            const rows = xlsx.utils.sheet_to_json(sheet, { range: headerIdx, defval: null });
            if (rows.length === 0) return;

            const rowKeys = Object.keys(rows[0]).map(cleanKey);

            // 1. MATRICES
            if (rowKeys.includes('BOOKING') && rowKeys.includes('STATUS BL')) {
                console.log(`[+] Procesando '${filename}' como CONTROL DE MATRICES`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    if (!getVal('BOOKING')) return;
                    matrices.push({
                        booking: getVal('BOOKING').toString().trim().toUpperCase(),
                        usuario: getVal('USUARIO') ? getVal('USUARIO').toString().trim().toUpperCase() : 'NO DEFINIDO',
                        fecha: parseDate(getVal('M. PREL     FECHA- HORA') || getVal('M. FINAL \nFECHA-HORA') || getVal('FECHA ENVIO DF') || getVal('FECHA INGRESO A PUERTO')),
                        puerto: getVal('PUERTO') ? getVal('PUERTO').toString().trim().toUpperCase() : 'NO DEFINIDO',
                        cliente: getVal('CLIENTE ') ? getVal('CLIENTE ').toString().trim().toUpperCase() : (getVal('CLIENTE') ? getVal('CLIENTE').toString().trim().toUpperCase() : 'NO DEFINIDO'),
                        operador: getVal('OPERADOR') ? getVal('OPERADOR').toString().trim().toUpperCase() : 'NO DEFINIDO'
                    });
                });

            // 2. VGM
            } else if (rowKeys.includes('BOOKING') && (rowKeys.includes('V. PRELIMINAR') || rowKeys.includes('V. FINAL'))) {
                console.log(`[+] Procesando '${filename}' como CONTROL DE VGM`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    if (!getVal('BOOKING')) return;
                    vgm.push({
                        booking: getVal('BOOKING').toString().trim().toUpperCase(),
                        usuario: getVal('USUARIO') ? getVal('USUARIO').toString().trim().toUpperCase() : 'NO DEFINIDO',
                        fecha: parseDate(getVal('V. PREL     FECHA- HORA') || getVal('V. FINAL \nFECHA-HORA')),
                        puerto: getVal('PUERTO') ? getVal('PUERTO').toString().trim().toUpperCase() : 'NO DEFINIDO',
                        cliente: getVal('CLIENTE ') ? getVal('CLIENTE ').toString().trim().toUpperCase() : (getVal('CLIENTE') ? getVal('CLIENTE').toString().trim().toUpperCase() : 'NO DEFINIDO'),
                        operador: getVal('OPERADOR') ? getVal('OPERADOR').toString().trim().toUpperCase() : 'NO DEFINIDO'
                    });
                });

            // 3. DATOS FINALES
            } else if (rowKeys.includes('SECTORISTA') && rowKeys.includes('INGRESO A PUERTO') && rowKeys.includes('ENVIO DATOS FINALES')) {
                console.log(`[+] Procesando '${filename}' como DATOS FINALES`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const rawColab = getVal('SECTORISTA');
                    const rawOp = getVal('OPER');
                    const fechaEnvio = getVal('ENVIO DATOS FINALES');
                    if (!fechaEnvio) return; // Skip if no ENVIO DATOS FINALES date
                    if (!rawColab && !rawOp) return;
                    operaciones.push({
                        origen: 'Datos Finales',
                        fecha: parseDate(fechaEnvio),
                        colaborador: rawColab,
                        operador: rawOp,
                        cliente: getVal('EMBARCADOR'),
                        tipoEmbarque: getVal('TIPO DE EMB.XML') || getVal('TIPO DE EMB.'),
                        sede: getVal('ADUANA'),
                        puerto: getVal('PUERTO'),
                        booking: getVal('BOOKING')
                    });
                });

            // 4. FACTURACION / BOOKING
            } else if (rowKeys.includes('REG / CORRELATIVO') && rowKeys.includes('SECTORISTA') && rowKeys.includes('EMBARCADOR') && rowKeys.includes('BK')) {
                console.log(`[+] Procesando '${filename}' como FACTURACIÓN / BOOKING`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const rawColab = getVal('SECTORISTA');
                    const rawOp = getVal('OPERADOR');
                    if (!rawColab && !rawOp) return;
                    operaciones.push({
                        origen: 'Facturacion',
                        fecha: parseDate(getVal('FECHA DE REG. DEL BK') || getVal('FECHA DE NUMERACION')),
                        colaborador: rawColab,
                        operador: rawOp,
                        cliente: getVal('EMBARCADOR'),
                        tipoEmbarque: getVal('TIPO DE EMBARQUE'),
                        sede: getVal('ADUANA'),
                        puerto: getVal('TERMINAL EMBARQUE'),
                        booking: getVal('BK')
                    });
                });

            // 5. INCIDENCIAS
            } else if (rowKeys.includes('FECHA DE  INCIDENCIA') || rowKeys.includes('FECHA DE INCIDENCIA')) {
                console.log(`[+] Procesando '${filename}' como INCIDENCIAS OPERATIVAS`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const rawOp = getVal('OPERADOR');
                    const rawClient = getVal('EXPORTADOR');
                    if (!rawOp && !rawClient) return;
                    incidencias.push({
                        fecha: parseDate(getVal('FECHA DE INCIDENCIA') || getVal('FECHA DE  INCIDENCIA')),
                        operador: rawOp ? rawOp.toString().trim().toUpperCase() : 'NO DEFINIDO',
                        cliente: rawClient ? rawClient.toString().trim().toUpperCase() : 'NO DEFINIDO',
                        booking: getVal('BOOKING'),
                        observacion: getVal('OBSERVACION DE INCIDENCIA'),
                        estado: getVal('FECHA DE RESOLUCION') ? 'Resuelto' : 'Pendiente'
                    });
                });

            // 6. AEREOS
            } else if (rowKeys.includes('AWB') && rowKeys.includes('FECHA REGISTRO') && rowKeys.includes('SHIPPER')) {
                console.log(`[+] Procesando '${filename}' como REPORTE AÉREO`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const rawColab = getVal('USUARIO') || 'No Definido';
                    const rawOp = getVal('OPERADOR');
                    if (!rawOp && !getVal('SHIPPER')) return;
                    operaciones.push({
                        origen: 'Aereos',
                        fecha: parseDate(getVal('DATOS FINALES')),
                        colaborador: rawColab,
                        operador: rawOp,
                        cliente: getVal('SHIPPER'),
                        tipoEmbarque: 'AÉREO',
                        sede: 'AEREA CALLAO / CALLAO',
                        puerto: getVal('TERMINAL DE EMBARQUE'),
                        booking: getVal('AWB'),
                        estadoKPI: getVal('KPI')
                    });
                });

            // 7. TERRESTRES
            } else if (rowKeys.includes('COORDINADOR') && rowKeys.includes('OPL') && rowKeys.includes('EXPORTADOR')) {
                console.log(`[+] Procesando '${filename}' como REPORTE TERRESTRE`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const rawColab = getVal('COORDINADOR');
                    const rawOp = getVal('OPL') || getVal('TRANSPORTE');
                    if (!rawColab && !getVal('EXPORTADOR')) return;
                    operaciones.push({
                        origen: 'Terrestres',
                        fecha: parseDate(getVal('FECHA REGISTRO')),
                        colaborador: rawColab,
                        operador: rawOp,
                        cliente: getVal('EXPORTADOR'),
                        tipoEmbarque: 'TERRESTRE',
                        sede: getVal('ADUANA'),
                        puerto: 'FRONTERA',
                        booking: getVal('ORDEN')
                    });
                });
            } else {
                console.log(`[-] Archivo omitido (no se reconoció el formato): '${filename}'`);
            }
        } catch (e) {
            console.error(`Error procesando archivo '${filename}':`, e.message);
        }
    });

    // Post-process operaciones (unificación y reasignación de Luis Esteban)
    const cleanedOperaciones = operaciones.map(o => {
        let colab = o.colaborador ? o.colaborador.toString().trim().toUpperCase() : 'NO DEFINIDO';
        const opClean = o.operador ? o.operador.toString().trim().toUpperCase() : '';
        
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
            sede: cleanSede(o.sede),
            puerto: o.puerto ? o.puerto.toString().trim().toUpperCase() : 'NO DEFINIDO',
            booking: o.booking ? o.booking.toString().trim().toUpperCase() : 'NO DEFINIDO',
            estadoKPI: o.estadoKPI ? o.estadoKPI.toString().trim().toUpperCase() : 'NO MEDIDO',
            origen: o.origen
        };
    });

    const consolidated = {
        operaciones: cleanedOperaciones,
        incidencias: incidencias,
        matrices: matrices,
        vgm: vgm
    };

    const targetJsonPath = path.join(projectRoot, 'dashboard', 'public', 'kpi_data.json');
    fs.writeFileSync(targetJsonPath, JSON.stringify(consolidated, null, 2));
    console.log(`\n🎉 Consolidación completada exitosamente!`);
    console.log(`Total operaciones consolidación local: ${cleanedOperaciones.length}`);
    console.log(`Total incidencias consolidación local: ${incidencias.length}`);
    console.log(`Total matrices: ${matrices.length}`);
    console.log(`Total VGM: ${vgm.length}`);
    console.log(`Archivo consolidado guardado en: ${targetJsonPath}`);
}

processAllReports();
