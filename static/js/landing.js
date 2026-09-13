import {
  auth,
  onAuthStateChanged,
  ensureAnalytics,
  trackEvent,
  signInWithGoogle,
  firebaseSignOut,
  describeAuthError,
  exchangeSession,
} from "./firebase-client.js";

document.addEventListener("contextmenu", (e) => e.preventDefault());

const authStatus = document.getElementById("auth-status");
const authError = document.getElementById("auth-error");
const googleBtn = document.getElementById("btn-google");
const signOutBtn = document.getElementById("btn-signout");
const gateActions = document.getElementById("gate-actions");

function setBusy(busy) {
  if (googleBtn) googleBtn.disabled = busy;
}

function showError(message) {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message || "";
}

function setStatus(message) {
  if (authStatus) authStatus.textContent = message;
}

async function handleProvider(fn, label) {
  showError("");
  setBusy(true);
  setStatus(`Signing in with ${label}…`);
  try {
    const { user, session } = await fn();
    const name = user.displayName || user.email || "Reader";
    setStatus(`Signed in as ${name}`);
    if (session?.redirect) {
      window.location.href = session.redirect;
      return;
    }
    window.location.href = "/read";
  } catch (err) {
    setStatus("Sign in to read the book");
    showError(describeAuthError(err));
  } finally {
    setBusy(false);
  }
}

if (googleBtn) {
  googleBtn.addEventListener("click", () => handleProvider(signInWithGoogle, "Google"));
}
if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await firebaseSignOut();
    window.location.href = "/";
  });
}

ensureAnalytics().then(() => trackEvent("landing_view"));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setStatus("Sign in with Google to unlock the protected reader");
    if (gateActions) gateActions.dataset.signedIn = "0";
    return;
  }

  const name = user.displayName || user.email || "Reader";
  setStatus(`Signed in as ${name}`);
  if (gateActions) gateActions.dataset.signedIn = "1";

  // Refresh Flask session if Firebase session already exists
  if (!document.body.dataset.unlocked) {
    try {
      const session = await exchangeSession(user);
      if (session?.ok && window.location.search.includes("next=read")) {
        window.location.href = session.redirect || "/read";
      }
    } catch (_) {
      /* stay on landing; user can tap Continue if already unlocked */
    }
  }
});
