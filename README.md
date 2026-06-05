# KPI Control de Operaciones Logísticas 🚀

Este es un dashboard premium interactivo y dinámico diseñado para consolidar, analizar e importar de forma incremental datos operativos de 8 reportes logísticos diferentes (Matrices, VGM, Envíos Datos Finales, Facturación/Bookings, Incidencias Operativas, Reportes Aéreos y Reportes Terrestres).

La aplicación está completamente desplegada y en funcionamiento en **GitHub Pages**:
🔗 **[https://rivascode.github.io/KPI_OPERACIONES/](https://rivascode.github.io/KPI_OPERACIONES/)**

---

## 🏗️ Arquitectura del Sistema

Para permitir la persistencia y la carga incremental de datos sin incurrir en costos de bases de datos en la nube o servidores backend, la aplicación utiliza una **Arquitectura de Base de Datos Local en el Navegador**:

1. **Next.js Estático**: Configurado para exportación estática (`output: 'export'`) y alojado de forma gratuita y ágil en GitHub Pages.
2. **IndexedDB (`dashboard/lib/db.js`)**: Base de datos local transaccional no relacional en el cliente. Mantiene cuatro almacenes principales:
   - `operaciones`: Embarques consolidados (Datos Finales, Facturación, Aéreo, Terrestre).
   - `incidencias`: Incidencias operativas asociadas a embarques.
   - `matrices`: Control de envío de matrices documentarias.
   - `vgm`: Control de registro de peso VGM (Verified Gross Mass).
3. **Carga e Inicialización Inteligente**:
   - En la primera visita, el sistema detecta que la base de datos local está vacía y se **auto-precarga** con el histórico consolidado inicial (`dashboard/public/kpi_data.json`).
   - El usuario puede importar nuevos reportes Excel en cualquier momento. Los datos se parsean en el cliente, se validan, y se guardan **incrementalmente** sin borrar los datos existentes.

---

## 📈 Lógicas de Negocio Especiales

Durante el procesamiento y la carga de datos (tanto en la precarga como en el módulo `/upload`), el sistema aplica las siguientes reglas de negocio automáticamente:

### 1. Unificación de Sedes
Los nombres de las aduanas/puertos se limpian y mapean a **8 Sedes Maestras**:
- `MARITIMA CALLAO`
- `AEREA CALLAO / CALLAO`
- `PAITA`
- `PISCO`
- `CHANCAY`
- `CHIMBOTE-SALAVERRY-CHICLAYO`
- `TACNA`
- `AREQUIPA`

### 2. Reasignación Automática de "Luis Esteban"
Para evitar la duplicidad de registros bajo perfiles genéricos y reflejar el verdadero colaborador encargado, las operaciones asignadas a **Luis Esteban** se reasignan dinámicamente según el **Operador Logístico** con el que se trabajó:
- `VE SOLUCIONES LOGISTICAS` ➡️ `ANDRES PAUCAR`
- `MAERSK LOGISTICS & SERVICES PERU S.A.` ➡️ `GINA LOPEZ SAENZ`
- `LA HANSEATICA S A` ➡️ `GEORGE AYASTA`
- `UNIMAR LOGISTICA S.A.` ➡️ `GEORGE AYASTA`
- `DLG TRANSPORT S.A.C.` ➡️ `LESLYE MARTINEZ`
- `MODAL TRADE PERU SA` ➡️ `SANDRA SOLANO FLORES`
- `ALEXIM PERU S.R.L.` ➡️ `ADRIANA ZULOAGA`
- `DP WORLD LOGISTICS` ➡️ `ADRIANA ZULOAGA`

---

## 📁 Estructura del Validador de Columnas (Módulo de Carga)

El módulo de importación en `/upload` valida los archivos Excel detectando automáticamente sus columnas cabecera. A continuación, se detallan las columnas críticas requeridas para cada tipo de reporte:

| Reporte / Archivo | Columnas Clave Requeridas para Validación | Datos Extraídos |
| :--- | :--- | :--- |
| **Control de Matrices** | `BOOKING`, `STATUS BL`, `M. PRELIMINAR   ` o `M. FINAL ` | Booking, Usuario, Fecha, Puerto, Cliente, Operador |
| **Control de VGM** | `BOOKING`, `V. PRELIMINAR   ` o `V. FINAL ` | Booking, Usuario, Fecha, Puerto, Cliente, Operador |
| **Envío Datos Finales** | `SECTORISTA`, `INGRESO A PUERTO`, `ENVIO DATOS FINALES`, `OPER`, `TIPO DE EMB.` | Booking, Colaborador, Operador, Cliente, Sede, Puerto, Fecha |
| **Facturación / Bookings** | `REG / CORRELATIVO`, `SECTORISTA`, `EMBARCADOR`, `BK`, `OPERADOR` | Booking, Colaborador, Operador, Cliente, Sede, Puerto, Fecha |
| **Incidencias Operativas**| `FECHA DE INCIDENCIA` o `FECHA DE  INCIDENCIA`, `OPERADOR`, `EXPORTADOR` | Booking, Operador, Exportador, Observación, Estado, Fecha |
| **Reportes Aéreos** | `AWB`, `FECHA REGISTRO`, `SHIPPER`, `OPERADOR` | Booking, Colaborador, Operador, Cliente, Sede, Puerto, Fecha |
| **Reportes Terrestres** | `COORDINADOR`, `OPL`, `EXPORTADOR`, `ORDEN` | Booking, Colaborador, Operador, Cliente, Sede, Puerto, Fecha |

---

## 🛠️ Desarrollo Local y Despliegue

### Requisitos Previos
- Node.js (v18+)
- npm

### 1. Clonar y Configurar Dependencias
```bash
git clone https://github.com/rivascode/KPI_OPERACIONES.git
cd KPI_OPERACIONES/dashboard
npm install
```

### 2. Ejecutar en Modo de Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000/KPI_OPERACIONES`.

### 3. Compilar y Desplegar a GitHub Pages
Para generar la compilación estática y subirla automáticamente a la rama `gh-pages` de tu repositorio:
```bash
npm run build
npm run deploy
```
