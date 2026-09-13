# Life Happens in Decisions

Protected Firebase-gated flip-book (Sandeep Malla).

## Cloudflare Pages
- **Build command:** `npm run build`
- **Output directory:** `public`
- Build copies `static/` + compressed `private/book.pdf` into `public/` (PDF must stay under 25 MiB).

Firebase project: `monytix-79dac`  
Enable Google + Email/Password, and add your Pages domain under Auth → Authorized domains.

## Docker (optional)
```bash
docker compose up -d --build
```
