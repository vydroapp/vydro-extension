/**
 * Vydro Studio Sync — page scraper.
 *
 * This file is INJECTED into the YT Studio tab by background.js (auto)
 * or popup.js (manual click) via chrome.scripting.executeScript. It runs
 * inside the page context, reads the "When your viewers are on YouTube"
 * heatmap, and returns a 7×24 intensity matrix + metadata.
 *
 * It does NOT use chrome.* APIs — pure DOM scraping. The caller (background
 * or popup) sends the result to Vydro.
 *
 * Returned shape (or {ok:false, reason} on failure):
 *   {
 *     ok: true,
 *     matrix_local: number[7][24],
 *     local_utc_offset_min: number,
 *     channel_id: string,
 *   }
 */

function vydroScrapeStudioGraph() {
  const TIER_TO_INTENSITY = {
    "Very few of your viewers are on YouTube": 0.10,
    "Few of your viewers are on YouTube":      0.30,
    "Some of your viewers are on YouTube":     0.55,
    "Many of your viewers are on YouTube":     0.80,
    "Most of your viewers are on YouTube":     1.00,
  };
  const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function parseAmPmHour(timeStr) {
    const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === "AM" && h === 12) h = 0;
    else if (ampm === "PM" && h !== 12) h += 12;
    return h;
  }

  // Locate the chart custom element. If not present, distinguish between
  // three real cases instead of always saying "open the Audience tab":
  //   1. Channel has too little data for YouTube to render the chart at
  //      all — Studio shows "Not enough viewer data to show this report"
  //      in place of the chart. We surface a specific message and tell
  //      the user Vydro will fall back to the V6 model.
  //   2. The user isn't on the Audience tab — give them the click-this-tab
  //      hint.
  //   3. The user IS on the Audience tab but the chart hasn't loaded yet
  //      (slow connection / Studio still rendering) — tell them to wait.
  const chart = document.querySelector("yta-audience-online-chart");
  if (!chart) {
    const bodyText = document.body?.innerText || "";
    const onAudienceTab = /\/analytics\/.*audience/i.test(location.pathname);

    // Case 1: Studio rendered the audience report card but with the
    // "not enough data" placeholder. The card heading + this exact
    // sentence are both visible. We also accept the Spanish/other
    // localizations later — for now English is fine since Studio
    // honors the user's YT account language and most Vydro users
    // are English-speaking.
    const studioSaysNotEnoughData =
      /Not enough viewer data to show this report|Not enough data to show this report/i.test(bodyText);
    if (studioSaysNotEnoughData) {
      return {
        ok: false,
        reason: "studio_not_enough_data",
        message:
          "Your channel doesn't have enough viewer data yet for YouTube to show the audience-online chart. Vydro will use its modeled fallback (your country distribution + post-performance) until your audience grows.",
      };
    }

    // Case 2: not on the Audience tab.
    if (!onAudienceTab) {
      return {
        ok: false,
        reason: "wrong_tab",
        message:
          "Open YouTube Studio → Analytics → Audience tab to sync the chart.",
      };
    }

    // Case 3: on the Audience tab but chart hasn't rendered yet.
    return {
      ok: false,
      reason: "chart_loading",
      message:
        "The audience chart is still loading. Wait a few seconds and click Sync now again.",
    };
  }

  const dayContainers = chart.querySelectorAll(".day-container");
  if (dayContainers.length !== 7) {
    return {
      ok: false,
      reason: "chart_not_loaded",
      message: `Chart isn't fully loaded yet — found ${dayContainers.length} of 7 days. Wait a moment and click Sync again.`,
    };
  }

  const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const day of dayContainers) {
    const cells = day.querySelectorAll(".cell-container");
    if (cells.length !== 24) {
      return {
        ok: false,
        reason: "cells_incomplete",
        message: `A day has ${cells.length} of 24 cells — chart isn't fully loaded. Wait a moment and click Sync again.`,
      };
    }
    for (const cell of cells) {
      const time = (cell.querySelector(".tooltip-time")?.textContent || "").trim();
      const traffic = (cell.querySelector(".tooltip-traffic")?.textContent || "").trim();
      const dowMatch = time.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
      if (!dowMatch) continue;
      const dow = DOW_MAP[dowMatch[1]];
      const hour = parseAmPmHour(time);
      const intensity = TIER_TO_INTENSITY[traffic];
      if (intensity === undefined || hour === null) continue;
      matrix[dow][hour] = intensity;
    }
  }

  // Pull the timezone offset shown in the chart's subtitle, e.g.
  // "Your local time (GMT -0700) · Last 28 days". Falls back to the
  // browser's getTimezoneOffset if the subtitle parse fails.
  let offsetMin = -new Date().getTimezoneOffset();
  let card = chart.parentElement;
  for (let i = 0; i < 5 && card; i++) {
    const txt = card.textContent || "";
    const m = txt.match(/local time \(GMT\s*([+-])(\d{2}):?(\d{2})?\)/i);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const hh = parseInt(m[2], 10);
      const mm = m[3] ? parseInt(m[3], 10) : 0;
      offsetMin = sign * (hh * 60 + mm);
      break;
    }
    card = card.parentElement;
  }

  // Channel ID lives in the URL: /channel/UC.../analytics/...
  const channelMatch = location.pathname.match(/\/channel\/(UC[\w-]+)/);
  const channelId = channelMatch ? channelMatch[1] : null;
  if (!channelId) {
    return {
      ok: false,
      reason: "channel_id_missing",
      message: "Couldn't find your channel ID in the URL — make sure you're on a channel-specific Studio page.",
    };
  }

  return {
    ok: true,
    matrix_local: matrix,
    local_utc_offset_min: offsetMin,
    channel_id: channelId,
  };
}

// IIFE wrapper so chrome.scripting.executeScript({func: ...}) returns the
// result via the Promise. Last expression in the func is what comes back.
vydroScrapeStudioGraph();
