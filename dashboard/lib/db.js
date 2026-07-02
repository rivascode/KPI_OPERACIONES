// Client-side IndexedDB Wrapper for KPI Operaciones
const DB_NAME = 'kpi_operaciones_db';
// v2: agrega correccionesPostZarpe, creditoApm, totalContenedores y gateOut,
// y limpia los almacenes previos para resembrar desde el consolidado actualizado.
const DB_VERSION = 2;

const AUTO_STORES = ['correccionesPostZarpe', 'creditoApm', 'totalContenedores', 'gateOut'];

export class KPIDatabase {
  constructor() {
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event);
        reject(event);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;

        // Operaciones store
        if (!db.objectStoreNames.contains('operaciones')) {
          db.createObjectStore('operaciones', { keyPath: 'id' });
        }

        // Incidencias store (Key: booking + fecha + observacion)
        if (!db.objectStoreNames.contains('incidencias')) {
          db.createObjectStore('incidencias', { keyPath: 'id', autoIncrement: true });
        }

        // Matrices store
        if (!db.objectStoreNames.contains('matrices')) {
          db.createObjectStore('matrices', { keyPath: 'booking' });
        }

        // VGM store
        if (!db.objectStoreNames.contains('vgm')) {
          db.createObjectStore('vgm', { keyPath: 'booking' });
        }

        // Nuevos reportes mensuales (junio 2026+)
        AUTO_STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
          }
        });

        // Al migrar desde v1, limpiar los datos sembrados antiguos para que
        // seedIfEmpty recargue el consolidado con los meses nuevos.
        if (event.oldVersion > 0 && event.oldVersion < 2 && tx) {
          ['operaciones', 'incidencias', 'matrices', 'vgm'].forEach(name => {
            try { tx.objectStore(name).clear(); } catch (e) { /* store nuevo, nada que limpiar */ }
          });
        }
      };
    });
  }

  // Generic methods
  getAll(storeName) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  // Preload base JSON data if DB is empty, or re-seed when a new
  // consolidated dataset was published (kpi_data_version.json changed).
  async seedIfEmpty() {
    let remoteVersion = null;
    try {
      const vres = await fetch('/KPI_OPERACIONES/kpi_data_version.json', { cache: 'no-store' });
      if (vres.ok) remoteVersion = (await vres.json()).version || null;
    } catch (e) { /* sin archivo de versión: se conserva el comportamiento clásico */ }

    const localVersion = typeof localStorage !== 'undefined' ? localStorage.getItem('kpi_data_version') : null;
    const opsCount = await this.count('operaciones');
    if (opsCount > 0 && (!remoteVersion || remoteVersion === localVersion)) return; // Already seeded & up to date

    try {
      if (opsCount > 0) {
        console.log('Nueva versión del consolidado detectada, resembrando IndexedDB...');
        for (const store of ['operaciones', 'incidencias', 'matrices', 'vgm', ...AUTO_STORES]) {
          await this.clearStore(store);
        }
      }
      const response = await fetch('/KPI_OPERACIONES/kpi_data.json');
      if (!response.ok) throw new Error('Could not fetch default JSON data');
      const data = await response.json();

      console.log('Seeding IndexedDB database from consolidated JSON...');
      await this.insertBatch('operaciones', data.operaciones || []);
      await this.insertBatch('incidencias', (data.incidencias || []).map((inc, i) => ({ ...inc, id: `seed-inc-${i}` })));
      await this.insertBatch('matrices', data.matrices || []);
      await this.insertBatch('vgm', data.vgm || []);
      for (const store of AUTO_STORES) {
        await this.clearStore(store);
        await this.insertBatch(store, (data[store] || []).map((item, i) => ({ ...item, id: `seed-${store}-${i}` })));
      }
      if (remoteVersion && typeof localStorage !== 'undefined') {
        localStorage.setItem('kpi_data_version', remoteVersion);
      }
      console.log('Seeding successfully completed!');
    } catch (e) {
      console.error('Seeding database failed:', e);
    }
  }

  count(storeName) {
    return new Promise((resolve) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }

  insertBatch(storeName, items) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      if (items.length === 0) return resolve();

      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e);

      items.forEach(item => {
        store.put(item);
      });
    });
  }

  // Add a single item, or replace if exists
  put(storeName, item) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e);
    });
  }

  // Clear a store
  clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    });
  }
}
