// Future Expenses Module - Enhanced

const FutureExpenses = {
    expenses: [],
    viewMode: 'month', // 'list' or 'month' — default to month

    async init() {
        await this.loadExpenses();
        await this.render();
        this.bindEvents();
    },

    async loadExpenses() {
        this.expenses = await Database.getAll(STORES.FUTURE_EXPENSES);
    },

    async render() {
        const container = document.getElementById('future-container');
        if (!container) return;

        if (this.expenses.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <span>📅</span>
                        <p>${t('noFutureExpenses')}</p>
                    </div>
                </div>
            `;
            return;
        }

        if (this.viewMode === 'month') {
            this.renderByMonth(container);
        } else {
            this.renderList(container);
        }
    },

    renderList(container) {
        const sorted = [...this.expenses].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        let html = '<div class="finance-cards-list">';
        html += sorted.map(expense => this.renderExpenseCard(expense)).join('');
        html += '</div>';
        container.innerHTML = html;
    },

    renderByMonth(container) {
        const grouped = {};
        const months = I18n.getMonths();
        
        this.expenses.forEach(expense => {
            const date = new Date(expense.dueDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${months[date.getMonth()]} ${date.getFullYear()}`;
            if (!grouped[key]) grouped[key] = { label, expenses: [] };
            grouped[key].expenses.push(expense);
        });

        const sortedKeys = Object.keys(grouped).sort();
        const currentKey = `${getCurrentYear()}-${String(getCurrentMonth()).padStart(2, '0')}`;
        
        let html = '';
        sortedKeys.forEach(key => {
            const group = grouped[key];
            const total = sumArray(group.expenses, 'amount');
            const paidCount = group.expenses.filter(e => e.paid).length;
            const unpaidTotal = sumArray(group.expenses.filter(e => !e.paid), 'amount');
            const isCurrent = key === currentKey;
            
            html += `
                <div class="finance-month-group ${isCurrent ? 'current-month' : ''}">
                    <div class="finance-month-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <div class="finance-month-group-info">
                            <span class="group-title">${isCurrent ? '📅 ' : ''}${group.label}</span>
                            <span class="group-stats">${paidCount}/${group.expenses.length} ${t('paidCount')} · ${t('remaining')}: ${formatCurrency(unpaidTotal)}</span>
                        </div>
                        <span class="group-total">${formatCurrency(total)}</span>
                    </div>
                    <div class="finance-month-group-body ${isCurrent ? '' : 'collapsed'}">
                        <div class="finance-cards-list">
                            ${group.expenses.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map(e => this.renderExpenseCard(e)).join('')}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || `<div class="card"><div class="empty-state"><span>📅</span><p>${t('noFutureExpenses')}</p></div></div>`;
    },

    renderExpenseCard(expense) {
        const isPast = new Date(expense.dueDate) < new Date();
        const isSkipped = expense.skippedMonths?.includes(this.getMonthKey(expense.dueDate));
        
        let statusClass, statusText, statusIcon;
        if (expense.paid) {
            statusClass = 'paid'; statusText = t('paid'); statusIcon = '✅';
        } else if (isSkipped) {
            statusClass = 'skipped'; statusText = t('skipped'); statusIcon = '⏭️';
        } else if (isPast) {
            statusClass = 'overdue'; statusText = t('overdue'); statusIcon = '🔴';
        } else {
            statusClass = 'pending'; statusText = t('pending'); statusIcon = '⏳';
        }

        return `
            <div class="finance-card ${statusClass}" data-id="${expense.id}">
                <div class="finance-card-top">
                    <div class="finance-card-info">
                        <span class="finance-card-desc">${expense.description}</span>
                        <span class="finance-card-meta">${this.getFrequencyText(expense.frequency)} · ${formatDate(expense.dueDate)}${expense.category ? ` · ${expense.category}` : ''}</span>
                    </div>
                    <div class="finance-card-amount expense-amount-text">${formatCurrency(expense.amount)}</div>
                </div>
                <div class="finance-card-bottom">
                    <span class="status-badge ${statusClass}">${statusIcon} ${statusText}</span>
                    <div class="finance-card-actions">
                        ${!expense.paid && !isSkipped ? `<button class="btn-action btn-receive mark-paid" data-id="${expense.id}" title="${t('markPaid')}">✅ ${t('markPaid')}</button>` : ''}
                        ${!expense.paid && expense.frequency !== 'once' ? `
                            ${isSkipped ? 
                                `<button class="btn-action btn-neutral unskip-expense" data-id="${expense.id}">↩️</button>` :
                                `<button class="btn-action btn-neutral skip-expense" data-id="${expense.id}">⏭️</button>`
                            }
                            <button class="btn-action btn-neutral stop-expense" data-id="${expense.id}">⏹️</button>
                        ` : ''}
                        <button class="btn-action btn-neutral edit-future" data-id="${expense.id}">✏️</button>
                        <button class="btn-action btn-danger delete-future" data-id="${expense.id}">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    },

    getMonthKey(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${d.getMonth() + 1}`;
    },

    getFrequencyText(frequency) {
        const texts = {
            'once': t('oneTimeType'),
            'monthly': t('monthly'),
            'bimonthly': t('bimonthly'),
            'quarterly': t('quarterly'),
            'yearly': t('yearly')
        };
        return texts[frequency] || frequency;
    },

    bindEvents() {
        // Add future expense button
        document.getElementById('add-future-btn')?.addEventListener('click', () => {
            this.showExpenseModal();
        });

        // View toggle
        document.querySelectorAll('.future-view-toggle .btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.future-view-toggle .btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.viewMode = e.target.dataset.view;
                this.render();
            });
        });

        // Delegate events for table actions
        document.getElementById('future-container')?.addEventListener('click', async (e) => {
            const markPaidBtn = e.target.closest('.mark-paid');
            const editBtn = e.target.closest('.edit-future');
            const deleteBtn = e.target.closest('.delete-future');
            const skipBtn = e.target.closest('.skip-expense');
            const unskipBtn = e.target.closest('.unskip-expense');
            const stopBtn = e.target.closest('.stop-expense');

            if (markPaidBtn) {
                const id = parseInt(markPaidBtn.dataset.id);
                const expense = this.expenses.find(ex => ex.id === id);
                if (expense) {
                    expense.paid = true;
                    await Database.update(STORES.FUTURE_EXPENSES, expense);
                    
                    // Create a transaction with the expense details
                    const expenseDate = new Date(expense.dueDate);
                    const transaction = {
                        date: expense.dueDate,
                        month: expenseDate.getMonth() + 1,
                        year: expenseDate.getFullYear(),
                        description: expense.description,
                        amount: expense.amount,
                        category: expense.category || '',
                        subcategory: expense.subcategory || '',
                        comment: `${t('futureExpenseComment')} - ${expense.description}`
                    };
                    await Database.add(STORES.TRANSACTIONS, transaction);
                    
                    // If recurring, create next occurrence
                    if (expense.frequency !== 'once') {
                        await this.createNextOccurrence(expense);
                    }
                    
                    await this.loadExpenses();
                    await this.render();
                    showToast(t('expensePaidAndAdded'));
                }
            }

            if (skipBtn) {
                const id = parseInt(skipBtn.dataset.id);
                await this.skipExpense(id);
            }

            if (unskipBtn) {
                const id = parseInt(unskipBtn.dataset.id);
                await this.unskipExpense(id);
            }

            if (editBtn) {
                const id = parseInt(editBtn.dataset.id);
                const expense = this.expenses.find(ex => ex.id === id);
                if (expense) this.showExpenseModal(expense);
            }

            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id);
                if (await confirmDialog(t('deleteExpense'), t('deleteExpenseConfirm'))) {
                    await Database.delete(STORES.FUTURE_EXPENSES, id);
                    await this.loadExpenses();
                    await this.render();
                    showToast(t('expenseDeleted'));
                }
            }
            
            if (stopBtn) {
                const id = parseInt(stopBtn.dataset.id);
                if (await confirmDialog(t('stopMonthlyExpense'), t('stopMonthlyExpenseConfirm'))) {
                    const expense = this.expenses.find(ex => ex.id === id);
                    if (expense) {
                        expense.frequency = 'once'; // Convert to one-time so it won't create new occurrences
                        await Database.update(STORES.FUTURE_EXPENSES, expense);
                        await this.loadExpenses();
                        await this.render();
                        showToast(t('monthlyExpenseStopped'));
                    }
                }
            }
        });
    },

    async skipExpense(id) {
        const expense = this.expenses.find(e => e.id === id);
        if (!expense) return;

        const monthKey = this.getMonthKey(expense.dueDate);
        if (!expense.skippedMonths) expense.skippedMonths = [];
        
        if (!expense.skippedMonths.includes(monthKey)) {
            expense.skippedMonths.push(monthKey);
            
            // Create next occurrence
            await this.createNextOccurrence(expense);
            
            await Database.update(STORES.FUTURE_EXPENSES, expense);
            await this.loadExpenses();
            await this.render();
            showToast(t('expenseSkipped'));
        }
    },

    async unskipExpense(id) {
        const expense = this.expenses.find(e => e.id === id);
        if (!expense || !expense.skippedMonths) return;

        const monthKey = this.getMonthKey(expense.dueDate);
        expense.skippedMonths = expense.skippedMonths.filter(m => m !== monthKey);
        
        await Database.update(STORES.FUTURE_EXPENSES, expense);
        await this.loadExpenses();
        await this.render();
        showToast(t('expenseReturned'));
    },

    async createNextOccurrence(expense) {
        const dueDate = new Date(expense.dueDate);
        
        switch (expense.frequency) {
            case 'monthly':
                dueDate.setMonth(dueDate.getMonth() + 1);
                break;
            case 'bimonthly':
                dueDate.setMonth(dueDate.getMonth() + 2);
                break;
            case 'quarterly':
                dueDate.setMonth(dueDate.getMonth() + 3);
                break;
            case 'yearly':
                dueDate.setFullYear(dueDate.getFullYear() + 1);
                break;
            default:
                return;
        }

        await Database.add(STORES.FUTURE_EXPENSES, {
            description: expense.description,
            amount: expense.amount,
            dueDate: dueDate.toISOString().split('T')[0],
            category: expense.category,
            subcategory: expense.subcategory,
            frequency: expense.frequency,
            paid: false,
            skippedMonths: []
        });
    },

    showExpenseModal(expense = null) {
        const isEdit = expense !== null;
        const title = isEdit ? t('editFutureExpense') : t('addFutureExpense');

        const categoryOptions = Categories.categories.map(c => 
            `<option value="${c.name}" ${expense?.category === c.name ? 'selected' : ''}>${c.icon} ${c.name}</option>`
        ).join('');

        const form = `
            <div class="form-group">
                <label>${t('description')}</label>
                <input type="text" id="future-desc" value="${expense?.description || ''}" required>
            </div>
            <div class="form-group">
                <label>${t('amountLabel')}</label>
                <input type="number" id="future-amount" value="${expense?.amount || ''}" required min="1">
            </div>
            <div class="form-group">
                <label>${t('dueDate')}</label>
                <input type="date" id="future-date" value="${expense?.dueDate || ''}" required>
            </div>
            <div class="form-group">
                <label>${t('category')}</label>
                <select id="future-category">
                    <option value="">${t('selectCategory')}</option>
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>${t('subcategory')}</label>
                <select id="future-subcategory">
                    <option value="">${t('selectSubcategory')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('frequency')}</label>
                <select id="future-frequency">
                    <option value="once" ${expense?.frequency === 'once' ? 'selected' : ''}>${t('oneTimeType')}</option>
                    <option value="monthly" ${expense?.frequency === 'monthly' ? 'selected' : ''}>${t('monthly')}</option>
                    <option value="bimonthly" ${expense?.frequency === 'bimonthly' ? 'selected' : ''}>${t('bimonthly')}</option>
                    <option value="quarterly" ${expense?.frequency === 'quarterly' ? 'selected' : ''}>${t('quarterlyFull')}</option>
                    <option value="yearly" ${expense?.frequency === 'yearly' ? 'selected' : ''}>${t('yearly')}</option>
                </select>
            </div>
        `;

        Modal.show(title, form, async () => {
            const description = document.getElementById('future-desc').value.trim();
            const amount = parseFloat(document.getElementById('future-amount').value) || 0;
            const dueDate = document.getElementById('future-date').value;
            const category = document.getElementById('future-category').value;
            const subcategory = document.getElementById('future-subcategory').value;
            const frequency = document.getElementById('future-frequency').value;

            if (!description || amount <= 0 || !dueDate) {
                showToast(t('fillAllRequired'));
                return;
            }

            if (isEdit) {
                expense.description = description;
                expense.amount = amount;
                expense.dueDate = dueDate;
                expense.category = category;
                expense.subcategory = subcategory;
                expense.frequency = frequency;
                await Database.update(STORES.FUTURE_EXPENSES, expense);
                showToast(t('futureExpenseUpdated'));
            } else {
                await Database.add(STORES.FUTURE_EXPENSES, {
                    description,
                    amount,
                    dueDate,
                    category,
                    subcategory,
                    frequency,
                    paid: false,
                    skippedMonths: []
                });
                showToast(t('futureExpenseAdded'));
            }

            await this.loadExpenses();
            await this.render();
        });

        // Bind category change to update subcategories
        const categorySelect = document.getElementById('future-category');
        const subcategorySelect = document.getElementById('future-subcategory');
        
        categorySelect?.addEventListener('change', () => {
            Categories.renderSubcategoryOptions(subcategorySelect, categorySelect.value, expense?.subcategory || '');
        });
        
        // Initialize subcategory dropdown if category is pre-selected
        if (expense?.category) {
            Categories.renderSubcategoryOptions(subcategorySelect, expense.category, expense.subcategory || '');
        }
    },

    // Get total future expenses for budget calculations
    async getFutureExpensesForMonth(month, year) {
        const expenses = await Database.getAll(STORES.FUTURE_EXPENSES);
        return expenses.filter(e => {
            const date = new Date(e.dueDate);
            const isCorrectMonth = date.getMonth() + 1 === month && date.getFullYear() === year;
            const isSkipped = e.skippedMonths?.includes(`${year}-${month}`);
            return isCorrectMonth && !e.paid && !isSkipped;
        });
    }
};
