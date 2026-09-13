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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

let analytics = null;
let analyticsReady = null;

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
    return "Add this site’s domain to Firebase Auth authorized domains (localhost is already allowed).";
  }
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) {
    return "Sign-in was cancelled.";
  }
  if (code.includes("operation-not-allowed")) {
    return "That sign-in provider is not enabled in the Momentra Firebase project yet.";
  }
  return message || "Sign-in failed.";
}

async function exchangeSession(user) {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      idToken,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      providerId: user.providerData?.[0]?.providerId || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Unable to unlock the reader.");
  }
  return data;
}

async function trackEvent(name, params = {}) {
  const a = await ensureAnalytics();
  if (a) {
    try {
      logEvent(a, name, { book: "life_happens_in_moments", ...params });
    } catch (_) {}
  }
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, params }),
    });
  } catch (_) {}
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
  const session = await exchangeSession(result.user);
  await trackEvent("login", { method: "google" });
  return { user: result.user, session };
}

async function firebaseSignOut() {
  await signOut(auth);
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  await trackEvent("logout");
}

export {
  auth,
  onAuthStateChanged,
  ensureAnalytics,
  trackEvent,
  signInWithGoogle,
  firebaseSignOut,
  describeAuthError,
  exchangeSession,
};
