// Security Module - PIN lock, auto-lock, screen blur, encryption integration

const Security = {
    isLocked: false,
    inactivityTimer: null,
    _unlockResolver: null,
    failedAttempts: 0,
    lockoutUntil: 0,

    PIN_HASH_KEY: 'pinHash',
    AUTO_LOCK_KEY: 'autoLockMinutes',
    SECURITY_ENABLED_KEY: 'securityEnabled',

    // ── Boot-time lock check (called before modules init) ──

    async checkLock() {
        const enabled = await Database.getSetting(this.SECURITY_ENABLED_KEY);
        if (enabled) {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.dataset.enabled = 'true';
            this.showLock();
            this.setupPinInputs();
            this.setupForgotPin();
            await this.waitForUnlock();
        }
    },

    waitForUnlock() {
        return new Promise(resolve => {
            this._unlockResolver = resolve;
        });
    },

    // ── Post-unlock init (auto-lock, blur, timers) ──

    async initPostUnlock() {
        await this.setupAutoLock();

        // Blur app when switching tabs/apps (hides financial data in app switcher)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isSecurityEnabled()) {
                this.blurApp();
            } else if (!document.hidden) {
                this.unblurApp();
            }
        });

        // Reset inactivity timer on user interaction
        ['click', 'touchstart', 'keydown', 'scroll'].forEach(event => {
            document.addEventListener(event, () => this.resetInactivityTimer(), { passive: true });
        });
    },

    // ── Utilities ──

    isSecurityEnabled() {
        const lockScreen = document.getElementById('lock-screen');
        return lockScreen && lockScreen.dataset.enabled === 'true';
    },

    async setupAutoLock() {
        const minutes = await Database.getSetting(this.AUTO_LOCK_KEY);
        if (minutes && minutes > 0) {
            this.startInactivityTimer(minutes);
        }
    },

    startInactivityTimer(minutes) {
        this.clearInactivityTimer();
        if (!minutes || minutes <= 0) return;
        this.inactivityTimer = setTimeout(() => {
            if (this.isSecurityEnabled() && !this.isLocked) {
                this.lock();
            }
        }, minutes * 60 * 1000);
    },

    clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    },

    resetInactivityTimer() {
        if (this.isSecurityEnabled() && !this.isLocked) {
            Database.getSetting(this.AUTO_LOCK_KEY).then(minutes => {
                if (minutes && minutes > 0) {
                    this.startInactivityTimer(minutes);
                }
            });
        }
    },

    // ── PIN hashing ──

    async hashPin(pin) {
        // Use the same random salt from crypto module for PIN hashing
        const salt = await AppCrypto.getSalt();
        const encoder = new TextEncoder();
        const pinBytes = encoder.encode(pin);
        // Combine salt + pin for strong hashing
        const combined = new Uint8Array(salt.length + pinBytes.length);
        combined.set(salt);
        combined.set(pinBytes, salt.length);
        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async verifyPin(pin) {
        const storedHash = await Database.getSetting(this.PIN_HASH_KEY);
        if (!storedHash) return false;
        const inputHash = await this.hashPin(pin);
        return inputHash === storedHash;
    },

    // ── Set / Remove PIN (with data encryption) ──

    async setPin(pin) {
        const hash = await this.hashPin(pin);
        await Database.setSetting(this.PIN_HASH_KEY, hash);
        await Database.setSetting(this.SECURITY_ENABLED_KEY, true);

        // Derive encryption key and encrypt all existing data
        await AppCrypto.activate(pin);
        await AppCrypto.encryptAllData();

        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.dataset.enabled = 'true';
    },

    async removePin() {
        // Decrypt all data first (crypto must be active)
        await AppCrypto.decryptAllData();
        AppCrypto.deactivate();

        await Database.setSetting(this.PIN_HASH_KEY, null);
        await Database.setSetting(this.SECURITY_ENABLED_KEY, false);
        await Database.setSetting(this.AUTO_LOCK_KEY, 0);
        await Database.setSetting(AppCrypto.SALT_KEY, null);

        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.dataset.enabled = 'false';
        this.clearInactivityTimer();
    },

    // ── Lock / Unlock ──

    showLock() {
        this.isLocked = true;
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) {
            lockScreen.classList.add('visible');
            this.clearPinInput();
            // Hide forgot-pin confirm section
            const forgotConfirm = document.getElementById('forgot-pin-confirm');
            const forgotBtn = document.getElementById('forgot-pin-btn');
            if (forgotConfirm) forgotConfirm.style.display = 'none';
            if (forgotBtn) forgotBtn.style.display = '';
            setTimeout(() => {
                const firstInput = lockScreen.querySelector('.pin-digit');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    },

    lock() {
        AppCrypto.deactivate(); // Clear encryption key from memory
        this.showLock();
    },

    unlock() {
        this.isLocked = false;
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) {
            lockScreen.classList.remove('visible');
        }
        this.unblurApp();
        this.resetInactivityTimer();

        // Resolve the waitForUnlock promise (first boot)
        if (this._unlockResolver) {
            this._unlockResolver();
            this._unlockResolver = null;
        }
    },

    blurApp() {
        document.body.classList.add('app-blurred');
    },

    unblurApp() {
        if (!this.isLocked) {
            document.body.classList.remove('app-blurred');
        }
    },

    // ── PIN input handling (lock screen) ──

    clearPinInput() {
        const digits = document.querySelectorAll('.pin-digit');
        digits.forEach(d => { d.value = ''; });
        const error = document.getElementById('pin-error');
        if (error) error.style.display = 'none';
    },

    setupPinInputs() {
        const digits = document.querySelectorAll('.pin-digit');
        digits.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                if (e.target.value && index < digits.length - 1) {
                    digits[index + 1].focus();
                }
                const pin = Array.from(digits).map(d => d.value).join('');
                if (pin.length === digits.length) {
                    this.attemptUnlock(pin);
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    digits[index - 1].focus();
                    digits[index - 1].value = '';
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = (e.clipboardData || window.clipboardData).getData('text');
                const numbers = pastedData.replace(/[^0-9]/g, '').slice(0, digits.length);
                numbers.split('').forEach((num, i) => {
                    if (digits[i]) digits[i].value = num;
                });
                if (numbers.length === digits.length) {
                    this.attemptUnlock(numbers);
                }
            });
        });
    },

    async attemptUnlock(pin) {
        // Check lockout
        if (Date.now() < this.lockoutUntil) {
            const seconds = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
            const error = document.getElementById('pin-error');
            if (error) {
                error.textContent = `${t('tooManyAttempts')} ${seconds}${t('seconds')}`;
                error.style.display = 'block';
            }
            this.clearPinInput();
            return;
        }

        const valid = await this.verifyPin(pin);
        if (valid) {
            this.failedAttempts = 0;
            // Derive encryption key from PIN
            await AppCrypto.activate(pin);
            this.unlock();
        } else {
            this.failedAttempts++;
            const error = document.getElementById('pin-error');

            if (this.failedAttempts >= 5) {
                this.lockoutUntil = Date.now() + 30000;
                if (error) {
                    error.textContent = `${t('tooManyAttempts')} 30${t('seconds')}`;
                    error.style.display = 'block';
                }
            } else {
                if (error) {
                    error.textContent = `${t('wrongPin')} (${this.failedAttempts}/5)`;
                    error.style.display = 'block';
                }
            }

            this.clearPinInput();
            const pinContainer = document.querySelector('#lock-screen .pin-input-container');
            if (pinContainer) {
                pinContainer.classList.add('shake');
                setTimeout(() => pinContainer.classList.remove('shake'), 500);
            }
        }
    },

    // ── Forgot PIN ──

    setupForgotPin() {
        const forgotBtn = document.getElementById('forgot-pin-btn');
        const forgotConfirm = document.getElementById('forgot-pin-confirm');
        const forgotReset = document.getElementById('forgot-pin-reset');
        const forgotCancel = document.getElementById('forgot-pin-cancel');

        forgotBtn?.addEventListener('click', () => {
            if (forgotConfirm) forgotConfirm.style.display = 'block';
            if (forgotBtn) forgotBtn.style.display = 'none';
        });

        forgotCancel?.addEventListener('click', () => {
            if (forgotConfirm) forgotConfirm.style.display = 'none';
            if (forgotBtn) forgotBtn.style.display = '';
        });

        forgotReset?.addEventListener('click', async () => {
            // Wipe ALL data — encrypted data is unrecoverable without PIN
            await Database.clear(STORES.TRANSACTIONS);
            await Database.clear(STORES.CATEGORIES);
            await Database.clear(STORES.GOALS);
            await Database.clear(STORES.FUTURE_EXPENSES);
            await Database.clear(STORES.INCOME);
            await Database.clear(STORES.CATEGORY_RULES);
            await Database.clear(STORES.SETTINGS);
            window.location.reload();
        });
    },

    // ── Settings UI ──

    async renderSecuritySettings() {
        const enabled = await Database.getSetting(this.SECURITY_ENABLED_KEY);
        const autoLock = await Database.getSetting(this.AUTO_LOCK_KEY) || 5;

        const toggleBtn = document.getElementById('toggle-pin-btn');
        const securityOptions = document.getElementById('security-options');
        const autoLockSelect = document.getElementById('auto-lock-select');

        if (toggleBtn) {
            toggleBtn.textContent = enabled ? t('removePin') : t('setPin');
            toggleBtn.className = enabled ? 'btn btn-danger' : 'btn btn-primary';
        }

        if (securityOptions) {
            securityOptions.style.display = enabled ? 'block' : 'none';
        }

        if (autoLockSelect) {
            autoLockSelect.value = String(autoLock);
        }
    },

    async handleTogglePin() {
        const enabled = await Database.getSetting(this.SECURITY_ENABLED_KEY);

        if (enabled) {
            // Ask for current PIN before removing
            const currentPin = await this.promptForPin(t('enterCurrentPin'));
            if (!currentPin) return;

            const valid = await this.verifyPin(currentPin);
            if (!valid) {
                showToast(t('wrongPin'));
                return;
            }

            showToast(t('decryptingData'));
            await this.removePin();
            showToast(t('pinRemoved'));
        } else {
            // Set new PIN
            const newPin = await this.promptForPin(t('enterNewPin'));
            if (!newPin || newPin.length < 4) {
                if (newPin !== null) showToast(t('pinTooShort'));
                return;
            }

            const confirmPin = await this.promptForPin(t('confirmNewPin'));
            if (newPin !== confirmPin) {
                showToast(t('pinMismatch'));
                return;
            }

            showToast(t('encryptingData'));
            await this.setPin(newPin);
            showToast(t('pinSet'));
        }

        await this.renderSecuritySettings();
    },

    async handleChangePin() {
        const currentPin = await this.promptForPin(t('enterCurrentPin'));
        if (!currentPin) return;

        const valid = await this.verifyPin(currentPin);
        if (!valid) {
            showToast(t('wrongPin'));
            return;
        }

        const newPin = await this.promptForPin(t('enterNewPin'));
        if (!newPin || newPin.length < 4) {
            if (newPin !== null) showToast(t('pinTooShort'));
            return;
        }

        const confirmPin = await this.promptForPin(t('confirmNewPin'));
        if (newPin !== confirmPin) {
            showToast(t('pinMismatch'));
            return;
        }

        showToast(t('reEncryptingData'));
        await AppCrypto.reEncryptAll(newPin);

        // Update PIN hash
        const hash = await this.hashPin(newPin);
        await Database.setSetting(this.PIN_HASH_KEY, hash);

        showToast(t('pinChanged'));
    },

    async handleAutoLockChange(minutes) {
        const value = parseInt(minutes);
        await Database.setSetting(this.AUTO_LOCK_KEY, value);
        if (value > 0) {
            this.startInactivityTimer(value);
            showToast(`${t('autoLockSet')} ${value} ${t('minutes')}`);
        } else {
            this.clearInactivityTimer();
            showToast(t('autoLockOff'));
        }
    },

    // ── PIN prompt (modal-based, for settings) ──

    promptForPin(title) {
        return new Promise((resolve) => {
            const html = `
                <div class="pin-prompt">
                    <p class="pin-prompt-text">${title}</p>
                    <div class="pin-input-container pin-prompt-inputs">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" class="pin-prompt-digit" maxlength="1" autocomplete="off">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" class="pin-prompt-digit" maxlength="1" autocomplete="off">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" class="pin-prompt-digit" maxlength="1" autocomplete="off">
                        <input type="password" inputmode="numeric" pattern="[0-9]*" class="pin-prompt-digit" maxlength="1" autocomplete="off">
                    </div>
                </div>
            `;

            Modal.show(t('security'), html, () => {
                const digits = document.querySelectorAll('.pin-prompt-digit');
                const pin = Array.from(digits).map(d => d.value).join('');
                resolve(pin.length >= 4 ? pin : null);
            });

            setTimeout(() => {
                const digits = document.querySelectorAll('.pin-prompt-digit');
                digits.forEach((input, index) => {
                    input.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                        if (e.target.value && index < digits.length - 1) {
                            digits[index + 1].focus();
                        }
                    });
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && !e.target.value && index > 0) {
                            digits[index - 1].focus();
                            digits[index - 1].value = '';
                        }
                    });
                });
                if (digits[0]) digits[0].focus();
            }, 100);
        });
    }
};
