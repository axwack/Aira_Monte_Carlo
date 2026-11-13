import React from "react";
import ReactDOM from "react-dom";

// Full-page Help hub. Content stays in ABOUT_FEATURES (src/about.js); this is
// presentation only. Design: contents-page, type and hairlines carry the
// hierarchy. No icons, colour categories, shadows or gradients.

// 11 authored groups -> 6 tabs. shortcut: a group not listed keeps its own name.
const TAB_OF = {
  "Getting Started": "Getting Started",
  "Your Income": "Income and Spending", "Your Spending": "Income and Spending", "Your Properties": "Income and Spending",
  "Withdrawal Strategies": "Withdrawals and Buckets", "3-Bucket Strategy": "Withdrawals and Buckets",
  "Tax Modeling": "Taxes and Roth", "Roth Conversions": "Taxes and Roth",
  "Reading the Charts": "Charts and Results", "Risk & Returns": "Charts and Results",
  "AI Action Plan": "AI Help",
};
const CHIPS = ["Roth", "IRMAA", "Buckets", "Social Security", "Check-In"];

const noStyle = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ");
const plain = (html) => noStyle(html).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// One-sentence description: the entry's lede, else its first paragraph.
const blurb = (e) => {
  const m = noStyle(e.body).match(/<p class=['"]help-lede['"]>([\s\S]*?)<\/p>/) || noStyle(e.body).match(/<p[^>]*>([\s\S]*?)<\/p>/);
  return plain(m ? m[1] : e.body);
};
const tabOf = (e) => TAB_OF[e.group] || e.group || "More";

const CSS = `
.hp { --hp-r:14px; --hp-band:color-mix(in srgb, var(--accent-teal) 16%, var(--card-bg)); position:fixed; inset:0; z-index:99999; overflow-y:auto; background:var(--bg-base); color:var(--text-primary); font-family:var(--font-sans, inherit); }
.hp-wrap { max-width:1040px; margin:0 auto; padding:24px 32px 96px; }
.hp button, .hp input, .hp a { font-family:inherit; }
.hp :focus-visible { outline:2px solid var(--accent-teal); outline-offset:2px; }
.hp-back { min-height:44px; padding:0 12px 0 0; background:none; border:0; color:var(--text-secondary); font-size:var(--fs-body); cursor:pointer; }
.hp-back:hover { color:var(--text-primary); }
.hp h1 { font-size:var(--fs-display); line-height:1.1; font-weight:700; margin:16px 0 8px; letter-spacing:-0.02em; }
.hp-sub { font-size:15px; color:var(--text-secondary); margin:0 0 24px; max-width:60ch; }
.hp-search { display:block; width:100%; max-width:640px; box-sizing:border-box; height:52px; padding:0 16px; font-size:16px;
  background:var(--card-bg); color:var(--text-primary); border:1px solid var(--card-border); border-radius:var(--hp-r); }
.hp-search::placeholder { color:var(--text-muted); }
.hp-chips { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 var(--space-2xl); align-items:center; }
.hp-chips span { font-size:var(--fs-label); color:var(--text-muted); margin-right:4px; }
.hp-chip { min-height:44px; padding:0 16px; border-radius:999px; background:none; border:1px solid var(--card-border);
  color:var(--text-secondary); font-size:var(--fs-label); cursor:pointer; }
.hp-chip:hover { border-color:var(--tint-white-14); color:var(--text-primary); }
.hp h2 { font-size:var(--fs-h1); font-weight:600; margin:0 0 16px; }
.hp-start { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin-bottom:var(--space-2xl); }
.hp-card { display:flex; flex-direction:column; text-align:left; width:100%; box-sizing:border-box; background:var(--card-bg);
  border:1px solid var(--card-border); border-radius:var(--hp-r); color:inherit; cursor:pointer; min-height:112px; }
.hp-card:hover { border-color:var(--tint-white-14); }
.hp-card:active { background:var(--tint-white-06); }
.hp-mono { font-family:var(--font-mono); font-size:var(--fs-label); color:var(--text-muted); }
.hp-tile { padding:24px; min-height:168px; }
.hp-tile.first { border-color:var(--accent-teal); }
.hp-tile.first .hp-mono { color:var(--accent-teal); }
.hp-tile h3 { font-size:20px; line-height:1.25; font-weight:600; margin:12px 0 8px; }
.hp-desc { font-size:var(--fs-body); line-height:1.55; color:var(--text-secondary); margin:0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.hp-tabs { display:flex; gap:4px; overflow-x:auto; overflow-y:hidden; border-bottom:1px solid var(--divider); margin-bottom:20px; scroll-snap-type:x proximity; }
.hp-tab { flex:none; min-height:44px; padding:0 12px; background:none; border:0; border-bottom:2px solid transparent; margin-bottom:-1px;
  color:var(--text-muted); font-size:var(--fs-body); cursor:pointer; scroll-snap-align:start; }
.hp-tab:hover { color:var(--text-primary); }
.hp-tab[aria-selected="true"] { color:var(--text-primary); border-bottom-color:var(--accent-teal); }
.hp-tab .hp-mono { margin-left:6px; }
.hp-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:14px; }
.hp-topic { padding:20px; }
.hp-topic .hp-mono, .hp-tile .hp-mono { font-family:inherit; font-size:var(--fs-label); }
.hp-card:hover { border-color:color-mix(in srgb, var(--accent-teal) 45%, var(--card-border)); }
.hp-topic h3 { font-size:16px; font-weight:600; margin:8px 0 6px; }
.hp-read-link { margin-top:auto; padding-top:10px; align-self:flex-end; font-size:var(--fs-label); color:var(--text-secondary); }
.hp-card:hover .hp-read-link { color:var(--text-primary); text-decoration:underline; }
.hp-empty { padding:32px 0; max-width:60ch; }
.hp-empty h3 { font-size:var(--fs-h1); font-weight:600; margin:0 0 8px; }
.hp-empty p { color:var(--text-secondary); font-size:15px; margin:0 0 16px; }
.hp-clear { min-height:44px; padding:0 16px; background:none; border:1px solid var(--card-border); border-radius:var(--hp-r); color:var(--text-primary); cursor:pointer; }
.hp-crumb { font-size:var(--fs-label); color:var(--text-muted); margin:0 0 12px; }
.hp-band { background:var(--hp-band); border-bottom:1px solid color-mix(in srgb, var(--accent-teal) 28%, var(--card-bg)); padding:12px 0 40px; }
.hp-band-in { max-width:1040px; margin:0 auto; padding:0 32px; }
.hp-band h1 { font-size:40px; line-height:1.15; margin:12px 0 16px; max-width:20ch; }
.hp-band .hp-back, .hp-band .hp-crumb { color:var(--text-primary); opacity:.8; }
.hp-band .hp-mono { font-family:inherit; font-size:14px; color:var(--text-primary); opacity:.8; }
.hp-band .hp-crumb { margin:0; }
.hp-band .hp-mono { margin:0; }
.hp-cols { display:grid; grid-template-columns:220px minmax(0, 66ch); gap:48px; align-items:start; margin-top:32px; }
.hp-cols:not(:has(.hp-rail)) { grid-template-columns:minmax(0, 66ch); }
.hp-rail { position:sticky; top:24px; }
.hp-rail .hp-mono { display:block; margin-bottom:8px; padding:0 12px; }
.hp-rail button { display:block; width:100%; text-align:left; min-height:44px; padding:6px 12px; background:none; border:0; border-radius:var(--hp-r); cursor:pointer; font-size:var(--fs-body); line-height:1.35; color:var(--text-muted); }
.hp-rail button:hover { color:var(--text-primary); }
.hp-rail button[aria-current="true"] { background:var(--tint-white-06); color:var(--text-primary); font-weight:600; }
.hp-read { font-size:16px; line-height:1.7; color:var(--text-secondary); }
.hp-read p, .hp-read li { font-size:16px; }
.hp-read .help-sub { font-size:20px; line-height:1.3; font-weight:700; color:var(--text-primary); margin:32px 0 10px; scroll-margin-top:24px; }
.hp-read ul { margin:0 0 1em; padding-left:22px; }
.hp-read p { margin:0 0 1em; }
.hp-read li + li { margin-top:.5em; }
.hp-read .help-lede { font-size:20px; line-height:1.5; color:var(--text-primary); margin-bottom:20px; }
.hp-read strong, .hp-read b { color:var(--text-primary); font-weight:600; }
.hp-read a { color:var(--accent-teal); text-underline-offset:3px; }
.hp-read figure { margin:16px 0; }
.hp-read figure img { display:block; max-width:100%; height:auto; border:1px solid var(--card-border); border-radius:var(--hp-r); }
.hp-read figcaption { font-size:12px; color:var(--text-muted); margin-top:8px; }
@media (min-width:1100px) { .hp-read figure.side { float:right; width:260px; margin:4px 0 16px 24px; } }  /* class 'side' for a narrow figure */
.hp-read .help-note { border:1px solid var(--card-border); }  /* flat box: no side tab; the tint still says which kind */
.hp-read .help-note-icon { display:none; }
.hp-pn { display:flex; gap:14px; margin-top:40px; padding-top:24px; border-top:1px solid var(--divider); }
.hp-pn .hp-card { flex:1; padding:14px 16px; min-height:44px; }
.hp-pn .hp-card:last-child:not(:first-child) { text-align:right; }
.hp-pn .hp-mono { display:block; margin-bottom:4px; }
@media (max-width:960px) { .hp-cols, .hp-cols:not(:has(.hp-rail)) { display:flex; flex-direction:column; gap:0; } .hp-rail { order:2; position:static; margin-top:32px; width:100%; box-sizing:border-box; } }
@media (max-width:720px) {
  .hp-band-in { padding:0 16px; } .hp-band h1 { font-size:30px; }
  .hp-wrap { padding:16px 16px 72px; } .hp-start, .hp-grid { grid-template-columns:1fr; }
  .hp-search { height:48px; } .hp-chips { flex-wrap:nowrap; overflow-x:auto; } .hp-chip { flex:none; } .hp-pn { flex-direction:column; }
}
`;

export default function HelpPage({ entries, onClose }) {
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState("All");
  const [openId, setOpenId] = React.useState(null);
  const [heads, setHeads] = React.useState([]);
  const rootRef = React.useRef(null);
  const searchRef = React.useRef(null);

  const items = React.useMemo(() => entries.map((e) => ({ ...e, tab: tabOf(e), blurb: blurb(e), text: plain(e.body).toLowerCase() })), [entries]);
  const tabs = React.useMemo(() => [...new Set(items.map((e) => e.tab))], [items]);

  React.useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "Escape") { openId ? setOpenId(null) : onClose(); }
      else if (ev.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { ev.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, onClose]);
  React.useEffect(() => { rootRef.current?.scrollTo?.(0, 0); }, [openId]);
  // 'On This Page': the entry's own section headings, given ids after render.
  React.useEffect(() => {
    const hs = [...(rootRef.current?.querySelectorAll(".hp-read .help-sub") || [])];
    hs.forEach((h, i) => { h.id = `hp-h-${i}`; });
    setHeads(hs.map((h) => ({ id: h.id, text: h.textContent })));
  }, [openId]);

  const q = query.trim().toLowerCase();
  // Title 3, keyword 2, group 1, body 1: title matches sort first.
  const score = (e) => (e.title.toLowerCase().includes(q) ? 3 : 0) + ((e.keywords || []).join(" ").toLowerCase().includes(q) ? 2 : 0) + (e.tab.toLowerCase().includes(q) ? 1 : 0) + (e.text.includes(q) ? 1 : 0);
  const shown = q ? items.map((e) => [score(e), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, e]) => e)
    : tab === "All" ? items : items.filter((e) => e.tab === tab);
  const start = items.filter((e) => e.tab === "Getting Started").slice(0, 3);
  const open = items.find((e) => e.id === openId);
  const siblings = open ? items.filter((e) => e.tab === open.tab) : [];
  const at = open ? siblings.indexOf(open) : -1;

  const Card = ({ e, cls, children }) => (
    <button type="button" className={`hp-card ${cls}`} onClick={() => setOpenId(e.id)}>{children}</button>
  );

  const body = open ? (
    <>
      <div className="hp-cols">
        {(heads.length > 1 || siblings.length > 1) && (
          <nav className="hp-rail" aria-label="Help Navigation">
            {heads.length > 1 && <>
              <span className="hp-mono">On This Page</span>
              {heads.map((h) => <button key={h.id} type="button" onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{h.text}</button>)}
              <span className="hp-mono" style={{ marginTop: 24 }}>In This Group</span>
            </>}
            {heads.length <= 1 && <span className="hp-mono">In This Group</span>}
            {siblings.map((s) => <button key={s.id} type="button" aria-current={s.id === open.id} onClick={() => setOpenId(s.id)}>{s.title}</button>)}
          </nav>
        )}
        <article className="hp-article">
          <div className="help-body hp-read" dangerouslySetInnerHTML={{ __html: open.body }} />
          <div className="hp-pn">
            {siblings[at - 1] && <Card e={siblings[at - 1]} cls=""><span className="hp-mono">Previous</span>{siblings[at - 1].title}</Card>}
            {siblings[at + 1] && <Card e={siblings[at + 1]} cls=""><span className="hp-mono">Next</span>{siblings[at + 1].title}</Card>}
          </div>
        </article>
      </div>
    </>
  ) : (
    <>
      <h1>Help</h1>
      <p className="hp-sub">How each part of the planner works, and how to read what it tells you.</p>
      <input ref={searchRef} className="hp-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help, for example Roth" aria-label="Search Help" />
      <div className="hp-chips"><span>Popular</span>{CHIPS.map((c) => <button key={c} type="button" className="hp-chip" onClick={() => setQuery(c)}>{c}</button>)}</div>

      {!q && start.length > 0 && (
        <>
          <h2>Start Here</h2>
          <div className="hp-start">
            {start.map((e, i) => (
              <Card key={e.id} e={e} cls={`hp-tile${i === 0 ? " first" : ""}`}>
                <span className="hp-mono">{`0${i + 1}`}{i === 0 ? " / Start Here" : ""}</span>
                <h3>{e.title}</h3><p className="hp-desc">{e.blurb}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {!q && (
        <div className="hp-tabs" role="tablist" aria-label="Help Topics">
          {["All", ...tabs].map((t) => (
            <button key={t} type="button" role="tab" className="hp-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t}<span className="hp-mono">{t === "All" ? items.length : items.filter((e) => e.tab === t).length}</span>
            </button>
          ))}
        </div>
      )}
      {q && <h2>{shown.length} {shown.length === 1 ? "Topic" : "Topics"}</h2>}

      {shown.length === 0 ? (
        <div className="hp-empty">
          <h3>No Help Topics Match “{query.trim()}”</h3>
          <p>Try a different word, or start from one of these.</p>
          <div className="hp-chips" style={{ margin: "0 0 16px" }}>{CHIPS.slice(0, 3).map((c) => <button key={c} type="button" className="hp-chip" onClick={() => setQuery(c)}>{c}</button>)}</div>
          <button type="button" className="hp-clear" onClick={() => setQuery("")}>Clear Search</button>
        </div>
      ) : (
        <div className="hp-grid">
          {shown.map((e, i) => (
            <Card key={e.id} e={e} cls="hp-topic">
              <span className="hp-mono">{e.tab}</span>
              <h3>{e.title}</h3><p className="hp-desc">{e.blurb}</p>
              <span className="hp-read-link">Read</span>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  return ReactDOM.createPortal(
    <div className="hp" ref={rootRef} role="dialog" aria-modal="true" aria-label="Help">
      <style>{CSS}</style>
      {open ? (
        <header className="hp-band"><div className="hp-band-in">
          <button type="button" className="hp-back" onClick={() => setOpenId(null)}>All Help</button>
          <p className="hp-crumb">Help / {open.tab}</p>
          <h1>{open.title}</h1>
          <p className="hp-mono">{[`About ${Math.max(1, Math.round(open.text.split(" ").length / 200))} min read`, open.source && `Source: ${open.source}`, open.verified && `Verified ${open.verified}`].filter(Boolean).join(" · ")}</p>
        </div></header>
      ) : null}
      <div className="hp-wrap">
        {!open && <button type="button" className="hp-back" onClick={onClose}>Back to Plan</button>}
        {body}
      </div>
    </div>,
    document.body
  );
}
