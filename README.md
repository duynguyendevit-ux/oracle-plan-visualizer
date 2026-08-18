# MyDevTools

Browser-first developer utilities built with Next.js and a Carbon-inspired UI. Tools include Oracle execution-plan analysis, Rancher log retrieval, SQL extraction, environment-to-Kubernetes conversion, Nginx redirect generation, spreadsheet utilities, diagrams, hashing, diffing, and URL encoding.

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. Verification commands:

```bash
npm run typecheck
npm run lint
npm run test:e2e
npm run test:agent
npm run build
```

Large log, SQL, formula, and spreadsheet operations run in Web Workers. Excel tools accept `.xlsx` and `.csv`; legacy `.xls` is intentionally unsupported.

## Rancher Logs

Save a local kubeconfig path once:

```bash
npm run setup:rancher -- /absolute/path/to/kubeconfig.yaml
npm run dev:rancher
```

The loopback-only agent listens on `127.0.0.1:3210`. Log Analyzer supports context, namespace, pod, and container selection; one-time retrieval; and live `kubectl logs --follow` streaming with pause, resume, stop, and bounded reconnect attempts.

Use **Check environment** to verify kubectl. If missing, **Install kubectl** downloads the official binary, verifies SHA-256, and installs it under `~/.local/bin` without sudo. Public cluster hostnames require an explicit allowlist:

```bash
KUBECTL_ALLOWED_HOSTS=rancher.internal.example npm run dev:rancher
```

Hosted deployments such as Vercel cannot access local Rancher clusters; run the local agent for that workflow.

## Browser Data

Tool sessions, favorites, recent tools, transfers, and named workspace snapshots remain in browser storage. Workspace Manager can save, restore, import, export, or reset these sessions. Kubeconfig content is never included in workspace snapshots.

Execution-plan history uses IndexedDB and remains independent from workspace snapshots.
