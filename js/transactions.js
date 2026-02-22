// Transactions Module

const Transactions = {
    transactions: [],
    pendingData: [],
    currentView: 'table',
    modifiedRows: new Set(),
    
    async init() {
        await this.loadTransactions();
        this.setupUpload();
        this.bindEvents();
        await this.render();
    },

    async loadTransactions() {
        this.transactions = await Database.getAll(STORES.TRANSACTIONS);
        this.modifiedRows.clear();
        this.updateSaveAllButton();
    },
    
    markAsModified(id) {
        this.modifiedRows.add(id);
        this.updateSaveAllButton();
        const row = document.querySelector(`tr[data-id="${id}"]`);
        if (row) row.classList.add('modified');
    },
    
    updateSaveAllButton() {
        const btn = document.getElementById('save-all-transactions');
        if (btn) {
            btn.style.display = this.modifiedRows.size > 0 ? '' : 'none';
            btn.textContent = `💾 ${t('save')} (${this.modifiedRows.size})`;
        }
    },
    
    async saveAllModified() {
        if (this.modifiedRows.size === 0) return;
        
        let saved = 0;
        for (const id of this.modifiedRows) {
            const transaction = this.transactions.find(t => t.id === id);
            if (transaction) {
                await Database.update(STORES.TRANSACTIONS, transaction);
                saved++;
            }
        }
        
        this.modifiedRows.clear();
        this.updateSaveAllButton();
        document.querySelectorAll('tr.modified').forEach(row => row.classList.remove('modified'));
        
        showToast(`${t('addedTransactions')} ${saved} ${t('operations')}`);
    },

    setupUpload() {
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        
        if (!uploadArea || !fileInput) return;

        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.processFile(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.processFile(file);
        });

        document.getElementById('confirm-upload')?.addEventListener('click', async () => {
            await this.confirmUpload();
        });
        
        document.getElementById('cancel-upload')?.addEventListener('click', () => {
            this.cancelUpload();
        });
    },
    
    cancelUpload() {
        this.pendingData = [];
        const preview = document.getElementById('upload-preview');
        if (preview) preview.style.display = 'none';
        const table = document.getElementById('preview-table');
        if (table) table.innerHTML = '';
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
        showToast(t('uploadCancelled'));
    },

    async processFile(file) {
        try {
            if (typeof XLSX === 'undefined') {
                showToast(t('excelNotLoaded'));
                return;
            }
            
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

            this.pendingData = this.parseExcelData(rawData);
            
            if (this.pendingData.length === 0) {
                showToast(t('noTransactionsInFile'));
                return;
            }
            
            await this.markDuplicates();
            await this.showPreview();
        } catch (error) {
            console.error('Error processing file:', error);
            showToast(t('fileReadError') + ': ' + error.message);
        }
    },

    parseExcelData(rawData) {
        if (!rawData || rawData.length === 0) return [];
        
        let headerRowIndex = -1;
        let headers = [];
        
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const row = rawData[i];
            if (!row || !Array.isArray(row)) continue;
            
            const rowStr = row.join(' ');
            
            if (rowStr.includes('תאריך רכישה') || rowStr.includes('שם בית עסק')) {
                headerRowIndex = i;
                headers = row;
                break;
            }
            
            if (rowStr.includes('תאריך') && (rowStr.includes('תיאור') || rowStr.includes('סכום'))) {
                headerRowIndex = i;
                headers = row;
                break;
            }
        }
        
        if (headerRowIndex === -1) {
            for (let i = 0; i < rawData.length; i++) {
                if (rawData[i] && rawData[i].length > 2) {
                    headerRowIndex = i;
                    headers = rawData[i];
                    break;
                }
            }
        }
        
        if (headerRowIndex === -1) return [];
        
        const findColIndex = (options) => {
            for (let i = 0; i < headers.length; i++) {
                const h = String(headers[i] || '').trim();
                for (const opt of options) {
                    if (h.includes(opt)) return i;
                }
            }
            return -1;
        };
        
        let dateCol = findColIndex(['תאריך רכישה', 'תאריך']);
        let descCol = findColIndex(['שם בית עסק', 'שם בית העסק']);
        let amountCol = findColIndex(['סכום עסקה', 'סכום חיוב', 'סכום']);
        
        if (dateCol === -1) dateCol = findColIndex(['date', 'Date']);
        if (descCol === -1) descCol = findColIndex(['תיאור', 'פירוט', 'description', 'Description']);
        if (amountCol === -1) amountCol = findColIndex(['חיוב', 'amount', 'Amount']);
        
        const debitCol = findColIndex(['חיוב', 'debit', 'Debit']);
        const creditCol = findColIndex(['זכות', 'credit', 'Credit']);
        
        const transactions = [];
        const skipPatterns = ['סה"כ', 'סה״כ', 'סהכ', 'סיכום', 'total', 'Total'];
        
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || !Array.isArray(row) || row.length < 3) continue;
            
            const rowStr = row.join(' ');
            if (skipPatterns.some(p => rowStr.includes(p))) continue;
            
            const description = descCol >= 0 ? String(row[descCol] || '').trim() : '';
            if (!description) continue;
            
            let amount = 0;
            if (amountCol >= 0 && row[amountCol]) {
                const val = String(row[amountCol]).replace(/[^\d.-]/g, '');
                amount = Math.abs(parseFloat(val) || 0);
            } else if (debitCol >= 0 || creditCol >= 0) {
                const debit = debitCol >= 0 ? Math.abs(parseFloat(String(row[debitCol]).replace(/[^\d.-]/g, '')) || 0) : 0;
                const credit = creditCol >= 0 ? Math.abs(parseFloat(String(row[creditCol]).replace(/[^\d.-]/g, '')) || 0) : 0;
                amount = debit || credit;
            }
            
            if (amount <= 0) continue;
            
            let date = new Date();
            if (dateCol >= 0 && row[dateCol]) {
                const dateVal = row[dateCol];
                
                if (typeof dateVal === 'number') {
                    date = parseExcelDate(dateVal);
                } else {
                    const dateStr = String(dateVal).trim();
                    const ddmmyyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
                    if (ddmmyyMatch) {
                        let year = parseInt(ddmmyyMatch[3]);
                        year = year < 50 ? 2000 + year : 1900 + year;
                        date = new Date(year, parseInt(ddmmyyMatch[2]) - 1, parseInt(ddmmyyMatch[1]));
                    } else {
                        const parts = dateStr.split(/[\/\-\.]/);
                        if (parts.length === 3) {
                            const day = parseInt(parts[0]);
                            const month = parseInt(parts[1]) - 1;
                            let year = parseInt(parts[2]);
                            if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;
                            date = new Date(year, month, day);
                        } else {
                            const parsed = new Date(dateStr);
                            if (!isNaN(parsed)) date = parsed;
                        }
                    }
                }
            }
            
            if (isNaN(date.getTime())) date = new Date();
            
            transactions.push({
                date: date.toISOString().split('T')[0],
                month: date.getMonth() + 1,
                year: date.getFullYear(),
                description: description,
                amount: amount,
                category: '',
                subcategory: '',
                comment: ''
            });
        }
        
        return transactions;
    },

    async showPreview() {
        try {
            const preview = document.getElementById('upload-preview');
            const table = document.getElementById('preview-table');
            
            if (!preview || !table) return;

            await Categories.getCategories();
            await this.applyAutoCategories();

            preview.style.display = 'block';

            const groupedData = this.groupByMonthYear(this.pendingData);
            const duplicateCount = this.pendingData.filter(t => t._isDuplicate).length;
            let html = `
                <div class="preview-toolbar">
                <label>
                    <input type="checkbox" id="preview-group-by-month" checked>
                    ${t('groupByMonth')}
                </label>
                ${duplicateCount > 0 ? `
                <label class="duplicate-warning">
                    <input type="checkbox" id="skip-duplicates" checked>
                    ${t('skipDuplicates')} ${duplicateCount} ${t('duplicates')} ⚠️
                </label>
                ` : ''}
                <span class="preview-summary">${t('totalOps')} ${this.pendingData.length} ${t('operations')}</span>
            </div>
        `;

        html += this.renderPreviewTable(groupedData, true);
        table.innerHTML = html;

        document.getElementById('preview-group-by-month')?.addEventListener('change', (e) => {
            const tableContainer = table.querySelector('.preview-table-content');
            if (tableContainer) {
                tableContainer.innerHTML = e.target.checked ? 
                    this.renderGroupedRows(groupedData) : 
                    this.renderFlatRows(this.pendingData);
                this.bindPreviewDropdowns(table);
            }
        });

        this.bindPreviewDropdowns(table);
        } catch (error) {
            console.error('Error in showPreview:', error);
            showToast(t('previewError'));
        }
    },

    renderPreviewTable(groupedData, grouped) {
        return `
            <div class="preview-table-content">
                ${grouped ? this.renderGroupedRows(groupedData) : this.renderFlatRows(this.pendingData)}
            </div>
        `;
    },

    renderGroupedRows(groupedData) {
        let html = '';
        const sortedKeys = Object.keys(groupedData).sort((a, b) => b.localeCompare(a));
        
        for (const key of sortedKeys) {
            const items = groupedData[key];
            const total = sumArray(items, 'amount');
            
            html += `
                <div class="preview-month-group">
                    <div class="preview-month-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <span class="month-label">${key}</span>
                        <span class="month-stats">${items.length} ${t('operations')} | ${formatCurrency(total)}</span>
                    </div>
                    <div class="preview-month-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>${t('date')}</th>
                                    <th>${t('description')}</th>
                                    <th>${t('amount')}</th>
                                    <th>${t('category')}</th>
                                    <th>${t('subcategory')}</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            items.forEach((item) => {
                const index = item._originalIndex !== undefined ? item._originalIndex : this.pendingData.indexOf(item);
                html += this.renderPreviewRow(item, index);
            });
            
            html += '</tbody></table></div></div>';
        }
        
        return html;
    },

    renderFlatRows(items) {
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>${t('date')}</th>
                        <th>${t('description')}</th>
                        <th>${t('amount')}</th>
                        <th>${t('category')}</th>
                        <th>${t('subcategory')}</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        items.forEach((item, index) => {
            html += this.renderPreviewRow(item, index);
        });
        
        html += '</tbody></table>';
        return html;
    },

    renderPreviewRow(item, index) {
        const duplicateClass = item._isDuplicate ? 'is-duplicate' : '';
        const categoryClass = item.category ? 'has-category' : '';
        return `
            <tr class="${categoryClass} ${duplicateClass}" data-index="${index}">
                <td>${formatDate(item.date)}${item._isDuplicate ? ` <span class="duplicate-badge">${t('duplicate')}</span>` : ''}</td>
                <td>${item.description}</td>
                <td>${formatCurrency(item.amount)}</td>
                <td>
                    <select class="preview-category" data-index="${index}">
                        <option value="">${t('selectCategory')}</option>
                        ${Categories.categories.map(c => 
                            `<option value="${c.name}" ${c.name === item.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    <select class="preview-subcategory" data-index="${index}">
                        <option value="">${t('selectSubcategory')}</option>
                        ${item.category ? (Categories.getCategoryByName(item.category)?.subcategories || []).map(s =>
                            `<option value="${s}" ${s === item.subcategory ? 'selected' : ''}>${s}</option>`
                        ).join('') : ''}
                    </select>
                </td>
            </tr>
        `;
    },

    groupByMonthYear(data) {
        const grouped = {};
        const months = I18n.getMonths();
        
        data.forEach((item, idx) => {
            item._originalIndex = idx;
            const monthName = months[item.month - 1] || '?';
            const key = `${monthName} ${item.year}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        
        return grouped;
    },

    async markDuplicates() {
        const existingTransactions = await Database.getAll(STORES.TRANSACTIONS);
        let duplicateCount = 0;
        
        this.pendingData.forEach(item => {
            const isDuplicate = existingTransactions.some(existing => 
                existing.date === item.date && 
                existing.description === item.description && 
                existing.amount === item.amount
            );
            
            if (isDuplicate) {
                item._isDuplicate = true;
                duplicateCount++;
            }
        });
        
        this.duplicateCount = duplicateCount;
    },

    bindPreviewDropdowns(table) {
        table.querySelectorAll('.preview-category').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.pendingData[index].category = e.target.value;
                
                const row = e.target.closest('tr');
                const subSelect = row.querySelector('.preview-subcategory');
                Categories.renderSubcategoryOptions(subSelect, e.target.value);
                row.classList.toggle('has-category', !!e.target.value);
            });
        });

        table.querySelectorAll('.preview-subcategory').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.pendingData[index].subcategory = e.target.value;
            });
        });
    },

    async applyAutoCategories() {
        const rules = await Database.getAll(STORES.CATEGORY_RULES);
        
        for (const item of this.pendingData) {
            if (item.category) continue;
            
            const rule = rules.find(r => 
                item.description.toLowerCase().includes(r.pattern.toLowerCase())
            );
            
            if (rule) {
                item.category = rule.category;
                item.subcategory = rule.subcategory || '';
                item.autoAssigned = true;
            }
        }
    },

    async saveCategoryRule(description, category, subcategory) {
        const pattern = description.split(/\s+/).slice(0, 3).join(' ');
        
        const rules = await Database.getAll(STORES.CATEGORY_RULES);
        const existing = rules.find(r => r.pattern === pattern);
        
        if (existing) {
            existing.category = category;
            existing.subcategory = subcategory;
            await Database.update(STORES.CATEGORY_RULES, existing);
        } else {
            await Database.add(STORES.CATEGORY_RULES, {
                pattern,
                category,
                subcategory
            });
        }
    },

    async confirmUpload() {
        if (this.pendingData.length === 0) {
            showToast(t('noDataToUpload'));
            return;
        }

        const comment = document.getElementById('sheet-comment')?.value || '';
        const saveRules = document.getElementById('save-category-rules')?.checked ?? true;
        const skipDuplicates = document.getElementById('skip-duplicates')?.checked ?? true;
        
        let dataToImport = skipDuplicates 
            ? this.pendingData.filter(t => !t._isDuplicate)
            : this.pendingData;
        
        if (dataToImport.length === 0) {
            showToast(t('allDuplicates'));
            return;
        }
        
        dataToImport.forEach(t => {
            if (comment) t.comment = comment;
        });

        if (saveRules) {
            for (const transaction of dataToImport) {
                if (transaction.category && !transaction.autoAssigned) {
                    await this.saveCategoryRule(transaction.description, transaction.category, transaction.subcategory);
                }
            }
        }

        for (const transaction of dataToImport) {
            delete transaction.autoAssigned;
            delete transaction._isDuplicate;
            delete transaction._originalIndex;
            await Database.add(STORES.TRANSACTIONS, transaction);
        }

        const skippedCount = this.pendingData.length - dataToImport.length;
        const message = skippedCount > 0 
            ? `${t('addedTransactions')} ${dataToImport.length} ${t('operations')} (${t('skippedDuplicates')} ${skippedCount} ${t('duplicateOps')})`
            : `${t('addedTransactions')} ${dataToImport.length} ${t('operations')}`;
        showToast(message);
        
        this.pendingData = [];
        document.getElementById('upload-preview').style.display = 'none';
        document.getElementById('sheet-comment').value = '';
        document.getElementById('file-input').value = '';
        
        await this.loadTransactions();
        await this.render();
        
        if (typeof Dashboard !== 'undefined') {
            Dashboard.render();
        }
    },

    bindEvents() {
        populateDateSelectors('transactions-month', 'transactions-year');
        
        document.getElementById('transactions-month')?.addEventListener('change', () => this.render());
        document.getElementById('transactions-year')?.addEventListener('change', () => this.render());

        const searchInput = document.getElementById('search-transactions');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => this.render(), 300));
        }

        document.querySelectorAll('.view-toggle .btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.view-toggle .btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentView = e.target.dataset.view;
                this.render();
            });
        });

        document.getElementById('select-all')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('#transactions-body input[type="checkbox"]').forEach(cb => {
                cb.checked = checked;
            });
            this.updateDeleteButton();
        });

        document.getElementById('delete-selected')?.addEventListener('click', async () => {
            const selected = document.querySelectorAll('#transactions-body input[type="checkbox"]:checked');
            if (selected.length === 0) return;

            if (await confirmDialog(t('deleteTransaction'), `${t('deleteSelectedConfirm')} (${selected.length})?`)) {
                for (const cb of selected) {
                    const id = parseInt(cb.dataset.id);
                    await Database.delete(STORES.TRANSACTIONS, id);
                }
                showToast(t('selectedDeleted'));
                await this.loadTransactions();
                await this.render();
            }
        });

        document.getElementById('export-transactions')?.addEventListener('click', () => this.exportTransactions());
        
        document.getElementById('add-expense-btn')?.addEventListener('click', () => this.showExpenseModal());
        
        document.getElementById('save-all-transactions')?.addEventListener('click', () => this.saveAllModified());

        document.getElementById('transactions-body')?.addEventListener('change', async (e) => {
            if (e.target.classList.contains('table-category')) {
                const id = parseInt(e.target.dataset.id);
                const transaction = this.transactions.find(t => t.id === id);
                if (transaction) {
                    transaction.category = e.target.value;
                    this.markAsModified(id);
                    
                    if (transaction.category) {
                        await this.saveCategoryRule(transaction.description, transaction.category, transaction.subcategory);
                    }
                    
                    const row = e.target.closest('tr');
                    const subSelect = row.querySelector('.table-subcategory');
                    Categories.renderSubcategoryOptions(subSelect, e.target.value, transaction.subcategory);
                }
            }

            if (e.target.classList.contains('table-subcategory')) {
                const id = parseInt(e.target.dataset.id);
                const transaction = this.transactions.find(t => t.id === id);
                if (transaction) {
                    transaction.subcategory = e.target.value;
                    this.markAsModified(id);
                    
                    if (transaction.category) {
                        await this.saveCategoryRule(transaction.description, transaction.category, transaction.subcategory);
                    }
                }
            }

            if (e.target.type === 'checkbox' && e.target.dataset.id) {
                this.updateDeleteButton();
            }
        });
        
        document.getElementById('transactions-body')?.addEventListener('input', (e) => {
            if (e.target.classList.contains('table-comment')) {
                const id = parseInt(e.target.dataset.id);
                const transaction = this.transactions.find(t => t.id === id);
                if (transaction) {
                    transaction.comment = e.target.value;
                    this.markAsModified(id);
                }
            }
        });

        document.getElementById('transactions-body')?.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-transaction')) {
                const id = parseInt(e.target.dataset.id);
                if (await confirmDialog(t('deleteTransaction'), t('deleteTransactionConfirm'))) {
                    await Database.delete(STORES.TRANSACTIONS, id);
                    await this.loadTransactions();
                    await this.render();
                    showToast(t('transactionDeleted'));
                }
            }

            if (e.target.classList.contains('save-comment')) {
                const id = parseInt(e.target.dataset.id);
                const input = e.target.parentElement.querySelector('.table-comment');
                const transaction = this.transactions.find(t => t.id === id);
                if (transaction && input) {
                    transaction.comment = input.value;
                    await Database.update(STORES.TRANSACTIONS, transaction);
                    
                    this.modifiedRows.delete(id);
                    this.updateSaveAllButton();
                    
                    const row = e.target.closest('tr');
                    if (row) row.classList.remove('modified');
                    e.target.classList.add('saved-indicator');
                    setTimeout(() => e.target.classList.remove('saved-indicator'), 1000);
                }
            }
        });
    },

    updateDeleteButton() {
        const selected = document.querySelectorAll('#transactions-body input[type="checkbox"]:checked');
        const deleteBtn = document.getElementById('delete-selected');
        if (deleteBtn) {
            deleteBtn.style.display = selected.length > 0 ? '' : 'none';
        }
    },

    async render() {
        const month = parseInt(document.getElementById('transactions-month')?.value || getCurrentMonth());
        const year = parseInt(document.getElementById('transactions-year')?.value || getCurrentYear());
        const search = document.getElementById('search-transactions')?.value?.toLowerCase() || '';

        let filtered = this.transactions.filter(t => 
            t.month === month && t.year === year
        );

        if (search) {
            filtered = filtered.filter(t => 
                t.description.toLowerCase().includes(search) ||
                (t.category && t.category.toLowerCase().includes(search)) ||
                (t.comment && t.comment.toLowerCase().includes(search))
            );
        }

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (this.currentView === 'table') {
            this.renderTableView(filtered);
        } else {
            this.renderCategoryView(filtered);
        }
    },

    renderTableView(transactions) {
        document.getElementById('transactions-table-view').style.display = '';
        document.getElementById('transactions-category-view').style.display = 'none';

        const tbody = document.getElementById('transactions-body');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px;">${t('noTransactions')}</td></tr>`;
            return;
        }

        tbody.innerHTML = transactions.map(tr => `
            <tr data-id="${tr.id}" class="${this.modifiedRows.has(tr.id) ? 'modified' : ''}">
                <td class="checkbox-col">
                    <input type="checkbox" data-id="${tr.id}">
                </td>
                <td>${formatDate(tr.date)}</td>
                <td>${tr.description}</td>
                <td>${formatCurrency(tr.amount)}</td>
                <td>
                    <select class="table-category" data-id="${tr.id}">
                        <option value="">${t('selectCategory')}</option>
                        ${Categories.categories.map(c => 
                            `<option value="${c.name}" ${c.name === tr.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    <select class="table-subcategory" data-id="${tr.id}">
                        <option value="">${t('selectSubcategory')}</option>
                        ${tr.category ? (Categories.getCategoryByName(tr.category)?.subcategories || []).map(s =>
                            `<option value="${s}" ${s === tr.subcategory ? 'selected' : ''}>${s}</option>`
                        ).join('') : ''}
                    </select>
                </td>
                <td>
                    <div class="inline-comment">
                        <input type="text" class="table-comment" data-id="${tr.id}" value="${tr.comment || ''}" placeholder="${t('comment')}...">
                        <button class="save-comment" data-id="${tr.id}" title="${t('save')}">💾</button>
                    </div>
                </td>
                <td class="action-buttons">
                    <button class="btn-icon delete-transaction" data-id="${tr.id}" title="${t('delete')}">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    renderCategoryView(transactions) {
        document.getElementById('transactions-table-view').style.display = 'none';
        document.getElementById('transactions-category-view').style.display = '';

        const container = document.getElementById('category-breakdown');
        if (!container) return;

        const grouped = groupBy(transactions, 'category');

        let html = '';
        for (const category of Categories.categories) {
            const categoryTransactions = grouped[category.name] || [];
            const total = sumArray(categoryTransactions, 'amount');

            html += `
                <div class="category-section">
                    <div class="category-section-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <div class="category-title">
                            <span class="category-icon">${category.icon}</span>
                            <span class="category-name">${category.name}</span>
                            <span class="transaction-count">(${categoryTransactions.length})</span>
                        </div>
                        <span class="category-total">${formatCurrency(total)}</span>
                    </div>
                    <div class="category-transactions ${categoryTransactions.length === 0 ? 'collapsed' : ''}">
            `;

            categoryTransactions.forEach(tr => {
                html += `
                    <div class="category-transaction-item">
                        <span class="trans-date">${formatDate(tr.date)}</span>
                        <span class="trans-desc">${tr.description}</span>
                        <span class="trans-amount">${formatCurrency(tr.amount)}</span>
                    </div>
                `;
            });

            html += '</div></div>';
        }

        const uncategorized = grouped[''] || grouped[t('noCategory')] || [];
        if (uncategorized.length > 0) {
            const total = sumArray(uncategorized, 'amount');
            html += `
                <div class="category-section">
                    <div class="category-section-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <div class="category-title">
                            <span class="category-icon">📌</span>
                            <span class="category-name">${t('noCategory')}</span>
                            <span class="transaction-count">(${uncategorized.length})</span>
                        </div>
                        <span class="category-total">${formatCurrency(total)}</span>
                    </div>
                    <div class="category-transactions">
            `;

            uncategorized.forEach(tr => {
                html += `
                    <div class="category-transaction-item">
                        <span class="trans-date">${formatDate(tr.date)}</span>
                        <span class="trans-desc">${tr.description}</span>
                        <span class="trans-amount">${formatCurrency(tr.amount)}</span>
                    </div>
                `;
            });

            html += '</div></div>';
        }

        container.innerHTML = html || `<p style="text-align: center; padding: 40px; color: var(--text-secondary);">${t('noTransactions')}</p>`;
    },

    async exportTransactions() {
        const month = parseInt(document.getElementById('transactions-month')?.value || getCurrentMonth());
        const year = parseInt(document.getElementById('transactions-year')?.value || getCurrentYear());

        const filtered = this.transactions.filter(t => t.month === month && t.year === year);

        const exportData = filtered.map(tr => ({
            [t('date')]: formatDate(tr.date),
            [t('description')]: tr.description,
            [t('amount')]: tr.amount,
            [t('category')]: tr.category || '',
            [t('subcategory')]: tr.subcategory || '',
            [t('comment')]: tr.comment || ''
        }));

        await exportToExcel(exportData, `transaction-details_export_${Date.now()}.xlsx`);
        showToast(t('exporting'));
    },

    async showExpenseModal(expense = null) {
        const isEdit = expense !== null;
        const title = isEdit ? t('editTransaction') : t('addManualExpense');
        
        const categories = await Categories.getCategories();
        const categoryOptions = categories.map(c => 
            `<option value="${c.name}" ${expense?.category === c.name ? 'selected' : ''}>${c.icon} ${c.name}</option>`
        ).join('');

        const form = `
            <div class="form-group">
                <label>${t('date')}</label>
                <input type="date" id="expense-date" value="${expense?.date || new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label>${t('description')}</label>
                <input type="text" id="expense-desc" value="${expense?.description || ''}" placeholder="${t('descPlaceholder')}" required>
            </div>
            <div class="form-group">
                <label>${t('amountLabel')}</label>
                <input type="number" id="expense-amount" value="${expense?.amount || ''}" required min="0.01" step="0.01">
            </div>
            <div class="form-group">
                <label>${t('category')}</label>
                <select id="expense-category">
                    <option value="">${t('selectCategory')}</option>
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>${t('subcategory')}</label>
                <select id="expense-subcategory">
                    <option value="">${t('selectSubcategory')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('commentOptional')}</label>
                <textarea id="expense-comment" placeholder="${t('commentPlaceholder')}">${expense?.comment || ''}</textarea>
            </div>
        `;

        Modal.show(title, form, async () => {
            const dateVal = document.getElementById('expense-date').value;
            const description = document.getElementById('expense-desc').value.trim();
            const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
            const category = document.getElementById('expense-category').value;
            const subcategory = document.getElementById('expense-subcategory').value;
            const comment = document.getElementById('expense-comment').value.trim();

            if (!description || amount <= 0) {
                showToast(t('fillDescAndAmount'));
                return;
            }

            const date = new Date(dateVal);
            const expenseData = {
                date: dateVal,
                month: date.getMonth() + 1,
                year: date.getFullYear(),
                description,
                amount,
                category,
                subcategory,
                comment
            };

            if (isEdit) {
                expenseData.id = expense.id;
                await Database.update(STORES.TRANSACTIONS, expenseData);
                showToast(t('transactionSaved'));
            } else {
                await Database.add(STORES.TRANSACTIONS, expenseData);
                showToast(t('transactionAdded'));
            }

            if (category) {
                await this.saveCategoryRule(description, category, subcategory);
            }

            await this.loadTransactions();
            await this.render();
        });

        const categorySelect = document.getElementById('expense-category');
        const subcategorySelect = document.getElementById('expense-subcategory');
        
        categorySelect?.addEventListener('change', () => {
            Categories.renderSubcategoryOptions(subcategorySelect, categorySelect.value, expense?.subcategory || '');
        });
        
        if (expense?.category) {
            Categories.renderSubcategoryOptions(subcategorySelect, expense.category, expense.subcategory || '');
        }
    }
};
