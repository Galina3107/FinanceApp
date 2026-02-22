// Database Module - IndexedDB wrapper with transparent encryption layer
const DB_NAME = 'FinanceManagerDB';
const DB_VERSION = 3;

const STORES = {
    TRANSACTIONS: 'transactions',
    CATEGORIES: 'categories',
    GOALS: 'goals',
    FUTURE_EXPENSES: 'futureExpenses',
    INCOME: 'income',
    CATEGORY_RULES: 'categoryRules',
    SETTINGS: 'settings'
};

const Database = {
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
                    const transStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
                    transStore.createIndex('date', 'date');
                    transStore.createIndex('category', 'category');
                    transStore.createIndex('month', 'month');
                    transStore.createIndex('year', 'year');
                }

                if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
                    db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains(STORES.GOALS)) {
                    db.createObjectStore(STORES.GOALS, { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains(STORES.FUTURE_EXPENSES)) {
                    db.createObjectStore(STORES.FUTURE_EXPENSES, { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains(STORES.INCOME)) {
                    db.createObjectStore(STORES.INCOME, { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains(STORES.CATEGORY_RULES)) {
                    db.createObjectStore(STORES.CATEGORY_RULES, { keyPath: 'id', autoIncrement: true });
                }

                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }
            };
        });
    },

    // ── Encryption check ──

    _shouldEncrypt(storeName) {
        return typeof Crypto !== 'undefined' && Crypto.isActive() && storeName !== STORES.SETTINGS;
    },

    // ── Raw IndexedDB methods (no encryption, used by Crypto module) ──

    async _rawAdd(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async _rawUpdate(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async _rawGet(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async _rawGetAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async _rawGetByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // ── Public API with transparent encryption ──

    async add(storeName, data) {
        if (this._shouldEncrypt(storeName)) {
            const encrypted = await Crypto.encrypt(data);
            return this._rawAdd(storeName, encrypted);
        }
        return this._rawAdd(storeName, data);
    },

    async update(storeName, data) {
        if (this._shouldEncrypt(storeName)) {
            const id = data.id;
            const encrypted = await Crypto.encrypt(data);
            encrypted.id = id;
            return this._rawUpdate(storeName, encrypted);
        }
        return this._rawUpdate(storeName, data);
    },

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, id) {
        const result = await this._rawGet(storeName, id);
        if (result && this._shouldEncrypt(storeName) && result._enc) {
            const decrypted = await Crypto.decrypt(result);
            decrypted.id = result.id;
            return decrypted;
        }
        return result;
    },

    async getAll(storeName) {
        const results = await this._rawGetAll(storeName);
        if (this._shouldEncrypt(storeName)) {
            const decrypted = [];
            for (const record of results) {
                if (record._enc) {
                    const data = await Crypto.decrypt(record);
                    data.id = record.id;
                    decrypted.push(data);
                } else {
                    decrypted.push(record); // Unencrypted record, pass through
                }
            }
            return decrypted;
        }
        return results;
    },

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getByIndex(storeName, indexName, value) {
        if (this._shouldEncrypt(storeName)) {
            // Indexes don't work with encrypted data; fall back to getAll + filter
            const all = await this.getAll(storeName);
            return all.filter(item => item[indexName] === value);
        }
        return this._rawGetByIndex(storeName, indexName, value);
    },

    // ── Settings helpers (never encrypted) ──

    async getSetting(key) {
        const result = await this._rawGet(STORES.SETTINGS, key);
        return result?.value;
    },

    async setSetting(key, value) {
        return this._rawUpdate(STORES.SETTINGS, { key, value });
    }
};
