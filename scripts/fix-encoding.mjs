// One-off repair: reverse a CP1252 double-encoding of src/App.jsx.
//
// What happened: a PowerShell Get-Content | Set-Content round-trip decoded the
// file's UTF-8 bytes as CP1252 and re-encoded them as UTF-8, so every non-ASCII
// character became 2-3 mojibake chars ("—" -> "â€”", "▼" -> "â–¼"). There were
// zero U+FFFD replacement characters, which means the byte stream is intact and
// the transform is exactly invertible.
//
// Reverse: for each char, map back to its CP1252 byte, then decode the byte
// stream as UTF-8. Chars <= 0xFF map to themselves (latin1); the 0x80-0x9F
// window needs the explicit CP1252 table because those code points (e.g. U+20AC
// EURO) are NOT their own byte values.
import fs from "fs";

const CP1252_REV = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

const target = process.argv[2];
const out = process.argv[3] || target;
const s = fs.readFileSync(target, "utf8");

const bytes = [];
let unreversible = 0;
for (const ch of s) {
  const cp = ch.codePointAt(0);
  if (cp < 0x80) { bytes.push(cp); continue; }
  // A BOM the rewriting tool prepended — drop it rather than encode it.
  if (cp === 0xFEFF) continue;
  if (CP1252_REV[cp] != null) { bytes.push(CP1252_REV[cp]); continue; }
  if (cp <= 0xFF) { bytes.push(cp); continue; }
  unreversible++;
  // Leave an unreversible char as UTF-8 so nothing is silently dropped.
  for (const b of Buffer.from(ch, "utf8")) bytes.push(b);
}

const fixed = Buffer.from(bytes).toString("utf8");
const fffd = (fixed.match(/\uFFFD/g) || []).length;
const before = (s.match(/â|Ã|ð/g) || []).length;
const after = (fixed.match(/â|Ã|ð/g) || []).length;

console.log(`target: ${target}`);
console.log(`mojibake markers before: ${before}`);
console.log(`mojibake markers after : ${after}`);
console.log(`unreversible chars     : ${unreversible}`);
console.log(`U+FFFD in result       : ${fffd}`);
for (const probe of ["\u2014", "\u25BC", "\u25B2", "\u2713", "\u26A1", "\u2192", "\u2264", "\u00B7"]) {
  const label = JSON.stringify(probe);
  console.log(`  ${label.padEnd(8)} before=${s.includes(probe)} after=${fixed.includes(probe)}`);
}
if (after > 0 || fffd > 0) {
  console.log("REFUSING to write — reversal not clean.");
  process.exit(1);
}
if (out !== target) fs.writeFileSync(out, fixed, "utf8");
else fs.writeFileSync(out, fixed, "utf8");
console.log(`written: ${out}`);
