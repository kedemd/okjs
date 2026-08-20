# OKJS static tooling

`@kedem/okjs/tooling` is the pure, importable source-analysis API. It never fetches,
imports component modules, executes component code, creates a DOM, or mutates a
component definition.

```js
import { analyzeOKSource, validateOKSource } from '@kedem/okjs/tooling';

const analysis = analyzeOKSource({
    path: 'card.ok.html',
    source,
    baseURL: 'file:///workspace/card.ok.html',
    importMap: { imports: { '@ui/': 'file:///workspace/ui/' } },
});
```

Offsets are UTF-16 character offsets into the unchanged host source. `loc` values
are derived, one-based display coordinates. `mapping.kind === "segmented"` means
the runtime value is not represented by one safe, continuous editable region.

The current schema version is `1`. Template bindings, events, primitives, scope
inference, component-tag semantics, and CSS selector/scoping validation are
deliberately reported as coverage gaps rather than guessed.


`validateOKSource().valid` means that no statically proven error was found. Check
`status` or `conclusive` before using the result as a hard gate: dynamic or
unsupported behavior produces `status: "unknown"`, not a claim of runtime validity.
Valid JavaScript is interpreted from Acorn's AST; the tolerant scanner is used only
after parsing fails and its results are reported as partial coverage.
