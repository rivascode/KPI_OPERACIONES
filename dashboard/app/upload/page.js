'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as xlsx from 'xlsx';
import { KPIDatabase } from '../../lib/db';
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function UploadPage() {
  const router = useRouter();
  const [db, setDb] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    document.title = "Importar Reportes - KPI Control";
    const kpiDb = new KPIDatabase();
    kpiDb.init().then(() => {
      setDb(kpiDb);
    });
  }, []);

  // Helper to normalize column names
  const cleanKey = (k) => {
    // Normaliza saltos de línea y espacios múltiples de las cabeceras
    return k ? k.toString().trim().toUpperCase().replace(/\s+/g, ' ') : '';
  };

  const parseDate = (d) => {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString();
    // Fechas en texto formato dd/mm/yyyy hh:mm (formato peruano de los reportes)
    if (typeof d === 'string') {
      const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (m) {
        return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))).toISOString();
      }
    }
    const dObj = new Date(d);
    if (!isNaN(dObj)) return dObj.toISOString();
    return null;
  };

  // Devuelve la primera fecha válida entre varios candidatos (ignora placeholders como '-')
  const firstValidDate = (...vals) => {
    for (const v of vals) {
      const parsed = parseDate(v);
      if (parsed) return parsed;
    }
    return null;
  };

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

  const SEDE_EXCEPCIONES = {
    'PAITA-DESAGUADERO': 'PAITA'
  };

  const cleanSede = (val) => {
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
  };

  // Reassignment mapping for Luis Esteban
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

  const reassignLuisEsteban = (colab, operador) => {
    let cleanColab = colab ? colab.toString().trim().toUpperCase() : 'NO DEFINIDO';
    const cleanOp = operador ? operador.toString().trim().toUpperCase() : '';
    if (cleanColab === 'LUIS ESTEBAN' && luisEstebanReassignmentMap[cleanOp]) {
      return luisEstebanReassignmentMap[cleanOp];
    }
    return cleanColab;
  };

  // Detecta el mes (periodo) al que pertenece un reporte según el nombre del archivo
  const detectPeriodo = (filename) => {
    const p = filename.toLowerCase();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    for (const mes of meses) {
      if (p.includes(mes)) return mes === 'septiembre' ? 'setiembre' : mes;
    }
    return 'junio';
  };

  // Parser para reportes jerárquicos de puerto (Operador logístico -> detalle -> Cantidad)
  const parseHierarchicalReport = (rows, detailKey, periodo) => {
    const parsed = [];
    let currentOperador = 'NO DEFINIDO';
    rows.forEach(r => {
      const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
      const op = getVal('OPERADOR LOGÍSTICO') || getVal('OPERADOR LOGISTICO');
      const detalle = getVal(detailKey);
      const cantidad = getVal('CANTIDAD');
      if (op) {
        currentOperador = op.toString().trim().toUpperCase();
        return; // fila de subtotal del grupo
      }
      if (!detalle || typeof cantidad !== 'number') return;
      parsed.push({
        id: `upload-${Date.now()}-${parsed.length}`,
        operador: currentOperador,
        detalle: detalle.toString().trim().toUpperCase(),
        cantidad,
        periodo
      });
    });
    return parsed;
  };

  // Drag handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Process Excel File in browser
  const handleFile = (file) => {
    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const dataBytes = new Uint8Array(e.target.result);
        const workbook = xlsx.read(dataBytes, { type: 'array', cellDates: true });
        
        // Let's analyze the first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to rows to detect headers
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        let headerIdx = 0;
        
        // Find best row containing columns
        for (let i = 0; i < Math.min(5, rawRows.length); i++) {
          if (rawRows[i] && rawRows[i].length > 2 && rawRows[i].some(c => c && typeof c === 'string')) {
            headerIdx = i;
            break;
          }
        }

        const rows = xlsx.utils.sheet_to_json(sheet, { range: headerIdx, defval: null });
        if (rows.length === 0) {
          throw new Error('El archivo está vacío o no tiene el formato correcto.');
        }

        // Get keys and match report type
        const rowKeys = Object.keys(rows[0]).map(cleanKey);
        
        let reportType = '';
        let processedCount = 0;
        const filenameLower = file.name.toLowerCase();
        const periodo = detectPeriodo(file.name);

        // A. CORRECCIONES POST ZARPE (por nombre: comparte cabeceras con gate out)
        if (filenameLower.includes('correcciones') && filenameLower.includes('zarpe')) {
          reportType = `CORRECCIONES POST ZARPE (${periodo})`;
          const items = parseHierarchicalReport(rows, 'EXPORTADOR', periodo);
          await db.insertBatch('correccionesPostZarpe', items);
          processedCount = items.length;

        // B. TOTAL GATE OUT
        } else if (filenameLower.includes('gate') && filenameLower.includes('out')) {
          reportType = `TOTAL GATE OUT (${periodo})`;
          const items = parseHierarchicalReport(rows, 'EXPORTADOR', periodo);
          await db.insertBatch('gateOut', items);
          processedCount = items.length;

        // C. TOTAL DE CONTENEDORES
        } else if (filenameLower.includes('contenedores')) {
          reportType = `TOTAL DE CONTENEDORES (${periodo})`;
          const items = parseHierarchicalReport(rows, 'TIPO DE CONTENEDOR', periodo);
          await db.insertBatch('totalContenedores', items);
          processedCount = items.length;

        // D. CREDITO APM / MAERSK
        } else if (filenameLower.includes('credito') || (rowKeys.includes('BOOKING') && rowKeys.includes('FECHA DE SOLICITUD'))) {
          reportType = `CRÉDITO APM/MAERSK (${periodo})`;
          const items = [];
          rows.forEach(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            const booking = getVal('BOOKING');
            if (!booking) return;
            let fecha = getVal('FECHA DE SOLICITUD');
            if (typeof fecha === 'string') {
              const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
              fecha = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))).toISOString() : parseDate(fecha);
            } else if (fecha instanceof Date) {
              // Excel interpreta como mm/dd las celdas con día <= 12; el texto
              // original era dd/mm, así que se intercambian mes y día.
              fecha = new Date(Date.UTC(
                fecha.getFullYear(),
                fecha.getDate() - 1,
                fecha.getMonth() + 1,
                fecha.getHours(),
                fecha.getMinutes()
              )).toISOString();
            } else {
              fecha = parseDate(fecha);
            }
            items.push({
              id: `upload-cred-${Date.now()}-${items.length}`,
              booking: booking.toString().trim().toUpperCase(),
              cliente: getVal('CLIENTE') ? getVal('CLIENTE').toString().trim().toUpperCase() : 'NO DEFINIDO',
              fecha,
              periodo
            });
          });
          await db.insertBatch('creditoApm', items);
          processedCount = items.length;

        // 1. MATRICES: Check columns
        } else if (rowKeys.includes('BOOKING') && rowKeys.includes('STATUS BL') && rowKeys.includes('M. PRELIMINAR   ') || rowKeys.includes('M. FINAL ')) {
          reportType = 'CONTROL DE MATRICES';
          const items = rows.filter(r => r[Object.keys(r).find(k => cleanKey(k) === 'BOOKING')]).map(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            return {
              booking: getVal('BOOKING').toString().trim().toUpperCase(),
              usuario: getVal('USUARIO') ? getVal('USUARIO').toString().trim().toUpperCase() : 'NO DEFINIDO',
              fecha: firstValidDate(getVal('M. PREL FECHA- HORA'), getVal('M. FINAL FECHA-HORA'), getVal('FECHA ENVIO DF'), getVal('FECHA INGRESO A PUERTO')),
              puerto: getVal('PUERTO') ? getVal('PUERTO').toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('CLIENTE ') ? getVal('CLIENTE ').toString().trim().toUpperCase() : (getVal('CLIENTE') ? getVal('CLIENTE').toString().trim().toUpperCase() : 'NO DEFINIDO'),
              operador: getVal('OPERADOR') ? getVal('OPERADOR').toString().trim().toUpperCase() : 'NO DEFINIDO'
            };
          });
          await db.insertBatch('matrices', items);
          processedCount = items.length;

        // 2. VGM: Check columns
        } else if (rowKeys.includes('BOOKING') && rowKeys.includes('V. PRELIMINAR   ') || rowKeys.includes('V. FINAL ')) {
          reportType = 'CONTROL DE VGM';
          const items = rows.filter(r => r[Object.keys(r).find(k => cleanKey(k) === 'BOOKING')]).map(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            return {
              booking: getVal('BOOKING').toString().trim().toUpperCase(),
              usuario: getVal('USUARIO') ? getVal('USUARIO').toString().trim().toUpperCase() : 'NO DEFINIDO',
              fecha: firstValidDate(getVal('V. PREL FECHA- HORA'), getVal('V. FINAL FECHA-HORA')),
              puerto: getVal('PUERTO') ? getVal('PUERTO').toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('CLIENTE ') ? getVal('CLIENTE ').toString().trim().toUpperCase() : (getVal('CLIENTE') ? getVal('CLIENTE').toString().trim().toUpperCase() : 'NO DEFINIDO'),
              operador: getVal('OPERADOR') ? getVal('OPERADOR').toString().trim().toUpperCase() : 'NO DEFINIDO'
            };
          });
          await db.insertBatch('vgm', items);
          processedCount = items.length;

        // 3. DATOS FINALES: Check columns
        } else if (rowKeys.includes('SECTORISTA') && rowKeys.includes('INGRESO A PUERTO') && rowKeys.includes('ENVIO DATOS FINALES')) {
          reportType = 'DATOS FINALES';
          const ops = [];
          rows.forEach(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            const rawColab = getVal('SECTORISTA');
            const rawOp = getVal('OPER');
            const fechaEnvio = getVal('ENVIO DATOS FINALES');
            if (!fechaEnvio) return; // Skip if empty
            ops.push({
              id: Math.random().toString(36).substr(2, 9),
              origen: 'Datos Finales',
              fecha: parseDate(fechaEnvio),
              colaborador: reassignLuisEsteban(rawColab, rawOp),
              operador: rawOp ? rawOp.toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('EMBARCADOR') ? getVal('EMBARCADOR').toString().trim().toUpperCase() : 'NO DEFINIDO',
              tipoEmbarque: getVal('TIPO DE EMB.XML') || getVal('TIPO DE EMB.') ? (getVal('TIPO DE EMB.XML') || getVal('TIPO DE EMB.')).toString().trim().toUpperCase() : 'NO DEFINIDO',
              sede: cleanSede(getVal('ADUANA')),
              puerto: getVal('PUERTO') ? getVal('PUERTO').toString().trim().toUpperCase() : 'NO DEFINIDO',
              booking: getVal('BOOKING') ? getVal('BOOKING').toString().trim().toUpperCase() : 'NO DEFINIDO',
              estadoKPI: 'NO MEDIDO'
            });
          });
          await db.insertBatch('operaciones', ops);
          processedCount = ops.length;

        // 4. FACTURACION / BOOKING: Check columns
        } else if (rowKeys.includes('REG / CORRELATIVO') && rowKeys.includes('SECTORISTA') && rowKeys.includes('EMBARCADOR') && rowKeys.includes('BK')) {
          reportType = 'FACTURACIÓN / REPORT BOOKING';
          const ops = [];
          rows.forEach(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            const rawColab = getVal('SECTORISTA');
            const rawOp = getVal('OPERADOR');
            const fechaEnvio = getVal('FECHA ENVIO DF');
            if (!fechaEnvio) return; // Skip if empty
            ops.push({
              id: Math.random().toString(36).substr(2, 9),
              origen: 'Facturacion',
              fecha: parseDate(fechaEnvio),
              colaborador: reassignLuisEsteban(rawColab, rawOp),
              operador: rawOp ? rawOp.toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('EMBARCADOR') ? getVal('EMBARCADOR').toString().trim().toUpperCase() : 'NO DEFINIDO',
              tipoEmbarque: getVal('TIPO DE EMBARQUE') ? getVal('TIPO DE EMBARQUE').toString().trim().toUpperCase() : 'NO DEFINIDO',
              sede: cleanSede(getVal('ADUANA')),
              puerto: getVal('TERMINAL EMBARQUE') ? getVal('TERMINAL EMBARQUE').toString().trim().toUpperCase() : 'NO DEFINIDO',
              booking: getVal('BK') ? getVal('BK').toString().trim().toUpperCase() : 'NO DEFINIDO',
              estadoKPI: 'NO MEDIDO'
            });
          });
          await db.insertBatch('operaciones', ops);
          processedCount = ops.length;

        // 5. INCIDENCIAS: Check columns
        } else if (rowKeys.includes('FECHA DE  INCIDENCIA') || rowKeys.includes('FECHA DE INCIDENCIA')) {
          reportType = 'INCIDENCIAS OPERATIVAS';
          const incs = rows.map((r, idx) => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            return {
              id: `upload-inc-${Date.now()}-${idx}`,
              fecha: parseDate(getVal('FECHA DE INCIDENCIA') || getVal('FECHA DE  INCIDENCIA')),
              operador: getVal('OPERADOR') ? getVal('OPERADOR').toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('EXPORTADOR') ? getVal('EXPORTADOR').toString().trim().toUpperCase() : 'NO DEFINIDO',
              booking: getVal('BOOKING') ? getVal('BOOKING').toString().trim().toUpperCase() : 'NO DEFINIDO',
              observacion: getVal('OBSERVACION DE INCIDENCIA'),
              estado: getVal('FECHA DE RESOLUCION') ? 'Resuelto' : 'Pendiente'
            };
          });
          await db.insertBatch('incidencias', incs);
          processedCount = incs.length;

        // 6. AEREOS: Check columns
        } else if (rowKeys.includes('AWB') && rowKeys.includes('FECHA REGISTRO') && rowKeys.includes('SHIPPER')) {
          reportType = 'REPORTE AÉREO';
          const ops = rows.map(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            const rawColab = getVal('USUARIO') || 'No Definido';
            const rawOp = getVal('OPERADOR');
            return {
              id: Math.random().toString(36).substr(2, 9),
              origen: 'Aereos',
              fecha: parseDate(getVal('DATOS FINALES')),
              colaborador: reassignLuisEsteban(rawColab, rawOp),
              operador: rawOp ? rawOp.toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('SHIPPER') ? getVal('SHIPPER').toString().trim().toUpperCase() : 'NO DEFINIDO',
              tipoEmbarque: 'AÉREO',
              sede: 'CALLAO - CHANCAY',
              puerto: getVal('TERMINAL DE EMBARQUE') ? getVal('TERMINAL DE EMBARQUE').toString().trim().toUpperCase() : 'NO DEFINIDO',
              booking: getVal('AWB') ? getVal('AWB').toString().trim().toUpperCase() : 'NO DEFINIDO',
              estadoKPI: getVal('KPI') ? getVal('KPI').toString().trim().toUpperCase() : 'NO MEDIDO'
            };
          });
          await db.insertBatch('operaciones', ops);
          processedCount = ops.length;

        // 7. TERRESTRES: Check columns
        } else if (rowKeys.includes('COORDINADOR') && rowKeys.includes('OPL') && rowKeys.includes('EXPORTADOR')) {
          reportType = 'REPORTE TERRESTRE';
          const ops = rows.map(r => {
            const getVal = (col) => r[Object.keys(r).find(k => cleanKey(k) === col)];
            const rawColab = getVal('COORDINADOR');
            const rawOp = getVal('OPL') || getVal('TRANSPORTE');
            return {
              id: Math.random().toString(36).substr(2, 9),
              origen: 'Terrestres',
              fecha: parseDate(getVal('FECHA REGISTRO')),
              colaborador: reassignLuisEsteban(rawColab, rawOp),
              operador: rawOp ? rawOp.toString().trim().toUpperCase() : 'NO DEFINIDO',
              cliente: getVal('EXPORTADOR') ? getVal('EXPORTADOR').toString().trim().toUpperCase() : 'NO DEFINIDO',
              tipoEmbarque: 'TERRESTRE',
              sede: cleanSede(getVal('ADUANA')),
              puerto: 'FRONTERA',
              booking: getVal('ORDEN') ? getVal('ORDEN').toString().trim().toUpperCase() : 'NO DEFINIDO',
              estadoKPI: 'NO MEDIDO'
            };
          });
          await db.insertBatch('operaciones', ops);
          processedCount = ops.length;
        } else {
          throw new Error('Las columnas de las cabeceras no coinciden con ninguno de los reportes conocidos.');
        }

        setResults(prev => [
          {
            name: file.name,
            success: true,
            message: `¡Carga exitosa! Detectado como '${reportType}'. Se procesaron ${processedCount} registros de forma incremental.`,
          },
          ...prev,
        ]);
      } catch (err) {
        setResults(prev => [
          {
            name: file.name,
            success: false,
            message: `Error al procesar: ${err.message}`,
          },
          ...prev,
        ]);
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Reset database completely
  const handleReset = async () => {
    if (confirm('¿Estás seguro de que quieres limpiar la base de datos local y volver a cargar el consolidado original?')) {
      setLoading(true);
      try {
        await db.clearStore('operaciones');
        await db.clearStore('incidencias');
        await db.clearStore('matrices');
        await db.clearStore('vgm');
        await db.clearStore('correccionesPostZarpe');
        await db.clearStore('creditoApm');
        await db.clearStore('totalContenedores');
        await db.clearStore('gateOut');
        await db.seedIfEmpty();
        alert('Base de datos restablecida correctamente.');
      } catch (e) {
        alert('Error al reiniciar base de datos.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="dashboard-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="modal-close" onClick={() => router.push('/')} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.6rem' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1>Importar Reportes</h1>
            <p>Sube reportes Excel para guardarlos de forma incremental en la base de datos</p>
          </div>
        </div>
        
        <button 
          onClick={handleReset}
          style={{
            padding: '0.6rem 1.2rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            color: '#ef4444',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <RefreshCw size={14} /> Reiniciar Base de Datos
        </button>
      </header>

      {/* Drag & Drop Area */}
      <div 
        className="filters-panel"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '260px',
          border: dragActive ? '2px dashed var(--accent-blue)' : '2px dashed var(--card-border)',
          background: dragActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--card-bg)',
          borderRadius: '24px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '2rem'
        }}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload-input').click()}
      >
        <input 
          id="file-upload-input"
          type="file" 
          accept=".xlsx, .xls"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '50%', marginBottom: '1rem', border: '1px solid var(--card-border)' }}>
          <Upload size={36} color="var(--accent-blue)" />
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Arrastra tu archivo Excel aquí</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>O haz clic para explorar en tu computadora</p>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
          Formatos soportados: Matrices, VGM, Datos Finales, Facturación, Incidencias, Aéreo, Terrestre, Correcciones Post Zarpe, Crédito APM/Maersk, Total Contenedores, Gate Out
        </span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', margin: '2rem 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Procesando archivo e importando datos...</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="data-table-section">
          <h3>Historial de importaciones</h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((res, index) => (
              <div 
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '1.25rem',
                  background: res.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(244, 63, 94, 0.05)',
                  border: `1px solid ${res.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`,
                  borderRadius: '16px'
                }}
              >
                <div style={{ marginTop: '0.15rem' }}>
                  {res.success 
                    ? <CheckCircle size={18} color="var(--accent-emerald)" />
                    : <AlertTriangle size={18} color="var(--accent-rose)" />
                  }
                </div>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>{res.name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{res.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
