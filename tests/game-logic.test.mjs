import test from "node:test";
import assert from "node:assert/strict";

await import("../config.js");
await import("../app.js");

const { PUZZLE } = globalThis;
const {
  PuzzleEngine,
  categoryOrderEmoji,
  completionPayload,
  createSession,
  evaluateGuess,
  formatText,
  hydrateState,
  normaliseWord,
  rankingForScore,
  validateConfig,
} = globalThis.MuseumConnections;

const START = "2026-09-12T12:00:00.000Z";

function engineWithRandom(random = () => 0) {
  return new PuzzleEngine(PUZZLE, createSession(PUZZLE, "The Badgers", START), random);
}

function addWords(engine, words) {
  for (const word of words) {
    assert.equal(engine.addWord(word).status, "added", `Expected ${word} to be added`);
  }
}

test("the supplied puzzle configuration is valid", () => {
  assert.deepEqual(validateConfig(PUZZLE), []);
  assert.equal(PUZZLE.title, "CMT Connections");
  assert.deepEqual(PUZZLE.categories.map((category) => category.words), [
    ["ASH", "BLACKSTONE", "PYE", "VALVE"],
    ["BÄCHLE", "RHEIN", "LEITH", "SHEAF"],
    ["MORE", "BLA", "LOMOND", "GHLAS"],
    ["PORTER", "ALT", "KÖLSCH", "HEAVY"],
  ]);
});

test("configured text placeholders are replaced without changing game logic", () => {
  assert.equal(
    formatText("{word} found — {remaining} left.", { word: "BÄCHLE", remaining: 3 }),
    "BÄCHLE found — 3 left.",
  );
  assert.equal(formatText("Keep {unknown} intact."), "Keep {unknown} intact.");
});

test("word matching is case-, Unicode- and umlaut-insensitive", () => {
  const engine = engineWithRandom();
  assert.equal(normaliseWord("  ba\u0308chle  "), "BACHLE");
  assert.equal(normaliseWord("Baechle"), "BACHLE");
  assert.equal(normaliseWord("Bachle"), "BACHLE");
  const added = engine.addWord("  ba\u0308chle  ");
  assert.equal(added.status, "added");
  assert.equal(added.word, "BÄCHLE");
  assert.equal(engine.addWord("Baechle").status, "duplicate");

  assert.equal(engine.addWord("Koelsch").status, "added");
  assert.equal(engine.state.enteredWords.at(-1), "KÖLSCH");
  assert.equal(engine.addWord("Kolsch").status, "duplicate");
});

test("invalid and empty words are rejected without changing progress", () => {
  const engine = engineWithRandom();
  assert.equal(engine.addWord(" ").status, "empty");
  assert.equal(engine.addWord("CAMBRIDGE").status, "invalid");
  assert.equal(engine.state.enteredWords.length, 0);
});

test("correct words keep their assigned positions until shuffle", () => {
  const engine = engineWithRandom(() => 0);
  addWords(engine, ["ASH", "PYE", "BLACKSTONE", "VALVE", "SHEAF"]);
  assert.deepEqual(engine.state.gridSlots.slice(0, 5), ["ASH", "PYE", "BLACKSTONE", "VALVE", "SHEAF"]);
  const before = [...engine.state.gridSlots];
  engine.shuffle();
  assert.notDeepEqual(engine.state.gridSlots, before);
  assert.deepEqual(
    engine.state.gridSlots.filter(Boolean).sort(),
    before.filter(Boolean).sort(),
  );
});

test("a category can be solved with only four words found", () => {
  const engine = engineWithRandom();
  addWords(engine, PUZZLE.categories[0].words);
  const result = engine.submitGuess(PUZZLE.categories[0].words, "2026-09-12T12:05:00.000Z");
  assert.equal(result.correct, true);
  assert.equal(engine.state.complete, false);
  assert.deepEqual(engine.state.solvedCategories, [0]);
  assert.equal(engine.state.gridSlots.length, 12);
  assert.equal(engine.state.gridSlots.filter(Boolean).length, 0);

  assert.equal(engine.addWord("SHEAF").status, "added");
  assert.equal(engine.state.gridSlots.length, 12);
  assert.equal(engine.state.gridSlots.filter(Boolean).length, 1);
});

test("one-away detects exactly three words from one unresolved category", () => {
  const engine = engineWithRandom();
  addWords(engine, ["SHEAF", "ASH", "PYE", "BLACKSTONE"]);
  const result = engine.submitGuess(["SHEAF", "ASH", "PYE", "BLACKSTONE"], "2026-09-12T12:06:00.000Z");
  assert.equal(result.correct, false);
  assert.equal(result.oneAway, true);
  assert.equal(result.emoji, "🟩🟨🟨🟨");
  assert.equal(engine.state.score, 95);
  assert.deepEqual(engine.state.guessHistory[0].words, ["SHEAF", "ASH", "PYE", "BLACKSTONE"]);
});

test("three words from an already solved category do not count as one away", () => {
  const result = evaluateGuess(["ASH", "PYE", "BLACKSTONE", "SHEAF"], PUZZLE, [0]);
  assert.equal(result.oneAway, false);
});

test("shuffle never changes solved rows", () => {
  const engine = engineWithRandom(() => 0);
  addWords(engine, [...PUZZLE.categories[0].words, "SHEAF", "RHEIN", "LEITH", "BÄCHLE"]);
  engine.submitGuess(PUZZLE.categories[0].words, "2026-09-12T12:08:00.000Z");
  const solvedBefore = [...engine.state.categoryOrder];
  const remainingBefore = engine.state.gridSlots.filter(Boolean).sort();
  engine.shuffle();
  assert.deepEqual(engine.state.categoryOrder, solvedBefore);
  assert.deepEqual(engine.state.gridSlots.filter(Boolean).sort(), remainingBefore);
  assert.equal(engine.state.gridSlots.length, 12);
});

test("score floors at zero and the game remains completable", () => {
  const engine = engineWithRandom();
  addWords(engine, PUZZLE.categories.flatMap((category) => category.words));
  const wrongGuess = ["ASH", "PYE", "SHEAF", "RHEIN"];
  let lastWrongResult;
  for (let count = 0; count < 25; count += 1) {
    lastWrongResult = engine.submitGuess(wrongGuess, `2026-09-12T12:${String(count).padStart(2, "0")}:00.000Z`);
    assert.equal(lastWrongResult.correct, false);
  }
  assert.equal(engine.state.score, 0);
  assert.equal(lastWrongResult.deducted, 5);

  PUZZLE.categories.forEach((category, index) => {
    engine.submitGuess(category.words, `2026-09-12T13:0${index}:00.000Z`);
  });
  assert.equal(engine.state.complete, true);
  assert.equal(engine.state.score, 0);
  assert.equal(engine.state.guessHistory.length, 29);
  assert.equal(rankingForScore(0, PUZZLE).label, "Made it in the end");
});

test("refresh hydration preserves positions, history, solve order and submission state", () => {
  const engine = engineWithRandom(() => 0);
  addWords(engine, PUZZLE.categories.flatMap((category) => category.words));
  engine.submitGuess(["ASH", "PYE", "BLACKSTONE", "SHEAF"], "2026-09-12T12:10:00.000Z");
  PUZZLE.categories.forEach((category, index) => {
    engine.submitGuess(category.words, `2026-09-12T13:1${index}:00.000Z`);
  });
  engine.state.resultSubmitted = true;

  const restored = hydrateState(JSON.parse(JSON.stringify(engine.state)), PUZZLE);
  assert.deepEqual(restored.gridSlots, []);
  assert.deepEqual(restored.categoryOrder, [0, 1, 2, 3]);
  assert.equal(restored.guessHistory[0].emoji, "🟨🟨🟨🟩");
  assert.equal(restored.resultSubmitted, true);
  assert.equal(restored.endTimestamp, "2026-09-12T13:13:00.000Z");
});

test("completion payload is stable and contains no category titles", () => {
  const engine = engineWithRandom();
  addWords(engine, PUZZLE.categories.flatMap((category) => category.words));
  PUZZLE.categories.forEach((category, index) => {
    engine.submitGuess(category.words, `2026-09-12T14:0${index}:00.000Z`);
  });

  const payload = completionPayload(engine.state, PUZZLE);
  assert.equal(payload.categoryOrderEmoji, "🟨🟩🟦🟪");
  assert.equal(payload.guessHistoryEmoji.split("\n").length, 4);
  assert.equal(payload.sessionId, engine.state.sessionId);
  for (const category of PUZZLE.categories) {
    assert.equal(JSON.stringify(payload).includes(category.title), false);
  }
  assert.equal(categoryOrderEmoji(engine.state, PUZZLE, true), "🟨 🟩 🟦 🟪");
});

test("duplicate configured words are rejected after normalisation", () => {
  const invalid = JSON.parse(JSON.stringify(PUZZLE));
  invalid.categories[3].words[3] = "  bächle ";
  assert.ok(validateConfig(invalid).some((error) => error.includes("unique")));
});
