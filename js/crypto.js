// Crypto Module - AES-256-GCM encryption with PBKDF2 key derivation
// All financial data is encrypted at rest. The PIN is the key.

const Crypto = {
    key: null, // AES-GCM key, only held in memory while app is unlocked
    SALT_KEY: 'cryptoSalt',
    ITERATIONS: 100000,

    // ── Helpers ──

    _toBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    _fromBase64(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    // ── Salt Management ──

    async getSalt() {
        let saltB64 = await Database.getSetting(this.SALT_KEY);
        if (!saltB64) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            saltB64 = this._toBase64(salt);
            await Database.setSetting(this.SALT_KEY, saltB64);
        }
        return this._fromBase64(saltB64);
    },

    // ── Key Derivation ──

    async deriveKey(pin) {
        const salt = await this.getSalt();
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(pin),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: this.ITERATIONS, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    // ── Activation ──

    async activate(pin) {
        this.key = await this.deriveKey(pin);
    },

    deactivate() {
        this.key = null;
    },

    isActive() {
        return this.key !== null;
    },

    // ── Encrypt / Decrypt ──

    async encrypt(data) {
        if (!this.key) throw new Error('Crypto not active');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const plaintext = encoder.encode(JSON.stringify(data));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.key,
            plaintext
        );
        return {
            _enc: 1,
            _iv: this._toBase64(iv),
            _ct: this._toBase64(ciphertext)
        };
    },

    async decrypt(record) {
        if (!this.key) throw new Error('Crypto not active');
        if (!record || !record._enc) return record;
        const iv = this._fromBase64(record._iv);
        const ciphertext = this._fromBase64(record._ct);
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            this.key,
            ciphertext
        );
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(plaintext));
    },

    // ── Bulk Operations ──

    async encryptAllData() {
        const dataStores = [
            STORES.TRANSACTIONS, STORES.CATEGORIES, STORES.GOALS,
            STORES.FUTURE_EXPENSES, STORES.INCOME, STORES.CATEGORY_RULES
        ];
        for (const storeName of dataStores) {
            const records = await Database._rawGetAll(storeName);
            for (const record of records) {
                if (!record._enc) {
                    const id = record.id;
                    const encrypted = await this.encrypt(record);
                    encrypted.id = id;
                    await Database._rawUpdate(storeName, encrypted);
                }
            }
        }
    },

    async decryptAllData() {
        const dataStores = [
            STORES.TRANSACTIONS, STORES.CATEGORIES, STORES.GOALS,
            STORES.FUTURE_EXPENSES, STORES.INCOME, STORES.CATEGORY_RULES
        ];
        for (const storeName of dataStores) {
            const records = await Database._rawGetAll(storeName);
            for (const record of records) {
                if (record._enc) {
                    const decrypted = await this.decrypt(record);
                    decrypted.id = record.id;
                    await Database._rawUpdate(storeName, decrypted);
                }
            }
        }
    },

    async reEncryptAll(newPin) {
        // Decrypt all with current key
        await this.decryptAllData();
        // Derive new key
        await this.activate(newPin);
        // Encrypt all with new key
        await this.encryptAllData();
    }
};
