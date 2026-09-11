# Log Analyzer Architecture

Read this document before changing Log Analyzer parsing, browser workers,
cross-tool transfers, or Rancher integration.

## Data Flow

- `app/log-analyzer/page.tsx` owns UI state, file input, filters, Rancher
  controls, live-stream lifecycle, copy/export, and navigation to SQL Extractor.
- `workers/log-analyzer.worker.ts` is the browser boundary for CPU-heavy parsing.
  Keep request and result contracts serializable.
- `lib/log-analyzer.ts` owns log types, text/JSON parsing, correlation filtering,
  root-cause extraction, statistics, and error grouping.
- `data/log-analyzer-samples.ts` is the sample source of truth. Preserve its SQL
  line because the `Log Analyzer -> SQL Extractor -> Execution Plan` workflow
  depends on it.

## Rancher Boundary

The browser calls the loopback-only agent in `scripts/rancher-log-agent.mjs`.
The agent validates kubeconfig input and invokes `kubectl`; hosted deployments
must not execute kubectl or receive kubeconfig credentials. The configured path
is stored in `~/.config/mydevtools/rancher-log-agent.json`, while kubeconfig
content must not enter browser storage or workspace snapshots.

## Change Checklist

For parser contract changes, update the type and parser first, then the worker
and UI consumers. Reuse the existing tests:

```bash
npx playwright test tests/global-ux.spec.ts tests/log-analyzer-rancher.spec.ts
npm run test:agent
npm run typecheck
```

Verify pasted logs, uploaded files, one-time Rancher retrieval, and live
streaming. Keep selectors scoped to the result region when the source textarea
can contain the same text. Run `npm run verify` before final handoff.
