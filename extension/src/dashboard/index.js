import { timeAgo, formatDuration } from "../popup/popup.js";

const refreshButton = document.getElementById("refresh");
const statusTextEl = document.getElementById("status-text");
const statusIndicatorEl = document.getElementById("status-indicator");
const videoListEl = document.getElementById("video-list");
const flashcardListEl = document.getElementById("flashcard-list");

document.addEventListener("DOMContentLoaded", async () => {
  refreshButton.addEventListener("click", handleManualRefresh);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "learning-analysis:updated") {
      renderAnalysis(message.payload);
      setStatus("Analysis updated just now.", "success");
    }
  });

  await loadLatestAnalysis();
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

function setStatus(text, state) {
  statusTextEl.textContent = text;

  const colorMap = {
    loading: "#f59e0b",
    success: "#22c55e",
    error: "#ef4444",
    idle: "#38bdf8"
  };

  statusIndicatorEl.style.backgroundColor = colorMap[state] ?? colorMap.idle;
  statusIndicatorEl.style.boxShadow = `0 0 8px ${(colorMap[state] ?? colorMap.idle)}80`;
}
