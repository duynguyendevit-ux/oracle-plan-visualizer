<!-- BEGIN:nextjs-agent-rules -->
# Next.js Version Guidance

Before changing Next.js APIs or configuration, inspect `package.json` and
`next.config.ts`, then consult official documentation matching the installed
version. Do not rely on `node_modules/next/dist/docs/`; the installed package
does not include that directory.
<!-- END:nextjs-agent-rules -->

## Repository Navigation

- Add or reorder tools in `data/tools.ts`; routes live under `app/<slug>/page.tsx`.
- For Log Analyzer, worker, or Rancher changes, read `docs/log-analyzer.md` first.
- Run `npm run verify` before handing off a completed change.
