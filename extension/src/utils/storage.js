const SETTINGS_KEY = "learningSettings";
const ANALYSIS_KEY = "learningAnalysis";
const ERROR_LOG_KEY = "learningErrorLog";

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
