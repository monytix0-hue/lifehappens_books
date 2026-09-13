# Life Happens in Decisions

Protected Firebase-gated flip-book (Sandeep Malla).

## Cloudflare Pages (`lifehappens-books`)
Custom domain: **https://book.monytix.ai**

### Build settings (use these exactly)
- Framework preset: **None**
- Build command: *(leave empty)* or `exit 0`
- Build output directory: **`public`**
- Root directory: *(empty)*
- Production branch: **`main`**

The deployable site is already in `public/` (including the PDF under 25 MiB).  
`npm run build` only refreshes `public/static` + `public/media` from source.

### After a successful deploy
- https://book.monytix.ai/ → Decisions landing
- https://book.monytix.ai/read.html → reader
- In Firebase Auth → Authorized domains, add `book.monytix.ai` and `lifehappens-books.pages.dev`

## Docker (optional)
```bash
docker compose up -d --build
```
