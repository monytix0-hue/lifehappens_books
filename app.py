#!/usr/bin/env python3
"""Protected book promo + reader for Life Happens in Moments."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import datetime, timezone
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
from google.oauth2 import id_token as google_id_token

BASE = Path(__file__).resolve().parent
PRIVATE_PDF = BASE / "private" / "book.pdf"
ANALYTICS_PATH = BASE / "private" / "book_analytics.json"
ANALYTICS_LOCK = threading.Lock()

app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates",
)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
ACCESS_CODE = os.environ.get("ACCESS_CODE", "moments")
TOKEN_TTL = int(os.environ.get("TOKEN_TTL", "7200"))  # 2 hours
STREAM_SECRET = os.environ.get("STREAM_SECRET", app.secret_key)
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "monytix-79dac")
TOTAL_PAGES = 187


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
    return google_id_token.verify_firebase_token(
        token,
        google_requests.Request(),
        audience=FIREBASE_PROJECT_ID,
    )


def _load_analytics() -> dict:
    if not ANALYTICS_PATH.exists():
        return {"readers": {}}
    try:
        return json.loads(ANALYTICS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"readers": {}}


def _save_analytics(data: dict) -> None:
    ANALYTICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = ANALYTICS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(ANALYTICS_PATH)


def _reader_key() -> str | None:
    uid = session.get("firebase_uid")
    if uid:
        return f"firebase:{uid}"
    viewer = session.get("viewer")
    if viewer:
        return f"code:{viewer}"
    return None


def _touch_reader(profile: dict | None = None) -> dict:
    key = _reader_key()
    if not key:
        return {}
    now = datetime.now(timezone.utc).isoformat()
    with ANALYTICS_LOCK:
        data = _load_analytics()
        readers = data.setdefault("readers", {})
        row = readers.get(key) or {
            "uid": session.get("firebase_uid"),
            "email": None,
            "display_name": None,
            "provider": None,
            "sessions": 0,
            "total_page_views": 0,
            "unique_pages": {},
            "max_page": 0,
            "events": [],
            "first_seen": now,
            "last_seen": now,
        }
        if profile:
            row["uid"] = profile.get("uid") or row.get("uid")
            row["email"] = profile.get("email") or row.get("email")
            row["display_name"] = profile.get("display_name") or row.get("display_name")
            row["provider"] = profile.get("provider") or row.get("provider")
        row["last_seen"] = now
        readers[key] = row
        _save_analytics(data)
        return row


def _record_event(name: str, params: dict | None = None) -> dict:
    key = _reader_key()
    if not key:
        return {}
    params = params or {}
    now = datetime.now(timezone.utc).isoformat()
    with ANALYTICS_LOCK:
        data = _load_analytics()
        readers = data.setdefault("readers", {})
        row = readers.get(key) or {
            "uid": session.get("firebase_uid"),
            "email": session.get("firebase_email"),
            "display_name": session.get("firebase_name"),
            "provider": session.get("firebase_provider"),
            "sessions": 0,
            "total_page_views": 0,
            "unique_pages": {},
            "max_page": 0,
            "events": [],
            "first_seen": now,
            "last_seen": now,
        }
        row["last_seen"] = now
        events = row.setdefault("events", [])
        events.append({"name": name, "params": params, "at": now})
        row["events"] = events[-80:]

        if name == "login" or name == "reading_session":
            row["sessions"] = int(row.get("sessions") or 0) + 1

        if name in {"page_view", "reading_progress"}:
            page = int(params.get("page") or params.get("page_number") or 0)
            if page > 0:
                row["total_page_views"] = int(row.get("total_page_views") or 0) + 1
                pages = row.setdefault("unique_pages", {})
                pages[str(page)] = int(pages.get(str(page)) or 0) + 1
                row["max_page"] = max(int(row.get("max_page") or 0), page)

        readers[key] = row
        _save_analytics(data)
        return row


def _stats_for_session() -> tuple[dict, dict, list]:
    key = _reader_key()
    empty_stats = {
        "progress_pct": 0,
        "max_page": 0,
        "total_pages": TOTAL_PAGES,
        "total_page_views": 0,
        "unique_pages": 0,
        "sessions": 0,
        "last_seen_human": "—",
    }
    profile = {
        "uid": session.get("firebase_uid") or session.get("viewer") or "guest",
        "email": session.get("firebase_email"),
        "display_name": session.get("firebase_name"),
        "provider": session.get("firebase_provider") or ("access_code" if session.get("unlocked") else None),
    }
    if not key:
        return profile, empty_stats, []

    with ANALYTICS_LOCK:
        row = _load_analytics().get("readers", {}).get(key) or {}

    max_page = int(row.get("max_page") or 0)
    unique = row.get("unique_pages") or {}
    last_seen = row.get("last_seen")
    last_human = "—"
    if last_seen:
        try:
            dt = datetime.fromisoformat(last_seen)
            last_human = dt.astimezone().strftime("%b %d, %Y %H:%M")
        except Exception:
            last_human = str(last_seen)[:16]

    stats = {
        "progress_pct": min(100, round((max_page / TOTAL_PAGES) * 100)) if max_page else 0,
        "max_page": max_page,
        "total_pages": TOTAL_PAGES,
        "total_page_views": int(row.get("total_page_views") or 0),
        "unique_pages": len(unique),
        "sessions": int(row.get("sessions") or 0),
        "last_seen_human": last_human,
    }
    profile = {
        "uid": row.get("uid") or profile["uid"],
        "email": row.get("email") or profile["email"],
        "display_name": row.get("display_name") or profile["display_name"],
        "provider": row.get("provider") or profile["provider"],
    }
    recent = []
    for ev in reversed(row.get("events") or []):
        params = ev.get("params") or {}
        detail = ""
        if "page" in params:
            detail = f"Page {params.get('page')}"
        elif "method" in params:
            detail = str(params.get("method"))
        elif params:
            detail = ", ".join(f"{k}={v}" for k, v in list(params.items())[:3])
        when = (ev.get("at") or "")[:16].replace("T", " ")
        recent.append({"name": ev.get("name") or "event", "detail": detail, "when": when})
        if len(recent) >= 20:
            break
    return profile, stats, recent


def require_access(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("unlocked"):
            return redirect(url_for("index", next="read"))
        return fn(*args, **kwargs)

    return wrapper


def _unlock_session(*, viewer: str, firebase: dict | None = None) -> None:
    session["unlocked"] = True
    session["viewer"] = viewer
    session["stream"] = _issue_stream_token(viewer)
    if firebase:
        session["firebase_uid"] = firebase.get("uid")
        session["firebase_email"] = firebase.get("email")
        session["firebase_name"] = firebase.get("display_name")
        session["firebase_provider"] = firebase.get("provider")
        _touch_reader(firebase)
    else:
        session.pop("firebase_uid", None)
        session.pop("firebase_email", None)
        session.pop("firebase_name", None)
        session.pop("firebase_provider", None)


@app.after_request
def harden(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.gstatic.com "
        "https://www.googletagmanager.com https://apis.google.com https://*.firebaseio.com; "
        "worker-src 'self' blob: https://cdnjs.cloudflare.com; "
        "child-src 'self' blob: https://cdnjs.cloudflare.com https://*.firebaseapp.com https://accounts.google.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: blob: https://*.googleusercontent.com; "
        "connect-src 'self' https://cdnjs.cloudflare.com https://*.googleapis.com "
        "https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com "
        "https://securetoken.googleapis.com https://www.google-analytics.com https://*.google-analytics.com "
        "https://*.analytics.google.com https://*.googletagmanager.com; "
        "frame-src https://*.firebaseapp.com https://accounts.google.com; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return resp


@app.get("/")
def index():
    return render_template("index.html", unlocked=bool(session.get("unlocked")))


@app.post("/auth/firebase")
def auth_firebase():
    body = request.get_json(silent=True) or {}
    token = (body.get("idToken") or "").strip()
    if not token:
        return jsonify({"ok": False, "error": "Missing Firebase ID token"}), 400
    try:
        claims = _verify_firebase_id_token(token)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid or expired Firebase token"}), 401

    uid = claims.get("sub") or claims.get("user_id")
    if not uid:
        return jsonify({"ok": False, "error": "Token missing user id"}), 401

    profile = {
        "uid": uid,
        "email": body.get("email") or claims.get("email"),
        "display_name": body.get("displayName") or claims.get("name"),
        "provider": body.get("providerId") or (claims.get("firebase") or {}).get("sign_in_provider"),
    }
    viewer = hashlib.sha256(uid.encode()).hexdigest()[:8]
    _unlock_session(viewer=viewer, firebase=profile)
    _record_event("login", {"method": profile.get("provider") or "firebase"})
    return jsonify({"ok": True, "redirect": url_for("reader"), "viewer": viewer})


@app.post("/auth/logout")
def auth_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/unlock")
def unlock():
    if request.is_json:
        code = ((request.json or {}).get("code") or "").strip()
    else:
        code = (request.form.get("code") or "").strip()
    if not hmac.compare_digest(code.lower(), ACCESS_CODE.lower()):
        if request.is_json or request.headers.get("Accept", "").find("application/json") >= 0:
            return jsonify({"ok": False, "error": "Invalid access code"}), 401
        return redirect(url_for("index", err="1"))
    viewer = secrets.token_hex(4)
    _unlock_session(viewer=viewer)
    _record_event("login", {"method": "access_code"})
    if request.is_json:
        return jsonify({"ok": True, "redirect": url_for("reader")})
    return redirect(url_for("reader"))


@app.get("/read")
@require_access
def reader():
    viewer = session.get("viewer", "guest")
    token = session.get("stream") or _issue_stream_token(viewer)
    session["stream"] = token
    _record_event("reading_session", {})
    return render_template(
        "reader.html",
        viewer_id=viewer,
        stream_token=token,
        book_title="Life Happens in Moments",
        author="Sandeep Malla",
    )


@app.get("/analytics")
@require_access
def analytics():
    profile, stats, recent = _stats_for_session()
    return render_template(
        "analytics.html",
        profile=profile,
        stats=stats,
        recent=recent,
    )


@app.get("/api/analytics/me")
@require_access
def analytics_me():
    profile, stats, recent = _stats_for_session()
    return jsonify({"ok": True, "profile": profile, "stats": stats, "recent": recent})


@app.post("/api/analytics/event")
@require_access
def analytics_event():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()[:64]
    if not name:
        return jsonify({"ok": False, "error": "Missing event name"}), 400
    params = body.get("params") if isinstance(body.get("params"), dict) else {}
    safe_params = {}
    for k, v in list(params.items())[:12]:
        key = str(k)[:40]
        if isinstance(v, (int, float, bool)):
            safe_params[key] = v
        else:
            safe_params[key] = str(v)[:120]
    _record_event(name, safe_params)
    return jsonify({"ok": True})


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
    return {"ok": True, "pages": TOTAL_PAGES, "firebase_project": FIREBASE_PROJECT_ID}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), debug=False)
