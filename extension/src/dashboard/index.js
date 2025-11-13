import { timeAgo, formatDuration } from "../popup/popup.js";

const sidebarButtons = document.querySelectorAll(".nav__item");
const viewTitleEl = document.getElementById("view-title");
const viewDescriptionEl = document.getElementById("view-description");
const statusTextEl = document.getElementById("status-text");
const statusIndicatorEl = document.getElementById("status-indicator");
const refreshButton = document.getElementById("refresh");
const quickPromptsEl = document.getElementById("quick-prompts");
const chatThreadEl = document.getElementById("chat-thread");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const quickstartCardContainer = document.getElementById("quickstart-card");
const quickstartActions = document.getElementById("quickstart-actions");
const quickstartStats = document.getElementById("quickstart-stats");
const quickstartReset = document.getElementById("quickstart-reset");
const databaseSearchEl = document.getElementById("database-search");
const databaseHistoryEl = document.getElementById("database-history");
const databaseHighlightsEl = document.getElementById("database-highlights");
const databaseSummaryEl = document.getElementById("database-summary");
const databaseTabs = document.querySelectorAll(".db-tab");
const statsTotalsEl = document.getElementById("stats-totals");
const statsInterestsEl = document.getElementById("stats-interests");
const statsHighlightsEl = document.getElementById("stats-highlights");
const statsChannelsEl = document.getElementById("stats-channels");
const statsFlashcardsEl = document.getElementById("stats-flashcards");
const settingsInterestsForm = document.getElementById("settings-interests-form");
const settingsInterestsInput = document.getElementById("settings-interests");
const exportDataButton = document.getElementById("export-data");
const clearDataButton = document.getElementById("clear-data");
const feedbackForm = document.getElementById("feedback-form");
const feedbackEmailInput = document.getElementById("feedback-email");
const feedbackMessageInput = document.getElementById("feedback-message");
const feedbackCopyButton = document.getElementById("feedback-copy");

const viewDescriptions = {
  home: "Chat with your learning copilot about your recent activity.",
  quickstart: "Practice flashcards generated from your educational watch history.",
  database: "Browse summaries of your history and saved highlights.",
  statistic: "Understand your learning patterns with quick analytics.",
  settings: "Manage preferences, export data, or send feedback."
};

const state = {
  view: "home",
  analysis: null,
  collection: [],
  profile: { interests: [] },
  stats: null,
  settings: null,
  flashcards: [],
  flashProgress: {},
  quickstartQueue: [],
  quickstartIndex: 0,
  conversation: []
};

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindEvents();
  await hydrateState();
  initialiseViews();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "learning-analysis:updated") {
      state.analysis = message.payload;
      state.flashcards = message.payload?.flashcards ?? [];
      buildQuickstartQueue();
      renderAll();
      setStatus("Analysis updated just now.", "success");
    }
    if (message?.type === "learning-collection:updated") {
      loadCollection().then(() => renderDatabase());
    }
  });
});

async function hydrateState() {
  setStatus("Loading workspace…", "loading");
  try {
    const [analysisRes, collectionRes, profileRes, statsRes, settingsRes, flashProgressRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: "learning-analysis:getLatest" }),
      chrome.runtime.sendMessage({ type: "collection:getAll" }),
      chrome.runtime.sendMessage({ type: "userProfile:get" }),
      chrome.runtime.sendMessage({ type: "statistics:get" }),
      chrome.runtime.sendMessage({ type: "learning-analysis:getSettings" }),
      chrome.runtime.sendMessage({ type: "flashcards:getProgress" })
    ]);

    if (analysisRes?.ok) {
      state.analysis = analysisRes.data;
      state.flashcards = analysisRes.data?.flashcards ?? [];
    }
    if (collectionRes?.ok) state.collection = collectionRes.items ?? [];
    if (profileRes?.ok) state.profile = profileRes.profile ?? state.profile;
    if (statsRes?.ok) state.stats = statsRes.stats;
    if (settingsRes?.ok) state.settings = settingsRes.settings;
    if (flashProgressRes?.ok) state.flashProgress = flashProgressRes.progress ?? {};

    buildQuickstartQueue();
    generateInitialChat();
    renderAll();

    if (state.analysis?.generatedAt) {
      setStatus(`Generated ${timeAgo(state.analysis.generatedAt)}`, "success");
    } else {
      setStatus("No analysis available yet. Run a refresh to begin.", "idle");
    }
  } catch (error) {
    console.error("Failed to hydrate dashboard", error);
    setStatus("Unable to load data. Try refreshing.", "error");
  }
}

function renderAll() {
  renderChatPrompts();
  renderQuickstart();
  renderDatabase();
  renderStatistics();
  renderSettings();
}

function bindNavigation() {
  sidebarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!view || state.view === view) return;
      state.view = view;
      sidebarButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === view));
      document.querySelectorAll(".view").forEach((section) => {
        section.classList.toggle("view--active", section.id === `view-${view}`);
      });
      viewTitleEl.textContent = capitalise(view);
      viewDescriptionEl.textContent = viewDescriptions[view] ?? "";
      if (view === "quickstart") renderQuickstart();
      if (view === "database") renderDatabase();
      if (view === "statistic") renderStatistics();
      if (view === "settings") renderSettings();
    });
  });
}

function bindEvents() {
  refreshButton.addEventListener("click", handleManualRefresh);
  chatForm.addEventListener("submit", handleChatSubmit);
  quickstartActions.querySelectorAll("button").forEach((button) =>
    button.addEventListener("click", () => handleFlashcardRating(button.dataset.rating))
  );
  quickstartReset.addEventListener("click", resetQuickstartProgress);
  databaseTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      databaseTabs.forEach((btn) => btn.classList.toggle("is-active", btn === tab));
      const target = tab.dataset.db;
      document.querySelectorAll(".database__list").forEach((list) => {
        list.classList.toggle("is-active", list.id === `database-${target}`);
      });
    })
  );
  databaseSearchEl.addEventListener("input", renderDatabase);
  settingsInterestsForm.addEventListener("submit", saveInterests);
  exportDataButton.addEventListener("click", exportData);
  clearDataButton.addEventListener("click", clearData);
  feedbackForm.addEventListener("submit", submitFeedback);
  feedbackCopyButton.addEventListener("click", copyDeveloperEmail);
}

async function handleManualRefresh() {
  setStatus("Re-running analysis…", "loading");
  refreshButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "learning-analysis:run" });
    if (response?.ok && response.data) {
      state.analysis = response.data;
      state.flashcards = response.data?.flashcards ?? [];
      buildQuickstartQueue();
      renderAll();
      setStatus("Analysis refreshed.", "success");
    } else {
      throw new Error(response?.error ?? "Unknown error");
    }
  } catch (error) {
    console.error("Manual refresh failed", error);
    setStatus("Refresh failed. Check permissions.", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function loadCollection() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "collection:getAll" });
    if (response?.ok) {
      state.collection = response.items ?? [];
    }
  } catch (error) {
    console.error("Failed to reload collection", error);
  }
}

function renderChatPrompts() {
  quickPromptsEl.innerHTML = "";
  const prompts = generateQuickPrompts();
  prompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      chatInput.value = prompt;
      chatInput.focus();
    });
    quickPromptsEl.appendChild(button);
  });
}

function generateQuickPrompts() {
  const basePrompts = [
    "Can you summarise my recent learning sessions?",
    "What educational topics have I explored the most this week?"
  ];
  const interestPrompts = (state.profile?.interests ?? [])
    .slice(0, 2)
    .map((interest) => `Did I watch anything about ${interest} recently?`);
  const collectionPrompt = state.collection.length
    ? "Show me highlights I saved for later review."
    : "How do I start collecting highlights?";
  return [...basePrompts, ...interestPrompts, collectionPrompt];
}

function appendChatMessage(role, text) {
  state.conversation.push({ role, text });
  const template = document.getElementById("chat-message-template");
  const node = template.content.cloneNode(true);
  const container = node.querySelector(".chat__message");
  container.dataset.role = role;
  node.querySelector(".chat__text").textContent = text;
  chatThreadEl.appendChild(node);
  chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  appendChatMessage("user", message);
  chatInput.value = "";
  try {
    const reply = await generateBotResponse(message);
    appendChatMessage("assistant", reply);
  } catch (error) {
    console.error("Chatbot error", error);
    appendChatMessage("assistant", "I ran into an issue processing that. Try asking in a different way.");
  }
}

async function generateBotResponse(message) {
  const normalized = message.toLowerCase();
  if (shouldUseLLM()) {
    const llmResponse = await callLLM(message);
    if (llmResponse) return llmResponse;
  }

  if (!state.analysis?.videos?.length) {
    return "I don't have any learning analysis yet. Try refreshing after you watch a few educational videos.";
  }

  if (normalized.includes("summary") || normalized.includes("summarise")) {
    return buildRecentSummary();
  }

  if (normalized.includes("highlight")) {
    if (!state.collection.length) {
      return "You haven't saved any highlights yet. Right-click a page, selection, or image and choose “Save to Learning Reflection”.";
    }
    const latest = state.collection.slice(0, 3).map((item) => `• ${item.title ?? "Saved item"} (${timeAgo(item.savedAt)})`);
    return `Here are your latest highlights:\n${latest.join("\n")}`;
  }

  const interest = (state.profile?.interests ?? []).find((interest) => normalized.includes(interest.toLowerCase()));
  if (interest) {
    const matches = (state.analysis?.videos ?? []).filter((video) =>
      [video.title ?? "", video.summary ?? "", video.description ?? ""].join(" ").toLowerCase().includes(interest.toLowerCase())
    );
    if (matches.length) {
      const lines = matches.slice(0, 3).map((video) => `• ${video.title} (${video.author ?? "Unknown channel"})`);
      return `You've been exploring ${interest} through these videos:\n${lines.join("\n")}`;
    }
    return `I didn't find recent videos about ${interest}. You can add more interests from Settings to improve detection.`;
  }

  if (normalized.includes("flashcard")) {
    return `You have ${state.flashcards.length} flashcards ready. Head to Quickstart to practise them.`;
  }

  return buildRecentSummary();
}

function buildRecentSummary() {
  const videos = (state.analysis?.videos ?? []).slice(0, 3);
  const lines = videos.map((video) => {
    const score = Math.round((video.educationalScore ?? 0) * 100);
    return `• ${video.title} (${video.author ?? "Unknown channel"}) – score ${score}%`;
  });
  const interests = (state.profile?.interests ?? []).slice(0, 3);
  const interestLine = interests.length ? `I'm keeping an eye on: ${interests.join(", ")}.` : "";
  return `Here's a quick reflection on your latest learning:\n${lines.join(
    "\n"
  )}\n${interestLine}\nVisit Quickstart for flashcards or Database for full summaries.`;
}

function shouldUseLLM() {
  const settings = state.settings ?? {};
  return settings.summaryProvider === "llm" && settings.llmEndpoint && settings.llmApiKey;
}

async function callLLM(message) {
  const settings = state.settings ?? {};
  try {
    const response = await fetch(settings.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.llmApiKey}`
      },
      body: JSON.stringify({
        model: settings.llmModel ?? "gpt-4o-mini",
        input: `User message: ${message}\n\nContext:\nRecent videos:\n${(state.analysis?.videos ?? [])
          .slice(0, 5)
          .map((video) => `- ${video.title} (${video.author})`)
          .join("\n")}\nHighlights:\n${state.collection
          .slice(0, 5)
          .map((item) => `- ${item.title} (${item.type})`)
          .join("\n")}\n\nRespond concisely and positively.`
      })
    });
    if (!response.ok) throw new Error(`LLM error: ${response.status}`);
    const data = await response.json();
    return data.summary ?? data.output ?? data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn("LLM fallback triggered", error);
    return null;
  }
}

function buildQuickstartQueue() {
  const now = Date.now();
  const progress = state.flashProgress ?? {};
  const dueCards = state.flashcards.filter((card) => {
    const record = progress[card.id];
    if (!record) return true;
    if (!record.nextReviewAt) return true;
    return new Date(record.nextReviewAt).getTime() <= now;
  });
  state.quickstartQueue = dueCards.length ? dueCards : state.flashcards.slice(0, 10);
  state.quickstartIndex = 0;
}

function renderQuickstart() {
  quickstartCardContainer.innerHTML = "";
  if (!state.quickstartQueue.length) {
    quickstartCardContainer.innerHTML = `<p class="quickstart__empty">No flashcards ready right now. Refresh after watching more educational videos.</p>`;
    quickstartActions.hidden = true;
    quickstartStats.textContent = "";
    return;
  }

  const card = state.quickstartQueue[state.quickstartIndex] ?? state.quickstartQueue[0];
  if (!card) {
    quickstartCardContainer.innerHTML = `<p class="quickstart__empty">Session complete! Come back tomorrow for spaced review.</p>`;
    quickstartActions.hidden = true;
    quickstartStats.textContent = "";
    return;
  }

  const template = document.getElementById("quickstart-card-template");
  const node = template.content.cloneNode(true);
  const root = node.querySelector(".quick-card");
  root.dataset.id = card.id;
  root.querySelector(".quick-card__question").textContent = card.question;
  root.querySelector(".quick-card__answer").textContent = card.answer;
  root.querySelector(".quick-card__link").href = card.source ?? "#";
  root.addEventListener("click", () => {
    const answer = root.querySelector(".quick-card__answer");
    const hidden = answer.hasAttribute("hidden");
    if (hidden) {
      answer.removeAttribute("hidden");
    } else {
      answer.setAttribute("hidden", "");
    }
  });

  quickstartCardContainer.appendChild(node);
  quickstartActions.hidden = false;
  quickstartStats.textContent = `Card ${state.quickstartIndex + 1} of ${state.quickstartQueue.length}`;
}

async function handleFlashcardRating(rating) {
  const card = state.quickstartQueue[state.quickstartIndex];
  if (!card) return;
  const now = new Date();
  const progress = { ...(state.flashProgress ?? {}) };
  const nextReviewAt = computeNextReview(now, rating);
  progress[card.id] = {
    lastRating: rating,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReviewAt?.toISOString?.() ?? null
  };
  state.flashProgress = progress;
  await chrome.runtime.sendMessage({ type: "flashcards:updateProgress", progress });
  state.quickstartIndex += 1;
  if (state.quickstartIndex >= state.quickstartQueue.length) {
    buildQuickstartQueue();
  }
  renderQuickstart();
  renderStatistics();
}

function computeNextReview(date, rating) {
  const base = new Date(date);
  switch (rating) {
    case "again":
      base.setHours(base.getHours() + 12);
      break;
    case "good":
      base.setDate(base.getDate() + 1);
      break;
    case "great":
      base.setDate(base.getDate() + 3);
      break;
    default:
      base.setDate(base.getDate() + 1);
  }
  return base;
}

async function resetQuickstartProgress() {
  await chrome.runtime.sendMessage({ type: "flashcards:updateProgress", progress: {} });
  state.flashProgress = {};
  buildQuickstartQueue();
  renderQuickstart();
  renderStatistics();
}

function renderDatabase() {
  const filter = databaseSearchEl.value.trim().toLowerCase();
  renderHistoryList(filter);
  renderHighlightList(filter);
  const totalVideos = state.analysis?.videos?.length ?? 0;
  const totalHighlights = state.collection.length;
  databaseSummaryEl.textContent = `Showing ${totalVideos} analysed videos and ${totalHighlights} saved highlights.`;
}

function renderHistoryList(filter) {
  databaseHistoryEl.innerHTML = "";
  const videos = state.analysis?.videos ?? [];
  const template = document.getElementById("history-item-template");
  const filtered = filter
    ? videos.filter((video) =>
        [video.title ?? "", video.author ?? "", video.summary ?? ""].join(" ").toLowerCase().includes(filter)
      )
    : videos;
  if (!filtered.length) {
    databaseHistoryEl.innerHTML = `<li class="db-item"><p class="db-item__summary">No videos match your search yet.</p></li>`;
    return;
  }
  filtered.forEach((video) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".db-item__title").textContent = video.title ?? "Untitled video";
    node.querySelector(".db-item__title").href = video.url ?? `https://www.youtube.com/watch?v=${video.videoId}`;
    const visited = video.lastVisitTime ?? state.analysis?.generatedAt ?? new Date().toISOString();
    node.querySelector(".db-item__time").textContent = timeAgo(visited);
    node.querySelector(".db-item__summary").textContent = video.summary ?? "Summary not available yet.";
    const details = node.querySelector(".db-item__details");
    details.textContent = `${video.author ?? "Unknown channel"} • ${formatDuration(video.durationSeconds)} • Score ${Math.round(
      (video.educationalScore ?? 0) * 100
    )}%`;
    databaseHistoryEl.appendChild(node);
  });
}

function renderHighlightList(filter) {
  databaseHighlightsEl.innerHTML = "";
  const template = document.getElementById("highlight-item-template");
  const filtered = filter
    ? state.collection.filter((item) =>
        [item.title ?? "", item.excerpt ?? "", item.type ?? ""].join(" ").toLowerCase().includes(filter)
      )
    : state.collection;
  if (!filtered.length) {
    databaseHighlightsEl.innerHTML = `<li class="db-item"><p class="db-item__summary">No highlights recorded yet. Save something from a page, image, or selection to see it here.</p></li>`;
    return;
  }
  filtered.forEach((item) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".db-item__badge").textContent = formatCollectionType(item.type);
    const savedTime = item.savedAt ?? state.analysis?.generatedAt ?? new Date().toISOString();
    node.querySelector(".db-item__time").textContent = timeAgo(savedTime);
    node.querySelector(".db-item__summary").textContent = item.excerpt || item.title || "Saved highlight";
    const links = node.querySelector(".db-item__links");
    if (item.url) {
      const pageLink = document.createElement("a");
      pageLink.href = item.url;
      pageLink.target = "_blank";
      pageLink.rel = "noopener noreferrer";
      pageLink.textContent = "Open page";
      links.appendChild(pageLink);
    }
    if (item.resourceUrl && item.resourceUrl !== item.url) {
      const resourceLink = document.createElement("a");
      resourceLink.href = item.resourceUrl;
      resourceLink.target = "_blank";
      resourceLink.rel = "noopener noreferrer";
      resourceLink.textContent = item.type === "image" ? "Open image" : "Open resource";
      links.appendChild(resourceLink);
    }
    databaseHighlightsEl.appendChild(node);
  });
}

function renderStatistics() {
  if (!state.stats) return;
  statsTotalsEl.innerHTML = "";
  const totals = state.stats.totals ?? {};
  const totalCards = state.flashcards.length;
  const cardsDue = state.quickstartQueue.length;
  const totalsData = [
    { label: "Videos analysed", value: totals.videos ?? 0 },
    { label: "Flashcards available", value: totalCards },
    { label: "Cards due now", value: cardsDue },
    { label: "Saved highlights", value: totals.highlights ?? 0 }
  ];
  totalsData.forEach((item) => {
    const card = document.createElement("div");
    card.className = "stats__card";
    card.innerHTML = `<h4>${item.label}</h4><p>${item.value}</p>`;
    statsTotalsEl.appendChild(card);
  });

  renderBarChart(statsInterestsEl, state.stats.interestMatches, "No interests yet. Add some in Settings.");
  renderBarChart(statsHighlightsEl, state.stats.highlightTypes, "No highlights so far.");
  renderList(statsChannelsEl, state.stats.channels, "No channels ranked yet.");
  renderBarChart(statsFlashcardsEl, state.stats.flashcards, "Practise flashcards in Quickstart.");
}

function renderBarChart(container, data, emptyMessage) {
  container.innerHTML = "";
  if (!data || !Object.keys(data).length) {
    container.innerHTML = `<p class="stats__hint">${emptyMessage}</p>`;
    return;
  }
  const max = Math.max(...Object.values(data));
  Object.entries(data).forEach(([label, value]) => {
    const wrap = document.createElement("div");
    wrap.className = "stats__bar";
    const header = document.createElement("div");
    header.className = "stats__bar-label";
    header.innerHTML = `<span>${label}</span><span>${value}</span>`;
    const track = document.createElement("div");
    track.className = "stats__bar-track";
    const fill = document.createElement("div");
    fill.className = "stats__bar-fill";
    fill.style.width = `${max ? Math.max((value / max) * 100, 6) : 0}%`;
    track.appendChild(fill);
    wrap.appendChild(header);
    wrap.appendChild(track);
    container.appendChild(wrap);
  });
}

function renderList(container, entries, emptyMessage) {
  container.innerHTML = "";
  if (!entries || !entries.length) {
    container.innerHTML = `<p class="stats__hint">${emptyMessage}</p>`;
    return;
  }
  entries.forEach(({ label, value }) => {
    const item = document.createElement("div");
    item.className = "stats__list-item";
    item.innerHTML = `<span>${label}</span><span>${value}</span>`;
    container.appendChild(item);
  });
}

function renderSettings() {
  settingsInterestsInput.value = (state.profile?.interests ?? []).join(", ");
}

async function saveInterests(event) {
  event.preventDefault();
  const interests = settingsInterestsInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);
  try {
    const response = await chrome.runtime.sendMessage({ type: "userProfile:update", profile: { interests } });
    if (response?.ok) {
      state.profile = response.profile;
      await hydrateState();
    }
  } catch (error) {
    console.error("Failed to update interests", error);
  }
}

async function exportData() {
  exportDataButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "app:exportData" });
    if (response?.ok) {
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `learning-reflection-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error("Export failed", error);
  } finally {
    exportDataButton.disabled = false;
  }
}

async function clearData() {
  const confirmation = confirm("This will remove all stored analysis, highlights, flashcard progress, and preferences. Continue?");
  if (!confirmation) return;
  clearDataButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "app:clearData" });
    if (response?.ok) {
      await hydrateState();
    }
  } catch (error) {
    console.error("Failed to clear data", error);
  } finally {
    clearDataButton.disabled = false;
  }
}

async function submitFeedback(event) {
  event.preventDefault();
  const message = feedbackMessageInput.value.trim();
  if (!message) return;
  const email = feedbackEmailInput.value.trim();
  try {
    await chrome.runtime.sendMessage({ type: "feedback:submit", message, email });
  } catch (error) {
    console.warn("Feedback log failed", error);
  }
  const mailto = buildMailto(email, message);
  window.open(mailto, "_blank");
  feedbackForm.reset();
}

function buildMailto(email, message) {
  const recipient = "1171380788@qq.com";
  const subject = encodeURIComponent("Learning Reflection feedback");
  const body = encodeURIComponent(`${message}\n\n------\nContact: ${email || "not provided"}`);
  return `mailto:${recipient}?subject=${subject}&body=${body}`;
}

function copyDeveloperEmail() {
  navigator.clipboard
    .writeText("1171380788@qq.com")
    .then(() => alert("Developer email copied to clipboard."))
    .catch(() => alert("Couldn't copy email. Please copy manually: 1171380788@qq.com"));
}

function generateInitialChat() {
  chatThreadEl.innerHTML = "";
  state.conversation = [];
  appendChatMessage(
    "assistant",
    `Welcome back! I'm ready to help you reflect on your learning. ${
      state.profile?.interests?.length ? "I'm especially tracking " + state.profile.interests.slice(0, 3).join(", ") + "." : ""
    }`
  );
}

function initialiseViews() {
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("view--active", section.id === "view-home");
  });
  renderAll();
}

function setStatus(text, stateName) {
  statusTextEl.textContent = text;
  const colorMap = {
    loading: "#f59e0b",
    success: "#22c55e",
    error: "#ef4444",
    idle: "#2563eb"
  };
  const color = colorMap[stateName] ?? colorMap.idle;
  statusIndicatorEl.style.backgroundColor = color;
  statusIndicatorEl.style.boxShadow = `0 0 6px ${color}80`;
}

function formatCollectionType(type) {
  switch (type) {
    case "selection":
      return "Text";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "link":
      return "Link";
    case "page":
      return "Page";
    default:
      return "Item";
  }
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
