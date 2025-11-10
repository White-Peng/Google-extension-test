const STORAGE_KEY = "youtubeApiKey";

const form = document.getElementById("apiKeyForm");
const apiKeyInput = document.getElementById("apiKeyInput");
const statusSection = document.getElementById("optionsStatus");
const statusMessage = document.getElementById("optionsStatusMessage");

initialize();

function initialize() {
  form?.addEventListener("submit", handleFormSubmit);
  loadStoredApiKey();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("API key cannot be empty.", "error");
    return;
  }

  try {
    setStatus("Saving API key…", "info");
    const response = await sendMessageAsync({
      type: "STORE_API_KEY",
      payload: { apiKey }
    });

    if (!response?.success) {
      throw new Error(response?.error ?? "Failed to save API key.");
    }

    setStatus("API key saved successfully.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error?.message ?? "Unable to save API key.", "error");
  }
}

async function loadStoredApiKey() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result?.[STORAGE_KEY]) {
      apiKeyInput.value = result[STORAGE_KEY];
      setStatus("Loaded existing API key.", "info");
    }
  } catch (error) {
    console.error("Failed to fetch stored API key", error);
  }
}

function setStatus(message, variant = "info") {
  if (!message) {
    statusSection.classList.add("status--hidden");
    statusMessage.textContent = "";
    return;
  }

  statusSection.classList.remove("status--hidden");
  statusSection.dataset.variant = variant;
  statusMessage.textContent = message;
}

function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
