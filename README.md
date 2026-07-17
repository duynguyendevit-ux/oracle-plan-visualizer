This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Rancher logs

Configure the kubeconfig path once:

```bash
npm run setup:rancher -- /absolute/path/to/kubeconfig.yaml
```

The setup is saved with mode `0600` at `~/.config/mydevtools/rancher-log-agent.json`. Then run the web app and loopback-only kubectl agent together:

```bash
npm run dev:rancher
```

Open `http://127.0.0.1:3000/log-analyzer`, select **Rancher**, then load context, namespace, and pod. Use **Check environment** to verify kubectl. If kubectl is missing, **Install kubectl** downloads the official binary, verifies SHA-256, and installs it to `~/.local/bin/kubectl` without sudo.

The agent listens on `127.0.0.1:3210`. Override the binary with `KUBECTL_PATH`. Public cluster hostnames must be explicitly allowlisted, for example:

```bash
KUBECTL_ALLOWED_HOSTS=rancher.internal.example npm run dev:rancher
```

The hosted Vercel app cannot access Rancher directly; use the local command for this workflow.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
