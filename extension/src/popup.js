const refreshButton = document.getElementById("refreshButton");
const openOptionsLink = document.getElementById("openOptionsLink");
const statusSection = document.getElementById("statusSection");
const statusMessage = document.getElementById("statusMessage");
const emptyState = document.getElementById("emptyState");
const videosContainer = document.getElementById("videosContainer");

const videoTemplate = document.getElementById("videoTemplate");
const flashcardTemplate = document.getElementById("flashcardTemplate");

initialize();

function initialize() {
  refreshButton?.addEventListener("click", handleRefreshClick);
  openOptionsLink?.addEventListener("click", handleOpenOptions);
  loadStoredData();
}

function handleOpenOptions(event) {
  event.preventDefault();
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("src/options.html"));
  }
}

async function handleRefreshClick() {
  setStatus("Processing YouTube history…", "info");
  toggleLoading(true);

  try {
    const response = await sendMessageAsync({ type: "PROCESS_HISTORY" });
    if (!response?.success) {
      throw new Error(response?.error ?? "Unknown error");
    }

    renderVideos(response.data ?? []);
    setStatus(`Found ${response.data?.length ?? 0} learning-focused videos.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error?.message ?? "Failed to process history.", "error");
  } finally {
    toggleLoading(false);
  }
}

async function loadStoredData() {
  toggleLoading(true);
  try {
    const response = await sendMessageAsync({ type: "GET_PROCESSED_VIDEOS" });
    if (!response?.success) {
      throw new Error(response?.error ?? "Unable to load stored data.");
    }

    const videos = response?.data?.processedVideos ?? [];
    renderVideos(videos);

    if (response?.data?.lastProcessedAt) {
      const lastProcessed = new Date(response.data.lastProcessedAt);
      setStatus(`Last updated ${lastProcessed.toLocaleString()}.`, "info");
    } else if (!videos.length) {
      showEmptyState(true);
    }
  } catch (error) {
    console.error(error);
    setStatus(error?.message ?? "Failed to load data.", "error");
  } finally {
    toggleLoading(false);
  }
}

function renderVideos(videos = []) {
  videosContainer.innerHTML = "";

  if (!videos.length) {
    showEmptyState(true);
    return;
  }

  showEmptyState(false);

  videos.forEach((video) => {
    const videoElement = videoTemplate.content.cloneNode(true);
    const titleEl = videoElement.querySelector(".video-card__title");
    const linkEl = videoElement.querySelector(".video-card__link");
    const channelEl = videoElement.querySelector(".video-card__channel");
    const publishedEl = videoElement.querySelector(".video-card__published");
    const categoryEl = videoElement.querySelector(".video-card__category");
    const ideasEl = videoElement.querySelector(".video-card__ideas");
    const promptEl = videoElement.querySelector(".video-card__prompt");
    const flashcardsContainer = videoElement.querySelector(".flashcards");

    titleEl.textContent = video.title ?? "Untitled video";
    linkEl.href = video.url;
    channelEl.textContent = video.channelTitle ?? "Unknown channel";
    publishedEl.textContent = video.publishedAt
      ? new Date(video.publishedAt).toLocaleDateString()
      : "";
    categoryEl.textContent = video.categoryTitle ? `Category: ${video.categoryTitle}` : "";

    (video.summary?.coreIdeas ?? []).forEach((idea) => {
      const listItem = document.createElement("li");
      listItem.textContent = idea.replace(/^-\s*/, "");
      ideasEl.appendChild(listItem);
    });

    promptEl.textContent = video.summary?.reflectionPrompt ?? "";

    (video.flashcards ?? []).forEach((card) => {
      const flashcardElement = flashcardTemplate.content.cloneNode(true);
      const questionEl = flashcardElement.querySelector(".flashcard__question");
      const answerEl = flashcardElement.querySelector(".flashcard__answer");
      const toggleButton = flashcardElement.querySelector(".flashcard__toggle");

      questionEl.textContent = card.question;
      answerEl.textContent = card.answer;

      toggleButton.addEventListener("click", () => {
        const isHidden = answerEl.classList.toggle("flashcard__answer--hidden");
        toggleButton.textContent = isHidden ? "Show answer" : "Hide answer";
      });

      flashcardsContainer.appendChild(flashcardElement);
    });

    videosContainer.appendChild(videoElement);
  });
}

function toggleLoading(isLoading) {
  if (!refreshButton) return;
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "Loading…" : "Refresh";
}

function showEmptyState(shouldShow) {
  emptyState.classList.toggle("status--hidden", !shouldShow);
  videosContainer.classList.toggle("status--hidden", shouldShow);
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
