// Income Module - Similar to Future Expenses

const Income = {
    incomes: [],
    viewMode: 'list', // 'list' or 'month'

    async init() {
        await this.loadIncomes();
        await this.render();
        this.bindEvents();
    },

    async loadIncomes() {
        this.incomes = await Database.getAll(STORES.INCOME);
    },

    async render() {
        const container = document.getElementById('income-container');
        if (!container) return;

        if (this.incomes.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <span>💰</span>
                        <p>${t('noIncomes')}</p>
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
        const sorted = [...this.incomes].sort((a, b) => {
            const dateA = new Date(a.type === 'once' ? a.date : a.startDate);
            const dateB = new Date(b.type === 'once' ? b.date : b.startDate);
            return dateB - dateA;
        });

        let html = `<div class="card"><div class="table-container"><table id="income-table">
            <thead>
                <tr>
                    <th>${t('description')}</th>
                    <th>${t('amount')}</th>
                    <th>${t('date')}</th>
                    <th>${t('incomeType')}</th>
                    <th>${t('status')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>`;

        html += sorted.map(income => this.renderIncomeRow(income)).join('');
        html += '</tbody></table></div></div>';
        container.innerHTML = html;
    },

    renderByMonth(container) {
        // Group by month/year  
        const grouped = {};
        const months = I18n.getMonths();
        
        this.incomes.forEach(income => {
            const date = new Date(income.type === 'once' ? income.date : income.startDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${months[date.getMonth()]} ${date.getFullYear()}`;
            
            if (!grouped[key]) {
                grouped[key] = { label, incomes: [] };
            }
            grouped[key].incomes.push(income);
        });

        // Sort keys chronologically (reverse)
        const sortedKeys = Object.keys(grouped).sort().reverse();
        
        let html = '';
        sortedKeys.forEach(key => {
            const group = grouped[key];
            const total = sumArray(group.incomes, 'amount');
            const receivedCount = group.incomes.filter(i => i.received).length;
            
            html += `
                <div class="card month-group">
                    <div class="month-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                        <div class="month-info">
                            <h3>${group.label}</h3>
                            <span class="month-stats">${group.incomes.length} ${t('incomeCount')} | ${receivedCount} ${t('receivedCount')}</span>
                        </div>
                        <div class="month-total">
                            <span class="total-label">${t('total')}:</span>
                            <span class="total-amount">${formatCurrency(total)}</span>
                        </div>
                    </div>
                    <div class="month-group-content">
                        <table class="income-table">
                            <thead>
                                <tr>
                                    <th>${t('description')}</th>
                                    <th>${t('amount')}</th>
                                    <th>${t('day')}</th>
                                    <th>${t('incomeType')}</th>
                                    <th>${t('status')}</th>
                                    <th>${t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.incomes.sort((a, b) => new Date(a.type === 'once' ? a.date : a.startDate) - new Date(b.type === 'once' ? b.date : b.startDate)).map(i => this.renderIncomeRow(i, true)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html || `<div class="card"><p style="text-align: center; padding: 40px;">${t('noIncomes')}</p></div>`;
    },

    renderIncomeRow(income, showDayOnly = false) {
        const month = getCurrentMonth();
        const year = getCurrentYear();
        const isActive = this.isIncomeActive(income, month, year);
        const skippedThisMonth = income.skippedMonths?.includes(`${year}-${month}`);
        
        // For monthly incomes, check if it's the income's month (based on startDate)
        const incomeDate = new Date(income.type === 'once' ? income.date : income.startDate);
        const incomeMonth = incomeDate.getMonth() + 1;
        const incomeYear = incomeDate.getFullYear();
        const isIncomeMonth = incomeMonth === month && incomeYear === year;
        const isFutureIncome = incomeYear > year || (incomeYear === year && incomeMonth > month);
        
        // Can mark as received: for monthly - if it's this income's month and not received/skipped
        // For one-time - if it's active this month
        const canMarkReceived = !income.received && !income.endDate && 
            (income.type === 'monthly' ? (isIncomeMonth && !skippedThisMonth) : isActive);
        
        let statusClass, statusText;
        if (income.received) {
            statusClass = 'paid';
            statusText = t('received');
        } else if (income.endDate) {
            statusClass = 'ended';
            statusText = t('ended');
        } else if (skippedThisMonth && isIncomeMonth) {
            statusClass = 'skipped';
            statusText = t('skipped');
        } else if (isIncomeMonth || isActive) {
            statusClass = 'pending';
            statusText = t('pending');
        } else if (isFutureIncome) {
            statusClass = 'future';
            statusText = t('future');
        } else {
            statusClass = 'inactive';
            statusText = t('inactive');
        }

        const dateDisplay = showDayOnly ? 
            incomeDate.getDate() : 
            formatDate(income.type === 'once' ? income.date : income.startDate);

        const typeText = income.type === 'once' ? t('oneTimeType') : t('monthly');

        return `
            <tr class="${statusClass}">
                <td>${income.description || '-'}</td>
                <td>${formatCurrency(income.amount)}</td>
                <td>${dateDisplay}</td>
                <td>${typeText}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td class="action-buttons">
                    ${canMarkReceived ? `<button class="btn-icon mark-received" data-id="${income.id}" title="${t('markReceived')}">✅</button>` : ''}
                    ${!income.received && income.type === 'monthly' && !income.endDate && isIncomeMonth ? `
                        ${skippedThisMonth ? 
                            `<button class="btn-icon unskip-income" data-id="${income.id}" title="${t('returnIncome')}">↩️</button>` :
                            `<button class="btn-icon skip-income" data-id="${income.id}" title="${t('skipMonth')}">⏭️</button>`
                        }
                    ` : ''}
                    ${!income.received && income.type === 'monthly' && !income.endDate ? `
                        <button class="btn-icon stop-income" data-id="${income.id}" title="${t('stopMonthly')}">⏹️</button>
                    ` : ''}
                    <button class="btn-icon edit-income" data-id="${income.id}" title="${t('edit')}">✏️</button>
                    <button class="btn-icon delete-income" data-id="${income.id}" title="${t('delete')}">🗑️</button>
                </td>
            </tr>
        `;
    },

    getActiveIncomes(month, year) {
        return this.incomes.filter(income => this.isIncomeActive(income, month, year) && !income.received);
    },

    isIncomeActive(income, month, year) {
        const selectedDate = new Date(year, month - 1, 15);
        
        if (income.type === 'once') {
            const incomeDate = new Date(income.date);
            return incomeDate.getMonth() + 1 === month && incomeDate.getFullYear() === year;
        } else {
            // Monthly income
            const startDate = new Date(income.startDate);
            const endDate = income.endDate ? new Date(income.endDate) : null;
            
            if (selectedDate < startDate) return false;
            if (endDate && selectedDate > endDate) return false;
            
            return true;
        }
    },

    async getTotalIncomeForMonth(month, year) {
        await this.loadIncomes();
        // Only count incomes that are marked as received
        const receivedIncomes = this.incomes.filter(income => {
            if (!income.received) return false;
            // Check if received in this month
            const incomeDate = new Date(income.type === 'once' ? income.date : income.startDate);
            return incomeDate.getMonth() + 1 === month && incomeDate.getFullYear() === year;
        });
        return sumArray(receivedIncomes, 'amount');
    },

    bindEvents() {
        // View toggle
        document.querySelectorAll('.income-view-toggle .btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.income-view-toggle .btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.viewMode = e.target.dataset.view;
                this.render();
            });
        });

        // Add income button
        document.getElementById('add-income-btn')?.addEventListener('click', () => {
            this.showIncomeModal();
        });

        // Delegate events
        document.getElementById('income-container')?.addEventListener('click', async (e) => {
            const markReceivedBtn = e.target.closest('.mark-received');
            const editBtn = e.target.closest('.edit-income');
            const deleteBtn = e.target.closest('.delete-income');
            const skipBtn = e.target.closest('.skip-income');
            const unskipBtn = e.target.closest('.unskip-income');
            const stopBtn = e.target.closest('.stop-income');

            if (markReceivedBtn) {
                const id = parseInt(markReceivedBtn.dataset.id);
                await this.markAsReceived(id);
            }

            if (editBtn) {
                const id = parseInt(editBtn.dataset.id);
                const income = this.incomes.find(i => i.id === id);
                if (income) this.showIncomeModal(income);
            }

            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id);
                if (await confirmDialog(t('deleteIncome'), t('deleteIncomeConfirm'))) {
                    await Database.delete(STORES.INCOME, id);
                    await this.loadIncomes();
                    await this.render();
                    showToast(t('incomeDeleted'));
                }
            }

            if (skipBtn) {
                const id = parseInt(skipBtn.dataset.id);
                const month = getCurrentMonth();
                const year = getCurrentYear();
                await this.skipMonth(id, month, year);
            }

            if (unskipBtn) {
                const id = parseInt(unskipBtn.dataset.id);
                const month = getCurrentMonth();
                const year = getCurrentYear();
                await this.unskipMonth(id, month, year);
            }

            if (stopBtn) {
                const id = parseInt(stopBtn.dataset.id);
                if (await confirmDialog(t('stopMonthly'), t('stopMonthlyConfirm'))) {
                    const income = this.incomes.find(i => i.id === id);
                    if (income) {
                        income.type = 'once';
                        income.date = income.startDate;
                        await Database.update(STORES.INCOME, income);
                        await this.loadIncomes();
                        await this.render();
                        showToast(t('monthlyStopped'));
                    }
                }
            }
        });
    },

    async markAsReceived(id) {
        const income = this.incomes.find(i => i.id === id);
        if (!income) return;

        income.received = true;
        income.receivedDate = new Date().toISOString().split('T')[0];

        // If recurring, set endDate to end of current month and create next occurrence
        if (income.type === 'monthly') {
            const month = getCurrentMonth();
            const year = getCurrentYear();
            // End of current month (day 0 of next month = last day of current month)
            const endOfMonth = new Date(year, month, 0);
            income.endDate = endOfMonth.toISOString().split('T')[0];
            await Database.update(STORES.INCOME, income);
            await this.createNextOccurrence(income);
        } else {
            await Database.update(STORES.INCOME, income);
        }

        await this.loadIncomes();
        await this.render();
        showToast(t('incomeReceived'));
    },

    async createNextOccurrence(income) {
        const incomeDate = new Date(income.startDate);
        const month = getCurrentMonth();
        const year = getCurrentYear();
        
        // Next month's start
        const nextMonth = new Date(year, month, 1);

        await Database.add(STORES.INCOME, {
            description: income.description,
            amount: income.amount,
            type: 'monthly',
            startDate: nextMonth.toISOString().split('T')[0],
            comment: income.comment,
            skippedMonths: []
        });
    },

    async skipMonth(id, month, year) {
        const income = this.incomes.find(i => i.id === id);
        if (!income) return;

        if (!income.skippedMonths) income.skippedMonths = [];
        const monthKey = `${year}-${month}`;
        
        if (!income.skippedMonths.includes(monthKey)) {
            income.skippedMonths.push(monthKey);
            await Database.update(STORES.INCOME, income);
            await this.render();
            showToast(t('incomeSkipped'));
        }
    },

    async unskipMonth(id, month, year) {
        const income = this.incomes.find(i => i.id === id);
        if (!income || !income.skippedMonths) return;

        const monthKey = `${year}-${month}`;
        income.skippedMonths = income.skippedMonths.filter(m => m !== monthKey);
        await Database.update(STORES.INCOME, income);
        await this.render();
        showToast(t('incomeReturned'));
    },

    showIncomeModal(income = null) {
        const isEdit = income !== null;
        const title = isEdit ? t('editIncome') : t('addIncome');

        const form = `
            <div class="form-group">
                <label>${t('incomeType')}</label>
                <select id="income-type">
                    <option value="monthly" ${income?.type === 'monthly' || !income ? 'selected' : ''}>${t('monthlyFixed')}</option>
                    <option value="once" ${income?.type === 'once' ? 'selected' : ''}>${t('oneTime')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('descriptionOptional')}</label>
                <input type="text" id="income-desc" value="${income?.description || ''}" placeholder="${t('descriptionPlaceholder')}">
            </div>
            <div class="form-group">
                <label>${t('amountLabel')}</label>
                <input type="number" id="income-amount" value="${income?.amount || ''}" required min="1">
            </div>
            <div class="form-group income-date-group" id="once-date-group" style="${income?.type === 'once' ? '' : 'display: none;'}">
                <label>${t('dateLabel')}</label>
                <input type="date" id="income-date" value="${income?.date || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group income-date-group" id="monthly-date-group" style="${income?.type === 'once' ? 'display: none;' : ''}">
                <label>${t('startDate')}</label>
                <input type="date" id="income-start-date" value="${income?.startDate || new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>${t('commentOptional')}</label>
                <textarea id="income-comment" placeholder="${t('commentPlaceholder')}">${income?.comment || ''}</textarea>
            </div>
        `;

        Modal.show(title, form, async () => {
            const type = document.getElementById('income-type').value;
            const description = document.getElementById('income-desc').value.trim();
            const amount = parseFloat(document.getElementById('income-amount').value) || 0;
            const comment = document.getElementById('income-comment').value.trim();

            if (amount <= 0) {
                showToast(t('enterAmount'));
                return;
            }

            const incomeData = {
                type,
                description,
                amount,
                comment
            };

            if (type === 'once') {
                incomeData.date = document.getElementById('income-date').value;
            } else {
                incomeData.startDate = document.getElementById('income-start-date').value;
                incomeData.skippedMonths = income?.skippedMonths || [];
            }

            if (isEdit) {
                incomeData.id = income.id;
                incomeData.received = income.received;
                incomeData.receivedDate = income.receivedDate;
                incomeData.endDate = income.endDate;
                await Database.update(STORES.INCOME, incomeData);
                showToast(t('incomeUpdated'));
            } else {
                await Database.add(STORES.INCOME, incomeData);
                showToast(t('incomeAdded'));
            }

            await this.loadIncomes();
            await this.render();
        });

        // Bind type change
        document.getElementById('income-type')?.addEventListener('change', (e) => {
            const isOnce = e.target.value === 'once';
            document.getElementById('once-date-group').style.display = isOnce ? '' : 'none';
            document.getElementById('monthly-date-group').style.display = isOnce ? 'none' : '';
        });
    }
};
