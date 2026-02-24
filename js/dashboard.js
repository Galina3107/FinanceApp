// Dashboard Module

const Dashboard = {
    pieChart: null,
    barChart: null,

    async init() {
        populateDateSelectors('dashboard-month', 'dashboard-year');
        this.bindEvents();
        await this.render();
    },

    bindEvents() {
        document.getElementById('dashboard-month')?.addEventListener('change', () => this.render());
        document.getElementById('dashboard-year')?.addEventListener('change', () => this.render());
    },

    async render() {
        const month = parseInt(document.getElementById('dashboard-month')?.value || getCurrentMonth());
        const year = parseInt(document.getElementById('dashboard-year')?.value || getCurrentYear());

        const transactions = await Database.getAll(STORES.TRANSACTIONS);
        const monthlyIncome = await Income.getTotalIncomeForMonth(month, year);
        const expectedIncome = await Income.getExpectedIncomeForMonth(month, year);

        const monthTransactions = transactions.filter(t => t.month === month && t.year === year);
        const totalExpenses = sumArray(monthTransactions, 'amount');

        const goals = await Database.getAll(STORES.GOALS);
        const totalSavings = sumArray(goals, 'current');

        const balance = monthlyIncome - totalExpenses;

        // Show received income, and if there's pending income show it as subtitle
        const incomeEl = document.getElementById('total-income');
        if (incomeEl) {
            incomeEl.textContent = formatCurrency(monthlyIncome);
            // Show expected income hint if different from received
            const pendingAmount = expectedIncome - monthlyIncome;
            const hintEl = document.getElementById('income-pending-hint');
            if (hintEl) {
                if (pendingAmount > 0) {
                    hintEl.textContent = `⏳ ${t('pending')}: ${formatCurrency(pendingAmount)}`;
                    hintEl.style.display = '';
                } else {
                    hintEl.style.display = 'none';
                }
            }
        }
        document.getElementById('total-expenses').textContent = formatCurrency(totalExpenses);
        document.getElementById('total-balance').textContent = formatCurrency(balance);
        document.getElementById('total-savings').textContent = formatCurrency(totalSavings);

        const balanceCard = document.getElementById('total-balance');
        if (balanceCard) {
            balanceCard.parentElement.classList.remove('positive', 'negative');
            balanceCard.parentElement.classList.add(balance >= 0 ? 'positive' : 'negative');
        }

        await this.renderPieChart(monthTransactions);
        await this.renderBarChart(transactions, year);
    },

    async renderPieChart(transactions) {
        const canvas = document.getElementById('expenses-pie-chart');
        if (!canvas) return;
        if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }

        try {
        if (this.pieChart) {
            this.pieChart.destroy();
        }

        const grouped = groupBy(transactions, 'category');
        const categories = await Categories.getCategories();
        const isRtl = I18n.currentLang === 'he';

        const labels = [];
        const data = [];
        const colors = [
            '#4F46E5', '#10B981', '#F59E0B', '#EF4444', 
            '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
            '#F97316', '#6366F1', '#14B8A6', '#F43F5E'
        ];

        for (const category of categories) {
            const categoryTransactions = grouped[category.name] || [];
            const total = sumArray(categoryTransactions, 'amount');
            if (total > 0) {
                labels.push(`${category.icon} ${category.name}`);
                data.push(total);
            }
        }

        const uncategorized = grouped[''] || [];
        if (uncategorized.length > 0) {
            labels.push(t('noCategory'));
            data.push(sumArray(uncategorized, 'amount'));
        }

        const ctx = canvas.getContext('2d');
        this.pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: isRtl ? 'right' : 'left',
                        rtl: isRtl,
                        labels: {
                            font: {
                                family: isRtl ? 'Heebo' : 'inherit',
                                size: 11
                            },
                            padding: 8
                        }
                    },
                    tooltip: {
                        rtl: isRtl,
                        callbacks: {
                            label: function(context) {
                                return formatCurrency(context.raw);
                            }
                        }
                    }
                }
            }
        });
        } catch (e) { console.error('Pie chart error:', e); }
    },

    async renderBarChart(allTransactions, year) {
        const canvas = document.getElementById('monthly-bar-chart');
        if (!canvas) return;
        if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded'); return; }

        try {
        if (this.barChart) {
            this.barChart.destroy();
        }

        const isRtl = I18n.currentLang === 'he';
        const monthlyData = [];
        const labels = [];

        for (let m = 1; m <= 12; m++) {
            const monthTransactions = allTransactions.filter(t => t.month === m && t.year === year);
            monthlyData.push(sumArray(monthTransactions, 'amount'));
            labels.push(getMonthName(m));
        }

        const ctx = canvas.getContext('2d');
        this.barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: t('expenses'),
                    data: monthlyData,
                    backgroundColor: '#4F46E5',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        rtl: isRtl,
                        callbacks: {
                            label: function(context) {
                                return formatCurrency(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₪' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
        } catch (e) { console.error('Bar chart error:', e); }
    }
};
