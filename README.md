# Life Happens in Moments — Cloudflare deploy

This Flask app is hosted with **[Cloudflare Containers](https://developers.cloudflare.com/containers/)**: a Worker proxies every request into a Dockerized gunicorn process.

## Prerequisites

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
2. **Cloudflare Workers Paid plan** (Containers are not available on Free) — [upgrade](https://dash.cloudflare.com/?to=/:account/workers/plans)
3. Wrangler logged in: `npx wrangler login`

## Deploy

```bash
npm install
npx wrangler deploy
```

After the first deploy, wait a few minutes for the container to provision, then open the `*.workers.dev` URL Wrangler prints.

## Post-deploy (required for Google sign-in)

Add your Worker hostname (without `https://`) to Firebase Auth authorized domains:

1. [Firebase Console → momentra-v2 → Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/momentra-v2/authentication/settings)
2. Add e.g. `life-happens-book.<your-subdomain>.workers.dev`
3. Later, add your custom domain the same way

## Custom domain

In the Cloudflare dashboard: **Workers & Pages → life-happens-book → Settings → Domains & Routes → Add**.

## Secrets (recommended)

Replace the default Flask secrets before production:

```bash
# Edit envVars in src/index.ts, or pass secrets via your preferred secret store,
# then redeploy:
npx wrangler deploy
```

## Local

```bash
# Flask only
pip install -r requirements.txt
python app.py

# Or Docker
docker compose up --build
```
