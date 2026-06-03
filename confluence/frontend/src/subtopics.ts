export interface SubtopicItem {
  title: string;
  content: string;
}

export function parseSubtopics(value?: string): SubtopicItem[] {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => ({
          title: String(item?.title || "").trim(),
          content: String(item?.content || "").trim()
        }))
        .filter(item => item.title || item.content);
    }
  } catch {
    // Legacy format: one title per line.
  }

  return value
    .split("\n")
    .map(title => title.trim())
    .filter(Boolean)
    .map(title => ({ title, content: "" }));
}

export function serializeSubtopics(items: SubtopicItem[]): string {
  const normalized = items
    .map(item => ({
      title: item.title.trim(),
      content: item.content.trim()
    }))
    .filter(item => item.title || item.content);

  return normalized.length > 0 ? JSON.stringify(normalized) : "";
}
