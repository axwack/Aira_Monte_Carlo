const STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "can", "how", "what", "why", "when",
  "does", "did", "who", "was", "with", "this", "that", "from", "have", "has", "will",
  "your", "about", "into", "than", "then", "them", "they", "its", "any", "all", "get",
]);

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];

export function plainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function retrieveHelpEntries(question, entries, k = 3) {
  const q = [...new Set(words(question).filter((w) => w.length > 2 && !STOP.has(w)))];
  if (q.length === 0) return [];
  return (entries || [])
    .map((e) => {
      const title = String(e.title || "").toLowerCase();
      const kw = (e.keywords || []).join(" ").toLowerCase();
      const group = String(e.group || "").toLowerCase();
      const body = plainText(e.body).toLowerCase();
      let score = 0;
      for (const w of q) {
        if (title.includes(w)) score += 4;
        if (kw.includes(w)) score += 3;
        if (group.includes(w)) score += 1;
        if (body.includes(w)) score += 1;
      }
      return { e, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.e);
}

export function helpContext(entries, maxChars = 1500) {
  return (entries || [])
    .map((e) => `[${e.id}] ${e.title}\n${plainText(e.body).slice(0, maxChars)}`)
    .join("\n\n");
}

export const HELP_CHAT_RULES =
  "You are Aira, the in-app help assistant for a retirement forecaster. Answer ONLY from the HELP ENTRIES below. " +
  "If they do not answer the question, say you could not find it in Help and suggest the Feedback button. " +
  "Do not ask for or use the user's personal numbers. This is not personalised financial, tax or legal advice. " +
  "Be concise (under 120 words) and use plain English. Name the entry you used by its title.";
