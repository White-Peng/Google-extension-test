(() => {
  if (window.hasLearningReflectionButton) {
    return;
  }
  window.hasLearningReflectionButton = true;

  const button = document.createElement("button");
  button.textContent = "Study with Learning Reflection";
  button.setAttribute("type", "button");
  button.style.position = "fixed";
  button.style.bottom = "24px";
  button.style.right = "24px";
  button.style.zIndex = "2147483647";
  button.style.padding = "12px 16px";
  button.style.borderRadius = "999px";
  button.style.border = "none";
  button.style.background = "linear-gradient(135deg,#2563eb,#1d4ed8)";
  button.style.color = "#fff";
  button.style.fontWeight = "600";
  button.style.boxShadow = "0 12px 24px rgba(37,99,235,0.35)";
  button.style.cursor = "pointer";

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "learning-analysis:openDashboard" });
  });

  document.body.appendChild(button);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(button)) {
      document.body.appendChild(button);
    }
  });

  observer.observe(document.body, { childList: true });
})();
