export default {
    tag: 'ssg-demo',
    context(scope) {
        const isClient = scope.$context.runtimePhase === 'client';
        return {
            ...scope.$context,
            count: scope.$context.initialCount ?? 0,
            clientStatus: isClient
                ? 'Client remounted from preserved template.'
                : 'Server prerender complete. Waiting for client remount.',
            remountedAt: null,
            increment() {
                this.count += 1;
            },
        };
    },
    mounted(scope) {
        if (scope.$context.runtimePhase !== 'client') return;
        this.clientStatus = 'Client remounted from preserved template.';
        this.remountedAt = new Date().toISOString();
    },
    template: /*html*/`
        <main class="demo-shell">
            <p class="eyebrow">SSG / remount</p>
            <h1>{{ title }}</h1>
            <p class="subtitle">{{ subtitle }}</p>

            <div class="status-card">
                <strong>Status:</strong>
                <span>{{ clientStatus }}</span>
            </div>

            <div class="timestamps">
                <div><strong>Server rendered:</strong> {{ serverRenderedAt }}</div>
                <div><strong>Client remounted:</strong> {{ remountedAt || 'pending...' }}</div>
            </div>

            <ul>
                <each :of="bullets" let:item="bullet">
                    <li>{{ bullet }}</li>
                </each>
            </ul>

            <div class="counter-row">
                <button @click="increment()">Increment</button>
                <span>Count: {{ count }}</span>
            </div>
        </main>
    `,
    style: /*css*/`
        [tag] {
            display: block;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
            color: #f6f7fb;
        }

        [tag] .demo-shell {
            max-width: 760px;
            margin: 3rem auto;
            padding: 2rem;
            border-radius: 20px;
            background: linear-gradient(180deg, rgba(31, 35, 61, 0.94), rgba(15, 18, 33, 0.98));
            border: 1px solid rgba(144, 176, 255, 0.25);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        }

        [tag] .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 0.75rem;
            color: #9bb2ff;
            margin: 0 0 0.75rem;
        }

        [tag] h1 {
            margin: 0;
            font-size: 2rem;
        }

        [tag] .subtitle {
            color: #cad3f5;
            line-height: 1.6;
            margin: 0.75rem 0 1.5rem;
        }

        [tag] .status-card,
        [tag] .timestamps,
        [tag] .counter-row {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            flex-wrap: wrap;
            margin: 1rem 0;
            padding: 0.9rem 1rem;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.06);
        }

        [tag] ul {
            padding-left: 1.2rem;
            line-height: 1.8;
        }

        [tag] button {
            border: 0;
            border-radius: 999px;
            background: #84a9ff;
            color: #16203f;
            font-weight: 700;
            padding: 0.7rem 1rem;
            cursor: pointer;
        }
    `,
};


