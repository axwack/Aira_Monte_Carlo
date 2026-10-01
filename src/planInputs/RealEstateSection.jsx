import React, { useMemo } from "react";

const DEFAULT_PROPERTY = { id: "p1", label: "Primary Residence", value: 0, mortgage: 0, income: 0 };
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0d1b2a",
  border: "1px solid #1e3a5f",
  color: "#e2e8f0",
  borderRadius: 6,
  padding: "5px 7px",
  fontSize: 12,
  fontFamily: "'JetBrains Mono',monospace",
};
const labelStyle = { fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textAlign: "right" };

function money(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}`;
}

function NumberField({ label, value, min = 0, max, step = 1, suffix = "", onChange, testId }) {
  return (
    <label style={{ display: "block" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          data-testid={testId}
          type="number"
          value={value ?? 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          style={inputStyle}
        />
        {suffix && <span style={{ color: "var(--text-muted)", fontSize: 10, whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
    </label>
  );
}

function PropertyCard({ property, index, total, onUpdate, onRemove }) {
  const equity = (Number(property.value) || 0) - (Number(property.mortgage) || 0);
  const primary = index === 0;
  return (
    <div data-testid={`property-${property.id}`} style={{ background: primary ? "rgba(13,148,136,0.05)" : "var(--card-bg)", border: `1px solid ${primary ? "rgba(13,148,136,0.25)" : "var(--card-border)"}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <input aria-label={`${property.label || "Property"} name`} value={property.label || ""} onChange={(e) => onUpdate(property.id, "label", e.target.value)} style={{ ...inputStyle, width: 180, fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {primary && <span style={{ fontSize: 9, color: "var(--positive)" }}>Primary · wired to mortgage calculator</span>}
          {total > 1 && <button type="button" onClick={() => onRemove(property.id)} aria-label={`Remove ${property.label || "property"}`}>✕</button>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
        <NumberField label="Gross value" value={property.value} max={10_000_000} step={5000} testId={`${property.id}-value`} onChange={(v) => onUpdate(property.id, "value", v)} />
        <NumberField label="Mortgage balance" value={property.mortgage} max={10_000_000} step={1000} testId={`${property.id}-mortgage`} onChange={(v) => onUpdate(property.id, "mortgage", v)} />
        <NumberField label="Annual income (opt)" value={property.income} max={200_000} step={1000} suffix="/yr" testId={`${property.id}-income`} onChange={(v) => onUpdate(property.id, "income", v)} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        Net equity: <strong style={{ color: equity >= 0 ? "var(--positive)" : "var(--negative)", fontFamily: "'JetBrains Mono',monospace" }}>{money(Math.abs(equity))}</strong>
      </div>
    </div>
  );
}

/** Controlled Plan Inputs editor for properties and the primary mortgage. */
export default function RealEstateSection({ properties: suppliedProperties, mortgage = {}, onUpdateProperty, onAddProperty, onRemoveProperty, onMortgageChange }) {
  const properties = suppliedProperties?.length ? suppliedProperties : [DEFAULT_PROPERTY];
  const primary = properties[0];
  const totals = useMemo(() => properties.reduce((a, p) => ({
    value: a.value + (Number(p.value) || 0),
    mortgage: a.mortgage + (Number(p.mortgage) || 0),
    income: a.income + (Number(p.income) || 0),
  }), { value: 0, mortgage: 0, income: 0 }), [properties]);
  const setPrimary = (field, value) => {
    onMortgageChange?.(field, value);
    if (field === "balance" && primary) onUpdateProperty?.(primary.id, "mortgage", value);
  };
  const add = () => onAddProperty?.();
  return (
    <section data-testid="real-estate-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><h2 style={{ margin: 0, fontSize: 16 }}>Real Estate &amp; Debt</h2><div style={{ color: "var(--text-muted)", fontSize: 11 }}>Property values, mortgages, and rental income used by the plan.</div></div>
        {properties.length < 5 && <button type="button" onClick={add}>+ Add property</button>}
      </div>
      {properties.map((p, i) => <PropertyCard key={p.id} property={p} index={i} total={properties.length} onUpdate={(id, field, value) => { onUpdateProperty?.(id, field, value); if (i === 0 && field === "mortgage") onMortgageChange?.("balance", value); }} onRemove={onRemoveProperty} />)}
      <div data-testid="property-totals" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {[["Total value", totals.value], ["Total mortgage", totals.mortgage], ["Total equity", totals.value - totals.mortgage], ["Annual income", totals.income]].map(([label, value]) => <div className="met" key={label}><div className="ml">{label}</div><div className="mv">{money(value)}</div></div>)}
      </div>
      <div className="chart-card" data-testid="primary-mortgage-editor">
        <div className="ct">{primary?.label || "Primary Residence"} · Mortgage calculator</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <NumberField label="Balance" value={mortgage.balance ?? primary?.mortgage ?? 0} max={1_500_000} step={1000} testId="mortgage-balance" onChange={(v) => setPrimary("balance", v)} />
          <NumberField label="Rate %" value={mortgage.rate ?? 6.5} min={0} max={12} step={0.125} suffix="%" testId="mortgage-rate" onChange={(v) => setPrimary("rate", v)} />
          <NumberField label="Original term (yrs)" value={mortgage.term ?? 30} min={10} max={30} step={1} suffix="yrs" testId="mortgage-term" onChange={(v) => setPrimary("term", v)} />
          <NumberField label="Extra/mo" value={mortgage.extra ?? 0} min={0} max={5000} step={50} suffix="/mo" testId="mortgage-extra" onChange={(v) => setPrimary("extra", v)} />
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-secondary)", fontSize: 11 }}>
            <span>Start date</span><input data-testid="mortgage-start" type="month" value={mortgage.start || ""} onChange={(e) => onMortgageChange?.("start", e.target.value)} style={{ ...inputStyle, width: 145 }} />
          </label>
        </div>
      </div>
    </section>
  );
}
