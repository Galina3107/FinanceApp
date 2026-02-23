// Categories Module

const Categories = {
    categories: [],
    editMode: false,
    selectedMonth: null,
    selectedYear: null,

    async init() {
        this.selectedMonth = getCurrentMonth();
        this.selectedYear = getCurrentYear();
        populateDateSelectors('categories-month', 'categories-year');
        await this.loadCategories();
        await this.render();
        this.bindEvents();
    },

    async loadCategories() {
        this.categories = await Database.getAll(STORES.CATEGORIES);
        this.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    async getCategories() {
        if (this.categories.length === 0) {
            await this.loadCategories();
        }
        return this.categories;
    },

    getCategoryByName(name) {
        return this.categories.find(c => c.name === name);
    },

    async addCategory(category) {
        category.order = this.categories.length;
        const id = await Database.add(STORES.CATEGORIES, category);
        category.id = id;
        this.categories.push(category);
        return id;
    },

    async updateCategory(category) {
        await Database.update(STORES.CATEGORIES, category);
        const index = this.categories.findIndex(c => c.id === category.id);
        if (index !== -1) {
            this.categories[index] = category;
        }
    },

    async deleteCategory(id) {
        await Database.delete(STORES.CATEGORIES, id);
        this.categories = this.categories.filter(c => c.id !== id);
        await this.reorderCategories();
    },

    async reorderCategories() {
        for (let i = 0; i < this.categories.length; i++) {
            this.categories[i].order = i;
            await Database.update(STORES.CATEGORIES, this.categories[i]);
        }
    },

    async moveCategory(id, direction) {
        const index = this.categories.findIndex(c => c.id === id);
        if (index === -1) return;
        
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.categories.length) return;
        
        [this.categories[index], this.categories[newIndex]] = [this.categories[newIndex], this.categories[index]];
        
        await this.reorderCategories();
        await this.render();
        showToast(t('orderUpdated'));
    },

    commonIcons: [
        '🍎', '🛒', '🍕', '☕', '🍺', '🍔',
        '🚗', '🚌', '⛽', '✈️', '🚕', '🚲',
        '🏠', '🏢', '🔧', '💡', '🚿', '🛋️',
        '🏥', '💊', '🏃', '💪', '🧘', '🦷',
        '🎬', '🎮', '🎵', '🎭', '🎨', '📺',
        '🛍️', '👕', '👟', '💄', '💎', '🎁',
        '📚', '🎓', '💻', '📱', '🖥️', '📷',
        '💰', '💳', '🏦', '📈', '💵', '🧾',
        '👶', '🐕', '🌳', '🏋️', '🎂', '📌'
    ],
    
    getIconOptionsHtml() {
        return this.commonIcons.map(icon => 
            `<button type="button" class="inline-icon-option" data-icon="${icon}">${icon}</button>`
        ).join('');
    },

    renderCategoryOptions(selectElement, selectedCategory = '') {
        selectElement.innerHTML = `<option value="">${t('selectCategory')}</option>`;
        this.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = `${cat.icon} ${cat.name}`;
            if (cat.name === selectedCategory) option.selected = true;
            selectElement.appendChild(option);
        });
    },

    renderSubcategoryOptions(selectElement, categoryName, selectedSubcategory = '') {
        selectElement.innerHTML = `<option value="">${t('selectSubcategory')}</option>`;
        const category = this.getCategoryByName(categoryName);
        if (category && category.subcategories) {
            category.subcategories.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub;
                option.textContent = sub;
                if (sub === selectedSubcategory) option.selected = true;
                selectElement.appendChild(option);
            });
        }
    },

    async render() {
        const container = document.getElementById('categories-list');
        if (!container) return;

        const month = parseInt(document.getElementById('categories-month')?.value) || this.selectedMonth;
        const year = parseInt(document.getElementById('categories-year')?.value) || this.selectedYear;
        this.selectedMonth = month;
        this.selectedYear = year;

        container.innerHTML = '';

        let categoryExpenses = {};
        if (!this.editMode) {
            const transactions = await Database.getAll(STORES.TRANSACTIONS);
            const filteredTransactions = transactions.filter(t => t.month === month && t.year === year);
            filteredTransactions.forEach(tr => {
                if (!tr.category) return;
                if (!categoryExpenses[tr.category]) {
                    categoryExpenses[tr.category] = { total: 0, subcategories: {} };
                }
                categoryExpenses[tr.category].total += tr.amount;
                
                const subName = tr.subcategory || t('noSubcategory');
                if (!categoryExpenses[tr.category].subcategories[subName]) {
                    categoryExpenses[tr.category].subcategories[subName] = 0;
                }
                categoryExpenses[tr.category].subcategories[subName] += tr.amount;
            });
        }

        this.categories.forEach((category, index) => {
            const expenses = categoryExpenses[category.name] || { total: 0, subcategories: {} };
            const card = this.createCategoryCard(category, expenses, index);
            container.appendChild(card);
        });
    },

    createCategoryCard(category, expenses = { total: 0, subcategories: {} }, index = 0) {
        const card = createElement('div', { className: 'category-card' });
        card.dataset.id = category.id;

        const header = createElement('div', { className: 'category-header' });
        
        const isFirst = index === 0;
        const isLast = index === this.categories.length - 1;
        
        if (this.editMode) {
            header.innerHTML = `
                <div class="reorder-buttons">
                    <button class="btn-icon move-up" data-id="${category.id}" title="${t('moveUp')}" ${isFirst ? 'disabled' : ''}>⬆️</button>
                    <button class="btn-icon move-down" data-id="${category.id}" title="${t('moveDown')}" ${isLast ? 'disabled' : ''}>⬇️</button>
                </div>
                <div class="edit-category-inline">
                    <div class="inline-icon-picker">
                        <button type="button" class="icon-picker-btn" data-id="${category.id}" title="${t('icon')}">${category.icon}</button>
                        <input type="hidden" class="edit-icon-input" value="${category.icon}" data-id="${category.id}">
                        <div class="inline-icon-dropdown" style="display: none;">
                            ${this.getIconOptionsHtml()}
                        </div>
                    </div>
                    <input type="text" class="edit-name-input" value="${category.name}" data-id="${category.id}">
                    <div class="action-buttons">
                        <button class="btn-icon save-category-inline" data-id="${category.id}" title="${t('save')}">✔️</button>
                        <button class="btn-icon delete-category" data-id="${category.id}" title="${t('delete')}">🗑️</button>
                    </div>
                </div>
                <span class="expand-icon">▼</span>
            `;
        } else {
            header.innerHTML = `
                <h4>${category.icon} ${category.name}</h4>
                <div class="category-expense-info">
                    <span class="category-amount">${formatCurrency(expenses.total)}</span>
                    <span class="expand-icon">▼</span>
                </div>
            `;
        }

        const content = createElement('div', { className: 'category-content' });

        let subcategoriesHtml;
        if (this.editMode) {
            subcategoriesHtml = category.subcategories
                .map((sub, idx) => `
                    <div class="subcategory-item" data-category-id="${category.id}" data-category-name="${category.name}" data-subcategory="${sub}" data-index="${idx}">
                        <input type="text" class="edit-subcategory-input" value="${sub}" data-category-id="${category.id}" data-index="${idx}">
                        <div class="action-buttons">
                            <button class="btn-icon save-subcategory-inline" data-category-id="${category.id}" data-index="${idx}" title="${t('save')}">✔️</button>
                            <button class="btn-icon delete-subcategory" title="${t('delete')}">🗑️</button>
                        </div>
                    </div>
                `).join('');
            
            content.innerHTML = `
                <div class="subcategories-list">${subcategoriesHtml}</div>
                <button class="btn btn-sm btn-secondary add-subcategory" data-id="${category.id}">${t('addSubcategory')}</button>
            `;
        } else {
            subcategoriesHtml = category.subcategories
                .map((sub) => {
                    const subAmount = expenses.subcategories[sub] || 0;
                    return `
                        <div class="subcategory-item view-mode" data-category-id="${category.id}" data-category-name="${category.name}" data-subcategory="${sub}">
                            <span class="subcategory-name" title="${t('viewTransactions')}">${sub}</span>
                            <span class="subcategory-amount">${formatCurrency(subAmount)}</span>
                        </div>
                    `;
                }).join('');
            
            const noSubAmount = expenses.subcategories[t('noSubcategory')] || 0;
            if (noSubAmount > 0) {
                subcategoriesHtml += `
                    <div class="subcategory-item view-mode no-sub" data-category-id="${category.id}" data-category-name="${category.name}" data-subcategory="${t('noSubcategory')}">
                        <span class="subcategory-name" title="${t('viewTransactions')}">${t('noSubcategory')}</span>
                        <span class="subcategory-amount">${formatCurrency(noSubAmount)}</span>
                    </div>
                `;
            }
            
            content.innerHTML = `<div class="subcategories-list">${subcategoriesHtml || `<p class="empty-subcategories">${t('noSubcategories')}</p>`}</div>`;
        }

        header.addEventListener('click', (e) => {
            if (!e.target.closest('.action-buttons') && !e.target.closest('.edit-category-inline')) {
                content.classList.toggle('open');
                const icon = header.querySelector('.expand-icon');
                icon.textContent = content.classList.contains('open') ? '▲' : '▼';
            }
        });

        card.appendChild(header);
        card.appendChild(content);

        return card;
    },

    bindEvents() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.inline-icon-picker')) {
                document.querySelectorAll('.inline-icon-dropdown').forEach(d => {
                    d.style.display = 'none';
                });
            }
        });
        
        document.getElementById('categories-month')?.addEventListener('change', () => this.render());
        document.getElementById('categories-year')?.addEventListener('change', () => this.render());
        
        document.getElementById('modal-body')?.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.delete-modal-transaction');
            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id);
                if (await confirmDialog(t('deleteTransaction'), t('deleteTransactionConfirm'))) {
                    await Database.delete(STORES.TRANSACTIONS, id);
                    const row = document.querySelector(`#modal-transactions-table tr[data-id="${id}"]`);
                    if (row) row.remove();
                    const remainingRows = document.querySelectorAll('#modal-transactions-table tbody tr');
                    const countEl = document.getElementById('modal-transactions-count');
                    if (countEl) countEl.textContent = remainingRows.length;
                    let newTotal = 0;
                    remainingRows.forEach(r => {
                        const amountText = r.querySelector('td:nth-child(3)').textContent;
                        const amount = parseFloat(amountText.replace(/[^\d.-]/g, '')) || 0;
                        newTotal += amount;
                    });
                    const totalEl = document.getElementById('modal-transactions-total');
                    if (totalEl) totalEl.textContent = formatCurrency(newTotal);
                    await Transactions.loadTransactions();
                    await this.render();
                    showToast(t('transactionDeleted'));
                }
            }
        });
        
        document.getElementById('add-category-btn')?.addEventListener('click', () => {
            this.showCategoryModal();
        });

        // Initially hide add-category button (only visible in edit mode)
        const addCatBtn = document.getElementById('add-category-btn');
        if (addCatBtn) addCatBtn.style.display = 'none';

        document.getElementById('edit-mode-btn')?.addEventListener('click', async () => {
            this.editMode = !this.editMode;
            const btn = document.getElementById('edit-mode-btn');
            const addCatBtn = document.getElementById('add-category-btn');
            if (this.editMode) {
                btn.textContent = `✅ ${t('finishEdit')}`;
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-success');
                if (addCatBtn) addCatBtn.style.display = '';
                showToast(t('editModeOn'));
            } else {
                btn.textContent = t('editMode');
                btn.classList.remove('btn-success');
                btn.classList.add('btn-secondary');
                if (addCatBtn) addCatBtn.style.display = 'none';
            }
            await this.render();
        });

        document.getElementById('categories-list')?.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-category');
            const deleteBtn = e.target.closest('.delete-category');
            const addSubBtn = e.target.closest('.add-subcategory');
            const editSubBtn = e.target.closest('.edit-subcategory');
            const deleteSubBtn = e.target.closest('.delete-subcategory');
            const saveCategoryBtn = e.target.closest('.save-category-inline');
            const saveSubcategoryBtn = e.target.closest('.save-subcategory-inline');
            const moveUpBtn = e.target.closest('.move-up');
            const moveDownBtn = e.target.closest('.move-down');
            const iconPickerBtn = e.target.closest('.icon-picker-btn');
            const inlineIconOption = e.target.closest('.inline-icon-option');

            if (iconPickerBtn) {
                e.stopPropagation();
                const picker = iconPickerBtn.closest('.inline-icon-picker');
                const dropdown = picker.querySelector('.inline-icon-dropdown');
                document.querySelectorAll('.inline-icon-dropdown').forEach(d => {
                    if (d !== dropdown) d.style.display = 'none';
                });
                dropdown.style.display = dropdown.style.display === 'none' ? 'grid' : 'none';
                return;
            }

            if (inlineIconOption) {
                e.stopPropagation();
                const icon = inlineIconOption.dataset.icon;
                const picker = inlineIconOption.closest('.inline-icon-picker');
                const btn = picker.querySelector('.icon-picker-btn');
                const input = picker.querySelector('.edit-icon-input');
                const dropdown = picker.querySelector('.inline-icon-dropdown');
                
                btn.textContent = icon;
                input.value = icon;
                dropdown.style.display = 'none';
                return;
            }

            if (moveUpBtn && !moveUpBtn.disabled) {
                e.stopPropagation();
                const id = parseInt(moveUpBtn.dataset.id);
                await this.moveCategory(id, 'up');
                return;
            }

            if (moveDownBtn && !moveDownBtn.disabled) {
                e.stopPropagation();
                const id = parseInt(moveDownBtn.dataset.id);
                await this.moveCategory(id, 'down');
                return;
            }

            if (deleteBtn) {
                e.stopPropagation();
                const id = parseInt(deleteBtn.dataset.id);
                const category = this.categories.find(c => c.id === id);
                const categoryName = category ? category.name : '';
                if (await confirmDialog(t('deleteCategory'), `${t('deleteCategoryConfirm')} "${categoryName}"?`)) {
                    await this.deleteCategory(id);
                    await this.render();
                    showToast(t('categoryDeleted'));
                }
                return;
            }

            if (deleteSubBtn) {
                e.stopPropagation();
                const item = e.target.closest('.subcategory-item');
                if (!item) return;
                const categoryId = parseInt(item.dataset.categoryId);
                const idx = parseInt(item.dataset.index);
                const category = this.categories.find(c => c.id === categoryId);
                if (!category) return;
                const subName = category.subcategories[idx] || '';

                if (await confirmDialog(t('deleteSubcategoryTitle'), `${t('deleteSubcategoryConfirm')} "${subName}"?`)) {
                    category.subcategories.splice(idx, 1);
                    await this.updateCategory(category);
                    await this.render();
                    showToast(t('subcategoryDeleted'));
                }
                return;
            }

            if (saveCategoryBtn) {
                const id = parseInt(saveCategoryBtn.dataset.id);
                const category = this.categories.find(c => c.id === id);
                if (category) {
                    const card = saveCategoryBtn.closest('.category-card');
                    const iconInput = card.querySelector('.edit-icon-input');
                    const nameInput = card.querySelector('.edit-name-input');
                    
                    const newIcon = iconInput.value.trim() || '📁';
                    const newName = nameInput.value.trim();
                    
                    if (!newName) {
                        showToast(t('enterCategoryName'));
                        return;
                    }
                    
                    category.icon = newIcon;
                    category.name = newName;
                    await this.updateCategory(category);
                    showToast(t('categorySaved'));
                }
                return;
            }

            if (saveSubcategoryBtn) {
                const categoryId = parseInt(saveSubcategoryBtn.dataset.categoryId);
                const idx = parseInt(saveSubcategoryBtn.dataset.index);
                const category = this.categories.find(c => c.id === categoryId);
                if (category) {
                    const item = saveSubcategoryBtn.closest('.subcategory-item');
                    const input = item.querySelector('.edit-subcategory-input');
                    const newName = input.value.trim();
                    
                    if (!newName) {
                        showToast(t('enterSubcategoryName'));
                        return;
                    }
                    
                    category.subcategories[idx] = newName;
                    await this.updateCategory(category);
                    showToast(t('subcategorySaved'));
                }
                return;
            }

            if (editBtn) {
                const id = parseInt(editBtn.dataset.id);
                const category = this.categories.find(c => c.id === id);
                if (category) this.showCategoryModal(category);
            }

            if (addSubBtn) {
                e.stopPropagation();
                const id = parseInt(addSubBtn.dataset.id);
                const category = this.categories.find(c => c.id === id);
                if (category) this.showSubcategoryModal(category);
                return;
            }

            if (editSubBtn) {
                const item = e.target.closest('.subcategory-item');
                const categoryId = parseInt(item.dataset.categoryId);
                const idx = parseInt(item.dataset.index);
                const category = this.categories.find(c => c.id === categoryId);
                if (category) {
                    this.showSubcategoryModal(category, idx);
                }
            }

            const subcategoryName = e.target.closest('.subcategory-name');
            if (subcategoryName) {
                const item = subcategoryName.closest('.subcategory-item');
                const categoryName = item.dataset.categoryName;
                const subcategory = item.dataset.subcategory;
                await this.showSubcategoryTransactions(categoryName, subcategory);
            }

            const viewModeItem = e.target.closest('.subcategory-item.view-mode');
            if (viewModeItem && !e.target.closest('.subcategory-name')) {
                const categoryName = viewModeItem.dataset.categoryName;
                const subcategory = viewModeItem.dataset.subcategory;
                if (subcategory) {
                    await this.showSubcategoryTransactions(categoryName, subcategory);
                }
            }
        });

        populateDateSelectors('cat-summary-month', 'cat-summary-year');
        document.getElementById('cat-summary-month')?.addEventListener('change', () => this.renderSummary());
        document.getElementById('cat-summary-year')?.addEventListener('change', () => this.renderSummary());
    },

    showCategoryModal(category = null) {
        const isEdit = category !== null;
        const title = isEdit ? t('editCategory') : t('addCategory');

        const form = `
            <div class="form-group">
                <label>${t('categoryName')}</label>
                <input type="text" id="category-name" value="${category?.name || ''}" required>
            </div>
            <div class="form-group">
                <label>${t('icon')}</label>
                <div class="icon-picker-container">
                    <input type="text" id="category-icon" value="${category?.icon || '📁'}" maxlength="2" class="icon-input">
                    <div class="icon-picker-grid">
                        ${this.commonIcons.map(icon => `
                            <button type="button" class="icon-option" data-icon="${icon}">${icon}</button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        Modal.show(title, form, async () => {
            const name = document.getElementById('category-name').value.trim();
            const icon = document.getElementById('category-icon').value.trim() || '📁';

            if (!name) {
                showToast(t('enterCategoryName'));
                return;
            }

            if (isEdit) {
                category.name = name;
                category.icon = icon;
                await this.updateCategory(category);
                showToast(t('categorySaved'));
            } else {
                await this.addCategory({
                    name,
                    icon,
                    subcategories: []
                });
                showToast(t('categoryAdded'));
            }

            await this.render();
        });
        
        setTimeout(() => {
            document.querySelectorAll('.icon-option').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const icon = btn.dataset.icon;
                    document.getElementById('category-icon').value = icon;
                    document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                });
            });
            const currentIcon = category?.icon || '📁';
            const currentBtn = document.querySelector(`.icon-option[data-icon="${currentIcon}"]`);
            if (currentBtn) currentBtn.classList.add('selected');
        }, 100);
    },

    showSubcategoryModal(category, editIndex = null) {
        const isEdit = editIndex !== null;
        const title = isEdit ? t('editSubcategory') : t('newSubcategory');
        const currentValue = isEdit ? category.subcategories[editIndex] : '';

        const form = `
            <div class="form-group">
                <label>${t('subcategoryName')}</label>
                <input type="text" id="subcategory-name" value="${currentValue}" required>
            </div>
        `;

        Modal.show(title, form, async () => {
            const name = document.getElementById('subcategory-name').value.trim();

            if (!name) {
                showToast(t('enterSubcategoryName'));
                return;
            }

            if (isEdit) {
                category.subcategories[editIndex] = name;
            } else {
                category.subcategories.push(name);
            }

            await this.updateCategory(category);
            await this.render();
            showToast(isEdit ? t('subcategorySaved') : t('subcategoryAdded'));
        });
    },

    async renderSummary() {
        const container = document.getElementById('category-summary');
        if (!container) return;

        const month = parseInt(document.getElementById('cat-summary-month')?.value);
        const year = parseInt(document.getElementById('cat-summary-year')?.value);

        const transactions = await Database.getAll(STORES.TRANSACTIONS);
        const filteredTransactions = transactions.filter(tr => tr.month === month && tr.year === year);

        const grouped = groupBy(filteredTransactions, 'category');
        const totalExpenses = sumArray(filteredTransactions, 'amount');

        let html = '<div class="category-summary-list">';

        for (const category of this.categories) {
            const categoryTransactions = grouped[category.name] || [];
            const categoryTotal = sumArray(categoryTransactions, 'amount');
            const percentage = calculatePercentage(categoryTotal, totalExpenses);

            const subGrouped = groupBy(categoryTransactions, 'subcategory');

            html += `
                <div class="category-breakdown-item">
                    <div class="breakdown-header" onclick="this.nextElementSibling.classList.toggle('open')">
                        <span>${category.icon} ${category.name}</span>
                        <span>${formatCurrency(categoryTotal)} (${percentage}%)</span>
                    </div>
                    <div class="breakdown-content">
            `;

            for (const [subName, subTransactions] of Object.entries(subGrouped)) {
                const subTotal = sumArray(subTransactions, 'amount');
                html += `
                    <div class="subcategory-row">
                        <span>${subName || t('noSubcategory')}</span>
                        <span>${formatCurrency(subTotal)}</span>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>';
        html += `<div class="total-row"><strong>${t('total')}:</strong> <span>${formatCurrency(totalExpenses)}</span></div>`;

        container.innerHTML = html;
    },

    async showSubcategoryTransactions(categoryName, subcategoryName) {
        const transactions = await Database.getAll(STORES.TRANSACTIONS);
        const month = this.selectedMonth;
        const year = this.selectedYear;
        
        const isNoSub = subcategoryName === t('noSubcategory');
        const filtered = transactions.filter(tr => {
            if (tr.category !== categoryName) return false;
            if (tr.month !== month || tr.year !== year) return false;
            if (isNoSub) {
                return !tr.subcategory || tr.subcategory === '';
            }
            return tr.subcategory === subcategoryName;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        const category = this.getCategoryByName(categoryName);
        const icon = category?.icon || '📁';

        let html = `
            <div class="subcategory-transactions-info">
                <p><strong>${t('category')}:</strong> ${icon} ${categoryName}</p>
                <p><strong>${t('subcategory')}:</strong> ${subcategoryName}</p>
                <p><strong>${t('monthLabel')}:</strong> ${getMonthName(month)} ${year}</p>
                <p><strong>${t('totalOps')} ${t('operations')}:</strong> <span id="modal-transactions-count">${filtered.length}</span></p>
                <p><strong>${t('total')} ${t('amount')}:</strong> <span id="modal-transactions-total">${formatCurrency(sumArray(filtered, 'amount'))}</span></p>
            </div>
        `;

        if (filtered.length === 0) {
            html += `<div class="empty-state"><span>📭</span><p>${t('noTransactions')}</p></div>`;
        } else {
            html += `
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table class="subcategory-transactions-table" id="modal-transactions-table">
                        <thead>
                            <tr>
                                <th>${t('date')}</th>
                                <th>${t('description')}</th>
                                <th>${t('amount')}</th>
                                <th>${t('comment')}</th>
                                <th>${t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            filtered.forEach(tr => {
                html += `
                    <tr data-id="${tr.id}">
                        <td>${formatDate(tr.date)}</td>
                        <td>${tr.description}</td>
                        <td>${formatCurrency(tr.amount)}</td>
                        <td>${tr.comment || '-'}</td>
                        <td><button class="btn-icon delete-modal-transaction" data-id="${tr.id}" title="${t('delete')}">🗑️</button></td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        Modal.show(`${t('operations')}: ${subcategoryName}`, html, null, t('confirm'), t('close'), true);
    }
};
