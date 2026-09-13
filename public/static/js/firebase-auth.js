import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const cfgEl = document.getElementById("firebase-config");
const statusEl = document.getElementById("auth-status");
const errEl = document.getElementById("auth-error");

function setError(msg) {
  if (!errEl) return;
  errEl.textContent = msg || "";
  errEl.hidden = !msg;
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

async function establishSession(user) {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ idToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Server rejected login");
  }
  window.location.href = data.redirect || "/read";
}

if (!cfgEl) {
  console.error("Missing firebase-config");
} else {
  const firebaseConfig = JSON.parse(cfgEl.textContent);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const google = new GoogleAuthProvider();

  const googleBtn = document.getElementById("btn-google");
  const emailForm = document.getElementById("email-auth-form");
  const modeToggle = document.getElementById("auth-mode-toggle");
  const submitBtn = document.getElementById("email-submit");
  let signupMode = false;

  if (modeToggle) {
    modeToggle.addEventListener("click", (e) => {
      e.preventDefault();
      signupMode = !signupMode;
      modeToggle.textContent = signupMode
        ? "Already have an account? Sign in"
        : "Need an account? Create one";
      if (submitBtn) submitBtn.textContent = signupMode ? "Create account" : "Sign in with email";
      setError("");
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      setError("");
      setStatus("Opening Google…");
      try {
        const cred = await signInWithPopup(auth, google);
        setStatus("Signed in — opening book…");
        await establishSession(cred.user);
      } catch (err) {
        console.error(err);
        setStatus("");
        setError(err.message || "Google sign-in failed");
      }
    });
  }

  if (emailForm) {
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setError("");
      const email = document.getElementById("auth-email").value.trim();
      const password = document.getElementById("auth-password").value;
      if (!email || !password) {
        setError("Email and password required");
        return;
      }
      setStatus(signupMode ? "Creating account…" : "Signing in…");
      try {
        const cred = signupMode
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
        setStatus("Signed in — opening book…");
        await establishSession(cred.user);
      } catch (err) {
        console.error(err);
        setStatus("");
        setError(err.message || "Email sign-in failed");
      }
    });
  }

  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (_) {}
      await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
      window.location.href = "/";
    });
  }

  onAuthStateChanged(auth, () => {
    /* session is server-side; client auth is only for obtaining idToken */
  });
}
