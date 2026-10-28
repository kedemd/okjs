export default {
    tag: 'app-ok',
    plugins: {
        theme: {
            expose: {
                '--bg-color': { type: 'color', category: 'Colors', default: '#f8fafc' },
                '--surface-color': { type: 'color', category: 'Colors', default: '#ffffff' },
                '--text-primary': { type: 'color', category: 'Colors', default: '#0f172a' },
                '--text-secondary': { type: 'color', category: 'Colors', default: '#64748b' },
                '--border-color': { type: 'color', category: 'Colors', default: '#e2e8f0' },
                '--primary-color': { type: 'color', category: 'Colors', default: '#3b82f6' },
                '--primary-hover': { type: 'color', category: 'Colors', default: '#2563eb' },
                '--ring-color': { type: 'color', category: 'Colors', default: 'rgba(59, 130, 246, 0.5)' },
                '--header-bg': { type: 'color', category: 'Colors', default: 'rgba(255, 255, 255, 0.8)' },
                '--header-border': { type: 'color', category: 'Colors', default: '#e2e8f0' }
            }
        }
    },
    context(scope) {
        let saved = 'default';
        try { saved = localStorage.getItem('theme') || 'default'; } catch {}
        return {
            theme: saved,
            toggleTheme() {
                this.theme = this.theme === 'default' ? 'dark' : 'default';
                try { localStorage.setItem('theme', this.theme); } catch {}
                this.applyTheme();
            },
            applyTheme() {
                if (scope.$ok.shared?.theme) {
                    if (this.theme === 'dark') {
                        scope.$ok.shared.theme.apply(document.documentElement, 'dark');
                    } else {
                        scope.$ok.shared.theme.reset(document.documentElement);
                    }
                } else {
                    if (this.theme === 'dark') {
                        document.documentElement.classList.add('dark');
                    } else {
                        document.documentElement.classList.remove('dark');
                    }
                }
            }
        };
    },
    mounted(scope) {
        this.applyTheme();

        // Normalize /path/index.html → /path/ so the router sees a clean path.
        if (typeof window !== 'undefined' && location.pathname?.endsWith('/index.html')) {
            history.replaceState(
                null, '',
                location.pathname.slice(0, -'index.html'.length) + location.search + location.hash
            );
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
    },
    template: /*html*/
`<history-router let:router>
    <var :route="router?.match('./:page')">
        <header class="app-header">
            <div class="header-container">
                <a href="./" class="app-brand" @click:prevent="router.replace('./')">
                    <svg class="brand-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>My App</span>
                </a>
                <nav class="app-nav">
                    <a href="./home"
                       :class="{ active: !route?.params?.page || route.params.page === 'home' }"
                       @click:prevent="router.push('./home')">Dashboard</a>
                    <a href="./about"
                       :class="{ active: route?.params?.page === 'about' }"
                       @click:prevent="router.push('./about')">Profile</a>
                </nav>
                <div class="header-actions">
                    <button class="theme-toggle" @click="toggleTheme()" :title="'Switch to ' + (theme === 'default' ? 'dark' : 'light') + ' mode'">
                        <if :="theme === 'default'">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke-linejoin="round" stroke-linecap="round"></path></svg>
                        <else>
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                        </else>
                        </if>
                    </button>
                    <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User Avatar" class="user-avatar" />
                </div>
            </div>
        </header>
        <main class="app-main">
            <component
                :import="'./pages/' + (route?.params?.page && !route.params.page.includes('.') ? route.params.page : 'home') + '.ok.html'">
            </component>
        </main>
    </var>
</history-router>`,
    style: /*css*/`
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-color, #f8fafc);
    -webkit-font-smoothing: antialiased;
}

app-ok {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-color, #f8fafc);
    color: var(--text-primary, #0f172a);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--header-bg);
    backdrop-filter: var(--header-blur);
    -webkit-backdrop-filter: var(--header-blur);
    border-bottom: 1px solid var(--header-border);
    transition: background-color 0.3s ease, border-color 0.3s ease;
}

.header-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 4rem;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1.5rem;
}

.app-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
    font-size: 1.125rem;
    color: var(--text-primary);
    text-decoration: none;
    letter-spacing: -0.025em;
    transition: color 0.2s;
}

.brand-logo {
    width: 24px;
    height: 24px;
    color: var(--primary-color);
}

.app-nav {
    display: flex;
    gap: 0.5rem;
    margin-left: 2rem;
    margin-right: auto;
}

.app-nav a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 500;
    padding: 0.5rem 0.875rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
}

.app-nav a:hover {
    color: var(--text-primary);
    background: var(--surface-color);
}

.app-nav a.active {
    color: var(--primary-color);
    background: var(--surface-color);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 1.25rem;
}

.theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

.theme-toggle:hover {
    color: var(--text-primary);
    background: var(--surface-color);
}

.user-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--border-color);
    cursor: pointer;
    transition: border-color 0.2s;
}
.user-avatar:hover {
    border-color: var(--primary-color);
}

.app-main {
    flex: 1;
    display: flex;
    flex-direction: column;
}
    `
}
