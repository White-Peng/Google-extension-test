import { fetchRecentLearningVideos } from "./utils/history.js";
import { analyzeVideos, generateFlashcards } from "./utils/analyzer.js";
import { getSettings, setSettings, saveAnalysis, getLatestAnalysis } from "./utils/storage.js";
import { hasHistoryPermission, requestHistoryPermission } from "./utils/permissions.js";
import { addCollectionItem, getCollectionItems, removeCollectionItem } from "./utils/collection.js";

const REFRESH_ALARM = "refresh-learning-analysis";
const CONTEXT_MENU_ID = "learning-collection-save";
const DEFAULT_SETTINGS = {
  lookbackHours: 72,
  maxResults: 20,
  keywords: [
    "lesson",
    "tutorial",
    "course",
    "education",
    "learning",
    "class",
    "study",
    "how to",
    "explained",
    "exam"
  ],
  minimumDurationMinutes: 5,
  includeShorts: false,
  summaryProvider: "heuristic",
  llmEndpoint: "",
  llmApiKey: "",
  locale: "en-US"
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const currentSettings = await getSettings();
  if (!currentSettings) {
    await setSettings(DEFAULT_SETTINGS);
  }
  await ensureContextMenus();

  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/onboarding/index.html")
    });
  }

  await scheduleAnalysis();
  if (await hasHistoryPermission()) {
    await runAnalysis();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureContextMenus();
  await scheduleAnalysis();
  if (await hasHistoryPermission()) {
    await runAnalysis();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    await runAnalysis();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  const item = buildCollectionItem(info, tab);
  if (!item) return;

  try {
    await addCollectionItem(item);
    await notifyCollectionUpdated();
    await flashBadge();
  } catch (error) {
    console.warn("Failed to add collection item", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case "learning-analysis:getLatest":
      getLatestAnalysis()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:getSettings":
      getSettings()
        .then((settings) => sendResponse({ ok: true, settings: settings ?? DEFAULT_SETTINGS }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:run":
      runAnalysis()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:updateSettings":
      setSettings(message.settings)
        .then(async () => {
          await scheduleAnalysis();
          sendResponse({ ok: true });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:checkPermission":
      hasHistoryPermission()
        .then((granted) => sendResponse({ ok: true, granted }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:requestPermission":
      requestHistoryPermission()
        .then(async (granted) => {
          if (granted) {
            await scheduleAnalysis();
            await runAnalysis();
          }
          sendResponse({ ok: true, granted });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "learning-analysis:openDashboard":
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/dashboard/index.html")
      });
      sendResponse({ ok: true });
      return false;

    case "collection:getAll":
      getCollectionItems()
        .then((items) => sendResponse({ ok: true, items }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "collection:remove":
      removeCollectionItem(message.id)
        .then(async (items) => {
          await notifyCollectionUpdated();
          sendResponse({ ok: true, items });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "collection:add":
      addCollectionItem(message.item)
        .then(async (item) => {
          await notifyCollectionUpdated();
          sendResponse({ ok: true, item });
        })
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    default:
      return false;
  }
});

async function scheduleAnalysis() {
  const settings = (await getSettings()) ?? DEFAULT_SETTINGS;
  const hasPermission = await hasHistoryPermission();

  chrome.alarms.clear(REFRESH_ALARM);
  if (hasPermission) {
    chrome.alarms.create(REFRESH_ALARM, {
      periodInMinutes: Math.max(15, Math.min(settings.lookbackHours * 60, 720))
    });
  }
}

async function runAnalysis() {
  if (!(await hasHistoryPermission())) {
    throw new Error("History permission not granted");
  }

  const settings = (await getSettings()) ?? DEFAULT_SETTINGS;

  const videos = await fetchRecentLearningVideos(settings);
  const analyzed = await analyzeVideos(videos, settings);
  const flashcards = generateFlashcards(analyzed, settings);

  const result = {
    generatedAt: new Date().toISOString(),
    videos: analyzed,
    flashcards
  };

  await saveAnalysis(result);

  try {
    await chrome.runtime.sendMessage({
      type: "learning-analysis:updated",
      payload: result
    });
  } catch (error) {
    if (!error?.message?.includes("Receiving end does not exist")) {
      console.warn("Failed to broadcast analysis update", error);
    }
  }

  return result;
}

async function ensureContextMenus() {
  try {
    await chrome.contextMenus.removeAll();
  } catch (error) {
    if (!String(error).includes("No context menu items")) {
      console.warn("Failed to clear context menus", error);
    }
  }

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Save to Learning Reflection",
    contexts: ["page", "selection", "image", "link", "video", "audio"]
  });
}

function buildCollectionItem(info, tab) {
  const pageUrl = info.pageUrl ?? tab?.url ?? "";
  const pageTitle = tab?.title ?? pageUrl ?? "Saved item";
  const excerpt = (info.selectionText ?? "").trim();

  if (excerpt) {
    return {
      type: "selection",
      title: pageTitle,
      url: pageUrl,
      excerpt: excerpt.slice(0, 500),
      metadata: { context: "selection" }
    };
  }

  if (info.mediaType === "image" || info.srcUrl) {
    return {
      type: "image",
      title: pageTitle,
      url: pageUrl,
      resourceUrl: info.srcUrl,
      excerpt: info.srcUrl,
      metadata: { context: "image" }
    };
  }

  if (info.mediaType === "video") {
    return {
      type: "video",
      title: pageTitle,
      url: pageUrl,
      excerpt: info.srcUrl ?? info.linkUrl ?? "",
      resourceUrl: info.srcUrl ?? info.linkUrl ?? pageUrl,
      metadata: { context: "video" }
    };
  }

  if (info.linkUrl) {
    return {
      type: "link",
      title: pageTitle,
      url: pageUrl,
      resourceUrl: info.linkUrl,
      excerpt: info.linkText ?? info.linkUrl,
      metadata: { context: "link" }
    };
  }

  if (pageUrl) {
    return {
      type: "page",
      title: pageTitle,
      url: pageUrl,
      metadata: { context: "page" }
    };
  }

  return null;
}

async function notifyCollectionUpdated() {
  try {
    await chrome.runtime.sendMessage({
      type: "learning-collection:updated"
    });
  } catch (error) {
    if (!error?.message?.includes("Receiving end does not exist")) {
      console.warn("Failed to broadcast collection update", error);
    }
  }
}

let badgeTimeout = null;
async function flashBadge() {
  try {
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
    if (badgeTimeout) {
      clearTimeout(badgeTimeout);
    }
    badgeTimeout = setTimeout(() => {
      chrome.action.setBadgeText({ text: "" });
    }, 1200);
  } catch (error) {
    console.warn("Failed to update badge", error);
  }
}
