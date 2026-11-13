import React, { useState } from "react";
import { retrieveHelpEntries } from "./helpChat.js";
import { askHelp } from "./ai/ai-analysis.js";

const NOT_FOUND = "I could not find that in Help. Try different words in the search box, or use Feedback to ask directly.";

/**
 * "Ask Aira" box for the Help modal. Picks the 3 best Help entries for the
 * question, asks the AI to answer only from those, and shows them as links.
 * A question that matches no entry never reaches the AI, so it costs nothing.
 */
export default function HelpChat({ entries, geminiApiKey, geminiModel, onOpenEntry }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState([]); // { question, answer, sources:[{id,title}] }
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    const hits = retrieveHelpEntries(question, entries);
    if (hits.length === 0) {
      setTurns((t) => [...t, { question, answer: NOT_FOUND, sources: [] }]);
      return;
    }
    setBusy(true);
    try {
      const history = turns.flatMap((t) => [
        { role: "user", content: t.question },
        { role: "assistant", content: t.answer },
      ]);
      const answer = await askHelp(question, history, hits, geminiApiKey, geminiModel);
      setTurns((t) => [...t, { question, answer: answer || NOT_FOUND, sources: hits.map((h) => ({ id: h.id, title: h.title })) }]);
    } catch (e) {
      setTurns((t) => [...t, { question, answer: e.message, sources: [] }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Ask Aira" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={q}
          disabled={busy}
          aria-label="Ask Aira a question about the app"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder="Ask Aira how something works"
          style={{ flex: 1, boxSizing: "border-box", padding: "10px 14px", minHeight: 44,
            background: "var(--row-highlight)", border: "1px solid var(--tint-white-12)",
            borderRadius: 9, color: "var(--text-primary)", fontSize: "var(--fs-body)", fontFamily: "inherit" }}
        />
        <button type="button" className="mbtn" onClick={send} disabled={busy || !q.trim()} style={{ minHeight: 44, padding: "0 16px" }}>
          {busy ? "Thinking" : "Ask"}
        </button>
      </div>
      {turns.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {turns.slice(-3).map((t, i) => (
            <div key={i} style={{ background: "var(--tint-white-04)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: 6 }}>{t.question}</div>
              <div role="status" style={{ fontSize: "var(--fs-body)", color: "var(--text-primary)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{t.answer}</div>
              {t.sources.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
                  <span>From Help:</span>
                  {t.sources.map((s) => (
                    <button key={s.id} type="button" onClick={() => onOpenEntry(s.id)}
                      style={{ background: "transparent", border: "none", padding: "6px 2px", minHeight: 32, cursor: "pointer",
                        color: "var(--accent-teal)", fontFamily: "inherit", fontSize: "var(--fs-small)", textDecoration: "underline" }}>
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)" }}>
            Answers come only from the Help entries and can be wrong. Check the linked entry. Not financial advice.
          </div>
        </div>
      )}
    </section>
  );
}
