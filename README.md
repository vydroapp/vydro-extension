# Vydro — YouTube Studio Sync

A free Chrome extension that syncs your real **"When your viewers are on YouTube"** graph from YouTube Studio into [Vydro](https://vydro.app), so Vydro's **Optimal Posting Time** feature schedules each Short exactly 1 hour before *your* audience peaks — not a model approximation.

## What it does

When you open YouTube Studio's **Analytics → Audience** tab, the extension silently reads the audience-online heatmap (the 7×24 grid showing Sun–Sat × hour-of-day intensity) and POSTs it to Vydro. Vydro then schedules your queued Shorts at peak-1h slots so YouTube's algorithm has time to push the video into recommendations as your audience comes online.

## Install (5 steps, ~3 minutes)

1. **Download** this repo: click the green **Code** button above → **Download ZIP** → unzip.
2. **Open** `chrome://extensions` in Chrome. Toggle **Developer mode** ON (top-right).
3. **Click "Load unpacked"** and select the unzipped folder.
4. **Get your Vydro token** from [vydro.app/dashboard](https://www.vydro.app/dashboard) → Settings → YouTube Studio Sync. Click the Vydro extension icon, paste the token, click **Save token**.
5. **Visit [YouTube Studio](https://studio.youtube.com)** → Analytics → Audience. The extension auto-syncs within seconds. You'll see "Synced ✓" in the popup.

## Privacy

The extension only runs on `studio.youtube.com/*/analytics/*` pages. It reads the audience-online graph from the page you're already viewing and sends it directly to Vydro's authenticated API. No data is sent anywhere else. Your Vydro token is stored locally in `chrome.storage.local` and used only to authenticate POSTs to `https://www.vydro.app/api/youtube/audience-presence`.

## Requirements

- A Vydro **Pro** account (Optimal Posting Time is a Pro feature).
- A connected YouTube channel in Vydro that matches the one you're viewing in Studio.
- Chrome 88+ (Manifest V3).

## License

MIT
