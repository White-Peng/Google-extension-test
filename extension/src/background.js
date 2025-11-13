import { fetchRecentLearningVideos } from "./utils/history.js";
import { analyzeVideos, generateFlashcards } from "./utils/analyzer.js";
import {
  getSettings,
  setSettings,
  saveAnalysis,
  getLatestAnalysis,
  getUserProfile,
  saveUserProfile,
  getFlashcardProgress,
  saveFlashcardProgress,
  appendFeedbackLog,
  exportAllData,
  clearAllData
} from "./utils/storage.js";
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
  locale: "en-US",
  customKeywords: []
};

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureSettingsDefaults();
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
    await maybeOpenPreferences();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSettingsDefaults();
  await ensureContextMenus();
  await scheduleAnalysis();
  if (await hasHistoryPermission()) {
    await runAnalysis();
    await maybeOpenPreferences();
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
            await runAnalysis().catch(() => {});
            await maybeOpenPreferences();
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

    case "userProfile:get":
      getUserProfile()
        .then((profile) => sendResponse({ ok: true, profile }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "userProfile:update":
      updateUserProfile(message.profile)
        .then((profile) => sendResponse({ ok: true, profile }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

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

    case "flashcards:getProgress":
      getFlashcardProgress()
        .then((progress) => sendResponse({ ok: true, progress }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "flashcards:updateProgress":
      saveFlashcardProgress(message.progress ?? {})
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "statistics:get":
      buildStatistics()
        .then((stats) => sendResponse({ ok: true, stats }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "feedback:submit":
      appendFeedbackLog({
        message: message.message ?? "",
        email: message.email ?? ""
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "app:exportData":
      exportAllData()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;

    case "app:clearData":
      clearAllData()
        .then(async () => {
          await ensureSettingsDefaults(true);
          await ensureContextMenus();
          sendResponse({ ok: true });
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

  const settings = await getEffectiveSettings();

  const videos = await fetchRecentLearningVideos(settings);
  const analyzed = await analyzeVideos(videos, settings);
  const flashcards = generateFlashcards(analyzed, settings);

  const result = {
    generatedAt: new Date().toISOString(),
    videos: analyzed,
    flashcards
  };

  await saveAnalysis(result);
  await setSettings(settings);

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

async function getEffectiveSettings() {
  const current = (await getSettings()) ?? {};
  const merged = {
    ...DEFAULT_SETTINGS,
    ...current
  };
  merged.customKeywords = uniq(merged.customKeywords ?? merged.keywords ?? []);
  merged.keywords = uniq([
    ...(DEFAULT_SETTINGS.keywords ?? []),
    ...(current.keywords ?? []),
    ...(merged.customKeywords ?? [])
  ]);
  return merged;
}

async function ensureSettingsDefaults(forceReset = false) {
  if (forceReset) {
    await setSettings(DEFAULT_SETTINGS);
    return;
  }

  const settings = await getEffectiveSettings();
  await setSettings(settings);
}

async function updateUserProfile(profile) {
  const saved = await saveUserProfile(profile ?? {});
  await mergeInterestsIntoSettings(saved.interests ?? []);
  return saved;
}

async function mergeInterestsIntoSettings(interests = []) {
  const settings = await getEffectiveSettings();
  const custom = uniq(interests);
  const next = {
    ...settings,
    customKeywords: custom,
    keywords: uniq([...(settings.keywords ?? []), ...custom])
  };
  await setSettings(next);
}

async function maybeOpenPreferences() {
  const profile = await getUserProfile();
  const needsProfile = !profile?.interests?.length;
  if (needsProfile) {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/onboarding/preferences.html")
    });
  }
}

async function buildStatistics() {
  const [analysis, collection, profile, flashcards] = await Promise.all([
    getLatestAnalysis(),
    getCollectionItems(),
    getUserProfile(),
    getFlashcardProgress()
  ]);

  const videos = analysis?.videos ?? [];
  const flashcardList = analysis?.flashcards ?? [];
  const flashcardStatus = Object.values(flashcards ?? {});

  const typeCounts = collection.reduce((acc, item) => {
    const key = item.type ?? "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const channelCounts = videos.reduce((acc, video) => {
    const key = video.author ?? "Unknown channel";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const interestCounts = (profile?.interests ?? []).reduce((acc, interest) => {
    const matches = videos.filter((video) =>
      [video.summary ?? "", video.title ?? ""].join(" ").toLowerCase().includes(interest.toLowerCase())
    ).length;
    acc[interest] = matches;
    return acc;
  }, {});

  const flashcardPerformance = flashcardStatus.reduce(
    (acc, entry) => {
      const state = entry?.lastRating ?? "unseen";
      acc[state] = (acc[state] ?? 0) + 1;
      return acc;
    },
    { unseen: Math.max(flashcardList.length - flashcardStatus.length, 0) }
  );

  return {
    totals: {
      videos: videos.length,
      flashcards: flashcardList.length,
      highlights: collection.length
    },
    channels: topN(channelCounts, 5),
    interestMatches: interestCounts,
    highlightTypes: typeCounts,
    flashcards: flashcardPerformance
  };
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

function topN(map, limit = 5) {
  return Object.entries(map ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function uniq(array = []) {
  return Array.from(new Set(array.filter(Boolean)));
}
