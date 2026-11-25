import React, { createContext, useContext } from "react";

export const NavContext = createContext(null);

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
