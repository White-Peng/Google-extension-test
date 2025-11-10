# YouTube Learning Reflection Companion

Chrome extension that turns your recent YouTube browsing history into concise learning reflections and quick flashcard drills. The tool inspects watch history entries, filters for education-focused videos, synthesises the core ideas, and surfaces lightweight prompts to reinforce what you learned.

> **Manifest version:** 4 (preview). Tested against Chromium-based browsers supporting Manifest V3+ background service workers.

## Key Features

- Scan the last 7 days of YouTube watch history directly via the `chrome.history` API.
- Filter for learning-oriented videos using category metadata and keyword heuristics.
- Fetch titles, descriptions, and category labels through the YouTube Data API.
- Produce quick bullet-point reflections and a lightweight prompt for follow-up action.
- Autogenerate up to five flashcards per video, ready for self-testing inside the popup.
- Persist processed results locally so insights load instantly on subsequent openings.

## Getting Started

### Prerequisites

- Google Chrome or another Chromium browser that supports Manifest V3/V4 service workers.
- A Google Cloud project with the **YouTube Data API v3** enabled.
- An API key created in Google Cloud Console.

### Installation

1. Clone or download this repository to your machine.
2. Open `chrome://extensions` in your Chromium-based browser.
3. Enable **Developer mode** (toggle in the upper right).
4. Click **Load unpacked**, then select the `extension` directory from this project.
5. The extension should now appear in your toolbar. Pin it for quicker access.

## Configure the YouTube API Key

1. In the extension popup, click **Open options** (or right-click the extension icon and choose **Options**).
2. Paste your YouTube Data API key into the input field and press **Save API key**.
3. You should see a confirmation message once the key is stored successfully.

## Using the Extension

1. After saving the API key, open the popup and press **Refresh**.
2. The background service worker will:
   - Retrieve up to 200 recent YouTube watch history entries from the last 7 days.
   - Call the YouTube Data API to collect metadata about each video.
   - Filter entries that align with learning themes (education category, how-to keywords, etc.).
   - Build reflection bullet points, a personal action prompt, and flashcards from each description.
3. Review your learning queue in the popup:
   - Follow links back to the original videos.
   - Expand flashcards to test yourself on key ideas.
4. Results are cached locally. Use **Refresh** anytime to regenerate insights with newly watched videos.

## Privacy & Permissions

- `history`: required to read your own Chrome browsing history for YouTube watch pages.
- `storage`: used to keep the API key and processed summaries/flashcards on-device.
- `https://www.googleapis.com/*`: needed to call the YouTube Data API.
- `https://www.youtube.com/*`: used for link generation and potential future enhancements.

All data stays local. Only metadata required for summaries is requested from Google APIs using the API key you provide.

## Project Structure

```
extension/
├── manifest.json                # Manifest V4 declaration (background service worker, permissions, entry points)
├── assets/                      # Generated PNG icons (16, 32, 128)
└── src/
    ├── background.js            # Service worker: history fetch + YouTube API + summarisation + storage
    ├── popup.html               # Popup UI markup
    ├── popup.js                 # Popup logic: rendering, refresh requests, messaging
    ├── options.html             # Options page for storing API key
    ├── options.js               # Options page script
    └── styles.css               # Shared styling for popup and options page
```

## Development Notes

- The summarisation and flashcard generation use lightweight heuristics (keywords, sentence extraction). Replace or extend these functions in `background.js` if you plan to integrate with an LLM or more advanced summariser.
- API requests are chunked (50 IDs per call) to stay within YouTube Data API limits; adjust the `HISTORY_SEARCH_LIMIT` or chunk size as needed.
- Manifest V4 is still evolving. If you encounter loading issues, downgrade `manifest_version` to `3` and adjust background registration accordingly.

## Troubleshooting

- **`YouTube Data API key not found`**: Ensure the key is saved on the options page before refreshing.
- **`Request had insufficient authentication scopes`**: Verify the API key belongs to a project with the YouTube Data API v3 enabled.
- **No videos detected**: Confirm your browser history contains recent `youtube.com/watch` entries and that they fall within the 7-day window.