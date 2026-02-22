// Settings Module - Backup & Restore

const Settings = {
    async init() {
        this.bindEvents();
        await this.updateRulesCount();
        await Security.renderSecuritySettings();
    },

    bindEvents() {
        // Backup data
        document.getElementById('backup-data')?.addEventListener('click', () => this.backupData());
        
        // Restore data
        document.getElementById('restore-data')?.addEventListener('click', () => {
            document.getElementById('restore-file-input').click();
        });
        
        document.getElementById('restore-file-input')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.restoreData(file);
            }
        });
        
        // Clear all data
        document.getElementById('clear-all-data')?.addEventListener('click', async () => {
            await this.clearAllData();
        });

        // Clear income data
        document.getElementById('clear-income-data')?.addEventListener('click', async () => {
            if (await confirmDialog(t('clearIncomeTitle'), t('clearIncomeConfirm'))) {
                await Database.clear(STORES.INCOME);
                showToast(t('incomeCleared'));
                await Income.loadIncomes();
                await Income.render();
            }
        });

        // Category rules management
        document.getElementById('view-category-rules')?.addEventListener('click', () => this.showCategoryRules());
        document.getElementById('clear-category-rules')?.addEventListener('click', () => this.clearCategoryRules());

        // Security settings
        document.getElementById('toggle-pin-btn')?.addEventListener('click', () => Security.handleTogglePin());
        document.getElementById('change-pin-btn')?.addEventListener('click', () => Security.handleChangePin());
        document.getElementById('auto-lock-select')?.addEventListener('change', (e) => Security.handleAutoLockChange(e.target.value));
    },

    async updateRulesCount() {
        const rules = await Database.getAll(STORES.CATEGORY_RULES);
        const countEl = document.getElementById('rules-count');
        if (countEl) {
            countEl.textContent = rules.length;
        }
    },

    async showCategoryRules() {
        const rules = await Database.getAll(STORES.CATEGORY_RULES);
        
        if (rules.length === 0) {
            showToast(t('noRules'));
            return;
        }

        let html = `<div class="rules-modal-content"><table class="rules-table"><thead><tr><th>${t('pattern')}</th><th>${t('category')}</th><th>${t('subcategory')}</th><th>${t('ruleActions')}</th></tr></thead><tbody>`;
        
        rules.forEach(rule => {
            html += `
                <tr data-rule-id="${rule.id}">
                    <td>${rule.pattern}</td>
                    <td>${rule.category}</td>
                    <td>${rule.subcategory || '-'}</td>
                    <td><button class="btn btn-sm btn-danger delete-rule" data-id="${rule.id}">🗑️</button></td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';

        // Show rules in modal using Modal.show with no confirm button
        Modal.show(`${t('categoryRules')} (${rules.length})`, html, null, t('confirm'), t('close'), true);

        // Bind delete buttons after modal is shown
        setTimeout(() => {
            document.getElementById('modal-body')?.querySelectorAll('.delete-rule').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id);
                    await Database.delete(STORES.CATEGORY_RULES, id);
                    e.target.closest('tr').remove();
                    await this.updateRulesCount();
                    showToast(t('ruleDeleted'));
                });
            });
        }, 50);
    },

    async clearCategoryRules() {
        const rules = await Database.getAll(STORES.CATEGORY_RULES);
        if (rules.length === 0) {
            showToast(t('noRulesToDelete'));
            return;
        }

        if (!await confirmDialog(t('deleteRulesTitle'), `${t('deleteRulesConfirm')} ${rules.length} ${t('categoryRules')}?`)) {
            return;
        }

        await Database.clear(STORES.CATEGORY_RULES);
        await this.updateRulesCount();
        showToast(t('rulesCleared'));
    },

    async backupData() {
        try {
            showToast(t('preparingBackup'));
            
            const backup = {
                version: '3.0',
                date: new Date().toISOString(),
                data: {
                    transactions: await Database.getAll(STORES.TRANSACTIONS),
                    categories: await Database.getAll(STORES.CATEGORIES),
                    goals: await Database.getAll(STORES.GOALS),
                    futureExpenses: await Database.getAll(STORES.FUTURE_EXPENSES),
                    income: await Database.getAll(STORES.INCOME),
                    categoryRules: await Database.getAll(STORES.CATEGORY_RULES),
                    settings: await this.getAllSettings()
                }
            };
            
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `finance-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast(t('backupSaved'));
        } catch (error) {
            console.error('Backup error:', error);
            showToast(t('backupError'));
        }
    },

    async getAllSettings() {
        const settings = {};
        const keys = ['monthlyIncome', 'language', 'testKey', 'pinHash', 'securityEnabled', 'autoLockMinutes', 'cryptoSalt'];
        
        for (const key of keys) {
            const value = await Database.getSetting(key);
            if (value !== undefined) {
                settings[key] = value;
            }
        }
        
        return settings;
    },

    async restoreData(file) {
        try {
            const text = await file.text();
            const backup = JSON.parse(text);
            
            if (!backup.data || !backup.version) {
                showToast(t('invalidFile'));
                return;
            }
            
            if (!await confirmDialog(t('restoreTitle'), t('restoreConfirm'))) {
                return;
            }
            
            showToast(t('restoringData'));
            
            // Preserve crypto salt before clearing (needed to decrypt any re-encrypted data)
            const savedCryptoSalt = await Database.getSetting('cryptoSalt');
            
            await Database.clear(STORES.TRANSACTIONS);
            await Database.clear(STORES.CATEGORIES);
            await Database.clear(STORES.GOALS);
            await Database.clear(STORES.FUTURE_EXPENSES);
            await Database.clear(STORES.INCOME);
            await Database.clear(STORES.CATEGORY_RULES);
            
            if (backup.data.transactions) {
                for (const item of backup.data.transactions) {
                    delete item.id;
                    await Database.add(STORES.TRANSACTIONS, item);
                }
            }
            
            if (backup.data.categories) {
                for (const item of backup.data.categories) {
                    delete item.id;
                    await Database.add(STORES.CATEGORIES, item);
                }
            }
            
            if (backup.data.goals) {
                for (const item of backup.data.goals) {
                    delete item.id;
                    await Database.add(STORES.GOALS, item);
                }
            }
            
            if (backup.data.futureExpenses) {
                for (const item of backup.data.futureExpenses) {
                    delete item.id;
                    await Database.add(STORES.FUTURE_EXPENSES, item);
                }
            }
            
            if (backup.data.income) {
                for (const item of backup.data.income) {
                    delete item.id;
                    await Database.add(STORES.INCOME, item);
                }
            }

            if (backup.data.categoryRules) {
                for (const item of backup.data.categoryRules) {
                    delete item.id;
                    await Database.add(STORES.CATEGORY_RULES, item);
                }
            }
            
            if (backup.data.settings) {
                for (const [key, value] of Object.entries(backup.data.settings)) {
                    await Database.setSetting(key, value);
                }
            }
            
            // Restore the crypto salt from THIS device (data was encrypted with this salt's key)
            if (savedCryptoSalt) {
                await Database.setSetting('cryptoSalt', savedCryptoSalt);
            }
            
            showToast(t('restoreSuccess'));
            
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            
        } catch (error) {
            console.error('Restore error:', error);
            showToast(t('restoreError'));
        }
    },

    async clearAllData() {
        if (!await confirmDialog(t('deleteAllTitle'), t('deleteAllConfirm'))) {
            return;
        }
        
        if (!await confirmDialog(t('finalConfirmTitle'), t('finalConfirmMsg'))) {
            return;
        }
        
        try {
            showToast(t('deletingData'));
            
            await Database.clear(STORES.TRANSACTIONS);
            await Database.clear(STORES.CATEGORIES);
            await Database.clear(STORES.GOALS);
            await Database.clear(STORES.FUTURE_EXPENSES);
            await Database.clear(STORES.INCOME);
            await Database.clear(STORES.CATEGORY_RULES);
            await Database.clear(STORES.SETTINGS);
            
            showToast(t('allDataDeleted'));
            
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            
        } catch (error) {
            console.error('Clear error:', error);
            showToast(t('deleteError'));
        }
    }
};
