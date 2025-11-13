const SETTINGS_KEY = "learningSettings";
const ANALYSIS_KEY = "learningAnalysis";
const ERROR_LOG_KEY = "learningErrorLog";
const PROFILE_KEY = "learningUserProfile";
const FLASHCARDS_KEY = "learningFlashcardProgress";
const FEEDBACK_LOG_KEY = "learningFeedbackLog";

export async function getSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  return result[SETTINGS_KEY] ?? null;
}

export async function setSettings(settings) {
  return chrome.storage.local.set({
    [SETTINGS_KEY]: settings
  });
}

export async function getLatestAnalysis() {
  const result = await chrome.storage.local.get([ANALYSIS_KEY]);
  return result[ANALYSIS_KEY] ?? null;
}

export async function saveAnalysis(analysis) {
  return chrome.storage.local.set({
    [ANALYSIS_KEY]: analysis
  });
}

export async function storeError(code, message) {
  const existing = await chrome.storage.local.get([ERROR_LOG_KEY]);
  const errors = existing[ERROR_LOG_KEY] ?? [];
  errors.push({
    code,
    message,
    timestamp: new Date().toISOString()
  });
  return chrome.storage.local.set({
    [ERROR_LOG_KEY]: errors.slice(-20)
  });
}

export async function getErrors() {
  const result = await chrome.storage.local.get([ERROR_LOG_KEY]);
  return result[ERROR_LOG_KEY] ?? [];
}

export async function getUserProfile() {
  const result = await chrome.storage.local.get([PROFILE_KEY]);
  return (
    result[PROFILE_KEY] ?? {
      interests: [],
      createdAt: null,
      updatedAt: null
    }
  );
}

export async function saveUserProfile(profile) {
  const payload = {
    ...(profile ?? {}),
    interests: (profile?.interests ?? []).map((item) => item.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
    createdAt: profile?.createdAt ?? (await getUserProfile())?.createdAt ?? new Date().toISOString()
  };
  await chrome.storage.local.set({
    [PROFILE_KEY]: payload
  });
  return payload;
}

export async function getFlashcardProgress() {
  const result = await chrome.storage.local.get([FLASHCARDS_KEY]);
  return result[FLASHCARDS_KEY] ?? {};
}

export async function saveFlashcardProgress(progress) {
  return chrome.storage.local.set({
    [FLASHCARDS_KEY]: progress ?? {}
  });
}

export async function appendFeedbackLog(entry) {
  const result = await chrome.storage.local.get([FEEDBACK_LOG_KEY]);
  const feedback = result[FEEDBACK_LOG_KEY] ?? [];
  feedback.push({
    ...entry,
    timestamp: new Date().toISOString()
  });
  return chrome.storage.local.set({
    [FEEDBACK_LOG_KEY]: feedback.slice(-50)
  });
}

export async function exportAllData() {
  const data = await chrome.storage.local.get(null);
  return data;
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}
