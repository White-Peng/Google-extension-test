const statusTextEl = document.getElementById("status-text");
const statusIndicatorEl = document.getElementById("status-indicator");
const videoListEl = document.getElementById("video-list");
const flashcardListEl = document.getElementById("flashcard-list");
const collectionListEl = document.getElementById("collection-list-popup");
const refreshButton = document.querySelector('[data-action="refresh"]');
const dashboardButton = document.querySelector('[data-action="open-dashboard"]');
const permissionCard = document.getElementById("permission-card");
const permissionButton = document.querySelector('[data-action="request-permission"]');

let hasHistory = false;

document.addEventListener("DOMContentLoaded", async () => {
  refreshButton?.addEventListener("click", handleManualRefresh);
  dashboardButton?.addEventListener("click", openDashboard);
  permissionButton?.addEventListener("click", requestPermission);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "learning-analysis:updated") {
      renderAnalysis(message.payload);
      setStatus("Analysis updated just now.", "success");
    }
    if (message?.type === "learning-collection:updated") {
      loadCollections();
    }
  });

  await syncPermissionAndData();
  await loadCollections();
});

async function syncPermissionAndData() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "learning-analysis:checkPermission" });
    if (!response?.ok) {
      throw new Error(response?.error ?? "Unable to check permission");
    }
    hasHistory = response.granted;
    updatePermissionUI();

    if (hasHistory) {
      await loadLatestAnalysis();
    } else {
      setStatus("History access required to build summaries and flashcards.", "idle");
    }
  } catch (error) {
    console.error("Permission check failed", error);
    setStatus("Unable to verify permissions. Try again later.", "error");
  }
}

async function requestPermission() {
  setStatus("Requesting permission…", "loading");
  permissionButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "learning-analysis:requestPermission" });
    if (response?.ok && response.granted) {
      hasHistory = true;
      updatePermissionUI();
      setStatus("Thanks! Running the first analysis…", "loading");
      await loadLatestAnalysis();
    } else {
      setStatus("Permission not granted. You can try again anytime.", "idle");
    }
  } catch (error) {
    console.error("Permission request failed", error);
    setStatus("Something went wrong while requesting access.", "error");
  } finally {
    permissionButton.disabled = false;
  }
}

async function loadLatestAnalysis() {
  if (!hasHistory) {
    return;
  }

  setStatus("Loading the latest analysis…", "loading");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "learning-analysis:getLatest"
    });

    if (response?.ok && response.data) {
      renderAnalysis(response.data);
      setStatus(`Generated ${timeAgo(response.data.generatedAt)}`, "success");
    } else {
      setStatus("No analysis available yet. Click refresh to start.", "idle");
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
      throw new Error(response?.error ?? "Unable to fetch saved highlights");
    }
  } catch (error) {
    console.error("Failed to load collections", error);
    collectionListEl.innerHTML = "";
    const item = document.createElement("li");
    item.className = "collection-item";
    const excerpt = document.createElement("p");
    excerpt.className = "collection-item__excerpt";
    excerpt.textContent = "Unable to load saved highlights right now.";
    item.appendChild(excerpt);
    collectionListEl.appendChild(item);
  }
}

async function handleManualRefresh() {
  if (!hasHistory) {
    setStatus("Grant history access first to enable analysis.", "idle");
    return;
  }

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
    const sourceEl = clone.querySelector(".flashcard__source");
    const toggleEl = clone.querySelector(".flashcard__toggle");

    flashcardEl.dataset.state = "question";
    questionEl.textContent = card.question;
    answerEl.textContent = card.answer;
    sourceEl.href = card.source ?? "#";

    toggleEl.addEventListener("click", () => {
      flashcardEl.dataset.state = flashcardEl.dataset.state === "question" ? "answer" : "question";
    });

    flashcardListEl.appendChild(clone);
  }
}

function renderCollections(items) {
  if (!collectionListEl) return;
  collectionListEl.innerHTML = "";

  const topItems = items.slice(0, 3);

  if (!topItems.length) {
    const empty = document.createElement("li");
    empty.className = "collection-item";
    const excerpt = document.createElement("p");
    excerpt.className = "collection-item__excerpt";
    excerpt.textContent = "Right-click any page, selection, or image to save it here.";
    empty.appendChild(excerpt);
    collectionListEl.appendChild(empty);
    return;
  }

  topItems.forEach((item) => {
    const li = document.createElement("li");
    li.className = "collection-item";

    const header = document.createElement("div");
    header.className = "collection-item__header";

    const badge = document.createElement("span");
    badge.className = "collection-item__badge";
    badge.textContent = formatCollectionType(item.type);

    const time = document.createElement("span");
    time.className = "collection-item__time";
    time.textContent = timeAgo(item.savedAt);

    header.appendChild(badge);
    header.appendChild(time);

    const excerpt = document.createElement("p");
    excerpt.className = "collection-item__excerpt";
    excerpt.textContent = truncateText(item.excerpt || item.title || "Saved item", 140);

    li.appendChild(header);
    li.appendChild(excerpt);

    const destination = item.resourceUrl && item.resourceUrl !== item.url ? item.resourceUrl : item.url;
    if (destination) {
      const link = document.createElement("a");
      link.className = "collection-item__link";
      link.href = destination;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open source";
      li.appendChild(link);
    }
    collectionListEl.appendChild(li);
  });
}

function setStatus(text, state) {
  statusTextEl.textContent = text;

  const colorMap = {
    loading: "#f59e0b",
    success: "#22c55e",
    error: "#ef4444",
    idle: "#2563eb"
  };

  const color = colorMap[state] ?? colorMap.idle;
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

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function updatePermissionUI() {
  if (hasHistory) {
    permissionCard.hidden = true;
    refreshButton.disabled = false;
  } else {
    permissionCard.hidden = false;
    refreshButton.disabled = true;
  }
}

async function openDashboard() {
  await chrome.runtime.sendMessage({ type: "learning-analysis:openDashboard" });
  window.close();
}

export function formatDuration(seconds) {
  if (!seconds) return "Length unknown";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 90) {
    return `${(mins / 60).toFixed(1)} hr`;
  }
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function timeAgo(isoString) {
  if (!isoString) return "recently";
  const delta = Date.now() - new Date(isoString).getTime();
  const minutes = Math.round(delta / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
