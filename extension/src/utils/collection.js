const COLLECTION_KEY = "learningCollection";
const COLLECTION_LIMIT = 200;

export async function getCollectionItems() {
  const result = await chrome.storage.local.get([COLLECTION_KEY]);
  const items = result[COLLECTION_KEY] ?? [];
  return items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

export async function addCollectionItem(partial) {
  const item = {
    id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    type: partial.type ?? "note",
    title: partial.title ?? "",
    url: partial.url ?? "",
    resourceUrl: partial.resourceUrl ?? null,
    excerpt: partial.excerpt ?? "",
    metadata: partial.metadata ?? {}
  };

  const existing = await getCollectionItems();
  const deduped = existing.filter(
    (entry) =>
      !(
        entry.type === item.type &&
        entry.url === item.url &&
        entry.excerpt === item.excerpt &&
        entry.resourceUrl === item.resourceUrl
      )
  );

  deduped.unshift(item);

  await chrome.storage.local.set({
    [COLLECTION_KEY]: deduped.slice(0, COLLECTION_LIMIT)
  });

  return item;
}

export async function removeCollectionItem(id) {
  const existing = await getCollectionItems();
  const next = existing.filter((entry) => entry.id !== id);
  await chrome.storage.local.set({
    [COLLECTION_KEY]: next
  });
  return next;
}
