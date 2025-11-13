import { storeError } from "./storage.js";

const HEURISTIC_THRESHOLD = 0.35;

export async function analyzeVideos(videos, settings) {
  const { keywords = [], summaryProvider } = settings;

  const analyses = await Promise.all(
    videos.map(async (video) => {
      const loweredKeywords = (keywords ?? []).map((keyword) => keyword.toLowerCase().trim()).filter(Boolean);
      const { score, matchedKeywords } = scoreVideo(video, loweredKeywords);

      if (score < HEURISTIC_THRESHOLD) {
        return null;
      }

      const summary =
        summaryProvider === "llm"
          ? await summarizeWithLLM(video, settings).catch(async (error) => {
              console.warn("LLM summary failed", error);
              await storeError("llm_summary_failed", error?.message ?? String(error));
              return heuristicSummary(video);
            })
          : heuristicSummary(video);

      const reflections = buildReflectionPrompts(video, summary, matchedKeywords);

      return {
        ...video,
        matchedKeywords,
        educationalScore: score,
        insights: reflections,
        summary
      };
    })
  );

  return analyses.filter(Boolean);
}

export function generateFlashcards(analyses, settings) {
  const flashcards = [];
  const maxCards = Math.max(3, Math.min(settings.maxResults, 25));

  for (const analysis of analyses) {
    if (flashcards.length >= maxCards) break;
    const { title, summary, url, insights = [] } = analysis;

    flashcards.push({
      id: `${analysis.videoId}-takeaway`,
      question: `What are the key takeaways from "${title}"?`,
      answer: summary,
      source: url
    });

    for (const insight of insights) {
      if (flashcards.length >= maxCards) break;
      flashcards.push({
        id: `${analysis.videoId}-${flashcards.length}`,
        question: insight.prompt,
        answer: insight.sampleAnswer,
        source: url
      });
    }
  }

  return flashcards;
}

function scoreVideo(video, keywords) {
  const haystack = [video.title ?? "", video.description ?? ""].join(" ").toLowerCase();
  let matchedKeywords = [];
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) {
      matchedKeywords.push(keyword);
      score += 0.12;
    }
  }

  if (video.durationSeconds && video.durationSeconds >= 8 * 60) {
    score += 0.1;
  }

  if ((video.author ?? "").toLowerCase().includes("university")) {
    score += 0.08;
  }

  if (/(lesson|training|tutorial|course|explained)/i.test(video.title ?? "")) {
    score += 0.15;
  }

  score = Math.min(score, 1);

  return { score, matchedKeywords };
}

function heuristicSummary(video) {
  const sentences = (video.description ?? "")
    .replace(/\s+/g, " ")
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return `Educational highlights from "${video.title}" are not available yet. Review the video directly to capture the main ideas.`;
  }

  return sentences.slice(0, 3).join(". ") + ".";
}

async function summarizeWithLLM(video, settings) {
  if (!settings.llmEndpoint || !settings.llmApiKey) {
    throw new Error("LLM endpoint or API key not configured");
  }

  const response = await fetch(settings.llmEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.llmApiKey}`
    },
    body: JSON.stringify({
      model: settings.llmModel ?? "gpt-4o-mini",
      input: `YouTube video metadata:\nTitle: ${video.title}\nChannel: ${video.author}\nDescription: ${video.description}\n\nTask: Produce a concise learning summary (max 120 words) focusing on actionable insights.`
    })
  });

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const summary = data.summary ?? data.output ?? data.choices?.[0]?.message?.content;

  if (!summary) {
    throw new Error("LLM response missing summary");
  }

  return summary.trim();
}

function buildReflectionPrompts(video, summary, matchedKeywords = []) {
  const prompts = [];

  prompts.push({
    prompt: `How can you apply the main idea from "${video.title}" to your current learning goals?`,
    sampleAnswer: summary
  });

  if (matchedKeywords.includes("exam")) {
    prompts.push({
      prompt: `What exam-style question could you craft from "${video.title}", and how would you answer it?`,
      sampleAnswer: "Draft a specific question and outline the answer highlighting key concepts."
    });
  }

  if ((video.durationSeconds ?? 0) > 20 * 60) {
    prompts.push({
      prompt: `Break down the content of "${video.title}" into three major sections. What is the takeaway from each?`,
      sampleAnswer: "Summaries of each section highlighting their unique focus."
    });
  }

  return prompts;
}
