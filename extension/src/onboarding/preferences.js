const popularTopics = [
  "machine learning",
  "productivity",
  "language learning",
  "exam prep",
  "neuroscience",
  "design theory",
  "web development",
  "data analysis",
  "history",
  "philosophy",
  "creative writing",
  "public speaking"
];

const chipListEl = document.getElementById("chip-list");
const customInput = document.getElementById("custom-interests");
const interestForm = document.getElementById("interest-form");
const skipButton = document.getElementById("skip-btn");

let selected = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  renderChips();
  await hydrateProfile();
});

interestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveProfile();
});

skipButton.addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("src/dashboard/index.html")
  });
  window.close();
});

function renderChips() {
  chipListEl.innerHTML = "";
  for (const topic of popularTopics) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = topic;
    chip.dataset.value = topic;
    chip.dataset.selected = "false";
    chip.addEventListener("click", () => toggleSelection(topic, chip));
    chipListEl.appendChild(chip);
  }
}

async function hydrateProfile() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "userProfile:get" });
    if (response?.ok) {
      selected = new Set(response.profile?.interests ?? []);
      customInput.value = Array.from(selected)
        .filter((topic) => !popularTopics.includes(topic))
        .join(", ");
      updateChipStates();
    }
  } catch (error) {
    console.warn("Failed to load user profile", error);
  }
}

function toggleSelection(topic, chipEl) {
  if (selected.has(topic)) {
    selected.delete(topic);
    chipEl.dataset.selected = "false";
  } else {
    selected.add(topic);
    chipEl.dataset.selected = "true";
  }
}

function updateChipStates() {
  chipListEl.querySelectorAll(".chip").forEach((chip) => {
    const topic = chip.dataset.value;
    chip.dataset.selected = selected.has(topic) ? "true" : "false";
  });
}

async function saveProfile() {
  const customTopics = customInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  customTopics.forEach((topic) => selected.add(topic));

  const interests = Array.from(selected).slice(0, 25);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "userProfile:update",
      profile: { interests }
    });

    if (response?.ok) {
      chrome.tabs.create({
        url: chrome.runtime.getURL("src/dashboard/index.html")
      });
      window.close();
    }
  } catch (error) {
    console.error("Failed to save profile", error);
  }
}
