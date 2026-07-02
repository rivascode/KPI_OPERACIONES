'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, LabelList
} from 'recharts';
import {
  TrendingUp, AlertCircle, CheckCircle2, Box, Ship, Plane, Truck, X, Eye, FileText, Landmark, FileSpreadsheet,
  Undo2, CreditCard, Container, PackageCheck, Download, Moon, Sun, CalendarDays
} from 'lucide-react';
import { KPIDatabase } from '../lib/db';

// ============================================================
// PERIODO ACTIVO: el dashboard muestra estáticamente este mes.
// Al publicar un mes nuevo: subir los reportes a reportes/<mes>/,
// correr `node processData.js` y actualizar esta constante.
// ============================================================
const CURRENT_PERIOD = { value: 'junio', label: 'Junio 2026', month: 5, year: 2026 };

// Devuelve true si la fecha ISO cae dentro del periodo activo
const matchesMonth = (fechaIso) => {
  if (!fechaIso) return true;
  const d = new Date(fechaIso);
  return d.getUTCMonth() === CURRENT_PERIOD.month && d.getUTCFullYear() === CURRENT_PERIOD.year;
};

// Estilo compartido de tooltips (sigue el tema claro/oscuro)
const TOOLTIP_STYLE = {
  background: 'var(--card-solid)',
  border: '1px solid var(--card-border)',
  borderRadius: '10px',
  color: 'var(--text-main)'
};

// Comparación flexible de nombres (los reportes de puerto abrevian razones sociales)
const looseNameMatch = (a, b) => {
  if (!a || !b) return false;
  const x = a.toString().trim().toUpperCase();
  const y = b.toString().trim().toUpperCase();
  return x === y || x.includes(y) || y.includes(x);
};

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
const SUB_COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
const DRY_REEFER_COLORS = ['#8b5cf6', '#ef4444'];
const MATRICES_VGM_COLORS = ['#06b6d4', '#10b981'];

export default function Dashboard() {
  const [data, setData] = useState({
    operaciones: [], incidencias: [], matrices: [], vgm: [],
    correccionesPostZarpe: [], creditoApm: [], totalContenedores: [], gateOut: []
  });
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('light');

  // Filters (el mes es fijo: CURRENT_PERIOD)
  const [operador, setOperador] = useState('all');
  const [cliente, setCliente] = useState('all');
  const [colaborador, setColaborador] = useState('all');
  const [tipoEmbarque, setTipoEmbarque] = useState('all');
  const [puerto, setPuerto] = useState('all');
  const [sede, setSede] = useState('all');

  // Modal State
  const [activeModal, setActiveModal] = useState(null);
  const [selectedColabForChart, setSelectedColabForChart] = useState('all');

  useEffect(() => {
    // Tema inicial: preferencia guardada del usuario, o la del sistema (que ya aplica el CSS)
    let saved = null;
    try { saved = localStorage.getItem('kpi_theme'); } catch (e) { /* almacenamiento no disponible */ }
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    setTheme(saved || system);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('kpi_theme', next); } catch (e) { /* almacenamiento no disponible */ }
  };

  useEffect(() => {
    document.title = "KPI Control Operaciones";
    const initDb = async () => {
      try {
        const kpiDb = new KPIDatabase();
        await kpiDb.init();
        await kpiDb.seedIfEmpty();
        const operaciones = await kpiDb.getAll('operaciones');
        const incidencias = await kpiDb.getAll('incidencias');
        const matrices = await kpiDb.getAll('matrices');
        const vgm = await kpiDb.getAll('vgm');
        const correccionesPostZarpe = await kpiDb.getAll('correccionesPostZarpe');
        const creditoApm = await kpiDb.getAll('creditoApm');
        const totalContenedores = await kpiDb.getAll('totalContenedores');
        const gateOut = await kpiDb.getAll('gateOut');
        setData({ operaciones, incidencias, matrices, vgm, correccionesPostZarpe, creditoApm, totalContenedores, gateOut });
      } catch (err) {
        console.error('Error loading database, falling back to JSON:', err);
        try {
          const res = await fetch('/KPI_OPERACIONES/kpi_data.json');
          const json = await res.json();
          setData(json);
        } catch (fetchErr) {
          console.error('JSON fallback failed:', fetchErr);
        }
      } finally {
        setLoading(false);
      }
    };
    initDb();
  }, []);

  // Helper to categorize types into main groups
  const getShipmentGroup = (type) => {
    if (!type) return 'OTROS';
    const t = type.toUpperCase();
    if (t.includes('AER') || t.includes('AÉREO')) return 'AÉREO';
    if (t.includes('TER') || t.includes('TERRESTRE')) return 'TERRESTRE';
    if (t === 'NO DEFINIDO') return 'OTROS';
    return 'MARÍTIMO';
  };

  // Main Filtered Operations
  const filteredData = useMemo(() => {
    return (data.operaciones || []).filter(o => {
      const matchOperador = operador === 'all' || o.operador === operador;
      const matchCliente = cliente === 'all' || o.cliente === cliente;
      const matchColaborador = colaborador === 'all' || o.colaborador === colaborador;
      
      const group = getShipmentGroup(o.tipoEmbarque);
      const matchTipo = tipoEmbarque === 'all' || group === tipoEmbarque;
      
      const matchPuerto = puerto === 'all' || o.puerto === puerto;
      const matchSede = sede === 'all' || o.sede === sede;
      const matchDate = matchesMonth(o.fecha);
      return matchOperador && matchCliente && matchColaborador && matchTipo && matchPuerto && matchSede && matchDate;
    });
  }, [data, operador, cliente, colaborador, tipoEmbarque, puerto, sede]);

  // Filtered Matrices (from CONTROL DE MATRICES.xlsx)
  const filteredMatrices = useMemo(() => {
    return (data.matrices || []).filter(m => {
      const matchOperador = operador === 'all' || m.operador === operador;
      const matchCliente = cliente === 'all' || m.cliente === cliente;
      const matchColaborador = colaborador === 'all' || m.usuario === colaborador;
      const matchPuerto = puerto === 'all' || m.puerto === puerto;
      const matchDate = matchesMonth(m.fecha);
      return matchOperador && matchCliente && matchColaborador && matchPuerto && matchDate;
    });
  }, [data, operador, cliente, colaborador, puerto]);

  // Filtered VGM (from CONTROL DE VGM.xlsx)
  const filteredVgm = useMemo(() => {
    return (data.vgm || []).filter(v => {
      const matchOperador = operador === 'all' || v.operador === operador;
      const matchCliente = cliente === 'all' || v.cliente === cliente;
      const matchColaborador = colaborador === 'all' || v.usuario === colaborador;
      const matchPuerto = puerto === 'all' || v.puerto === puerto;
      const matchDate = matchesMonth(v.fecha);
      return matchOperador && matchCliente && matchColaborador && matchPuerto && matchDate;
    });
  }, [data, operador, cliente, colaborador, puerto]);

  // Filtered Incidents
  const filteredIncidents = useMemo(() => {
    return (data.incidencias || []).filter(i => {
      const matchOperador = operador === 'all' || i.operador === operador;
      const matchCliente = cliente === 'all' || i.cliente === cliente;
      const matchDate = matchesMonth(i.fecha);
      return matchOperador && matchCliente && matchDate;
    });
  }, [data, operador, cliente]);

  // --- Reportes mensuales de puerto (Junio 2026+) ---
  // Estos reportes vienen agregados por mes ('periodo'), sin fecha por fila,
  // salvo Crédito APM/Maersk que sí tiene fecha de solicitud.
  const matchesPeriodo = (row) => row.periodo === CURRENT_PERIOD.value;

  // Ordena por volumen del operador (desc) y luego por cantidad (desc)
  const sortHierarchy = (rows) => {
    const totals = {};
    rows.forEach(r => { totals[r.operador] = (totals[r.operador] || 0) + (r.cantidad || 0); });
    return [...rows].sort((a, b) =>
      (totals[b.operador] - totals[a.operador])
      || a.operador.localeCompare(b.operador)
      || (b.cantidad - a.cantidad)
    );
  };

  // Correcciones Post Zarpe (operador -> exportador -> cantidad)
  const filteredCorrecciones = useMemo(() => {
    return sortHierarchy((data.correccionesPostZarpe || []).filter(r =>
      matchesPeriodo(r)
      && (operador === 'all' || looseNameMatch(r.operador, operador))
      && (cliente === 'all' || looseNameMatch(r.detalle, cliente))
    ));
  }, [data, operador, cliente]);

  // Crédito APM / Maersk (solicitudes de crédito por booking)
  const filteredCredito = useMemo(() => {
    return (data.creditoApm || []).filter(r =>
      matchesMonth(r.fecha)
      && (cliente === 'all' || looseNameMatch(r.cliente, cliente))
    ).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [data, cliente]);

  // Total de Contenedores (operador -> tipo de contenedor -> cantidad)
  const filteredContenedores = useMemo(() => {
    return sortHierarchy((data.totalContenedores || []).filter(r =>
      matchesPeriodo(r)
      && (operador === 'all' || looseNameMatch(r.operador, operador))
    ));
  }, [data, operador]);

  // Total Gate Out (operador -> exportador -> cantidad)
  const filteredGateOut = useMemo(() => {
    return sortHierarchy((data.gateOut || []).filter(r =>
      matchesPeriodo(r)
      && (operador === 'all' || looseNameMatch(r.operador, operador))
      && (cliente === 'all' || looseNameMatch(r.detalle, cliente))
    ));
  }, [data, operador, cliente]);

  const sumCantidad = (rows) => rows.reduce((acc, r) => acc + (r.cantidad || 0), 0);
  const totalCorrecciones = useMemo(() => sumCantidad(filteredCorrecciones), [filteredCorrecciones]);
  const totalContenedoresCount = useMemo(() => sumCantidad(filteredContenedores), [filteredContenedores]);
  const totalGateOutCount = useMemo(() => sumCantidad(filteredGateOut), [filteredGateOut]);

  // Filter unique lists
  const filterOptions = useMemo(() => {
    const ops = data.operaciones || [];
    const mat = data.matrices || [];
    const vg = data.vgm || [];
    
    // Count occurrences to sort operators by volume descending
    const opCounts = {};
    const countOp = (op) => {
      if (!op) return;
      opCounts[op] = (opCounts[op] || 0) + 1;
    };
    ops.forEach(o => countOp(o.operador));
    mat.forEach(m => countOp(m.operador));
    vg.forEach(v => countOp(v.operador));

    const sortedOperadores = [...new Set([
      ...ops.map(o => o.operador),
      ...mat.map(m => m.operador),
      ...vg.map(v => v.operador)
    ])].filter(Boolean).sort((a, b) => (opCounts[b] || 0) - (opCounts[a] || 0));
    
    return {
      operadores: sortedOperadores,
      clientes: [...new Set([
        ...ops.map(o => o.cliente),
        ...mat.map(m => m.cliente),
        ...vg.map(v => v.cliente)
      ])].filter(Boolean).sort(),
      colaboradores: [...new Set([
        ...ops.map(o => o.colaborador),
        ...mat.map(m => m.usuario),
        ...vg.map(v => v.usuario)
      ])].filter(Boolean).sort(),
      tipos: ['AÉREO', 'MARÍTIMO', 'TERRESTRE', 'OTROS'],
      puertos: [...new Set([
        ...ops.map(o => o.puerto),
        ...mat.map(m => m.puerto),
        ...vg.map(v => v.puerto)
      ])].filter(Boolean).sort(),
      sedes: [...new Set(ops.map(o => o.sede))].filter(Boolean).sort(),
    };
  }, [data]);

  // Count operations (unique bookings for Maritime, rows for Air/Land)
  const totalOperationsCount = useMemo(() => {
    const maritimoBookings = new Set(filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'MARÍTIMO').map(i => i.booking).filter(b => b && b !== 'NO DEFINIDO')).size;
    const aereoRows = filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'AÉREO').length;
    const terrestreRows = filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'TERRESTRE').length;
    const otrosRows = filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'OTROS').length;
    return maritimoBookings + aereoRows + terrestreRows + otrosRows;
  }, [filteredData]);

  const totalMaritimoContainers = useMemo(() => {
    return filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'MARÍTIMO').length;
  }, [filteredData]);

  const uniqueMaritimoBookings = useMemo(() => {
    return new Set(filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'MARÍTIMO').map(i => i.booking).filter(b => b && b !== 'NO DEFINIDO')).size;
  }, [filteredData]);

  // Detailed Modal Data Categories
  const modalCategories = useMemo(() => {
    return {
      total: {
        title: 'Operaciones Totales',
        description: 'Todas las operaciones registradas que cumplen los filtros actuales.',
        items: filteredData
      },
      aereo: {
        title: 'Operaciones Aéreas',
        description: 'Envíos registrados por vía aérea.',
        items: filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'AÉREO')
      },
      maritimo: {
        title: 'Operaciones Marítimas',
        description: 'Envíos unificados bajo transporte marítimo (DRY, REEFER, INI, LEX, DT, etc.).',
        items: filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'MARÍTIMO')
      },
      terrestre: {
        title: 'Operaciones Terrestres',
        description: 'Envíos registrados por vía terrestre.',
        items: filteredData.filter(d => getShipmentGroup(d.tipoEmbarque) === 'TERRESTRE')
      },
      incidencias: {
        title: 'Incidencias Operativas',
        description: 'Registros de incidencias que han afectado los embarques.',
        isIncidences: true,
        items: filteredIncidents
      },
      finalizados: {
        title: 'Operaciones de Facturación / Datos Finales',
        description: 'Registros listos para cierre operativo o facturación.',
        items: filteredData.filter(d => d.origen === 'Facturacion' || d.origen === 'Datos Finales')
      },
      matrices: {
        title: 'Reporte de Matrices Ingresadas',
        description: 'Detalle de registros del archivo de control de matrices.',
        items: filteredMatrices
      },
      vgm: {
        title: 'Reporte de VGM Ingresados',
        description: 'Detalle de registros del archivo de control de VGM (Verified Gross Mass).',
        items: filteredVgm
      },
      correcciones: {
        title: 'Correcciones Post Zarpe',
        description: 'Correcciones solicitadas después del zarpe de la nave, por operador logístico y exportador.',
        tableType: 'hierarchy',
        detailLabel: 'Exportador',
        items: filteredCorrecciones
      },
      credito: {
        title: 'Crédito APM / Maersk',
        description: 'Solicitudes de crédito registradas ante APM Terminals / Maersk, por booking y cliente.',
        tableType: 'credito',
        items: filteredCredito
      },
      contenedores: {
        title: 'Total de Contenedores',
        description: 'Contenedores movilizados por operador logístico y tipo de contenedor (REEFER, DRY, otros).',
        tableType: 'hierarchy',
        detailLabel: 'Tipo de Contenedor',
        items: filteredContenedores
      },
      gateout: {
        title: 'Total de Gate Out',
        description: 'Salidas de contenedores (Gate Out) por operador logístico y exportador.',
        tableType: 'hierarchy',
        detailLabel: 'Exportador',
        items: filteredGateOut
      }
    };
  }, [filteredData, filteredIncidents, filteredMatrices, filteredVgm, filteredCorrecciones, filteredCredito, filteredContenedores, filteredGateOut]);

  // Chart aggregation: Main Shipment Type (Only Maritimo, Terrestre, Aereo, Otros)
  const mainTypeChartData = useMemo(() => {
    const map = filteredData.reduce((acc, curr) => {
      const g = getShipmentGroup(curr.tipoEmbarque);
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(map).map(k => ({ name: k, value: map[k] }));
  }, [filteredData]);

  // Sub-chart 1: Breakdown of Maritime into INI, LEX, DT
  const maritimeSub1Data = useMemo(() => {
    let iniCount = 0;
    let lexCount = 0;
    let dtCount = 0;
    
    filteredData.forEach(o => {
      const t = (o.tipoEmbarque || '').toUpperCase();
      if (getShipmentGroup(o.tipoEmbarque) === 'MARÍTIMO') {
        if (t.includes('INI')) iniCount++;
        else if (t.includes('LEX')) lexCount++;
        else if (t.includes('DT')) dtCount++;
      }
    });
    
    return [
      { name: 'INI', total: iniCount },
      { name: 'LEX', total: lexCount },
      { name: 'DT', total: dtCount }
    ];
  }, [filteredData]);

  // Sub-chart 2: DRY / DRY HIGH CUBE vs REEFER
  const maritimeSub2Data = useMemo(() => {
    let dryCount = 0;
    let reeferCount = 0;
    
    filteredData.forEach(o => {
      const t = (o.tipoEmbarque || '').toUpperCase();
      if (getShipmentGroup(o.tipoEmbarque) === 'MARÍTIMO') {
        if (t.includes('DRY')) dryCount++;
        else if (t.includes('REEFER')) reeferCount++;
      }
    });
    
    return [
      { name: 'DRY / DRY HC', value: dryCount },
      { name: 'REEFER', value: reeferCount }
    ];
  }, [filteredData]);

  // Matrices & VGM Chart 1: Total Entered comparison
  const matricesVgmTotalsData = useMemo(() => {
    return [
      { name: 'Matrices Ingresadas', total: filteredMatrices.length },
      { name: 'VGM Ingresados', total: filteredVgm.length }
    ];
  }, [filteredMatrices, filteredVgm]);

  // Matrices & VGM Chart 2: Performance by staff (usuario)
  const staffPerformanceData = useMemo(() => {
    const map = {};
    
    filteredMatrices.forEach(m => {
      const user = m.usuario || 'NO DEFINIDO';
      if (!map[user]) map[user] = { name: user, Matrices: 0, VGM: 0 };
      map[user].Matrices++;
    });
    
    filteredVgm.forEach(v => {
      const user = v.usuario || 'NO DEFINIDO';
      if (!map[user]) map[user] = { name: user, Matrices: 0, VGM: 0 };
      map[user].VGM++;
    });
    
    return Object.values(map)
      .sort((a, b) => (b.Matrices + b.VGM) - (a.Matrices + a.VGM))
      .slice(0, 10);
  }, [filteredMatrices, filteredVgm]);

  // Chart aggregation: Timeline (monthly)
  const timelineChartData = useMemo(() => {
    const map = {};
    filteredData.forEach(curr => {
      if (!curr.fecha) return;
      const d = new Date(curr.fecha);
      
      // Calculate week number (todo en UTC para no desplazar fechas por zona horaria)
      const oneJan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const numberOfDays = Math.floor((d - oneJan) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((d.getUTCDay() + 1 + numberOfDays) / 7);
      
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const label = `Sem ${weekNum} (${monthNames[d.getUTCMonth()]})`;
      
      if (!map[weekNum]) {
        map[weekNum] = { weekNum, label, Operaciones: 0 };
      }
      map[weekNum].Operaciones++;
    });
    
    return Object.values(map)
      .sort((a, b) => a.weekNum - b.weekNum)
      .map(item => ({ date: item.label, Operaciones: item.Operaciones }));
  }, [filteredData]);

  // Chart aggregation: Operators (Top 15)
  const operatorChartData = useMemo(() => {
    const map = filteredData.reduce((acc, curr) => {
      const op = curr.operador || 'NO DEFINIDO';
      acc[op] = (acc[op] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(map)
      .map(k => ({ name: k, total: map[k] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredData]);

  // Chart aggregation: Exporters / Clients (Top 15)
  const exporterChartData = useMemo(() => {
    const map = filteredData.reduce((acc, curr) => {
      const exp = curr.cliente || 'NO DEFINIDO';
      acc[exp] = (acc[exp] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(map)
      .map(k => ({ name: k, total: map[k] }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredData]);

  // Chart aggregation: Collaborator stacked by Operator (Top 10 Colabs, Top 5 Operators + Otros)
  const collaboratorChartData = useMemo(() => {
    const colabCounts = {};
    filteredData.forEach(o => {
      const colab = o.colaborador || 'NO DEFINIDO';
      colabCounts[colab] = (colabCounts[colab] || 0) + 1;
    });
    
    const topColabs = Object.keys(colabCounts)
      .sort((a, b) => colabCounts[b] - colabCounts[a])
      .slice(0, 10);
    
    const opCounts = {};
    filteredData.forEach(o => {
      const op = o.operador || 'NO DEFINIDO';
      opCounts[op] = (opCounts[op] || 0) + 1;
    });
    const top5Ops = Object.keys(opCounts)
      .sort((a, b) => opCounts[b] - opCounts[a])
      .slice(0, 5);
      
    const chartData = topColabs.map(colab => {
      const row = { name: colab, OTROS: 0 };
      top5Ops.forEach(op => { row[op] = 0; });
      
      filteredData.forEach(o => {
        if ((o.colaborador || 'NO DEFINIDO') === colab) {
          const op = o.operador || 'NO DEFINIDO';
          if (top5Ops.includes(op)) {
            row[op]++;
          } else {
            row['OTROS']++;
          }
        }
      });
      return row;
    });
    
    return {
      chartData,
      keys: [...top5Ops, 'OTROS']
    };
  }, [filteredData]);

  // Chart aggregation: Detailed Operator counts for selected collaborator (Drill down)
  const colabSubChartData = useMemo(() => {
    if (selectedColabForChart === 'all') return [];
    
    const map = {};
    filteredData.forEach(o => {
      const col = o.colaborador || 'NO DEFINIDO';
      if (col === selectedColabForChart) {
        const op = o.operador || 'NO DEFINIDO';
        map[op] = (map[op] || 0) + 1;
      }
    });
    
    return Object.keys(map)
      .map(k => ({ name: k, total: map[k] }))
      .sort((a, b) => b.total - a.total);
  }, [filteredData, selectedColabForChart]);

  if (loading) {
    return (
      <div className="dashboard-container" style={{display:'flex', justifyContent:'center', alignItems:'center', height:'80vh'}}>
        <div style={{textAlign:'center'}}>
          <img
            className="loading-flag"
            src="/KPI_OPERACIONES/logos/bandera.png"
            alt="Cargando"
          />
          <h2 style={{color:'var(--text-main)', marginBottom:'1rem'}}>Procesando datos logísticos...</h2>
          <p style={{color:'var(--text-muted)'}}>Consolidando métricas de Operaciones</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="header">
        <div className="header-brand">
          <img
            className="brand-logo"
            src={theme === 'dark'
              ? '/KPI_OPERACIONES/logos/chavimochic_blanco.png'
              : '/KPI_OPERACIONES/logos/chavimochic_color.png'}
            alt="Chavimochic Despachos Aduaneros"
          />
          <div>
            <h1>KPI Control Operaciones</h1>
            <p>Visualización interactiva y análisis consolidado de embarques</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="periodo-chip">
            <CalendarDays size={16} /> {CURRENT_PERIOD.label}
          </span>
          <a className="btn-download" href="/KPI_OPERACIONES/fuente_datos.zip" download="fuente_datos.zip">
            <Download size={16} /> Descargar Fuente de Datos
          </a>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Filters Panel */}
      <div className="filters-panel">
        <div className="filter-group">
          <label>Operador</label>
          <select value={operador} onChange={(e) => setOperador(e.target.value)}>
            <option value="all">Todos los Operadores</option>
            {filterOptions.operadores.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Cliente / Exportador</label>
          <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="all">Todos los Clientes</option>
            {filterOptions.clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Colaborador / Coordinador</label>
          <select value={colaborador} onChange={(e) => setColaborador(e.target.value)}>
            <option value="all">Todos los Coordinadores</option>
            {filterOptions.colaboradores.map(colab => <option key={colab} value={colab}>{colab}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>Tipo Embarque</label>
          <select value={tipoEmbarque} onChange={(e) => setTipoEmbarque(e.target.value)}>
            <option value="all">Todos los Tipos</option>
            {filterOptions.tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="filter-group">
          <label>SEDE</label>
          <select value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="all">Todas las Sedes</option>
            {filterOptions.sedes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Section */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => setActiveModal('total')}>
          <div className="kpi-title">
            <Box size={16} color="var(--accent-blue)" />
            <span>Operaciones Totales</span>
          </div>
          <div className="kpi-value">{totalOperationsCount}</div>
          <div className="kpi-subtitle">Ver detalles de envíos ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('matrices')}>
          <div className="kpi-title">
            <FileSpreadsheet size={16} color="var(--accent-blue)" />
            <span>Matrices Ingresadas</span>
          </div>
          <div className="kpi-value" style={{color:'var(--accent-blue)'}}>{modalCategories.matrices.items.length}</div>
          <div className="kpi-subtitle">Ver reporte de matrices ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('vgm')}>
          <div className="kpi-title">
            <CheckCircle2 size={16} color="var(--accent-emerald)" />
            <span>VGM Ingresados</span>
          </div>
          <div className="kpi-value" style={{color:'var(--accent-emerald)'}}>{modalCategories.vgm.items.length}</div>
          <div className="kpi-subtitle">Ver reporte de VGM ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('maritimo')}>
          <div className="kpi-title">
            <Ship size={16} color="var(--accent-blue)" />
            <span>Envíos Marítimos (Unificados)</span>
          </div>
          <div className="kpi-value">{modalCategories.maritimo.items.length}</div>
          <div className="kpi-subtitle">Ver detalle marítimo ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('aereo')}>
          <div className="kpi-title">
            <Plane size={16} color="var(--accent-purple)" />
            <span>Envíos Aéreos</span>
          </div>
          <div className="kpi-value">{modalCategories.aereo.items.length}</div>
          <div className="kpi-subtitle">Ver detalle aéreo ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('terrestre')}>
          <div className="kpi-title">
            <Truck size={16} color="var(--accent-amber)" />
            <span>Envíos Terrestres</span>
          </div>
          <div className="kpi-value">{modalCategories.terrestre.items.length}</div>
          <div className="kpi-subtitle">Ver detalle terrestre ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('incidencias')}>
          <div className="kpi-title">
            <AlertCircle size={16} color="var(--accent-rose)" />
            <span>Incidencias Operativas</span>
          </div>
          <div className="kpi-value" style={{color: 'var(--accent-rose)'}}>{modalCategories.incidencias.items.length}</div>
          <div className="kpi-subtitle">Ver incidencias ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('finalizados')}>
          <div className="kpi-title">
            <Landmark size={16} color="var(--accent-blue)" />
            <span>Facturación / D. Finales</span>
          </div>
          <div className="kpi-value">{modalCategories.finalizados.items.length}</div>
          <div className="kpi-subtitle">Cierres y reportes ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('correcciones')}>
          <div className="kpi-title">
            <Undo2 size={16} color="var(--accent-rose)" />
            <span>Correcciones Post Zarpe</span>
          </div>
          <div className="kpi-value" style={{color:'var(--accent-rose)'}}>{totalCorrecciones}</div>
          <div className="kpi-subtitle">Ver detalle por exportador ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('credito')}>
          <div className="kpi-title">
            <CreditCard size={16} color="var(--accent-purple)" />
            <span>Crédito APM / Maersk</span>
          </div>
          <div className="kpi-value" style={{color:'var(--accent-purple)'}}>{filteredCredito.length}</div>
          <div className="kpi-subtitle">Ver solicitudes de crédito ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('contenedores')}>
          <div className="kpi-title">
            <Container size={16} color="var(--accent-blue)" />
            <span>Total de Contenedores</span>
          </div>
          <div className="kpi-value">{totalContenedoresCount}</div>
          <div className="kpi-subtitle">Ver detalle por tipo ↗</div>
        </div>

        <div className="kpi-card" onClick={() => setActiveModal('gateout')}>
          <div className="kpi-title">
            <PackageCheck size={16} color="var(--accent-emerald)" />
            <span>Total de Gate Out</span>
          </div>
          <div className="kpi-value" style={{color:'var(--accent-emerald)'}}>{totalGateOutCount}</div>
          <div className="kpi-subtitle">Ver detalle de salidas ↗</div>
        </div>
      </div>

      {/* Separate control charts for Matrices and VGM */}
      <div className="section-divider">
        <h2>Control de Matrices & VGM</h2>
        <p>Análisis del ingreso y desempeño del personal de control de matrices y VGM</p>
      </div>

      <div className="charts-row-2">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Ingresos Totales (Matrices vs VGM)</h3>
            <span>Cantidad de documentos ingresados</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={matricesVgmTotalsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="total" fill="var(--accent-emerald)" radius={[8, 8, 0, 0]} barSize={50}>
                  {matricesVgmTotalsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={MATRICES_VGM_COLORS[index % MATRICES_VGM_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Ingresos Realizados por Personal</h3>
            <span>Desempeño de Matrices y VGM por usuario</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={staffPerformanceData} 
                layout="vertical"
                margin={{ top: 10, right: 10, left: 30, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={true} horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  width={180}
                  tickFormatter={(val) => val.length > 28 ? `${val.substring(0, 25)}...` : val}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Legend verticalAlign="top" height={36} iconSize={10} iconType="circle" wrapperStyle={{fontSize: 12, marginBottom: '10px'}} />
                <Bar dataKey="Matrices" fill="#06b6d4" stackId="a" radius={[0, 0, 0, 0]} barSize={16} />
                <Bar dataKey="VGM" fill="#10b981" stackId="a" radius={[0, 8, 8, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="section-divider">
        <h2>Distribución y Tendencia de Operaciones</h2>
        <p>Métricas consolidadas de transportes, operadores logísticos y volumen</p>
      </div>

      {/* Row 1: 4 cards for core distributions */}
      <div className="charts-row-4">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Evolución de Embarques</h3>
            <span>Histórico Mensual</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="Operaciones" fill="var(--accent-blue)" radius={[6, 6, 0, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Por Tipo de Embarque</h3>
            <span>Marítimo / Aéreo / Terrestre</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mainTypeChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="value" name="Operaciones" radius={[6, 6, 0, 0]} barSize={40}>
                  <LabelList dataKey="value" position="top" fill="var(--text-main)" fontSize={11} style={{ fontWeight: 600 }} />
                  {mainTypeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Marítimo: INI vs LEX vs DT</h3>
            <span>Tipos especiales</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maritimeSub1Data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="total" fill="var(--accent-blue)" radius={[6, 6, 0, 0]} barSize={25}>
                  {maritimeSub1Data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SUB_COLORS[index % SUB_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <h3>Marítimo: DRY Vs REEFER</h3>
            <span>Contenedores</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={maritimeSub2Data}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {maritimeSub2Data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DRY_REEFER_COLORS[index % DRY_REEFER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{fontSize: 11, color: 'var(--text-muted)'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Top 15 rankings side-by-side with clear horizontal value labels */}
      <div className="charts-row-2">
        <div className="chart-card tall">
          <div className="chart-header">
            <h3>Top 15 Operadores Logísticos</h3>
            <span>Volumen por Operador</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={operatorChartData} 
                layout="vertical" 
                margin={{ top: 10, right: 40, left: 30, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={true} horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} hide={true} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="var(--text-muted)" 
                  fontSize={10}
                  width={180}
                  tickFormatter={(val) => val.length > 28 ? `${val.substring(0, 25)}...` : val} 
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="total" fill="var(--accent-purple)" radius={[0, 6, 6, 0]} barSize={16}>
                  <LabelList dataKey="total" position="right" fill="var(--text-main)" fontSize={10} style={{ fontWeight: 600 }} />
                  {operatorChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card tall">
          <div className="chart-header">
            <h3>Top 15 Exportadores / Clientes</h3>
            <span>Volumen por Exportador</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={exporterChartData} 
                layout="vertical" 
                margin={{ top: 10, right: 40, left: 30, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={true} horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} hide={true} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="var(--text-muted)" 
                  fontSize={10}
                  width={180}
                  tickFormatter={(val) => val.length > 28 ? `${val.substring(0, 25)}...` : val} 
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="total" fill="var(--accent-emerald)" radius={[0, 6, 6, 0]} barSize={16}>
                  <LabelList dataKey="total" position="right" fill="var(--text-main)" fontSize={10} style={{ fontWeight: 600 }} />
                  {exporterChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Movimiento por colaborador y operador */}
      <div className="data-table-section" style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3>Movimiento por Colaborador y Operador</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {selectedColabForChart === 'all' 
                ? 'Volumen de operaciones por colaborador (Coordinador) y su distribución por Operador Logístico'
                : `Operadores logísticos con los que trabajó ${selectedColabForChart} (total de ${colabSubChartData.reduce((a, b) => a + b.total, 0)} operaciones)`
              }
            </p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desglosar Colaborador:</span>
            <select
              className="select-control"
              value={selectedColabForChart}
              onChange={(e) => setSelectedColabForChart(e.target.value)}
            >
              <option value="all">Ver Todos (Vista General)</option>
              {filterOptions.colaboradores.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ width: '100%', height: 400 }}>
          {selectedColabForChart === 'all' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collaboratorChartData.chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tick={{ fill: 'var(--text-muted)' }} />
                <YAxis stroke="var(--text-muted)" fontSize={10} tick={{ fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Legend verticalAlign="top" height={36} iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '10px' }} />
                {collaboratorChartData.keys.map((key, index) => (
                  <Bar key={key} dataKey={key} stackId="a" fill={COLORS[index % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={colabSubChartData} 
                layout="vertical"
                margin={{ top: 10, right: 45, left: 30, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={true} horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={11} hide={true} />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="var(--text-muted)" 
                  fontSize={10}
                  width={180}
                  tickFormatter={(val) => val.length > 28 ? `${val.substring(0, 25)}...` : val} 
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--hover-row)' }} />
                <Bar dataKey="total" fill="var(--accent-blue)" radius={[0, 6, 6, 0]} barSize={16}>
                  <LabelList dataKey="total" position="right" fill="var(--text-main)" fontSize={10} style={{ fontWeight: 600 }} />
                  {colabSubChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Dynamic Detail Modal */}
      {activeModal && modalCategories[activeModal] && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{modalCategories[activeModal].title}</h2>
                <p style={{fontSize:'0.85rem', color:'var(--text-muted)', marginTop:'0.25rem'}}>
                  {modalCategories[activeModal].description}
                </p>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="table-wrapper" style={{maxHeight:'50vh', overflowY:'auto'}}>
                {modalCategories[activeModal].isIncidences ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha Incidencia</th>
                        <th>Booking / Referencia</th>
                        <th>Operador</th>
                        <th>Cliente / Exportador</th>
                        <th>Observación de Incidencia</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalCategories[activeModal].items.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.fecha ? new Date(row.fecha).toLocaleDateString() : 'N/D'}</td>
                          <td style={{fontFamily:'monospace', color:'var(--accent-rose)'}}>{row.booking || 'N/D'}</td>
                          <td>{row.operador}</td>
                          <td>{row.cliente}</td>
                          <td style={{color:'var(--text-main)'}}>{row.observacion || 'N/D'}</td>
                          <td>
                            <span className={`badge ${row.estado === 'Resuelto' ? 'badge-emerald' : 'badge-rose'}`} style={{background: row.estado === 'Resuelto' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: row.estado === 'Resuelto' ? '#34d399' : '#fb7185'}}>
                              {row.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {modalCategories[activeModal].items.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay incidencias que mostrar para la selección actual.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : modalCategories[activeModal].tableType === 'hierarchy' ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Operador Logístico</th>
                        <th>{modalCategories[activeModal].detailLabel}</th>
                        <th style={{textAlign:'right'}}>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalCategories[activeModal].items.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{fontWeight:600}}>{row.operador}</td>
                          <td>{row.detalle}</td>
                          <td style={{textAlign:'right', fontWeight:600, color:'var(--accent-blue)'}}>{row.cantidad}</td>
                        </tr>
                      ))}
                      {modalCategories[activeModal].items.length > 0 && (
                        <tr style={{borderTop:'2px solid var(--card-border)'}}>
                          <td style={{fontWeight:700}}>TOTAL</td>
                          <td></td>
                          <td style={{textAlign:'right', fontWeight:700, color:'var(--accent-blue)'}}>
                            {modalCategories[activeModal].items.reduce((a, r) => a + (r.cantidad || 0), 0)}
                          </td>
                        </tr>
                      )}
                      {modalCategories[activeModal].items.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay registros para la selección actual.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : modalCategories[activeModal].tableType === 'credito' ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Booking</th>
                        <th>Cliente</th>
                        <th>Fecha de Solicitud</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalCategories[activeModal].items.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{color:'var(--text-muted)'}}>{idx + 1}</td>
                          <td style={{fontFamily:'monospace', color:'var(--accent-purple)'}}>{row.booking}</td>
                          <td>{row.cliente}</td>
                          <td>{row.fecha ? new Date(row.fecha).toLocaleString('es-PE', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : 'N/D'}</td>
                        </tr>
                      ))}
                      {modalCategories[activeModal].items.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay solicitudes para la selección actual.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (activeModal === 'matrices' || activeModal === 'vgm') ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha Ingreso</th>
                        <th>Booking / Referencia</th>
                        <th>Operador</th>
                        <th>Cliente / Shipper</th>
                        <th>Usuario (Personal)</th>
                        <th>Puerto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalCategories[activeModal].items.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.fecha ? new Date(row.fecha).toLocaleDateString() : 'N/D'}</td>
                          <td style={{fontFamily:'monospace', color:'var(--accent-blue)'}}>{row.booking}</td>
                          <td>{row.operador}</td>
                          <td>{row.cliente}</td>
                          <td style={{fontWeight:600}}>{row.usuario}</td>
                          <td>{row.puerto}</td>
                        </tr>
                      ))}
                      {modalCategories[activeModal].items.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay registros para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Operador</th>
                        <th>Cliente / Shipper</th>
                        <th>Colaborador</th>
                        <th>Booking / Referencia</th>
                        <th>Original</th>
                        <th>Unificado</th>
                        <th>Sede</th>
                        <th>Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalCategories[activeModal].items.map((row) => (
                        <tr key={row.id}>
                          <td>{row.fecha ? new Date(row.fecha).toLocaleDateString() : 'N/D'}</td>
                          <td style={{fontWeight:600}}>{row.operador}</td>
                          <td>{row.cliente}</td>
                          <td>{row.colaborador}</td>
                          <td style={{fontFamily:'monospace', color:'var(--accent-blue)'}}>{row.booking}</td>
                          <td style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>{row.tipoEmbarque}</td>
                          <td>
                            <span className={`badge ${
                              getShipmentGroup(row.tipoEmbarque) === 'AÉREO' ? 'badge-purple' : 
                              getShipmentGroup(row.tipoEmbarque) === 'MARÍTIMO' ? 'badge-blue' : 'badge-amber'
                            }`}>
                              {getShipmentGroup(row.tipoEmbarque)}
                            </span>
                          </td>
                          <td>{row.sede}</td>
                          <td style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>{row.origen}</td>
                        </tr>
                      ))}
                      {modalCategories[activeModal].items.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{textAlign:'center', color:'var(--text-muted)'}}>No hay registros para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
