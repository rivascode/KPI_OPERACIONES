const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');
const AdmZip = require('adm-zip');

const projectRoot = __dirname;
const reportesFolder = path.join(projectRoot, 'reportes');

// ============================================================
// PERIODO ACTUAL: debe coincidir con CURRENT_PERIOD del dashboard
// (dashboard/app/page.js). Define qué carpeta de reportes/ se
// incluye en el zip descargable "fuente_datos.zip".
// ============================================================
const PERIODO_ACTUAL = 'junio';

function cleanKey(k) {
    // Normaliza saltos de línea y espacios múltiples: las cabeceras de los excels
    // traen cantidades variables de espacios (ej. 'V. PREL     \nFECHA- HORA')
    return k ? k.toString().trim().toUpperCase().replace(/\s+/g, ' ') : '';
}

function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString();
    // Handle "dd/mm/yyyy hh:mm" strings (e.g. reporte de crédito APM/Maersk)
    if (typeof d === 'string') {
        const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (m) {
            const [, day, month, year, hh, mm] = m;
            return new Date(Date.UTC(+year, +month - 1, +day, +(hh || 0), +(mm || 0))).toISOString();
        }
    }
    const dObj = new Date(d);
    if (!isNaN(dObj)) return dObj.toISOString();
    return null;
}

function cleanText(val, fallback = 'NO DEFINIDO') {
    return val ? val.toString().trim().toUpperCase() : fallback;
}

// Devuelve la primera fecha válida entre varios candidatos (ignora placeholders como '-')
function firstValidDate(...vals) {
    for (const v of vals) {
        const parsed = parseDate(v);
        if (parsed) return parsed;
    }
    return null;
}

// Detecta el periodo (mes) al que pertenece un archivo según su ruta o nombre
function detectPeriodo(filePath) {
    const p = filePath.toLowerCase();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    for (const mes of meses) {
        if (p.includes(mes)) return mes === 'septiembre' ? 'setiembre' : mes;
    }
    return null;
}

// Sedes unificadas en 5 grupos:
// CALLAO - CHANCAY | PAITA | PISCO | SALAVERRY | CHIMBOTE / CHICLAYO / AREQUIPA / TACNA
const SEDE_GRUPOS = {
    'CALLAO': 'CALLAO - CHANCAY',
    'AEREA CALLAO': 'CALLAO - CHANCAY',
    'MARITIMA CALLAO': 'CALLAO - CHANCAY',
    'CHANCAY': 'CALLAO - CHANCAY',
    'PAITA': 'PAITA',
    'PISCO': 'PISCO',
    'SALAVERRY': 'SALAVERRY',
    'CHIMBOTE': 'CHIMBOTE / CHICLAYO / AREQUIPA / TACNA',
    'CHICLAYO': 'CHIMBOTE / CHICLAYO / AREQUIPA / TACNA',
    'AREQUIPA': 'CHIMBOTE / CHICLAYO / AREQUIPA / TACNA',
    'MOLLENDO - MATARANI': 'CHIMBOTE / CHICLAYO / AREQUIPA / TACNA',
    'TACNA': 'CHIMBOTE / CHICLAYO / AREQUIPA / TACNA'
};

// Casos que no siguen el patrón origen/destino
const SEDE_EXCEPCIONES = {
    'PAITA-DESAGUADERO': 'PAITA'
};

function cleanSede(val) {
    if (!val) return 'NO DEFINIDA';
    const raw = val.toString().trim().toUpperCase();

    if (SEDE_EXCEPCIONES[raw]) return SEDE_EXCEPCIONES[raw];
    if (SEDE_GRUPOS[raw]) return SEDE_GRUPOS[raw];

    // Formato "ORIGEN / SEDE": la sede efectiva es la parte final
    const porSlash = raw.split('/').map(s => s.trim());
    const finalSlash = porSlash[porSlash.length - 1];
    if (SEDE_GRUPOS[finalSlash]) return SEDE_GRUPOS[finalSlash];

    // Formato "ORIGEN-SEDE" (ej. SALAVERRY-TACNA)
    const porGuion = finalSlash.split('-').map(s => s.trim());
    const finalGuion = porGuion[porGuion.length - 1];
    if (SEDE_GRUPOS[finalGuion]) return SEDE_GRUPOS[finalGuion];

    return raw;
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
const correccionesPostZarpe = [];
const creditoApm = [];
const totalContenedores = [];
const gateOut = [];

// Recorre la carpeta de reportes de forma recursiva (soporta subcarpetas por mes)
function walkReportes(dir) {
    let found = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            found = found.concat(walkReportes(fullPath));
        } else if ((entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls')) && !entry.name.startsWith('~$')) {
            found.push(fullPath);
        }
    });
    return found;
}

// Parser genérico para reportes jerárquicos (Operador logístico -> detalle -> Cantidad)
// Las filas con solo operador+cantidad son subtotales del grupo; las hijas llevan el detalle.
function parseHierarchicalReport(rows, detailKey, periodo) {
    const parsed = [];
    let currentOperador = 'NO DEFINIDO';
    rows.forEach(r => {
        const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
        const operador = getVal('OPERADOR LOGÍSTICO') || getVal('OPERADOR LOGISTICO');
        const detalle = getVal(detailKey);
        const cantidad = getVal('CANTIDAD');
        if (operador) {
            currentOperador = cleanText(operador);
            return; // fila de subtotal del grupo
        }
        if (!detalle || typeof cantidad !== 'number') return;
        parsed.push({
            operador: currentOperador,
            detalle: cleanText(detalle),
            cantidad: cantidad,
            periodo: periodo || 'junio'
        });
    });
    return parsed;
}

// Main processor function
function processAllReports() {
    if (!fs.existsSync(reportesFolder)) {
        console.error(`Error: La carpeta 'reportes' no existe en ${projectRoot}`);
        return;
    }

    const files = walkReportes(reportesFolder);
    console.log(`Buscando reportes en: ${reportesFolder}`);
    console.log(`Se encontraron ${files.length} archivos para procesar.`);

    files.forEach(filePath => {
        const filename = path.basename(filePath);
        const filenameLower = filename.toLowerCase();
        const periodo = detectPeriodo(filePath);
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

            // A. CORRECCIONES POST ZARPE (detección por nombre: comparte cabeceras con gate out)
            if (filenameLower.includes('correcciones') && filenameLower.includes('zarpe')) {
                console.log(`[+] Procesando '${filename}' como CORRECCIONES POST ZARPE (${periodo})`);
                correccionesPostZarpe.push(...parseHierarchicalReport(rows, 'EXPORTADOR', periodo));

            // B. TOTAL GATE OUT
            } else if (filenameLower.includes('gate') && filenameLower.includes('out')) {
                console.log(`[+] Procesando '${filename}' como TOTAL GATE OUT (${periodo})`);
                gateOut.push(...parseHierarchicalReport(rows, 'EXPORTADOR', periodo));

            // C. TOTAL DE CONTENEDORES
            } else if (filenameLower.includes('contenedores')) {
                console.log(`[+] Procesando '${filename}' como TOTAL DE CONTENEDORES (${periodo})`);
                totalContenedores.push(...parseHierarchicalReport(rows, 'TIPO DE CONTENEDOR', periodo));

            // D. CREDITO APM / MAERSK
            } else if (filenameLower.includes('credito') || (rowKeys.includes('BOOKING') && rowKeys.includes('FECHA DE SOLICITUD'))) {
                console.log(`[+] Procesando '${filename}' como CRÉDITO APM/MAERSK (${periodo})`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    const booking = getVal('BOOKING');
                    if (!booking) return;
                    let rawFecha = getVal('FECHA DE SOLICITUD');
                    // Excel convirtió a fecha las celdas con día <= 12 interpretándolas
                    // como mm/dd (locale US); el texto original era dd/mm, así que se
                    // intercambian mes y día para recuperar la fecha real.
                    if (rawFecha instanceof Date) {
                        rawFecha = new Date(Date.UTC(
                            rawFecha.getFullYear(),
                            rawFecha.getDate() - 1,      // mes real = día interpretado
                            rawFecha.getMonth() + 1,     // día real = mes interpretado
                            rawFecha.getHours(),
                            rawFecha.getMinutes()
                        ));
                    }
                    creditoApm.push({
                        booking: cleanText(booking),
                        cliente: cleanText(getVal('CLIENTE')),
                        fecha: parseDate(rawFecha),
                        periodo: periodo || 'junio'
                    });
                });

            // 1. MATRICES
            } else if (rowKeys.includes('BOOKING') && rowKeys.includes('STATUS BL')) {
                console.log(`[+] Procesando '${filename}' como CONTROL DE MATRICES`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    if (!getVal('BOOKING')) return;
                    matrices.push({
                        booking: cleanText(getVal('BOOKING')),
                        usuario: cleanText(getVal('USUARIO')),
                        fecha: firstValidDate(getVal('M. PREL FECHA- HORA'), getVal('M. FINAL FECHA-HORA'), getVal('FECHA ENVIO DF'), getVal('FECHA INGRESO A PUERTO')),
                        puerto: cleanText(getVal('PUERTO')),
                        cliente: cleanText(getVal('CLIENTE ') || getVal('CLIENTE')),
                        operador: cleanText(getVal('OPERADOR'))
                    });
                });

            // 2. VGM
            } else if (rowKeys.includes('BOOKING') && (rowKeys.includes('V. PRELIMINAR') || rowKeys.includes('V. FINAL'))) {
                console.log(`[+] Procesando '${filename}' como CONTROL DE VGM`);
                rows.forEach(r => {
                    const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
                    if (!getVal('BOOKING')) return;
                    vgm.push({
                        booking: cleanText(getVal('BOOKING')),
                        usuario: cleanText(getVal('USUARIO')),
                        fecha: firstValidDate(getVal('V. PREL FECHA- HORA'), getVal('V. FINAL FECHA-HORA')),
                        puerto: cleanText(getVal('PUERTO')),
                        cliente: cleanText(getVal('CLIENTE ') || getVal('CLIENTE')),
                        operador: cleanText(getVal('OPERADOR'))
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
                        operador: cleanText(rawOp),
                        cliente: cleanText(rawClient),
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
        let colab = cleanText(o.colaborador);
        const opClean = o.operador ? o.operador.toString().trim().toUpperCase() : '';

        if (colab === 'LUIS ESTEBAN' && luisEstebanReassignmentMap[opClean]) {
            colab = luisEstebanReassignmentMap[opClean];
        }

        return {
            id: Math.random().toString(36).substr(2, 9),
            fecha: o.fecha || new Date('2026-04-01').toISOString(),
            colaborador: colab,
            operador: cleanText(o.operador),
            cliente: cleanText(o.cliente),
            tipoEmbarque: cleanText(o.tipoEmbarque),
            sede: cleanSede(o.sede),
            puerto: cleanText(o.puerto),
            booking: cleanText(o.booking),
            estadoKPI: cleanText(o.estadoKPI, 'NO MEDIDO'),
            origen: o.origen
        };
    });

    // Deduplicar matrices y VGM por booking (los cortes mensuales pueden traer bookings repetidos)
    const dedupeByBooking = (arr) => {
        const map = new Map();
        arr.forEach(item => map.set(item.booking, item));
        return [...map.values()];
    };

    const consolidated = {
        operaciones: cleanedOperaciones,
        incidencias: incidencias,
        matrices: dedupeByBooking(matrices),
        vgm: dedupeByBooking(vgm),
        correccionesPostZarpe: correccionesPostZarpe,
        creditoApm: creditoApm,
        totalContenedores: totalContenedores,
        gateOut: gateOut
    };

    const targetJsonPath = path.join(projectRoot, 'dashboard', 'public', 'kpi_data.json');
    fs.writeFileSync(targetJsonPath, JSON.stringify(consolidated, null, 2));

    // Version del consolidado: el dashboard la compara para resembrar IndexedDB
    // automáticamente cuando se publica data nueva.
    const versionPath = path.join(projectRoot, 'dashboard', 'public', 'kpi_data_version.json');
    fs.writeFileSync(versionPath, JSON.stringify({ version: new Date().toISOString() }));

    // Comprimido con los reportes fuente DEL PERIODO ACTUAL (el mes que muestra
    // el dashboard), descargable desde el botón "Descargar Fuente de Datos".
    const zipFiles = files.filter(f => {
        const carpeta = path.relative(reportesFolder, f).toLowerCase().split(path.sep)[0];
        return carpeta.includes(PERIODO_ACTUAL);
    });
    const zip = new AdmZip();
    zipFiles.forEach(f => zip.addLocalFile(f));
    const zipPath = path.join(projectRoot, 'dashboard', 'public', 'fuente_datos.zip');
    zip.writeZip(zipPath);
    console.log(`Fuente de datos (${PERIODO_ACTUAL}) comprimida en: ${zipPath} (${zipFiles.length} archivos)`);
    console.log(`\n🎉 Consolidación completada exitosamente!`);
    console.log(`Total operaciones: ${cleanedOperaciones.length}`);
    console.log(`Total incidencias: ${incidencias.length}`);
    console.log(`Total matrices: ${consolidated.matrices.length}`);
    console.log(`Total VGM: ${consolidated.vgm.length}`);
    console.log(`Correcciones post zarpe: ${correccionesPostZarpe.length} filas (${correccionesPostZarpe.reduce((a, b) => a + b.cantidad, 0)} correcciones)`);
    console.log(`Crédito APM/Maersk: ${creditoApm.length} solicitudes`);
    console.log(`Total contenedores: ${totalContenedores.length} filas (${totalContenedores.reduce((a, b) => a + b.cantidad, 0)} contenedores)`);
    console.log(`Total gate out: ${gateOut.length} filas (${gateOut.reduce((a, b) => a + b.cantidad, 0)} gate outs)`);
    console.log(`Archivo consolidado guardado en: ${targetJsonPath}`);
}

processAllReports();
