/**
 * Popup UI logic (v1.1). Two states:
 *   • Signed out: token input + Save
 *   • Signed in: "Sync now" + "Sign out" + last-status
 *
 * "Sync now" just fires VYDRO_MANUAL_SYNC to the service worker, which
 * does the actual scrape (via chrome.scripting.executeScript) and POST.
 */

async function refresh() {
  const { vydro_token, vydro_status, vydro_status_at } = await chrome.storage.local.get([
    "vydro_token",
    "vydro_status",
    "vydro_status_at",
  ]);
  document.getElementById("signed-out").style.display = vydro_token ? "none" : "block";
  document.getElementById("signed-in").style.display = vydro_token ? "block" : "none";

  if (vydro_token && vydro_status) {
    const status = vydro_status;
    const el = document.getElementById("status");
    el.className = "status";
    if (status.state === "synced") el.classList.add("synced");
    else if (status.state === "error") el.classList.add("error");
    else if (status.state === "syncing") el.classList.add("syncing");

    let msg = status.message || "";
    if (vydro_status_at) {
      const secs = Math.round((Date.now() - vydro_status_at) / 1000);
      const ago = secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
      msg = `${msg}  •  ${ago}`;
    }
    el.textContent = msg;
  } else if (vydro_token) {
    document.getElementById("status").textContent =
      "Open YouTube Studio's Audience tab, then click Sync now.";
  }
}

document.getElementById("btn-save").addEventListener("click", async () => {
  const token = document.getElementById("token").value.trim();
  if (!token) return;
  await chrome.runtime.sendMessage({ kind: "VYDRO_SET_TOKEN", token });
  refresh();
});

document.getElementById("btn-signout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ kind: "VYDRO_CLEAR_TOKEN" });
  refresh();
});

document.getElementById("btn-sync").addEventListener("click", async () => {
  // Fire-and-forget; background.js does the work and writes to
  // chrome.storage.local.vydro_status, which our refresh() picks up.
  document.getElementById("status").textContent = "Syncing…";
  await chrome.runtime.sendMessage({ kind: "VYDRO_MANUAL_SYNC" });
  setTimeout(refresh, 600);
});

refresh();
setInterval(refresh, 1500);
