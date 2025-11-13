export async function hasHistoryPermission() {
  return chrome.permissions.contains({ permissions: ["history"] });
}

export async function requestHistoryPermission() {
  return chrome.permissions.request({ permissions: ["history"] });
}

export async function removeHistoryPermission() {
  return chrome.permissions.remove({ permissions: ["history"] });
}
