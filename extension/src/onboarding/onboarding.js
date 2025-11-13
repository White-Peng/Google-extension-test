import { requestHistoryPermission } from "../utils/permissions.js";

const grantButton = document.getElementById("grant-access");
const skipButton = document.getElementById("skip");
const statusEl = document.getElementById("status");

grantButton.addEventListener("click", async () => {
  setStatus("Requesting permission…");
  try {
    const granted = await requestHistoryPermission();
    if (granted) {
      setStatus("Thanks! You can close this tab and start using the extension.");
      grantButton.disabled = true;
    } else {
      setStatus("Permission was declined. You can grant it later from the popup.");
    }
  } catch (error) {
    console.error("Permission request failed", error);
    setStatus("Something went wrong. Please try again.");
  }
});

skipButton.addEventListener("click", () => {
  window.close();
});

function setStatus(text) {
  statusEl.textContent = text;
}
