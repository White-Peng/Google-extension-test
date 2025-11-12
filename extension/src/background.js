import { fetchRecentLearningVideos } from "./utils/history.js";
import { analyzeVideos, generateFlashcards } from "./utils/analyzer.js";
import { getSettings, setSettings, saveAnalysis, getLatestAnalysis } from "./utils/storage.js";
import { hasHistoryPermission, requestHistoryPermission } from "./utils/permissions.js";

const REFRESH_ALARM = "refresh-learning-analysis";
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "learning-analysis:getLatest") {
    getLatestAnalysis()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "learning-analysis:getSettings") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings: settings ?? DEFAULT_SETTINGS }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "learning-analysis:run") {
    runAnalysis()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "learning-analysis:updateSettings") {
    setSettings(message.settings)
      .then(async () => {
        await scheduleAnalysis();
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "learning-analysis:checkPermission") {
    hasHistoryPermission()
      .then((granted) => sendResponse({ ok: true, granted }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "learning-analysis:requestPermission") {
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
  }

  if (message?.type === "learning-analysis:openDashboard") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/dashboard/index.html")
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
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
