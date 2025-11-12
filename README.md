# YouTube Learning Reflection & Flashcards Extension
This repository contains a Chrome extension that inspects your YouTube watch history, filters for educational content, produces study summaries, and generates quick flashcards to reinforce what you've learned.

> **Manifest note:** Google has not released Manifest V4 at the time of writing, so the project targets Manifest V3 while keeping the codebase modular enough to migrate when V4 becomes available.

## Feature Highlights
- Pulls recent YouTube watch history (requires explicit `history` permission).
- Deduplicates videos and enriches them with metadata retrieved from the watch page.
- Heuristically filters for educational content using customizable keyword scoring and duration checks.
- Summarizes each video (built-in heuristic with optional LLM endpoint override).
- Shows reflection prompts and flashcards in both the popup UI and a full dashboard page.
- Offers an onboarding flow that requests browsing-history access before any data is processed.
- Provides an options page for tuning the lookback window, keywords, summary provider, and locale.

## Project Structure
```
extension/
  manifest.json
  src/
    background.js            # Alarm-driven analysis pipeline
    utils/
      history.js             # History lookup + metadata enrichment
      analyzer.js            # Educational scoring, summaries, flashcards
      storage.js             # chrome.storage helpers
      permissions.js         # Helpers for optional permission prompts
    onboarding/
      index.html|js|css      # Consent screen opened on install
    dashboard/
      index.html|js|css      # Full-page review hub
    content/
      youtubeHelper.js       # Injected button on YouTube pages
    popup/
      popup.html
      popup.js
      popup.css
    options/
      options.html
      options.js
      options.css
```

## Getting Started
- Clone or download this repository.
- Open `chrome://extensions` in a Chromium-based browser.
- Enable Developer mode (toggle in the top-right corner).
- Click **Load unpacked** and select the `extension/` folder.
- Pin the extension icon (optional) and open the popup to trigger the first analysis.

## Permissions & Privacy
- `history`: required to read your local browsing history and identify YouTube watch pages.
- `storage`: stores settings, cached analysis output, and recent error logs.
- `alarms`: re-runs the analysis periodically.
- `scripting`: reserved for future enhancements (for example, page injections).
- Host access to `https://www.youtube.com/*` is needed for metadata fetches.

All processing runs locally inside the extension unless you configure a custom LLM endpoint; no data is sent anywhere else by default.

## Custom Summaries (Optional)
You can replace the built-in heuristic summarizer with any HTTP API that accepts JSON input:
- Open the extension's **Options** page.
- Switch the Summary Provider to **Custom LLM endpoint**.
- Fill in the endpoint URL, API key, and optional model name.
- Save the settings; future refreshes will call your endpoint. Failures gracefully fall back to heuristic summaries.

## Limitations & Future Work
- YouTube page structure can change and may break metadata parsing; keep an eye on the console for warnings.
- Fetching full transcripts is out of scope; integrating with the official YouTube Data API requires additional keys or quotas.
- Icon assets are not bundled—add your preferred PNG icons and update `manifest.json` if desired.

## Development Tips
- The background script uses ES modules (`type: "module"`). Keep helpers in `src/utils` to share logic.
- When iterating on the popup or options UI, use the Chrome Extensions page's reload button to pick up changes quickly.
- Use `chrome.runtime.sendMessage` for communication between the UI surfaces and the background pipeline.

Have fun building on top of the core workflow! Pull requests and ideas are welcome.
