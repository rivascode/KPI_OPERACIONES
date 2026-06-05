// Client-side IndexedDB Wrapper for KPI Operaciones
const DB_NAME = 'kpi_operaciones_db';
const DB_VERSION = 1;

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

  // Preload base JSON data if DB is empty
  async seedIfEmpty() {
    const opsCount = await this.count('operaciones');
    if (opsCount > 0) return; // Already seeded

    try {
      const response = await fetch('/KPI_OPERACIONES/kpi_data.json');
      if (!response.ok) throw new Error('Could not fetch default JSON data');
      const data = await response.json();

      console.log('Seeding IndexedDB database from consolidated JSON...');
      await this.insertBatch('operaciones', data.operaciones || []);
      await this.insertBatch('incidencias', (data.incidencias || []).map((inc, i) => ({ ...inc, id: `seed-inc-${i}` })));
      await this.insertBatch('matrices', data.matrices || []);
      await this.insertBatch('vgm', data.vgm || []);
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
