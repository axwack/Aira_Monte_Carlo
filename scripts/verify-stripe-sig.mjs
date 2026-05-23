/**
 * Verify a Stripe webhook signature locally using Node.js.
 *
 * Usage:
 *   STRIPE_SECRET='whsec_...' STRIPE_SIG='t=...,v1=...' node scripts/verify-stripe-sig.mjs < body.json
 *
 * Or hardcode the values below and run: node scripts/verify-stripe-sig.mjs
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ─── Fill these in (or pass via env vars) ────────────────────────────────────
const secret    = process.env.STRIPE_SECRET    || 'whsec_REPLACE_ME';
const sigHeader = process.env.STRIPE_SIG       || 't=REPLACE,v1=REPLACE';

// Read body from stdin (pipe the raw JSON file) or hardcode here
let rawBody;
try {
  rawBody = readFileSync('/dev/stdin', 'utf8').trimEnd();
} catch {
  rawBody = '{"test": true}'; // fallback if stdin is a TTY
}

// ─── Parse Stripe-Signature header ───────────────────────────────────────────
const parts = Object.fromEntries(
  sigHeader.split(',').map(p => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  })
);
const timestamp   = parts.t;
const expectedSig = parts.v1;

// ─── Decode the whsec_ key ────────────────────────────────────────────────────
const b64raw     = (secret.startsWith('whsec_') ? secret.slice(6) : secret).trim();
const b64std     = b64raw.replace(/-/g, '+').replace(/_/g, '/');
const padding    = '=='.slice(0, (4 - b64std.length % 4) % 4);
const rawKeyBytes = Buffer.from(b64std + padding, 'base64');

// ─── Compute HMAC-SHA256 ─────────────────────────────────────────────────────
const toSign   = `${timestamp}.${rawBody}`;
const computed = createHmac('sha256', rawKeyBytes).update(toSign, 'utf8').digest('hex');

// ─── Report ───────────────────────────────────────────────────────────────────
console.log('secretLen   :', secret.length);
console.log('b64rawLen   :', b64raw.length);
console.log('keyBytesLen :', rawKeyBytes.length);
console.log('bodyLen     :', rawBody.length);
console.log('timestamp   :', timestamp);
console.log('expected    :', expectedSig?.slice(0, 20), '...');
console.log('computed    :', computed.slice(0, 20), '...');
console.log('');
console.log('MATCH:', computed === expectedSig ? '✓  YES — secret is correct' : '✗  NO  — wrong secret or wrong body');
