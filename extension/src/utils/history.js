const WATCH_HISTORY_SEARCH_TEXT = "https://www.youtube.com/watch";

export async function fetchRecentLearningVideos(settings) {
  const {
    lookbackHours,
    maxResults,
    includeShorts,
    minimumDurationMinutes,
    locale
  } = settings;

  const startTime = Date.now() - lookbackHours * 60 * 60 * 1000;
  const historyItems = await chrome.history.search({
    text: WATCH_HISTORY_SEARCH_TEXT,
    startTime,
    maxResults: Math.min(maxResults * 5, 500)
  });

  const videosById = new Map();

  for (const item of historyItems) {
    const url = item.url ?? "";
    const videoId = extractVideoId(url);
    if (!videoId) continue;

    const existing = videosById.get(videoId);
    if (!existing || (item.lastVisitTime ?? 0) > (existing.lastVisitTime ?? 0)) {
      videosById.set(videoId, {
        videoId,
        url,
        title: item.title ?? "",
        lastVisitTime: item.lastVisitTime ?? Date.now()
      });
    }
  }

  const enriched = await Promise.all(
    Array.from(videosById.values()).map(async (video) => {
      const metadata = await fetchVideoMetadata(video.url, locale);
      return {
        ...video,
        ...metadata
      };
    })
  );

  const filtered = enriched
    .filter((video) => {
      if (!video.videoId) return false;
      if (!includeShorts && video.durationSeconds && video.durationSeconds < minimumDurationMinutes * 60) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
    .slice(0, maxResults);

  return filtered;
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("youtube.com")) return null;
    if (parsed.pathname === "/watch") {
      return parsed.searchParams.get("v");
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.split("/")[2] ?? null;
    }
    return null;
  } catch (error) {
    console.debug("Failed to parse video url", url, error);
    return null;
  }
}

async function fetchVideoMetadata(url, locale) {
  if (!url) return {};

  try {
    const response = await fetch(url, {
      credentials: "omit",
      mode: "cors",
      headers: {
        "Accept-Language": locale ?? "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      throw new Error(`Unable to fetch video page (${response.status})`);
    }

    const text = await response.text();
    const playerResponse = extractPlayerResponse(text);
    if (!playerResponse) {
      return {};
    }

    const details = playerResponse.videoDetails ?? {};
    const microformat = playerResponse.microformat?.playerMicroformatRenderer ?? {};

    const durationSeconds = Number(details.lengthSeconds ?? microformat.lengthSeconds ?? 0) || undefined;
    const channel = details.author ?? microformat.ownerChannelName ?? "";
    const publishedTimeText = microformat.publishDate ?? "";

    return {
      title: details.title ?? microformat.title?.simpleText ?? "",
      author: channel,
      description: details.shortDescription ?? "",
      durationSeconds,
      thumbnails: details.thumbnail?.thumbnails ?? [],
      publishedTime: publishedTimeText
    };
  } catch (error) {
    console.warn("Failed to fetch metadata", error);
    return {};
  }
}

function extractPlayerResponse(html) {
  const regex = /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s;
  const match = html.match(regex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    console.warn("Failed to parse ytInitialPlayerResponse", error);
    return null;
  }
}
