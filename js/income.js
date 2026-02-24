// Income Module - Similar to Future Expenses

const Income = {
    incomes: [],
    viewMode: 'month', // 'list' or 'month' — default to month

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

        // Calculate summary for current month
        const month = getCurrentMonth();
        const year = getCurrentYear();
        const expectedTotal = await this.getExpectedIncomeForMonth(month, year);
        const receivedTotal = await this.getTotalIncomeForMonth(month, year);
        const pendingTotal = expectedTotal - receivedTotal;

        let summaryHtml = `
            <div class="card income-summary-bar">
                <div class="income-summary-item received-summary">
                    <span class="summary-label">✅ ${t('receivedIncome')}</span>
                    <span class="summary-value">${formatCurrency(receivedTotal)}</span>
                </div>
                <div class="income-summary-item pending-summary">
                    <span class="summary-label">⏳ ${t('pendingIncome')}</span>
                    <span class="summary-value">${formatCurrency(pendingTotal)}</span>
                </div>
                <div class="income-summary-item expected-summary">
                    <span class="summary-label">📊 ${t('expectedIncome')}</span>
                    <span class="summary-value">${formatCurrency(expectedTotal)}</span>
                </div>
            </div>
        `;

        if (this.viewMode === 'month') {
            this.renderByMonth(container, summaryHtml);
        } else {
            this.renderList(container, summaryHtml);
        }
    },

    renderList(container, summaryHtml = '') {
        // Sort: pending first, then by date desc
        const sorted = [...this.incomes].sort((a, b) => {
            // Pending (not received, not ended) first
            const aPending = !a.received && !a.endDate ? 0 : 1;
            const bPending = !b.received && !b.endDate ? 0 : 1;
            if (aPending !== bPending) return aPending - bPending;
            const dateA = new Date(a.type === 'once' ? a.date : a.startDate);
            const dateB = new Date(b.type === 'once' ? b.date : b.startDate);
            return dateB - dateA;
        });

        let html = summaryHtml + '<div class="finance-cards-list">';
        html += sorted.map(income => this.renderIncomeCard(income)).join('');
        html += '</div>';
        container.innerHTML = html;
    },

    renderByMonth(container, summaryHtml = '') {
        const month = getCurrentMonth();
        const year = getCurrentYear();
        const months = I18n.getMonths();

        // Get current month incomes by date
        const currentMonthByDate = this.incomes.filter(income => {
            const d = new Date(income.type === 'once' ? income.date : income.startDate);
            return d.getMonth() + 1 === month && d.getFullYear() === year;
        });

        // Also include active monthly incomes from previous months (not yet received)
        // This catches recurring incomes where the user forgot to mark them as received
        const overdueRecurring = this.incomes.filter(income => {
            if (income.type !== 'monthly' || income.received || income.endDate) return false;
            const d = new Date(income.startDate);
            const isThisMonth = d.getMonth() + 1 === month && d.getFullYear() === year;
            if (isThisMonth) return false; // Already counted above
            return this.isIncomeActive(income, month, year);
        });

        const currentMonthIncomes = [...currentMonthByDate, ...overdueRecurring];

        // Get other months (exclude items already shown in current month)
        const currentMonthIds = new Set(currentMonthIncomes.map(i => i.id));
        const otherIncomes = this.incomes.filter(income => !currentMonthIds.has(income.id));

        // Group other by month
        const grouped = {};
        otherIncomes.forEach(income => {
            const date = new Date(income.type === 'once' ? income.date : income.startDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${months[date.getMonth()]} ${date.getFullYear()}`;
            if (!grouped[key]) grouped[key] = { label, incomes: [] };
            grouped[key].incomes.push(income);
        });

        let html = summaryHtml;

        // Current month section — always open, prominent
        const currentLabel = `${months[month - 1]} ${year}`;
        const pendingCurrent = currentMonthIncomes.filter(i => !i.received && !i.endDate);
        const receivedCurrent = currentMonthIncomes.filter(i => i.received);
        
        html += `<div class="finance-month-section current-month-section">`;
        html += `<div class="finance-month-title">
            <span class="month-title-text">📅 ${currentLabel}</span>
            <span class="month-title-stats">${receivedCurrent.length}/${currentMonthIncomes.length} ${t('receivedCount')}</span>
        </div>`;

        if (pendingCurrent.length > 0) {
            html += `<div class="finance-section-label pending-label">⏳ ${t('pendingIncome')}</div>`;
            html += '<div class="finance-cards-list">';
            html += pendingCurrent.map(i => this.renderIncomeCard(i)).join('');
            html += '</div>';
        }

        if (receivedCurrent.length > 0) {
            html += `<div class="finance-section-label received-label">✅ ${t('receivedIncome')}</div>`;
            html += '<div class="finance-cards-list">';
            html += receivedCurrent.map(i => this.renderIncomeCard(i)).join('');
            html += '</div>';
        }

        if (currentMonthIncomes.length === 0) {
            html += `<div class="finance-empty-month">${t('noIncomes')}</div>`;
        }
        html += '</div>';

        // Other months — collapsed groups
        const sortedKeys = Object.keys(grouped).sort().reverse();
        if (sortedKeys.length > 0) {
            html += `<div class="finance-section-label other-months-label" style="margin-top: 16px;">📆 ${t('otherMonths')}</div>`;
            sortedKeys.forEach(key => {
                const group = grouped[key];
                const total = sumArray(group.incomes, 'amount');
                const recCount = group.incomes.filter(i => i.received).length;
                
                html += `
                    <div class="finance-month-group">
                        <div class="finance-month-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
                            <div class="finance-month-group-info">
                                <span class="group-title">${group.label}</span>
                                <span class="group-stats">${group.incomes.length} ${t('incomeCount')} · ${recCount} ${t('receivedCount')}</span>
                            </div>
                            <span class="group-total">${formatCurrency(total)}</span>
                        </div>
                        <div class="finance-month-group-body collapsed">
                            <div class="finance-cards-list">
                                ${group.incomes.map(i => this.renderIncomeCard(i)).join('')}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;
    },

    renderIncomeCard(income) {
        const month = getCurrentMonth();
        const year = getCurrentYear();
        const isActive = this.isIncomeActive(income, month, year);
        const skippedThisMonth = income.skippedMonths?.includes(`${year}-${month}`);
        
        const incomeDate = new Date(income.type === 'once' ? income.date : income.startDate);
        const incomeMonth = incomeDate.getMonth() + 1;
        const incomeYear = incomeDate.getFullYear();
        const isIncomeMonth = incomeMonth === month && incomeYear === year;
        const isFutureIncome = incomeYear > year || (incomeYear === year && incomeMonth > month);
        
        const canMarkReceived = !income.received && !income.endDate && 
            (income.type === 'monthly' ? (isIncomeMonth && !skippedThisMonth) : isActive);
        
        let statusClass, statusText, statusIcon;
        if (income.received) {
            statusClass = 'paid'; statusText = t('received'); statusIcon = '✅';
        } else if (income.endDate) {
            statusClass = 'ended'; statusText = t('ended'); statusIcon = '⏹️';
        } else if (skippedThisMonth && isIncomeMonth) {
            statusClass = 'skipped'; statusText = t('skipped'); statusIcon = '⏭️';
        } else if (isIncomeMonth || isActive) {
            statusClass = 'pending'; statusText = t('pending'); statusIcon = '⏳';
        } else if (isFutureIncome) {
            statusClass = 'future'; statusText = t('future'); statusIcon = '🔮';
        } else {
            statusClass = 'inactive'; statusText = t('inactive'); statusIcon = '⚪';
        }

        const dateStr = formatDate(income.type === 'once' ? income.date : income.startDate);
        const typeText = income.type === 'once' ? t('oneTimeType') : t('monthly');

        return `
            <div class="finance-card ${statusClass}" data-id="${income.id}">
                <div class="finance-card-top">
                    <div class="finance-card-info">
                        <span class="finance-card-desc">${income.description || t('income')}</span>
                        <span class="finance-card-meta">${typeText} · ${dateStr}</span>
                    </div>
                    <div class="finance-card-amount income-amount-text">${formatCurrency(income.amount)}</div>
                </div>
                <div class="finance-card-bottom">
                    <span class="status-badge ${statusClass}">${statusIcon} ${statusText}</span>
                    <div class="finance-card-actions">
                        ${canMarkReceived ? `<button class="btn-action btn-receive mark-received" data-id="${income.id}" title="${t('markReceived')}">✅ ${t('markReceived')}</button>` : ''}
                        ${!income.received && income.type === 'monthly' && !income.endDate && isIncomeMonth ? `
                            ${skippedThisMonth ? 
                                `<button class="btn-action btn-neutral unskip-income" data-id="${income.id}">↩️</button>` :
                                `<button class="btn-action btn-neutral skip-income" data-id="${income.id}">⏭️</button>`
                            }
                        ` : ''}
                        ${!income.received && income.type === 'monthly' && !income.endDate ? 
                            `<button class="btn-action btn-neutral stop-income" data-id="${income.id}">⏹️</button>` : ''}
                        <button class="btn-action btn-neutral edit-income" data-id="${income.id}">✏️</button>
                        <button class="btn-action btn-danger delete-income" data-id="${income.id}">🗑️</button>
                    </div>
                </div>
                ${income.comment ? `<div class="finance-card-comment">${income.comment}</div>` : ''}
            </div>
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

    async getExpectedIncomeForMonth(month, year) {
        await this.loadIncomes();
        // Count all active incomes for this month (received or not)
        const activeIncomes = this.incomes.filter(income => {
            const skipped = income.skippedMonths?.includes(`${year}-${month}`);
            if (skipped) return false;
            if (income.type === 'once') {
                const incomeDate = new Date(income.date);
                return incomeDate.getMonth() + 1 === month && incomeDate.getFullYear() === year;
            } else {
                // Monthly: active if within start/end range (catches recurring from previous months)
                return this.isIncomeActive(income, month, year) && !income.received;
            }
        });
        return sumArray(activeIncomes, 'amount');
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
