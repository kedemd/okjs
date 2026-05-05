const INSTALL_KEY = Symbol.for('okjs.ssg.hooks.installed');

export const SSG_DEFAULTS = {
    capture: false,
    remount: true,
    automatic: false,
    skipInit: false,
    document: null,
    originalNodes: null,
    capturedRoots: null,
    markerAttr: 'data-ok-prerendered',
    originTemplateAttr: 'data-ok-origin-template',
    templateMarkerAttr: 'data-ok-prerender-template',
    templatePrefix: 'ok-ssg-origin-',
    stageAttr: 'data-ok-prerender-stage',
    remountRootAttr: 'data-ok-ssg-remount-root',
    remountingAttr: 'data-ok-ssg-remounting',
};

function createHookBuckets() {
    return {
        init: {
            prepare: [],
            resolveTarget: [],
            after: [],
            error: [],
        }
    };
}

function ensureHooks(target = null) {
    const hooks = target || createHookBuckets();
    hooks.init ||= {};
    hooks.init.prepare ||= [];
    hooks.init.resolveTarget ||= [];
    hooks.init.after ||= [];
    hooks.init.error ||= [];
    return hooks;
}

function isElementNode(node) {
    return !!node && node.nodeType === 1;
}

function getNodeDocument(node, fallbackDocument = null) {
    return node?.ownerDocument || fallbackDocument || globalThis.document || null;
}

function getInstallKey(options) {
    return JSON.stringify({
        ...options,
        capture: !!options.capture,
        remount: options.remount !== false,
        automatic: !!options.automatic,
    });
}

function hasOriginalNodeSet(options) {
    return options.originalNodes && typeof options.originalNodes.has === 'function';
}

function getCaptureParent(node, okDocument = null) {
    if (!node) return null;
    if (node.tagName === 'BODY') return null;
    const parentElement = node.parentElement;
    if (!parentElement) return null;
    if (parentElement === okDocument?.documentElement) return null;
    return parentElement;
}

function getScopeParent(node) {
    if (!node) return null;
    const scopeParent = node.$scope?.$parent;
    if (scopeParent) return scopeParent;
    return node.parentNode?.$scope || null;
}

function hasCapturedRootAncestor(node, options) {
    const capturedRoots = options.capturedRoots;
    if (!capturedRoots || typeof capturedRoots[Symbol.iterator] !== 'function') return false;

    for (const root of capturedRoots) {
        if (root && root !== node && root.contains?.(node)) {
            return true;
        }
    }

    return false;
}

function shouldCaptureNode(state, options) {
    const node = state.node;
    if (!isElementNode(node)) return false;
    if (!options.capture) return false;
    if (node.hasAttribute(options.originTemplateAttr)) return false;
    if (options.document && node.ownerDocument !== options.document) return false;
    if (options.automatic) {
        if (getScopeParent(node)) return false;
        if (hasOriginalNodeSet(options) && !options.originalNodes.has(node)) return false;
        if (hasCapturedRootAncestor(node, options)) return false;
    }

    if (node.tagName !== 'BODY' && !node.parentNode) return false;
    return true;
}

function serializeAttributes(node, { omit = [] } = {}) {
    const skip = new Set(omit);
    return Array.from(node.attributes || [])
        .filter(attr => !skip.has(attr.name))
        .map(attr => [attr.name, attr.value]);
}

function applySerializedAttributes(node, attrs = []) {
    for (const [name, value] of attrs) {
        node.setAttribute(name, value);
    }
}

function encodeBodyAttributes(node, options) {
    return JSON.stringify(serializeAttributes(node, {
        omit: [options.markerAttr, options.originTemplateAttr, options.stageAttr],
    }));
}

function decodeBodyAttributes(template) {
    const raw = template?.getAttribute('data-ok-prerender-body-attrs');
    if (!raw) return [];

    try {
        const attrs = JSON.parse(raw);
        return Array.isArray(attrs) ? attrs : [];
    } catch {
        return [];
    }
}

function isExecutableScript(script) {
    if (!script || script.tagName !== 'SCRIPT') return false;
    const type = (script.getAttribute('type') || '').trim().toLowerCase();
    if (!type) return true;

    return [
        'module',
        'text/javascript',
        'application/javascript',
        'text/ecmascript',
        'application/ecmascript',
    ].includes(type);
}

function stripExecutableScripts(root) {
    for (const script of root.querySelectorAll('script')) {
        if (isExecutableScript(script)) {
            script.remove();
        }
    }
}

function markRemountNode(node, options) {
    if (!isElementNode(node)) return;
    node.setAttribute(options.remountRootAttr, '');
    node.setAttribute(options.remountingAttr, '');
}

function clearRemountNode(node, options) {
    if (!isElementNode(node)) return;
    node.removeAttribute(options.remountingAttr);
    node.removeAttribute(options.remountRootAttr);
}

function scheduleRemountCleanup(node, options) {
    const doc = getNodeDocument(node);
    const view = doc?.defaultView || globalThis.window || globalThis;
    const run = () => clearRemountNode(node, options);

    if (typeof view?.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(run);
        return;
    }

    if (typeof globalThis.setTimeout === 'function') {
        globalThis.setTimeout(run, 0);
        return;
    }

    run();
}

function createOriginTemplate(node, state, options) {
    const doc = getNodeDocument(node, state.ok?.config?.document);
    if (!doc) return null;

    const template = doc.createElement('template');
    const baseName = node.id || node.getAttribute('as') || node.tagName.toLowerCase() || 'root';
    const count = state.ok._ssgTemplateCounter = (state.ok._ssgTemplateCounter || 0) + 1;
    template.id = `${options.templatePrefix}${baseName}-${count}`;
    template.setAttribute(options.templateMarkerAttr, '');
    if (node.tagName === 'BODY') {
        template.innerHTML = node.innerHTML;
        template.setAttribute('data-ok-prerender-body', '');
        template.setAttribute('data-ok-prerender-body-attrs', encodeBodyAttributes(node, options));
    } else {
        template.innerHTML = node.outerHTML;
    }

    const parent = getCaptureParent(node, doc);
    if (parent) {
        parent.insertBefore(template, node);
    } else if (doc.head) {
        doc.head.appendChild(template);
    } else if (node.parentNode) {
        node.parentNode.insertBefore(template, node);
    } else {
        return null;
    }

    return template;
}

function transplantBody(requestedNode, mountNode) {
    const scope = mountNode.$scope || null;

    while (requestedNode.firstChild) {
        requestedNode.removeChild(requestedNode.firstChild);
    }

    for (const attr of Array.from(requestedNode.attributes)) {
        requestedNode.removeAttribute(attr.name);
    }

    for (const attr of Array.from(mountNode.attributes)) {
        requestedNode.setAttribute(attr.name, attr.value);
    }

    while (mountNode.firstChild) {
        requestedNode.appendChild(mountNode.firstChild);
    }

    if (scope) {
        requestedNode.$scope = scope;
        scope.$el = requestedNode;
    }
}

export function createSSGHooks(options = {}) {
    return installSSGHooks(createHookBuckets(), options);
}

export function installSSGHooks(targetHooks, options = {}) {
    const hooks = ensureHooks(targetHooks);
    const resolved = { ...SSG_DEFAULTS, ...options };

    const installed = hooks[INSTALL_KEY] ??= new Set();
    const installKey = getInstallKey(resolved);
    if (installed.has(installKey)) return hooks;
    installed.add(installKey);

    hooks.init.resolveTarget.push(async (state) => {
        if (!resolved.skipInit) return;

        return {
            result: state.requestedNode,
        };
    });

    hooks.init.prepare.push(async (state) => {
        const node = state.node;
        if (!shouldCaptureNode(state, resolved)) return;

        const template = createOriginTemplate(node, state, resolved);
        if (!template) return;

        resolved.capturedRoots?.add?.(node);

        return {
            meta: {
                ssgCapture: {
                    node,
                    template,
                    body: node.tagName === 'BODY',
                    options: resolved,
                }
            }
        };
    });

    hooks.init.resolveTarget.push(async (state) => {
        const requestedNode = state.requestedNode;
        if (!resolved.remount || !isElementNode(requestedNode)) return;
        if (!requestedNode.hasAttribute(resolved.markerAttr)) return;

        const templateId = requestedNode.getAttribute(resolved.originTemplateAttr);
        if (!templateId) return;

        const doc = getNodeDocument(requestedNode, state.ok?.config?.document);
        const template = doc?.getElementById(templateId);
        const isBodyRemount = requestedNode.tagName === 'BODY';
        if (isBodyRemount) {
            if (!doc || !template) return;
            const mountNode = doc.createElement('body');
            applySerializedAttributes(mountNode, decodeBodyAttributes(template));
            mountNode.append(template.content.cloneNode(true));
            stripExecutableScripts(mountNode);
            markRemountNode(mountNode, resolved);

            return {
                node: mountNode,
                meta: {
                    ssgRemount: {
                        requestedNode,
                        mountNode,
                        originalId: requestedNode.getAttribute('id') || null,
                        body: true,
                        options: resolved,
                    }
                }
            };
        }

        const mountNode = template?.content?.firstElementChild?.cloneNode(true);
        if (!mountNode) return;

        const originalId = mountNode.getAttribute('id');
        if (originalId) {
            mountNode.removeAttribute('id');
        }
        markRemountNode(mountNode, resolved);

        mountNode.hidden = true;
        mountNode.setAttribute(resolved.stageAttr, '');
        requestedNode.parentNode.insertBefore(mountNode, requestedNode.nextSibling);

        return {
            node: mountNode,
            meta: {
                ssgRemount: {
                    requestedNode,
                    mountNode,
                    originalId,
                    options: resolved,
                }
            }
        };
    });

    hooks.init.after.push(async (state) => {
        const capture = state.meta.ssgCapture;
        if (capture) {
            capture.node.setAttribute(capture.options.markerAttr, '');
            capture.node.setAttribute(capture.options.originTemplateAttr, capture.template.id);
            state.result = capture.node;
        }

        const remount = state.meta.ssgRemount;
        if (!remount) return;

        if (remount.body) {
            transplantBody(remount.requestedNode, remount.mountNode);
            state.result = remount.requestedNode;
            scheduleRemountCleanup(remount.requestedNode, remount.options);
            return;
        }

        remount.mountNode.hidden = false;
        remount.mountNode.removeAttribute(remount.options.stageAttr);
        if (remount.originalId) {
            remount.mountNode.setAttribute('id', remount.originalId);
        }

        state.ok.dom.replace(remount.requestedNode, remount.mountNode);
        state.result = remount.mountNode;
        scheduleRemountCleanup(remount.mountNode, remount.options);
    });

    hooks.init.error.push(async (state) => {
        const remount = state.meta.ssgRemount;
        if (remount?.body) {
            clearRemountNode(remount.requestedNode, remount.options);
            return;
        }
        clearRemountNode(remount?.mountNode, remount?.options || resolved);
        if (remount?.mountNode?.parentNode) {
            remount.mountNode.remove();
        }
    });

    return hooks;
}

export function getGlobalOKHooks() {
    const state = globalThis.__OK_SSG__ && typeof globalThis.__OK_SSG__ === 'object'
        ? globalThis.__OK_SSG__
        : (globalThis.__OK_SSG__ = {});

    return state.hooks ??= createHookBuckets();
}

export function installGlobalSSGHooks(options = {}) {
    return installSSGHooks(getGlobalOKHooks(), options);
}



