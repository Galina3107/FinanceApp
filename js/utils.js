// Utility Functions

// Format currency (Israeli Shekel)
function formatCurrency(amount) {
    const locale = I18n.currentLang === 'en' ? 'en-IL' : 'he-IL';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'ILS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const locale = I18n.currentLang === 'en' ? 'en-GB' : 'he-IL';
    return date.toLocaleDateString(locale);
}

// Parse Excel date (serial number to Date)
function parseExcelDate(serial) {
    if (typeof serial === 'string') {
        const parsed = new Date(serial);
        if (!isNaN(parsed)) return parsed;
    }
    const utc_days = Math.floor(serial - 25569);
    const date = new Date(utc_days * 86400 * 1000);
    return date;
}

// Get month name (i18n aware)
function getMonthName(month) {
    const months = I18n.getMonths();
    return months[month - 1];
}

// Get current month/year
function getCurrentMonth() {
    const now = new Date();
    return now.getMonth() + 1;
}

function getCurrentYear() {
    return new Date().getFullYear();
}

// Populate date selectors
function populateDateSelectors(monthId, yearId, startYear = 2020) {
    const monthSelect = document.getElementById(monthId);
    const yearSelect = document.getElementById(yearId);
    
    if (!monthSelect || !yearSelect) return;
    
    const currentMonth = getCurrentMonth();
    const currentYear = getCurrentYear();
    
    // Save current values before repopulating
    const savedMonth = monthSelect.value || currentMonth;
    const savedYear = yearSelect.value || currentYear;
    
    // Populate months
    monthSelect.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = getMonthName(m);
        if (m == savedMonth) option.selected = true;
        monthSelect.appendChild(option);
    }
    
    // Populate years
    yearSelect.innerHTML = '';
    for (let y = startYear; y <= currentYear + 1; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y == savedYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

// Create element helper
function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.attrs) {
        Object.entries(options.attrs).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });
    }
    return el;
}

// Group array by key
function groupBy(array, key) {
    return array.reduce((groups, item) => {
        const value = item[key] || t('noCategory');
        (groups[value] = groups[value] || []).push(item);
        return groups;
    }, {});
}

// Sum array by property
function sumArray(array, property) {
    return array.reduce((sum, item) => sum + (item[property] || 0), 0);
}

// Calculate percentage
function calculatePercentage(part, total) {
    if (total === 0) return 0;
    return Math.round((part / total) * 100);
}

// Show toast notification
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// Modal helper
const Modal = {
    show(title, content, onConfirm, confirmText, cancelText, hideConfirmBtn = false) {
        confirmText = confirmText || t('confirm');
        cancelText = cancelText || t('cancel');
        
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal-confirm').textContent = confirmText;
        document.getElementById('modal-cancel').textContent = cancelText;
        document.getElementById('modal-overlay').classList.add('show');
        
        const confirmBtn = document.getElementById('modal-confirm');
        if (hideConfirmBtn) {
            confirmBtn.style.display = 'none';
        } else {
            confirmBtn.style.display = '';
        }
        
        this._onConfirm = onConfirm;
    },
    
    hide() {
        document.getElementById('modal-overlay').classList.remove('show');
    },
    
    init() {
        document.getElementById('modal-close').addEventListener('click', () => this.hide());
        document.getElementById('modal-cancel').addEventListener('click', () => this.hide());
        document.getElementById('modal-confirm').addEventListener('click', async () => {
            if (this._onConfirm) {
                await this._onConfirm();
            }
            this.hide();
        });
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') this.hide();
        });
    }
};

// Confirm dialog
function confirmDialog(title, message) {
    return new Promise((resolve) => {
        let resolved = false;
        
        const doResolve = (value) => {
            if (resolved) return;
            resolved = true;
            resolve(value);
            // Re-initialize Modal listeners since we replaced button elements
            setTimeout(() => Modal.init(), 0);
        };
        
        Modal.show(title, `<p>${message}</p>`, () => {
            doResolve(true);
        }, t('confirm'), t('cancel'));
        
        // Override cancel/close to resolve false instead of just hiding
        const cancelBtn = document.getElementById('modal-cancel');
        const closeBtn = document.getElementById('modal-close');
        const overlay = document.getElementById('modal-overlay');
        
        const handleCancel = (e) => {
            if (e) e.stopImmediatePropagation();
            doResolve(false);
            Modal.hide();
        };
        
        // Clone and replace to remove old event listeners
        const newCancel = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        newCancel.addEventListener('click', handleCancel);
        
        const newClose = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newClose.addEventListener('click', handleCancel);
        
        // Clone and replace confirm button too
        const confirmBtn = document.getElementById('modal-confirm');
        const newConfirm = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        newConfirm.addEventListener('click', () => {
            doResolve(true);
            Modal.hide();
        });
        
        // Handle overlay click
        const overlayHandler = (e) => {
            if (e.target.id === 'modal-overlay') {
                handleCancel(e);
            }
        };
        overlay.addEventListener('click', overlayHandler, { once: true });
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export to Excel
async function exportToExcel(data, filename) {
    if (typeof XLSX === 'undefined') {
        showToast(t('excelNotLoaded'));
        return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, filename);
}
