import { parseCalendarDate } from "./ages";

const DAY_MS = 86400000;
const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

export function retirementTarget({ dob, retireAge, dobIsEstimate = false } = {}) {
  if (!dob || !Number.isFinite(Number(retireAge))) return null;
  const d = parseCalendarDate(dob);
  if (isNaN(d.getTime())) return null;
  const date = new Date(d.getFullYear() + Number(retireAge), d.getMonth(), d.getDate());
  return { precision: dobIsEstimate ? "year" : "day", date, year: date.getFullYear() };
}

export function formatRemaining(target, now = new Date()) {
  if (!target) return null;
  const totalDays = dayNum(target.date) - dayNum(now);
  if (totalDays <= 0) return { past: true, years: 0, months: 0, days: 0, totalDays: 0 };
  let years = target.date.getFullYear() - now.getFullYear();
  let months = target.date.getMonth() - now.getMonth();
  let days = target.date.getDate() - now.getDate();
  if (days < 0) {
    months--;
    days += new Date(target.date.getFullYear(), target.date.getMonth(), 0).getDate();
  }
  if (months < 0) { years--; months += 12; }
  return { past: false, years, months, days, totalDays };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function describeCountdown(target, now = new Date()) {
  const r = formatRemaining(target, now);
  if (!r) return { heading: "Add your date of birth", detail: "", approx: false };
  if (target.precision === "year") {
    const approxYears = Math.max(0, Math.round(r.totalDays / 365.25));
    return {
      heading: `Retirement year: ${target.year}`,
      detail: r.past ? "Target year reached" : `≈ ${plural(approxYears, "year")} away (estimate)`,
      approx: true,
    };
  }
  const heading = target.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (r.past) return { heading, detail: "Target date reached", approx: false };
  const parts = [];
  if (r.years) parts.push(plural(r.years, "year"));
  if (r.months) parts.push(plural(r.months, "month"));
  if (r.days || !parts.length) parts.push(plural(r.days, "day"));
  return { heading, detail: parts.join(", "), approx: false, totalDays: r.totalDays };
}
