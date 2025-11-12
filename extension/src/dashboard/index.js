import { timeAgo, formatDuration } from "../popup/popup.js";

const refreshButton = document.getElementById("refresh");
const statusTextEl = document.getElementById("status-text");
const statusIndicatorEl = document.getElementById("status-indicator");
const videoListEl = document.getElementById("video-list");
const flashcardListEl = document.getElementById("flashcard-list");
const collectionListEl = document.getElementById("collection-list");

document.addEventListener("DOMContentLoaded", async () => {
  refreshButton?.addEventListener("click", handleManualRefresh);
  collectionListEl?.addEventListener("click", handleCollectionClick);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "learning-analysis:updated") {
      renderAnalysis(message.payload);
      setStatus("Analysis updated just now.", "success");
    }
    if (message?.type === "learning-collection:updated") {
      loadCollections();
    }
  });

  await Promise.all([loadLatestAnalysis(), loadCollections()]);
});

async function loadLatestAnalysis() {
  setStatus("Loading the latest analysis…", "loading");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "learning-analysis:getLatest"
    });

    if (response?.ok && response.data) {
      renderAnalysis(response.data);
      setStatus(`Generated ${timeAgo(response.data.generatedAt)}`, "success");
    } else {
      setStatus("No analysis available yet. Request history access in the popup to begin.", "idle");
    }
  } catch (error) {
    console.error("Failed to load analysis", error);
    setStatus("Unable to load analysis. Try refreshing.", "error");
  }
}

async function loadCollections() {
  if (!collectionListEl) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "collection:getAll" });
    if (response?.ok) {
      renderCollections(response.items ?? []);
    } else {
      throw new Error(response?.error ?? "Unable to fetch collection");
    }
  } catch (error) {
    console.error("Failed to load collections", error);
    collectionListEl.innerHTML = "";
    const message = document.createElement("p");
    message.className = "collection__excerpt";
    message.textContent = "Unable to load saved highlights right now.";
    collectionListEl.appendChild(message);
  }
}

async function handleManualRefresh() {
  setStatus("Re-running analysis…", "loading");
  refreshButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "learning-analysis:run"
    });

    if (response?.ok && response.data) {
      renderAnalysis(response.data);
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

function renderAnalysis(data) {
  renderVideos(data?.videos ?? []);
  renderFlashcards(data?.flashcards ?? []);
}

function renderVideos(videos) {
  videoListEl.innerHTML = "";
  if (!videos.length) {
    const empty = document.createElement("li");
    empty.className = "video";
    empty.textContent = "No educational videos were detected in your recent history.";
    videoListEl.appendChild(empty);
    return;
  }

  const template = document.getElementById("video-item-template");

  for (const video of videos) {
    const clone = template.content.cloneNode(true);
    const titleEl = clone.querySelector(".video__title");
    const summaryEl = clone.querySelector(".video__summary");
    const channelEl = clone.querySelector(".video__channel");
    const durationEl = clone.querySelector(".video__duration");
    const scoreEl = clone.querySelector(".video__score");

    titleEl.textContent = video.title ?? "Untitled video";
    titleEl.href = video.url ?? `https://www.youtube.com/watch?v=${video.videoId}`;
    summaryEl.textContent = video.summary ?? "No summary available yet.";
    channelEl.textContent = video.author ?? "Unknown channel";
    durationEl.textContent = formatDuration(video.durationSeconds);
    scoreEl.textContent = `Score: ${(video.educationalScore * 100).toFixed(0)}%`;

    videoListEl.appendChild(clone);
  }
}

function renderFlashcards(cards) {
  flashcardListEl.innerHTML = "";
  if (!cards.length) {
    const placeholder = document.createElement("p");
    placeholder.textContent = "Flashcards will appear once educational videos are detected.";
    flashcardListEl.appendChild(placeholder);
    return;
  }

  const template = document.getElementById("flashcard-template");

  for (const card of cards) {
    const clone = template.content.cloneNode(true);
    const flashcardEl = clone.querySelector(".flashcard");
    const questionEl = clone.querySelector(".flashcard__question");
    const answerEl = clone.querySelector(".flashcard__answer");
    const linkEl = clone.querySelector(".flashcard__link");
    const toggleButton = clone.querySelector(".flashcard__toggle");

    questionEl.textContent = card.question;
    answerEl.textContent = card.answer;
    linkEl.href = card.source ?? "#";

    toggleButton.addEventListener("click", () => {
      const nextState = flashcardEl.dataset.state === "question" ? "answer" : "question";
      flashcardEl.dataset.state = nextState;
    });

    flashcardListEl.appendChild(clone);
  }
}

function renderCollections(items) {
  collectionListEl.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "collection__excerpt";
    empty.textContent = "Clip articles, selections, or images via the context menu to build your personal learning library.";
    collectionListEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const container = document.createElement("article");
    container.className = "collection";
    container.dataset.id = item.id;

    const badge = document.createElement("span");
    badge.className = "collection__badge";
    badge.textContent = formatCollectionType(item.type);

    const body = document.createElement("div");
    body.className = "collection__body";

    const titleEl = document.createElement("h3");
    titleEl.className = "collection__title";
    titleEl.textContent = item.title || "Untitled item";

    const excerptEl = document.createElement("p");
    excerptEl.className = "collection__excerpt";
    excerptEl.textContent = item.excerpt || item.resourceUrl || "Saved page";

    const metaEl = document.createElement("div");
    metaEl.className = "collection__meta";

    const savedSpan = document.createElement("span");
    savedSpan.textContent = `Saved ${timeAgo(item.savedAt)}`;
    metaEl.appendChild(savedSpan);

    if (item.url) {
      const pageLink = document.createElement("a");
      pageLink.href = item.url;
      pageLink.target = "_blank";
      pageLink.rel = "noopener noreferrer";
      pageLink.textContent = "Open page";
      metaEl.appendChild(pageLink);
    }

    if (item.resourceUrl && item.resourceUrl !== item.url) {
      const resourceLink = document.createElement("a");
      resourceLink.href = item.resourceUrl;
      resourceLink.target = "_blank";
      resourceLink.rel = "noopener noreferrer";
      resourceLink.textContent = item.type === "image" ? "Open image" : "Open resource";
      metaEl.appendChild(resourceLink);
    }

    body.appendChild(titleEl);
    body.appendChild(excerptEl);
    body.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "collection__actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "collection__remove";
    removeButton.dataset.action = "remove-collection";
    removeButton.dataset.id = item.id;
    removeButton.textContent = "Remove";
    actions.appendChild(removeButton);

    container.appendChild(badge);
    container.appendChild(body);
    container.appendChild(actions);

    collectionListEl.appendChild(container);
  });
}

function setStatus(text, state) {
  statusTextEl.textContent = text;

  const colorMap = {
    loading: "#f59e0b",
    success: "#22c55e",
    error: "#ef4444",
    idle: "#38bdf8"
  };

  const color = colorMap[state] ?? colorMap.idle;
  statusIndicatorEl.style.backgroundColor = color;
  statusIndicatorEl.style.boxShadow = `0 0 8px ${color}80`;
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

async function handleCollectionClick(event) {
  const button = event.target.closest("button[data-action='remove-collection']");
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  button.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "collection:remove", id });
    if (response?.ok) {
      renderCollections(response.items ?? []);
    } else {
      throw new Error(response?.error ?? "Unable to remove item");
    }
  } catch (error) {
    console.error("Failed to remove collection item", error);
  } finally {
    button.disabled = false;
  }
}
