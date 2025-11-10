const form = document.getElementById("settings-form");
const statusEl = document.getElementById("save-status");

document.addEventListener("DOMContentLoaded", async () => {
  form.addEventListener("submit", handleSubmit);
  await hydrateForm();
});

async function hydrateForm() {
  setStatus("Loading…", "pending");
  try {
    const response = await chrome.runtime.sendMessage({ type: "learning-analysis:getSettings" });
    if (!response?.ok) {
      throw new Error(response?.error ?? "Unknown error");
    }
    populateForm(response.settings);
    setStatus("Settings loaded.", "idle");
  } catch (error) {
    console.error("Failed to load settings", error);
    setStatus("Unable to load settings. Refresh the page.", "error");
  }
}

function populateForm(settings) {
  form.lookbackHours.value = settings.lookbackHours ?? 72;
  form.maxResults.value = settings.maxResults ?? 20;
  form.minimumDurationMinutes.value = settings.minimumDurationMinutes ?? 5;
  form.includeShorts.checked = Boolean(settings.includeShorts);
  form.keywords.value = (settings.keywords ?? []).join(", ");
  form.summaryProvider.value = settings.summaryProvider ?? "heuristic";
  form.llmEndpoint.value = settings.llmEndpoint ?? "";
  form.llmApiKey.value = settings.llmApiKey ?? "";
  form.llmModel.value = settings.llmModel ?? "";
  form.locale.value = settings.locale ?? "en-US";
}

async function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(form);

  const updatedSettings = {
    lookbackHours: Number(formData.get("lookbackHours")),
    maxResults: Number(formData.get("maxResults")),
    minimumDurationMinutes: Number(formData.get("minimumDurationMinutes")),
    includeShorts: Boolean(formData.get("includeShorts")),
    keywords: parseKeywords(formData.get("keywords")),
    summaryProvider: formData.get("summaryProvider"),
    llmEndpoint: formData.get("llmEndpoint")?.trim() ?? "",
    llmApiKey: formData.get("llmApiKey")?.trim() ?? "",
    llmModel: formData.get("llmModel")?.trim() ?? "",
    locale: formData.get("locale")?.trim() || "en-US"
  };

  setStatus("Saving…", "pending");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "learning-analysis:updateSettings",
      settings: updatedSettings
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Unknown error");
    }

    setStatus("Settings saved.", "success");
    setTimeout(() => setStatus("", "idle"), 2000);
  } catch (error) {
    console.error("Failed to save settings", error);
    setStatus("Failed to save. Check console for details.", "error");
  }
}

function parseKeywords(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function setStatus(message, state) {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}
