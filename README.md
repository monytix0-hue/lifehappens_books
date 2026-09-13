# Life Happens in Moments — Cloudflare Pages

Static site on **Cloudflare Pages** (no Workers / Containers). Google sign-in and analytics use Firebase project `momentra-v2`.

## Deploy

```bash
npm install
npm run deploy
```

### GitHub → Cloudflare Pages settings

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `public` |
| Deploy command | leave default / none (do **not** use `wrangler deploy`) |

Disconnect any **Workers** connected build that runs `npx wrangler deploy`.

## After deploy

Add your Pages host to Firebase Auth → Authorized domains:

- `books.pages.dev`
- your custom domain, if any

## Local

```bash
npm run pages:dev
```
