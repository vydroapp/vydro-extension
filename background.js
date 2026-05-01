/**
 * Vydro Studio Sync — service worker (v1.1).
 *
 * Architecture rewrite: instead of relying on a static content script
 * (which Chrome doesn't inject into already-open tabs after install),
 * we use chrome.scripting.executeScript to PROGRAMMATICALLY inject the
 * scraper whenever:
 *   1. The popup's "Sync now" button is clicked
 *   2. The user navigates to the Studio Audience tab (auto)
 *
 * This makes the extension foolproof: it works on day-one tabs that
 * were open before installation, on freshly opened tabs, on SPA
 * navigations within Studio — all without ever requiring a page reload.
 */

const VYDRO_BASE = "https://www.vydro.app";
const ENDPOINT = VYDRO_BASE + "/api/youtube/audience-presence";
const STUDIO_AUDIENCE_RX = /^https:\/\/studio\.youtube\.com\/channel\/UC[\w-]+\/analytics\/.*audience/i;

// ── Storage helpers ────────────────────────────────────────────────────

async function getToken() {
  const out = await chrome.storage.local.get(["vydro_token"]);
  return out.vydro_token || null;
}

async function setStatus(status) {
  await chrome.storage.local.set({
    vydro_status: status,
    vydro_status_at: Date.now(),
  });
}

// ── Core flow: scrape a Studio tab and POST the matrix to Vydro ───────

async function scrapeAndSync(tabId) {
  const token = await getToken();
  if (!token) {
    await setStatus({
      state: "needs_signin",
      message: "Paste your Vydro session token in the extension popup.",
    });
    return;
  }

  // Inject the scraper into the page. scripting.executeScript runs the
  // function in the tab's main world by default and returns its result.
  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["scraper.js"],
    });
  } catch (err) {
    await setStatus({
      state: "error",
      message: `Couldn't inject scraper: ${err && err.message}. Make sure you're on a YouTube Studio Analytics → Audience page.`,
    });
    return;
  }

  // executeScript returns an array (one entry per frame); we only want
  // the main frame's result.
  const result = injectionResults?.[0]?.result;
  if (!result) {
    await setStatus({
      state: "error",
      message: "Scraper returned no result. Try reloading the Studio tab.",
    });
    return;
  }
  if (!result.ok) {
    await setStatus({
      state: "no_data",
      message: result.message || `Couldn't read the chart (${result.reason}).`,
    });
    return;
  }

  // Got the matrix — POST to Vydro.
  await setStatus({ state: "syncing", message: "Sending audience matrix to Vydro…" });
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel_id: result.channel_id,
        local_utc_offset_min: result.local_utc_offset_min,
        matrix_local: result.matrix_local,
        extension_version: chrome.runtime.getManifest().version,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await setStatus({
        state: "error",
        message: `Vydro returned HTTP ${res.status}: ${text.slice(0, 200)}`,
      });
      return;
    }
    const j = await res.json();
    await setStatus({
      state: "synced",
      message: "Synced ✓ Vydro is using your real audience graph for optimal posting time.",
      peaks: j.peaks_by_dow,
      channel_id: result.channel_id,
    });
  } catch (err) {
    await setStatus({
      state: "error",
      message: `Network error: ${err && err.message}`,
    });
  }
}

// ── Triggers ───────────────────────────────────────────────────────────

// 1. Popup "Sync now" button — fired via runtime message.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.kind === "VYDRO_MANUAL_SYNC") {
    (async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length === 0 || !tabs[0].url || !STUDIO_AUDIENCE_RX.test(tabs[0].url)) {
        // Fall back: find ANY Studio Audience tab
        const all = await chrome.tabs.query({ url: "https://studio.youtube.com/*/analytics/*" });
        const audienceTab = all.find((t) => t.url && STUDIO_AUDIENCE_RX.test(t.url));
        if (!audienceTab) {
          await setStatus({
            state: "no_data",
            message:
              "Open YouTube Studio → Analytics → Audience tab in any window, then click Sync now.",
          });
          sendResponse({ ok: false, reason: "no_audience_tab" });
          return;
        }
        await scrapeAndSync(audienceTab.id);
      } else {
        await scrapeAndSync(tabs[0].id);
      }
      sendResponse({ ok: true });
    })();
    return true; // keep channel open for async sendResponse
  }
  if (msg && msg.kind === "VYDRO_SET_TOKEN" && typeof msg.token === "string") {
    chrome.storage.local
      .set({ vydro_token: msg.token })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.kind === "VYDRO_CLEAR_TOKEN") {
    chrome.storage.local
      .remove(["vydro_token", "vydro_status", "vydro_status_at"])
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

// 2. Auto-sync on Studio Audience tab load / SPA navigation.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !STUDIO_AUDIENCE_RX.test(tab.url)) return;
  // Wait a bit for the chart to render (it's lazy-loaded)
  setTimeout(() => scrapeAndSync(tabId), 4000);
});
