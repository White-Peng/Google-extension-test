const HISTORY_SEARCH_LIMIT = 200;
const HISTORY_LOOKBACK_DAYS = 7;
const YOUTUBE_WATCH_HOST = "www.youtube.com";
const LEARNING_CATEGORY_IDS = new Set(["27"]); // Education category in YouTube API
const LEARNING_KEYWORDS = [
  "learn",
  "learning",
  "tutorial",
  "course",
  "education",
  "study",
  "how to",
  "guide",
  "class",
  "lesson",
  "skill",
  "explained",
  "explain",
  "teaching",
  "practice",
  "revision",
  "exam",
  "concept",
  "overview",
  "fundamentals"
];

const STORAGE_KEYS = {
  API_KEY: "youtubeApiKey",
  PROCESSED_VIDEOS: "processedVideos",
  LAST_PROCESSED_AT: "lastProcessedAt"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    [STORAGE_KEYS.PROCESSED_VIDEOS]: [],
    [STORAGE_KEYS.LAST_PROCESSED_AT]: null
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PROCESS_HISTORY") {
    handleProcessRequest(sendResponse);
    return true;
  }

  if (message?.type === "GET_PROCESSED_VIDEOS") {
    chrome.storage.local
      .get([STORAGE_KEYS.PROCESSED_VIDEOS, STORAGE_KEYS.LAST_PROCESSED_AT])
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        console.error("Failed to load stored videos", error);
        sendResponse({ success: false, error: error?.message ?? String(error) });
      });
    return true;
  }

  if (message?.type === "STORE_API_KEY") {
    const apiKey = message?.payload?.apiKey?.trim();
    if (!apiKey) {
      sendResponse({ success: false, error: "API key is required." });
      return false;
    }

    chrome.storage.local
      .set({ [STORAGE_KEYS.API_KEY]: apiKey })
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Failed to store API key", error);
        sendResponse({ success: false, error: error?.message ?? String(error) });
      });

    return true;
  }

  return false;
});

async function handleProcessRequest(sendResponse) {
  try {
    const apiKey = await getStoredApiKey();
    if (!apiKey) {
      sendResponse({
        success: false,
        error: "YouTube Data API key not found. Set it in the extension options."
      });
      return;
    }

    const processedVideos = await processRecentHistory(apiKey);
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROCESSED_VIDEOS]: processedVideos,
      [STORAGE_KEYS.LAST_PROCESSED_AT]: Date.now()
    });

    sendResponse({ success: true, data: processedVideos });
  } catch (error) {
    console.error("Failed to process history", error);
    sendResponse({ success: false, error: error?.message ?? String(error) });
  }
}

async function getStoredApiKey() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return result?.[STORAGE_KEYS.API_KEY] ?? "";
}

async function processRecentHistory(apiKey) {
  const historyEntries = await loadRecentYouTubeWatchHistory();
  if (!historyEntries.length) {
    return [];
  }

  const uniqueVideoIds = [...new Set(historyEntries.map((entry) => entry.videoId))];
  const videoDetails = await fetchVideoDetails(uniqueVideoIds, apiKey);
  const categoryLookup = await fetchCategoryLookup(apiKey);

  return videoDetails
    .map((video) => {
      const snippet = video?.snippet;
      if (!snippet) return null;

      if (!isLearningFocused(snippet, categoryLookup)) return null;

      const summary = buildReflectionSummary(snippet);
      const flashcards = buildFlashcards(snippet, summary, video.id);

      return {
        videoId: video.id,
        title: snippet.title,
        channelTitle: snippet.channelTitle,
        description: snippet.description,
        publishedAt: snippet.publishedAt,
        categoryId: snippet.categoryId,
        categoryTitle: categoryLookup[snippet.categoryId] ?? "Unknown",
        summary,
        flashcards,
        url: `https://www.youtube.com/watch?v=${video.id}`
      };
    })
    .filter(Boolean);
}

async function loadRecentYouTubeWatchHistory() {
  const startTime = Date.now() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const historyItems = await chrome.history.search({
    text: "https://www.youtube.com/watch",
    startTime,
    maxResults: HISTORY_SEARCH_LIMIT
  });

  return historyItems
    .map((item) => {
      try {
        const parsedUrl = new URL(item.url);
        if (parsedUrl.hostname !== YOUTUBE_WATCH_HOST) return null;

        const videoId = parsedUrl.searchParams.get("v");
        if (!videoId) return null;

        return {
          videoId,
          lastVisitTime: item.lastVisitTime ?? item.visitTime ?? 0
        };
      } catch (error) {
        console.warn("Unable to parse history entry", item?.url, error);
        return null;
      }
    })
    .filter(Boolean);
}

async function fetchVideoDetails(videoIds, apiKey) {
  const responses = [];

  for (const chunk of chunkArray(videoIds, 50)) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({
      key: apiKey,
      id: chunk.join(","),
      part: "snippet,contentDetails"
    }).toString();

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube API videos request failed: ${response.status} ${errorBody}`);
    }

    const payload = await response.json();
    responses.push(...(payload.items ?? []));
  }

  return responses;
}

async function fetchCategoryLookup(apiKey) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videoCategories");
  url.search = new URLSearchParams({
    part: "snippet",
    regionCode: "US",
    key: apiKey
  }).toString();

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube API categories request failed: ${response.status} ${errorBody}`);
    }

    const payload = await response.json();
    return (payload.items ?? []).reduce((acc, category) => {
      const categoryId = category.id;
      const title = category?.snippet?.title;
      if (categoryId && title) {
        acc[categoryId] = title;
      }
      return acc;
    }, {});
  } catch (error) {
    console.error("Failed to fetch category lookup", error);
    return {};
  }
}

function isLearningFocused(snippet, categoryLookup) {
  if (!snippet) return false;

  if (snippet.categoryId && LEARNING_CATEGORY_IDS.has(snippet.categoryId)) {
    return true;
  }

  const categoryTitle = categoryLookup[snippet.categoryId];
  if (categoryTitle && /education|how-to|science/i.test(categoryTitle)) {
    return true;
  }

  const haystack = `${snippet.title} ${snippet.description ?? ""}`.toLowerCase();
  return LEARNING_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function buildReflectionSummary(snippet) {
  const sentences = splitIntoSentences(snippet.description ?? "");
  const keySentences = sentences.filter((sentence) =>
    LEARNING_KEYWORDS.some((keyword) => sentence.toLowerCase().includes(keyword))
  );

  const selectedSentences =
    keySentences.length >= 2
      ? keySentences.slice(0, 3)
      : sentences.slice(0, 3);

  const bulletPoints = selectedSentences.map((sentence) => `- ${sentence.trim()}`);

  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    coreIdeas: bulletPoints,
    reflectionPrompt: buildReflectionPrompt(snippet)
  };
}

function buildReflectionPrompt(snippet) {
  const title = snippet.title ?? "the video";
  return `After watching "${title}", what is one concept you could apply this week and what resources would you need to do so?`;
}

function buildFlashcards(snippet, summary, videoId) {
  const sentences = splitIntoSentences(snippet.description ?? "");
  const topSentences = sentences.slice(0, 5);

  const cards = topSentences.map((sentence, index) => ({
    id: `${videoId ?? snippet.title}-${index}`,
    question: deriveQuestionFromSentence(sentence, snippet.title),
    answer: sentence.trim()
  }));

  if (!cards.length && summary.coreIdeas?.length) {
    summary.coreIdeas.forEach((idea, index) => {
      cards.push({
        id: `${snippet.title}-summary-${index}`,
        question: `What is a key takeaway from "${snippet.title}"?`,
        answer: idea.replace(/^-\s*/, "")
      });
    });
  }

  return cards.slice(0, 5);
}

function deriveQuestionFromSentence(sentence, title = "") {
  const trimmed = sentence.trim();
  if (!trimmed) return `What is one idea highlighted in "${title}"?`;

  if (/(\d+%|\d+\s+(?:steps?|tips?))/i.test(trimmed)) {
    return `According to "${title}", what key metric or step is highlighted here?`;
  }

  if (trimmed.length < 100) {
    return `What does "${title}" explain about: "${trimmed}"?`;
  }

  return `Summarize the main idea presented in "${title}".`;
}

function splitIntoSentences(text) {
  return text
    .replace(/\r?\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function chunkArray(items, chunkSize) {
  const result = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}
