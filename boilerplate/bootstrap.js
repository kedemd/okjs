import OK from "@kedem/okjs";
import okTheme from "@kedem/okjs/toolkit/theming/ok-theme.ok.js";
import historyRouter from "@kedem/okjs/toolkit/navigation/history-router.ok.js";

const ok = OK();

// Core: only register what the app actually uses
ok.register(okTheme);
ok.register(historyRouter);

// Dev tools: theme editor, console, etc. — only in dev mode in the browser
if (ok.config.env !== 'prod' && !globalThis.__OK_SSG__?.active) {
    const { default: manifest, base } = await import("@kedem/okjs/toolkit");
    const devComponents = manifest.filter(m => m.meta?.includes('dev') || m.meta?.includes('service'));
    ok.register(devComponents.map(m => new URL(m.path, base).href));
}

await ok.init(document.body, {});

// Register presets after init (ok.shared.theme is created during component initialization)
ok.shared.theme.register('dark', {
    define: {
        '--bg-color': '#0f172a',
        '--surface-color': '#1e293b',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--border-color': '#334155',
        '--primary-color': '#3b82f6',
        '--primary-hover': '#60a5fa',
        '--ring-color': 'rgba(59, 130, 246, 0.5)',
        '--header-bg': 'rgba(30, 41, 59, 0.8)',
        '--header-border': '#334155'
    }
});
