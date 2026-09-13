import {
  auth,
  onAuthStateChanged,
  ensureAnalytics,
  trackEvent,
  signInWithGoogle,
  firebaseSignOut,
  describeAuthError,
  ensureReaderProfile,
} from "./firebase-client.js";

document.addEventListener("contextmenu", (e) => e.preventDefault());

const authStatus = document.getElementById("auth-status");
const authError = document.getElementById("auth-error");
const googleBtn = document.getElementById("btn-google");
const signedOut = document.getElementById("signed-out");
const signedIn = document.getElementById("signed-in");

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

function renderAuth(user) {
  if (user) {
    const name = user.displayName || user.email || "Reader";
    setStatus(`Signed in as ${name}`);
    if (signedOut) signedOut.hidden = true;
    if (signedIn) signedIn.hidden = false;
  } else {
    setStatus("Sign in with Google to unlock the protected reader");
    if (signedOut) signedOut.hidden = false;
    if (signedIn) signedIn.hidden = true;
  }
}

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    showError("");
    setBusy(true);
    setStatus("Signing in with Google…");
    try {
      const { user } = await signInWithGoogle();
      renderAuth(user);
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next === "read" ? "/read.html" : "/read.html";
    } catch (err) {
      setStatus("Sign in with Google to unlock the protected reader");
      showError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  });
}

const signOutBtn = document.getElementById("btn-signout");
if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    await firebaseSignOut();
    window.location.href = "/";
  });
}

ensureAnalytics().then(() => trackEvent("landing_view"));

onAuthStateChanged(auth, async (user) => {
  renderAuth(user);
  if (user) {
    try {
      await ensureReaderProfile(user);
    } catch (_) {}
  }
});
