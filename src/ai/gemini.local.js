#!/usr/bin/env node
/**
 * gemini.local.js -- Local integration test for Gemini API calls
 *
 * Run with:  node src/ai/gemini.local.js
 *
 * Reads the Gemini API key from the Vincent profile JSON.
 * Makes two real Gemini API calls matching the format in ai-analysis.js:
 *   1. health_score  -- function calling, minimal retirement scenario
 *   2. annotate_cards -- function calling, action plan annotation
 *
 * This file is covered by *.local.js in .gitignore -- NEVER commit it.
 */

import { readFileSync } from 'fs';

// --- Config ---

const PROFILE_PATH = 'g:/My Drive/Claude Retirement/Monte Carlo App/Vincent Profile.json';
const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL        = 'gemini-2.0-flash';

// --- Scenario (fake but plausible, per task spec) ---

const SCENARIO = {
  port:             1_200_000,
  sp:               52_000,
  currentAge:       56,
  retireAge:        62,
  stateOfResidence: 'NJ',
  rate:             0.87,
};

// --- Load API key from profile JSON ---

function loadApiKey() {
  let raw;
  try { raw = readFileSync(PROFILE_PATH, 'utf8'); }
  catch (e) {
    console.error('ERROR: Cannot read profile file at:
  ' + PROFILE_PATH + '
  ' + e.message);
    process.exit(1);
  }
  const profile = JSON.parse(raw);
  const key = profile.geminiApiKey?.trim();
  if (!key) { console.error("ERROR: 'geminiApiKey' field missing or empty."); process.exit(1); }
  return key;
}

// --- Gemini helpers (mirror callGemini + fnCall in ai-analysis.js exactly) ---

async function callGemini(apiKey, payload) {
  const url = `${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const status = res.status;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || `Gemini HTTP ${status}`), { status });
  }
  return { status, body: await res.json() };
}

function buildFnCallPayload(maxTokens, systemText, userText, fnDecl) {
  return {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    tools: [{ functionDeclarations: [fnDecl] }],
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [fnDecl.name] } },
    generationConfig: { maxOutputTokens: maxTokens },
  };
}

function getFnArgs(body) {
  return body.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args || {};
}

// --- TEST 1: health_score ---

async function testHealthScore(apiKey) {
  console.log('
--- TEST 1: health_score ---');
  const swr = ((SCENARIO.sp / SCENARIO.port) * 100).toFixed(1);
  const userText = [
    `MC success: ${(SCENARIO.rate * 100).toFixed(1)}% | SWR: ${swr}%`,
    `Portfolio: $${SCENARIO.port.toLocaleString()} | Spending: $${SCENARIO.sp.toLocaleString()}/yr`,
    `State: ${SCENARIO.stateOfResidence} | Age: ${SCENARIO.currentAge} | Retire: ${SCENARIO.retireAge}`,
  ].join('
');

  const fnDecl = {
    name: 'health_score',
    description: 'Score a retirement plan',
    parameters: {
      type: 'object',
      properties: {
        score:   { type: 'number' },
        grade:   { type: 'string', enum: ['A','B','C','D','F'] },
        summary: { type: 'string' },
        flags:   { type: 'array', items: { type: 'string' } },
      },
      required: ['score','grade','summary','flags'],
    },
  };

  const payload = buildFnCallPayload(512,
    'You are Aira. Score this retirement plan 0-100 and list 2-4 specific risk flags.',
    userText, fnDecl);

  console.log('  Sending health_score request to Gemini...');
  const { status, body } = await callGemini(apiKey, payload);
  console.log(`  HTTP status: ${status}`);

  const args = getFnArgs(body);
  const ok = typeof args.score === 'number'
    && ['A','B','C','D','F'].includes(args.grade)
    && typeof args.summary === 'string'
    && Array.isArray(args.flags);

  console.log(`  Grade: ${args.grade ?? "(missing)"}  |  Score: ${args.score ?? "(missing)"}`);
  if (args.summary) console.log(`  Summary: ${args.summary}`);
  if (args.flags?.length) {
    console.log('  Flags:');
    args.flags.forEach(f => console.log(`    - ${f}`));
  }

  const pass = status === 200 && ok;
  console.log(`  Result: ${pass ? "PASS" : "FAIL"}`);
  if (!pass) console.log('  Raw args:', JSON.stringify(args, null, 2));
  return pass;
}
// --- TEST 2: annotate_cards ---

async function testAnnotateCards(apiKey) {
  console.log('
--- TEST 2: annotate_cards ---');
  const swr = ((SCENARIO.sp / SCENARIO.port) * 100).toFixed(1);
  const ctx = [
    `SWR: ${swr}% | MC Success: ${(SCENARIO.rate * 100).toFixed(1)}%`,
    `Portfolio: $${SCENARIO.port.toLocaleString()} | Pre-tax: 80% | Roth: 20%`,
    `Age: ${SCENARIO.currentAge} -> Retire: ${SCENARIO.retireAge} | State: ${SCENARIO.stateOfResidence}`,
    'Triggered rules: [roth-conversion, ss-delay]',
  ].join('
');

  const cards = [
    { id: 'roth-conversion', priority: 'yellow', category: 'Tax',    action: 'Begin Roth conversions to reduce pre-tax concentration' },
    { id: 'ss-delay',        priority: 'green',  category: 'Income', action: 'Evaluate delaying Social Security past age 62' },
  ];

  const cardList = cards
    .map(c => `[${c.id}] ${c.priority.toUpperCase()} | ${c.category}: ${c.action}`)
    .join('
');

  const fnDecl = {
    name: 'annotate_cards',
    description: 'Annotate existing action cards and add new ones',
    parameters: {
      type: 'object',
      properties: {
        annotated: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:     { type: 'string' },
              aiNote: { type: 'string', description: '1-2 sentence specific insight for this card' },
            },
            required: ['id','aiNote'],
          },
        },
        new_cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              priority: { type: 'string', enum: ['red','yellow','green'] },
              category: { type: 'string' },
              action:   { type: 'string' },
              reason:   { type: 'string' },
              deadline: { type: 'string' },
              aiNote:   { type: 'string' },
            },
            required: ['priority','category','action','reason','deadline','aiNote'],
          },
        },
      },
      required: ['annotated','new_cards'],
    },
  };

  const userText =
    `Profile:
${ctx}

Existing cards:
${cardList}

For each card, add a specific 1-2 sentence aiNote with numbers from the profile. Then add up to 2 net-new cards the rules engine missed (e.g. IRMAA cliff, SS bridge gap, specific bracket math). Skip new cards if none apply.`;

  const payload = buildFnCallPayload(1024,
    'You are Aira, a fiduciary retirement planning AI. Be specific, concise, and quantitative. Never give legal or tax advice.',
    userText, fnDecl);

  console.log('  Sending annotate_cards request to Gemini...');
  const { status, body } = await callGemini(apiKey, payload);
  console.log(`  HTTP status: ${status}`);

  const args      = getFnArgs(body);
  const annotated = args.annotated || [];
  const newCards  = args.new_cards  || [];

  const allAnnotated = annotated.length >= 1 && annotated.every(a => typeof a.id === 'string' && typeof a.aiNote === 'string');
  const newCardsOk   = newCards.every(c => ['red','yellow','green'].includes(c.priority) && typeof c.category === 'string' && typeof c.action === 'string' && typeof c.aiNote === 'string');

  console.log(`  Annotated cards: ${annotated.length}`);
  annotated.forEach(a => console.log(`    [${a.id}] ${a.aiNote}`));
  if (newCards.length > 0) {
    console.log(`  New AI-generated cards: ${newCards.length}`);
    newCards.forEach(c => console.log(`    [${c.priority.toUpperCase()}] ${c.category}: ${c.action}`));
  } else {
    console.log('  New AI-generated cards: 0 (AI found none to add)');
  }

  const pass = status === 200 && allAnnotated && newCardsOk;
  console.log(`  Result: ${pass ? "PASS" : "FAIL"}`);
  if (!pass) console.log('  Raw args:', JSON.stringify(args, null, 2));
  return pass;
}
// --- Main ---

async function main() {
  console.log('=== AiRA Gemini Integration Test ===');
  console.log(`Model: ${MODEL}`);
  console.log(
    `Scenario: $${SCENARIO.port.toLocaleString()} portfolio, $${SCENARIO.sp.toLocaleString()}/yr spending, age ${SCENARIO.currentAge}->${SCENARIO.retireAge}, ${SCENARIO.stateOfResidence}, ${(SCENARIO.rate * 100).toFixed(0)}% MC success`
  );

  const apiKey = loadApiKey();
  console.log(`API key: ${apiKey.slice(0,8)}...${apiKey.slice(-4)} (loaded from profile)`);

  const results = {};

  try {
    results.healthScore = await testHealthScore(apiKey);
  } catch (e) {
    console.error(`  ERROR in health_score: ${e.message} (HTTP ${e.status ?? "?"})`);
    results.healthScore = false;
  }

  try {
    results.annotateCards = await testAnnotateCards(apiKey);
  } catch (e) {
    console.error(`  ERROR in annotate_cards: ${e.message} (HTTP ${e.status ?? "?"})`);
    results.annotateCards = false;
  }

  console.log('
=== SUMMARY ===');
  console.log(`  health_score:   ${results.healthScore   ? "PASS" : "FAIL"}`);
  console.log(`  annotate_cards: ${results.annotateCards ? "PASS" : "FAIL"}`);

  const allPassed = Object.values(results).every(Boolean);
  console.log(`
  OVERALL: ${allPassed ? "PASS" : "FAIL"}`);
  process.exit(allPassed ? 0 : 1);
}

main();