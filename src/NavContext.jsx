import React, { createContext, useContext } from "react";

/**
 * Lets deep components say "go to Plan inputs > <step>" without prop-drilling
 * navigateToTab through every panel. Outside a provider (unit tests, isolated
 * renders) it falls back to plain text, so nothing needs the app shell to render.
 */
export const NavContext = createContext(null);

/** A text-link that opens Plan inputs on a given ProfileWizard step. */
export function GoStep({ step, children }) {
  const nav = useContext(NavContext);
  if (!nav) return <strong>{children}</strong>;
  return (
    <button
      type="button"
      onClick={() => nav("assumptions", null, step)}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}
