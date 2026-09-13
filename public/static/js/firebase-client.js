import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getAnalytics,
  isSupported,
  logEvent,
  setUserId,
  setUserProperties,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/** Same Firebase project as Momentra V2 */
const firebaseConfig = {
  apiKey: "AIzaSyCA-jxHmyvPSkTyosYcE139qUwyjCO9Pi0",
  authDomain: "momentra-v2.firebaseapp.com",
  projectId: "momentra-v2",
  storageBucket: "momentra-v2.firebasestorage.app",
  messagingSenderId: "315259659778",
  appId: "1:315259659778:web:d3d5117dd1484e2588291b",
  measurementId: "G-0MBM849ZFR",
};

const BOOK_URL = "/media/life-happens-in-moments.pdf";
const TOTAL_PAGES = 187;
const LOCAL_STATS_KEY = "lhim-reader-stats";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let analytics = null;
let analyticsReady = null;

function readLocalStats(uid) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_STATS_KEY) || "{}");
    return all[uid] || null;
  } catch {
    return null;
  }
}

function writeLocalStats(uid, row) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_STATS_KEY) || "{}");
    all[uid] = row;
    localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(all));
  } catch (_) {}
}

function ensureAnalytics() {
  if (!analyticsReady) {
    analyticsReady = isSupported()
      .then((ok) => {
        if (!ok) return null;
        analytics = getAnalytics(app);
        return analytics;
      })
      .catch(() => null);
  }
  return analyticsReady;
}

function describeAuthError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "");
  if (code.includes("unauthorized-domain")) {
    return "Add this site’s domain to Firebase Auth authorized domains.";
  }
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
    return "Sign-in was cancelled.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Google sign-in is not enabled in the Momentra Firebase project yet.";
  }
  return message || "Sign-in failed.";
}

function viewerIdFor(user) {
  return user?.uid ? user.uid.slice(0, 8) : "guest";
}

async function ensureReaderProfile(user) {
  if (!user) return null;
  const local = readLocalStats(user.uid) || {
    email: user.email || null,
    display_name: user.displayName || null,
    provider: user.providerData?.[0]?.providerId || "google.com",
    sessions: 0,
    total_page_views: 0,
    max_page: 0,
    unique_pages: {},
    events: [],
  };
  local.email = user.email || local.email;
  local.display_name = user.displayName || local.display_name;
  local.provider = user.providerData?.[0]?.providerId || local.provider;
  writeLocalStats(user.uid, local);

  try {
    const refDoc = doc(db, "book_readers", user.uid);
    const snap = await getDoc(refDoc);
    const base = {
      email: user.email || null,
      display_name: user.displayName || null,
      provider: user.providerData?.[0]?.providerId || "google.com",
      updated_at: serverTimestamp(),
    };
    if (!snap.exists()) {
      await setDoc(refDoc, {
        ...base,
        sessions: local.sessions,
        total_page_views: local.total_page_views,
        max_page: local.max_page,
        unique_pages: local.unique_pages,
        events: local.events,
        created_at: serverTimestamp(),
      });
    } else {
      await updateDoc(refDoc, base);
    }
    return refDoc;
  } catch (err) {
    console.warn("firestore profile skipped", err);
    return null;
  }
}

async function trackEvent(name, params = {}) {
  const a = await ensureAnalytics();
  if (a) {
    try {
      logEvent(a, name, { book: "life_happens_in_moments", ...params });
    } catch (_) {}
  }

  const user = auth.currentUser;
  if (!user) return;

  const data = readLocalStats(user.uid) || {
    email: user.email,
    display_name: user.displayName,
    provider: "google.com",
    sessions: 0,
    total_page_views: 0,
    max_page: 0,
    unique_pages: {},
    events: [],
  };
  data.events = [...(data.events || []), { name, params, at: new Date().toISOString() }].slice(-80);
  if (name === "login" || name === "reading_session") data.sessions = Number(data.sessions || 0) + 1;
  if (name === "page_view" || name === "reading_progress") {
    const page = Number(params.page || params.page_number || 0);
    if (page > 0) {
      data.total_page_views = Number(data.total_page_views || 0) + 1;
      data.unique_pages = { ...(data.unique_pages || {}) };
      data.unique_pages[String(page)] = Number(data.unique_pages[String(page)] || 0) + 1;
      data.max_page = Math.max(Number(data.max_page || 0), page);
    }
  }
  data.updated_at_iso = new Date().toISOString();
  writeLocalStats(user.uid, data);

  try {
    const refDoc = doc(db, "book_readers", user.uid);
    await updateDoc(refDoc, {
      ...data,
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    try {
      await setDoc(doc(db, "book_readers", user.uid), {
        ...data,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } catch (err2) {
      console.warn("analytics firestore skipped", err2);
    }
  }
}

async function getReaderStats(user) {
  if (!user) return null;
  let data = readLocalStats(user.uid) || {};
  try {
    const snap = await getDoc(doc(db, "book_readers", user.uid));
    if (snap.exists()) data = { ...data, ...snap.data() };
  } catch (_) {}

  const maxPage = Number(data.max_page || 0);
  const unique = data.unique_pages || {};
  const updated = data.updated_at?.toDate?.() || (data.updated_at_iso ? new Date(data.updated_at_iso) : null);
  const recent = [...(data.events || [])]
    .reverse()
    .slice(0, 20)
    .map((ev) => {
      const params = ev.params || {};
      let detail = "";
      if (params.page) detail = `Page ${params.page}`;
      else if (params.method) detail = String(params.method);
      return {
        name: ev.name || "event",
        detail,
        when: String(ev.at || "").slice(0, 16).replace("T", " "),
      };
    });

  return {
    profile: {
      uid: user.uid,
      email: data.email || user.email,
      display_name: data.display_name || user.displayName,
      provider: data.provider || "google.com",
    },
    stats: {
      progress_pct: maxPage ? Math.min(100, Math.round((maxPage / TOTAL_PAGES) * 100)) : 0,
      max_page: maxPage,
      total_pages: TOTAL_PAGES,
      total_page_views: Number(data.total_page_views || 0),
      unique_pages: Object.keys(unique).length,
      sessions: Number(data.sessions || 0),
      last_seen_human: updated
        ? updated.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
    },
    recent,
  };
}

async function loadBookPdfUrl() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in required to open the book.");
  return BOOK_URL;
}

async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureAnalytics();
  if (analytics && result.user) {
    setUserId(analytics, result.user.uid);
    setUserProperties(analytics, {
      sign_in_provider: "google.com",
      book_reader: "life_happens",
    });
  }
  await ensureReaderProfile(result.user);
  await trackEvent("login", { method: "google" });
  return { user: result.user };
}

async function firebaseSignOut() {
  await signOut(auth);
}

function requireAuthRedirect() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        window.location.replace("/?next=read");
        resolve(null);
        return;
      }
      resolve(user);
    });
  });
}

export {
  auth,
  onAuthStateChanged,
  ensureAnalytics,
  trackEvent,
  signInWithGoogle,
  firebaseSignOut,
  describeAuthError,
  ensureReaderProfile,
  getReaderStats,
  loadBookPdfUrl,
  requireAuthRedirect,
  viewerIdFor,
  TOTAL_PAGES,
};
