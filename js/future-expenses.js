// Future Expenses Module - Enhanced

const FutureExpenses = {
    expenses: [],
    viewMode: 'list', // 'list' or 'month'

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
        // Sort by date
        const sorted = [...this.expenses].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        let html = `<div class="card"><div class="table-container"><table id="future-table">
            <thead>
                <tr>
                    <th>${t('description')}</th>
                    <th>${t('amount')}</th>
                    <th>${t('dueDate')}</th>
                    <th>${t('category')}</th>
                    <th>${t('subcategory')}</th>
                    <th>${t('frequency')}</th>
                    <th>${t('status')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>`;

        html += sorted.map(expense => this.renderExpenseRow(expense)).join('');
        html += '</tbody></table></div></div>';
        container.innerHTML = html;
    },

    renderByMonth(container) {
        // Group by month/year
        const grouped = {};
        const months = I18n.getMonths();
        
        this.expenses.forEach(expense => {
            const date = new Date(expense.dueDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${months[date.getMonth()]} ${date.getFullYear()}`;
            
            if (!grouped[key]) {
                grouped[key] = { label, expenses: [] };
            }
            grouped[key].expenses.push(expense);
        });

        // Sort keys chronologically
        const sortedKeys = Object.keys(grouped).sort();
        
        let html = '';
        sortedKeys.forEach(key => {
            const group = grouped[key];
            const total = sumArray(group.expenses, 'amount');
            const paidCount = group.expenses.filter(e => e.paid).length;
            
            html += `
                <div class="card month-group">
                    <div class="month-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <div class="month-info">
                            <h3>${group.label}</h3>
                            <span class="month-stats">${group.expenses.length} ${t('expensesCount')} | ${paidCount} ${t('paidCount')}</span>
                        </div>
                        <div class="month-total">
                            <span class="total-label">${t('total')}:</span>
                            <span class="total-amount">${formatCurrency(total)}</span>
                        </div>
                    </div>
                    <div class="month-group-content">
                        <table class="future-table">
                            <thead>
                                <tr>
                                    <th>${t('description')}</th>
                                    <th>${t('amount')}</th>
                                    <th>${t('day')}</th>
                                    <th>${t('category')}</th>
                                    <th>${t('subcategory')}</th>
                                    <th>${t('frequency')}</th>
                                    <th>${t('status')}</th>
                                    <th>${t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.expenses.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map(e => this.renderExpenseRow(e, true)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || `<div class="card"><p style="text-align: center; padding: 40px;">${t('noFutureExpenses')}</p></div>`;
    },

    renderExpenseRow(expense, showDayOnly = false) {
        const isPast = new Date(expense.dueDate) < new Date();
        const isSkipped = expense.skippedMonths?.includes(this.getMonthKey(expense.dueDate));
        const statusClass = expense.paid ? 'paid' : (isSkipped ? 'skipped' : (isPast ? 'overdue' : 'pending'));
        const statusText = expense.paid ? t('paid') : (isSkipped ? t('skipped') : (isPast ? t('overdue') : t('pending')));

        const dateDisplay = showDayOnly ? 
            new Date(expense.dueDate).getDate() : 
            formatDate(expense.dueDate);

        return `
            <tr class="${statusClass}">
                <td>${expense.description}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td>${dateDisplay}</td>
                <td>${expense.category || '-'}</td>
                <td>${expense.subcategory || '-'}</td>
                <td>${this.getFrequencyText(expense.frequency)}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td class="action-buttons">
                    ${!expense.paid && !isSkipped ? `<button class="btn-icon mark-paid" data-id="${expense.id}" title="${t('markPaid')}">✅</button>` : ''}
                    ${!expense.paid && expense.frequency !== 'once' ? `
                        ${isSkipped ? 
                            `<button class="btn-icon unskip-expense" data-id="${expense.id}" title="${t('unskip')}">↩️</button>` :
                            `<button class="btn-icon skip-expense" data-id="${expense.id}" title="${t('skipMonth')}">⏭️</button>`
                        }
                        <button class="btn-icon stop-expense" data-id="${expense.id}" title="${t('stopMonthlyExpense')}">⏹️</button>
                    ` : ''}
                    <button class="btn-icon edit-future" data-id="${expense.id}" title="${t('edit')}">✏️</button>
                    <button class="btn-icon delete-future" data-id="${expense.id}" title="${t('delete')}">🗑️</button>
                </td>
            </tr>
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
