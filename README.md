# Life Happens in Decisions

Protected Firebase-gated flip-book (Sandeep Malla).

## Cloudflare Pages (`lifehappens-books`)
Custom domain: **https://book.monytix.ai**

**Required build settings**
- Framework preset: None
- Build command: `npm run build`
- Build output directory: `public`
- Root directory: `/` (empty)
- Production branch: `main`

`npm run build` copies `static/` + `private/book.pdf` into `public/` (PDF must stay under 25 MiB).

## Firebase
Project: `monytix-79dac`  
Enable Google + Email/Password.  
Authorized domains must include:
- `book.monytix.ai`
- `lifehappens-books.pages.dev`

## Docker (optional)
```bash
docker compose up -d --build
```
