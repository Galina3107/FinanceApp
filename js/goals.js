// Goals Module

const Goals = {
    goals: [],

    async init() {
        await this.loadGoals();
        await this.render();
        this.bindEvents();
    },

    async loadGoals() {
        this.goals = await Database.getAll(STORES.GOALS);
    },

    async render() {
        const container = document.getElementById('goals-list');
        if (!container) return;

        container.innerHTML = '';

        if (this.goals.length === 0) {
            container.innerHTML = `
                <div class="empty-state card">
                    <span>🎯</span>
                    <p>${t('noGoals')}</p>
                    <p>${t('addFirstGoal')}</p>
                </div>
            `;
            return;
        }

        this.goals.forEach(goal => {
            const card = this.createGoalCard(goal);
            container.appendChild(card);
        });
    },

    createGoalCard(goal) {
        const card = createElement('div', { className: 'card goal-card' });
        
        const progress = calculatePercentage(goal.current, goal.target);
        const remaining = Math.max(0, goal.target - goal.current);

        card.innerHTML = `
            <div class="goal-header">
                <div class="goal-info">
                    <span class="goal-icon">${goal.icon || '🎯'}</span>
                    <div class="goal-details">
                        <h4>${goal.name}</h4>
                        <span class="goal-deadline">${goal.deadline ? `${t('targetDate')}: ${formatDate(goal.deadline)}` : t('noDeadline')}</span>
                    </div>
                </div>
                <div class="goal-actions">
                    <button class="btn-icon edit-goal" data-id="${goal.id}" title="${t('edit')}">✏️</button>
                    <button class="btn-icon delete-goal" data-id="${goal.id}" title="${t('delete')}">🗑️</button>
                </div>
            </div>
            <div class="goal-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(100, progress)}%"></div>
                </div>
                <div class="progress-info">
                    <span>${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}</span>
                    <span>${progress}%</span>
                </div>
            </div>
            <div class="goal-footer">
                <span class="remaining">${t('remaining')}: ${formatCurrency(remaining)}</span>
                <button class="btn btn-sm btn-success add-to-goal" data-id="${goal.id}">+ ${t('addToSavings')}</button>
            </div>
        `;

        return card;
    },

    bindEvents() {
        // Add goal button
        document.getElementById('add-goal-btn')?.addEventListener('click', () => {
            this.showGoalModal();
        });

        // Delegate events for goal cards
        document.getElementById('goals-list')?.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-goal');
            const deleteBtn = e.target.closest('.delete-goal');
            const addBtn = e.target.closest('.add-to-goal');

            if (editBtn) {
                const id = parseInt(editBtn.dataset.id);
                const goal = this.goals.find(g => g.id === id);
                if (goal) this.showGoalModal(goal);
            }

            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id);
                if (await confirmDialog(t('deleteGoal'), t('deleteGoalConfirm'))) {
                    await Database.delete(STORES.GOALS, id);
                    await this.loadGoals();
                    await this.render();
                    showToast(t('goalDeleted'));
                }
            }

            if (addBtn) {
                const id = parseInt(addBtn.dataset.id);
                const goal = this.goals.find(g => g.id === id);
                if (goal) this.showAddSavingsModal(goal);
            }
        });
    },

    showGoalModal(goal = null) {
        const isEdit = goal !== null;
        const title = isEdit ? t('editGoal') : t('addGoal');

        const form = `
            <div class="form-group">
                <label>${t('goalName')}</label>
                <input type="text" id="goal-name" value="${goal?.name || ''}" required>
            </div>
            <div class="form-group">
                <label>${t('icon')}</label>
                <input type="text" id="goal-icon" value="${goal?.icon || '🎯'}" maxlength="2">
            </div>
            <div class="form-group">
                <label>${t('targetAmount')}</label>
                <input type="number" id="goal-target" value="${goal?.target || ''}" required min="1">
            </div>
            <div class="form-group">
                <label>${t('currentAmount')}</label>
                <input type="number" id="goal-current" value="${goal?.current || 0}" min="0">
            </div>
            <div class="form-group">
                <label>${t('targetDate')}</label>
                <input type="date" id="goal-deadline" value="${goal?.deadline || ''}">
            </div>
        `;

        Modal.show(title, form, async () => {
            const name = document.getElementById('goal-name').value.trim();
            const icon = document.getElementById('goal-icon').value.trim() || '🎯';
            const target = parseFloat(document.getElementById('goal-target').value) || 0;
            const current = parseFloat(document.getElementById('goal-current').value) || 0;
            const deadline = document.getElementById('goal-deadline').value || null;

            if (!name || target <= 0) {
                showToast(t('fillNameAndTarget'));
                return;
            }

            if (isEdit) {
                goal.name = name;
                goal.icon = icon;
                goal.target = target;
                goal.current = current;
                goal.deadline = deadline;
                await Database.update(STORES.GOALS, goal);
                showToast(t('goalSaved'));
            } else {
                await Database.add(STORES.GOALS, {
                    name,
                    icon,
                    target,
                    current,
                    deadline
                });
                showToast(t('goalAdded'));
            }

            await this.loadGoals();
            await this.render();
        });
    },

    showAddSavingsModal(goal) {
        const form = `
            <p>${t('goal')}: <strong>${goal.name}</strong></p>
            <p>${t('currentBalance')}: ${formatCurrency(goal.current)}</p>
            <p>${t('targetDate')}: ${formatCurrency(goal.target)}</p>
            <hr>
            <div class="form-group">
                <label>${t('amountToAdd')}</label>
                <input type="number" id="add-amount" min="1" required>
            </div>
        `;

        Modal.show(t('addToSavingsTitle'), form, async () => {
            const amount = parseFloat(document.getElementById('add-amount').value) || 0;
            
            if (amount <= 0) {
                showToast(t('enterPositiveAmount'));
                return;
            }

            goal.current += amount;
            await Database.update(STORES.GOALS, goal);
            await this.loadGoals();
            await this.render();
            
            if (goal.current >= goal.target) {
                showToast(t('goalReached'));
            } else {
                showToast(`${t('addedToSavings')} ${formatCurrency(amount)}`);
            }
        });
    }
};
