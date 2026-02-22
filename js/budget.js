// Budget Module

const Budget = {
    chartInstance: null,

    async init() {
        this.bindEvents();
        await this.render();
    },

    async render() {
        const month = parseInt(document.getElementById('budget-month')?.value || getCurrentMonth());
        const year = parseInt(document.getElementById('budget-year')?.value || getCurrentYear());

        await this.renderSummary(month, year);
        await this.renderCategoryBudgets(month, year);
    },

    async renderSummary(month, year) {
        const container = document.getElementById('budget-summary');
        if (!container) return;

        const monthlyIncome = await Income.getTotalIncomeForMonth(month, year);

        const transactions = await Database.getAll(STORES.TRANSACTIONS);
        const monthTransactions = transactions.filter(t => t.month === month && t.year === year);
        const totalExpenses = sumArray(monthTransactions, 'amount');

        const futureExpenses = await FutureExpenses.getFutureExpensesForMonth(month, year);
        const totalFuture = sumArray(futureExpenses, 'amount');

        const remaining = monthlyIncome - totalExpenses;
        const expectedRemaining = monthlyIncome - totalExpenses - totalFuture;

        container.innerHTML = `
            <div class="budget-summary-grid">
                <div class="budget-item income">
                    <span class="budget-label">${t('monthlyIncome')}</span>
                    <span class="budget-value">${formatCurrency(monthlyIncome)}</span>
                </div>
                <div class="budget-item expenses">
                    <span class="budget-label">${t('actualExpenses')}</span>
                    <span class="budget-value">${formatCurrency(totalExpenses)}</span>
                </div>
                <div class="budget-item future">
                    <span class="budget-label">${t('expectedExpenses')}</span>
                    <span class="budget-value">${formatCurrency(totalFuture)}</span>
                </div>
                <div class="budget-item ${remaining >= 0 ? 'positive' : 'negative'}">
                    <span class="budget-label">${t('remaining')}</span>
                    <span class="budget-value">${formatCurrency(remaining)}</span>
                </div>
                <div class="budget-item ${expectedRemaining >= 0 ? 'positive' : 'negative'}">
                    <span class="budget-label">${t('expectedRemaining')}</span>
                    <span class="budget-value">${formatCurrency(expectedRemaining)}</span>
                </div>
            </div>
            <div class="budget-chart-container">
                <canvas id="budget-pie-chart"></canvas>
            </div>
        `;

        this.renderBudgetChart(totalExpenses, totalFuture, Math.max(0, expectedRemaining));
    },

    renderBudgetChart(expenses, future, remaining) {
        const canvas = document.getElementById('budget-pie-chart');
        if (!canvas) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const isRtl = I18n.currentLang === 'he';
        const ctx = canvas.getContext('2d');
        this.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [t('actualExpenses'), t('expectedExpenses'), t('remaining')],
                datasets: [{
                    data: [expenses, future, remaining],
                    backgroundColor: [
                        '#EF4444',
                        '#F59E0B',
                        '#10B981'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        rtl: isRtl,
                        labels: {
                            font: {
                                family: isRtl ? 'Heebo' : 'inherit'
                            }
                        }
                    }
                }
            }
        });
    },

    async renderCategoryBudgets(month, year) {
        const container = document.getElementById('budget-categories');
        if (!container) return;

        const monthlyIncome = await Income.getTotalIncomeForMonth(month, year);

        const transactions = await Database.getAll(STORES.TRANSACTIONS);
        const monthTransactions = transactions.filter(t => t.month === month && t.year === year);
        const grouped = groupBy(monthTransactions, 'category');

        let html = '<div class="category-budget-list">';

        for (const category of Categories.categories) {
            const categoryTransactions = grouped[category.name] || [];
            const total = sumArray(categoryTransactions, 'amount');
            const percentage = calculatePercentage(total, monthlyIncome);

            html += `
                <div class="category-budget-item">
                    <div class="category-budget-header">
                        <span class="category-budget-name">${category.icon} ${category.name}</span>
                        <span class="category-budget-amount">${formatCurrency(total)}</span>
                    </div>
                    <div class="category-budget-bar">
                        <div class="category-budget-fill" style="width: ${Math.min(100, percentage)}%"></div>
                    </div>
                    <div class="category-budget-info">
                        <span>${percentage}% ${t('ofIncome')}</span>
                        <span>${categoryTransactions.length} ${t('operations')}</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    },

    bindEvents() {
        populateDateSelectors('budget-month', 'budget-year');

        document.getElementById('budget-month')?.addEventListener('change', () => this.render());
        document.getElementById('budget-year')?.addEventListener('change', () => this.render());
    }
};
