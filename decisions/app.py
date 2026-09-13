#!/usr/bin/env python3
"""Protected book promo + reader for Life Happens in Decisions (Firebase Auth required)."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

BASE = Path(__file__).resolve().parent
PRIVATE_PDF = BASE / "private" / "book.pdf"

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "monytix-79dac")
FIREBASE_API_KEY = os.environ.get(
    "FIREBASE_API_KEY", "AIzaSyCPn4S5jhRRFlBgImLBtIgfC4HzCLwJ8q4"
)
FIREBASE_AUTH_DOMAIN = os.environ.get(
    "FIREBASE_AUTH_DOMAIN", "monytix-79dac.firebaseapp.com"
)
FIREBASE_STORAGE_BUCKET = os.environ.get(
    "FIREBASE_STORAGE_BUCKET", "monytix-79dac.firebasestorage.app"
)
FIREBASE_MESSAGING_SENDER_ID = os.environ.get(
    "FIREBASE_MESSAGING_SENDER_ID", "636445644991"
)
FIREBASE_APP_ID = os.environ.get(
    "FIREBASE_APP_ID", "1:636445644991:web:79e655865f8f255cd1ce0a"
)
FIREBASE_MEASUREMENT_ID = os.environ.get("FIREBASE_MEASUREMENT_ID", "G-41N9QLGP5D")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
TOKEN_TTL = int(os.environ.get("TOKEN_TTL", "7200"))
STREAM_SECRET = os.environ.get("STREAM_SECRET", app.secret_key)


def _firebase_web_config() -> dict:
    return {
        "apiKey": FIREBASE_API_KEY,
        "authDomain": FIREBASE_AUTH_DOMAIN,
        "projectId": FIREBASE_PROJECT_ID,
        "storageBucket": FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": FIREBASE_MESSAGING_SENDER_ID,
        "appId": FIREBASE_APP_ID,
        "measurementId": FIREBASE_MEASUREMENT_ID,
    }


def _issue_stream_token(viewer: str) -> str:
    exp = int(time.time()) + TOKEN_TTL
    payload = f"{viewer}|{exp}"
    sig = hmac.new(STREAM_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{exp}.{sig}"


def _valid_stream_token(token: str, viewer: str) -> bool:
    try:
        exp_s, sig = token.split(".", 1)
        exp = int(exp_s)
        if exp < int(time.time()):
            return False
        payload = f"{viewer}|{exp}"
        expect = hmac.new(STREAM_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
        return hmac.compare_digest(sig, expect)
    except Exception:
        return False


def _verify_firebase_id_token(token: str) -> dict:
    """Verify Firebase ID token; returns claims (uid, email, name, ...)."""
    return id_token.verify_firebase_token(
        token,
        google_requests.Request(),
        audience=FIREBASE_PROJECT_ID,
    )


def require_access(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("unlocked") or not session.get("uid"):
            return redirect(url_for("index", next="read"))
        return fn(*args, **kwargs)

    return wrapper


@app.after_request
def harden(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.gstatic.com https://www.googleapis.com https://apis.google.com; "
        "worker-src 'self' blob: https://cdnjs.cloudflare.com; "
        "child-src 'self' blob: https://cdnjs.cloudflare.com https://accounts.google.com https://*.firebaseapp.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https://*.googleusercontent.com; "
        "connect-src 'self' https://cdnjs.cloudflare.com https://identitytoolkit.googleapis.com "
        "https://securetoken.googleapis.com https://www.googleapis.com https://firebase.googleapis.com "
        "https://firebaseinstallations.googleapis.com https://*.googleapis.com https://*.firebaseio.com; "
        "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return resp


@app.get("/")
def index():
    return render_template(
        "index.html",
        unlocked=bool(session.get("unlocked") and session.get("uid")),
        user_email=session.get("email") or "",
        firebase_config=_firebase_web_config(),
    )


@app.post("/auth/firebase")
def auth_firebase():
    data = request.get_json(silent=True) or {}
    token = (data.get("idToken") or "").strip()
    if not token:
        return jsonify({"ok": False, "error": "Missing idToken"}), 400
    try:
        claims = _verify_firebase_id_token(token)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Invalid token: {exc}"}), 401

    uid = claims.get("sub") or claims.get("user_id") or ""
    email = claims.get("email") or ""
    name = claims.get("name") or email or uid
    if not uid:
        return jsonify({"ok": False, "error": "Token missing uid"}), 401

    viewer = hashlib.sha256(uid.encode()).hexdigest()[:8]
    session["unlocked"] = True
    session["uid"] = uid
    session["email"] = email
    session["name"] = name
    session["viewer"] = viewer
    session["stream"] = _issue_stream_token(viewer)
    return jsonify({"ok": True, "redirect": url_for("reader"), "email": email})


@app.post("/auth/logout")
def auth_logout():
    session.clear()
    return jsonify({"ok": True, "redirect": url_for("index")})


@app.get("/read")
@require_access
def reader():
    viewer = session.get("viewer", "guest")
    token = session.get("stream") or _issue_stream_token(viewer)
    session["stream"] = token
    return render_template(
        "reader.html",
        viewer_id=viewer,
        stream_token=token,
        book_title="Life Happens in Decisions",
        author="Sandeep Malla",
        user_email=session.get("email") or "",
    )


@app.get("/api/book")
@require_access
def stream_book():
    viewer = session.get("viewer", "")
    token = request.args.get("t") or session.get("stream", "")
    if not _valid_stream_token(token, viewer):
        abort(403)
    if not PRIVATE_PDF.exists():
        abort(404)
    return send_file(
        PRIVATE_PDF,
        mimetype="application/pdf",
        as_attachment=False,
        download_name="protected.pdf",
        conditional=True,
        max_age=0,
    )


@app.get("/health")
def health():
    return {"ok": True, "pages": 184, "auth": "firebase"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), debug=False)
