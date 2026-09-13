import {
  auth,
  onAuthStateChanged,
  getReaderStats,
  requireAuthRedirect,
} from "./firebase-client.js";

const profileEl = document.getElementById("profile-line");
const progressEl = document.getElementById("stat-progress");
const progressMeta = document.getElementById("stat-progress-meta");
const viewsEl = document.getElementById("stat-views");
const viewsMeta = document.getElementById("stat-views-meta");
const sessionsEl = document.getElementById("stat-sessions");
const sessionsMeta = document.getElementById("stat-sessions-meta");
const providerEl = document.getElementById("stat-provider");
const providerMeta = document.getElementById("stat-provider-meta");
const activityEl = document.getElementById("activity-list");
const emptyEl = document.getElementById("activity-empty");

async function render(user) {
  const data = await getReaderStats(user);
  if (!data) return;

  const { profile, stats, recent } = data;
  profileEl.textContent = `Tracked for ${
    profile.display_name || profile.email || profile.uid
  } · synced with Momentra Firebase`;

  progressEl.textContent = `${stats.progress_pct}%`;
  progressMeta.textContent = `Page ${stats.max_page} of ${stats.total_pages}`;
  viewsEl.textContent = String(stats.total_page_views);
  viewsMeta.textContent = `Across ${stats.unique_pages} unique pages`;
  sessionsEl.textContent = String(stats.sessions);
  sessionsMeta.textContent = `Last ${stats.last_seen_human}`;
  providerEl.textContent = profile.provider || "—";
  providerMeta.textContent = profile.email || "No email shared";

  activityEl.innerHTML = "";
  if (!recent.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  for (const row of recent) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${row.name}</strong><span>${row.detail || ""}</span><em>${row.when}</em>`;
    activityEl.appendChild(li);
  }
}

const user = await requireAuthRedirect();
if (user) {
  onAuthStateChanged(auth, (u) => {
    if (u) render(u);
  });
  await render(user);
}
