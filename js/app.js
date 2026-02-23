// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    });
}

// Main Application

const App = {
    currentPage: 'dashboard',

    async init() {
        try {
            // Initialize database
            await Database.init();
            
            // Initialize i18n (must be after DB, before other modules)
            await I18n.init();
            
            // Initialize modal
            Modal.init();
            
            // Security gate: if PIN is set, lock app and wait for unlock
            // This ensures the crypto key is derived BEFORE any encrypted data is read
            await Security.checkLock();
            
            // Initialize default categories if none exist
            await this.initDefaultCategories();
            
            // Initialize all modules (crypto key is now available if needed)
            await Categories.init();
            await Transactions.init();
            await Goals.init();
            await FutureExpenses.init();
            await Income.init();
            await Budget.init();
            await Dashboard.init();
            await Settings.init();
            
            // Setup post-unlock security (auto-lock, blur, timers)
            await Security.initPostUnlock();
            
            // Setup navigation
            this.setupNavigation();
            
            // Setup language switcher
            this.setupLanguageSwitcher();
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Error initializing app:', error);
            showToast(t('initError'));
        }
    },

    async initDefaultCategories() {
        const categories = await Database.getAll(STORES.CATEGORIES);
        
        if (categories.length === 0) {
            const defaultCategories = [
                { name: 'מזון', icon: '🍎', subcategories: ['סופר', 'מסעדות', 'קפה'], order: 0 },
                { name: 'תחבורה', icon: '🚗', subcategories: ['דלק', 'תחזוקה', 'תחבורה ציבורית', 'חניה'], order: 1 },
                { name: 'דיור', icon: '🏠', subcategories: ['שכר דירה', 'ארנונה', 'חשמל', 'מים', 'גז', 'ועד בית'], order: 2 },
                { name: 'בריאות', icon: '🏥', subcategories: ['ביטוח בריאות', 'תרופות', 'רופאים'], order: 3 },
                { name: 'בילויים', icon: '🎬', subcategories: ['סרטים', 'מופעים', 'יציאות', 'חופשות'], order: 4 },
                { name: 'קניות', icon: '🛍️', subcategories: ['ביגוד', 'מוצרי חשמל', 'ריהוט'], order: 5 },
                { name: 'חינוך', icon: '📚', subcategories: ['שכר לימוד', 'ספרים', 'קורסים'], order: 6 },
                { name: 'תקשורת', icon: '📱', subcategories: ['סלולר', 'אינטרנט', 'טלוויזיה'], order: 7 },
                { name: 'אחר', icon: '📌', subcategories: ['שונות'], order: 8 }
            ];

            for (const cat of defaultCategories) {
                await Database.add(STORES.CATEGORIES, cat);
            }
        }
    },

    setupNavigation() {
        // Tab items and sidebar nav items
        const navItems = document.querySelectorAll('.nav-item[data-page]');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        // Hamburger menu items
        const hamburgerItems = document.querySelectorAll('.hamburger-item[data-page]');
        hamburgerItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.closeHamburger();
                this.navigateTo(page);
            });
        });

        // Hamburger open/close
        document.getElementById('hamburger-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openHamburger();
        });
        document.getElementById('hamburger-close')?.addEventListener('click', () => {
            this.closeHamburger();
        });
        document.getElementById('hamburger-overlay')?.addEventListener('click', () => {
            this.closeHamburger();
        });
    },

    openHamburger() {
        document.getElementById('hamburger-overlay')?.classList.add('show');
        document.getElementById('hamburger-menu')?.classList.add('show');
    },

    closeHamburger() {
        document.getElementById('hamburger-overlay')?.classList.remove('show');
        document.getElementById('hamburger-menu')?.classList.remove('show');
    },

    setupLanguageSwitcher() {
        document.getElementById('lang-he')?.addEventListener('click', async () => {
            await I18n.setLanguage('he');
            this.onLanguageChanged();
        });
        document.getElementById('lang-en')?.addEventListener('click', async () => {
            await I18n.setLanguage('en');
            this.onLanguageChanged();
        });
        // Highlight active language button
        this.updateLangButtons();
    },

    updateLangButtons() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === I18n.currentLang);
        });
    },

    async onLanguageChanged() {
        this.updateLangButtons();
        // Re-render all date selectors with translated month names
        populateDateSelectors('dashboard-month', 'dashboard-year');
        populateDateSelectors('transactions-month', 'transactions-year');
        populateDateSelectors('categories-month', 'categories-year');
        populateDateSelectors('budget-month', 'budget-year');
        // Re-render active page
        switch (this.currentPage) {
            case 'dashboard': await Dashboard.render(); break;
            case 'transactions': await Transactions.render(); break;
            case 'categories': await Categories.render(); break;
            case 'goals': await Goals.render(); break;
            case 'income': await Income.render(); break;
            case 'future': await FutureExpenses.render(); break;
            case 'budget': await Budget.render(); break;
        }
    },

    navigateTo(page) {
        // Update sidebar/tab navigation
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Update hamburger menu active state
        document.querySelectorAll('.hamburger-item[data-page]').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // If navigating to a hamburger-menu page on mobile, highlight the hamburger button
        const isMenuPage = ['upload', 'goals', 'income', 'future', 'settings'].includes(page);
        const hamburgerBtn = document.getElementById('hamburger-btn');
        if (hamburgerBtn) {
            hamburgerBtn.classList.toggle('active', isMenuPage);
        }

        // Update pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.toggle('active', p.id === `page-${page}`);
        });

        this.currentPage = page;

        // Refresh page data
        switch (page) {
            case 'dashboard': Dashboard.render(); break;
            case 'transactions': Transactions.render(); break;
            case 'categories': Categories.render(); break;
            case 'goals': Goals.render(); break;
            case 'income': Income.render(); break;
            case 'future': FutureExpenses.render(); break;
            case 'budget': Budget.render(); break;
            case 'settings': break;
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
