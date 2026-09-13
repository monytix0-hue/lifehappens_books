# Life Happens in Decisions

Protected Firebase-gated flip-book site for *Life Happens in Decisions* (Sandeep Malla).

## Stack
- Flask + Gunicorn + Docker
- Firebase Auth (Google + Email/Password)
- PDF.js + StPageFlip reader

## Run
```bash
docker compose up -d --build
```
Site: http://localhost:4411

## Firebase Console
1. Enable **Google** and **Email/Password** sign-in
2. Add authorized domain for your host (e.g. `192.168.68.108` for LAN)

## Notes
- PDF lives in `private/book.pdf` (not served as a static download)
- Access requires Firebase login; server verifies ID tokens
