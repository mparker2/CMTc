(function initialiseMuseumConnections(root) {
  "use strict";

  const STATE_SCHEMA_VERSION = 1;
  const REQUIRED_COLOURS = ["yellow", "green", "blue", "purple"];
  const REQUIRED_TEXT_KEYS = [
    "metaDescription", "headerEyebrow", "welcomeLocation", "welcomeTitle", "welcomeInstructions",
    "teamNameLabel", "beginButton", "welcomeNote", "playingAsLabel", "defaultTeamHeading",
    "viewResultButton", "scoreLabel", "scoreAria", "scorePenalty", "scoreValueAria", "wordsFound",
    "selectionCount", "boardAria", "solvedGroupsAria", "unresolvedWordsAria", "solvedGroupAria",
    "tileSelectedSuffix", "wordEntryLabel", "addButton", "puzzleControlsAria",
    "submitGroupButton", "deselectAllButton", "shuffleButton", "resetButton", "completionKicker",
    "completionTitle", "pointsLabel", "solveOrderHeading", "solveOrderAria", "guessesHeading",
    "guessHistoryAria", "guessAria", "closeResultsAria", "copyResultButton", "teamNameRequired",
    "restoreFailed", "emptyWord", "invalidWord", "duplicateWord", "gridFull", "wordCouldNotBeAdded",
    "wordCorrected", "invalidWordPenalty",
    "wordAdded", "findMoreWords", "maxSelection", "selectionCleared", "wordsShuffled", "invalidGuess",
    "correctGroup", "oneAway", "wrongGroup", "pointSingular", "pointPlural", "copySuccess",
    "copyFailure", "resetConfirmation", "resultSent", "resultSavedForRetry", "saveUnavailable",
    "fatalConfiguration", "shareTeam", "shareScore",
  ];

  function normaliseWord(value) {
    return String(value ?? "")
      .trim()
      .normalize("NFKC")
      .replace(/\s+/gu, " ")
      .toLocaleUpperCase("de-DE")
      .replace(/Ä|AE/gu, "A")
      .replace(/Ö|OE/gu, "O")
      .replace(/Ü|UE/gu, "U")
      .normalize("NFD")
      .replace(/\p{M}+/gu, "");
  }

  function normaliseTeamName(value) {
    return String(value ?? "").trim().replace(/\s+/gu, " ");
  }

  function formatText(template, values = {}) {
    return String(template ?? "").replace(/\{([A-Za-z][A-Za-z0-9]*)\}/gu, (placeholder, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder
    ));
  }

  function createUuid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === "function") {
      root.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function secureRandom() {
    if (root.crypto && typeof root.crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      root.crypto.getRandomValues(values);
      return values[0] / 4294967296;
    }
    return Math.random();
  }

  function isoTimestamp(value = new Date()) {
    return new Date(value).toISOString();
  }

  function isIsoTimestamp(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  function wordEntries(config) {
    return config.categories.flatMap((category, categoryIndex) =>
      category.words.map((word) => ({
        canonical: String(word).trim().normalize("NFC"),
        normalised: normaliseWord(word),
        categoryIndex,
        colour: category.colour,
      })),
    );
  }

  function wordMap(config) {
    return new Map(wordEntries(config).map((entry) => [entry.normalised, entry]));
  }

  // Damerau–Levenshtein distance includes transposed letters, which are a
  // common genuine typing error (for example, BLACKSTNOE -> BLACKSTONE).
  function damerauLevenshtein(left, right) {
    const distances = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let leftIndex = 0; leftIndex <= left.length; leftIndex += 1) distances[leftIndex][0] = leftIndex;
    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) distances[0][rightIndex] = rightIndex;

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitution = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        distances[leftIndex][rightIndex] = Math.min(
          distances[leftIndex - 1][rightIndex] + 1,
          distances[leftIndex][rightIndex - 1] + 1,
          distances[leftIndex - 1][rightIndex - 1] + substitution,
        );
        if (
          leftIndex > 1
          && rightIndex > 1
          && left[leftIndex - 1] === right[rightIndex - 2]
          && left[leftIndex - 2] === right[rightIndex - 1]
        ) {
          distances[leftIndex][rightIndex] = Math.min(
            distances[leftIndex][rightIndex],
            distances[leftIndex - 2][rightIndex - 2] + 1,
          );
        }
      }
    }
    return distances[left.length][right.length];
  }

  function maximumTypoDistance(word) {
    // Longer words can contain two genuine typing errors without becoming
    // meaningfully ambiguous. Short words remain deliberately strict.
    return word.length >= 9 ? 2 : 1;
  }

  function validateConfig(config) {
    const errors = [];
    if (!config || typeof config !== "object") {
      return ["PUZZLE is missing from config.js."];
    }

    if (!Array.isArray(config.categories) || config.categories.length !== 4) {
      errors.push("PUZZLE.categories must contain exactly four categories.");
    } else {
      config.categories.forEach((category, index) => {
        if (!category || !String(category.title ?? "").trim()) {
          errors.push(`Category ${index + 1} needs a title.`);
        }
        if (!Array.isArray(category.words) || category.words.length !== 4) {
          errors.push(`Category ${index + 1} must contain exactly four words.`);
        } else if (category.words.some((word) => !normaliseWord(word))) {
          errors.push(`Category ${index + 1} contains an empty word.`);
        }
      });

      const colours = config.categories.map((category) => category.colour).sort();
      if (colours.join("|") !== [...REQUIRED_COLOURS].sort().join("|")) {
        errors.push("Use each category colour exactly once: yellow, green, blue and purple.");
      }
    }

    if (!String(config.title ?? "").trim()) {
      errors.push("PUZZLE.title must not be empty.");
    }
    if (!config.text || typeof config.text !== "object") {
      errors.push("PUZZLE.text is missing.");
    } else {
      const missingText = REQUIRED_TEXT_KEYS.filter((key) => !String(config.text[key] ?? "").trim());
      if (missingText.length > 0) {
        errors.push(`PUZZLE.text needs values for: ${missingText.join(", ")}.`);
      }
    }

    if (Array.isArray(config.categories)) {
      const words = wordEntries(config).map((entry) => entry.normalised);
      if (new Set(words).size !== words.length) {
        errors.push("All 16 words must be unique after case and Unicode normalisation.");
      }
    }

    for (const colour of REQUIRED_COLOURS) {
      const palette = config.palette?.[colour];
      if (!palette?.background || !palette?.foreground || !palette?.emoji || !palette?.label) {
        errors.push(`PUZZLE.palette.${colour} needs background, foreground, emoji and label values.`);
      }
    }

    const startingScore = Number(config.score?.start);
    const penalty = Number(config.score?.incorrectPenalty);
    if (!Number.isFinite(startingScore) || startingScore <= 0) {
      errors.push("PUZZLE.score.start must be a positive number.");
    }
    if (!Number.isFinite(penalty) || penalty <= 0) {
      errors.push("PUZZLE.score.incorrectPenalty must be a positive number.");
    }
    if (!Array.isArray(config.score?.rankings) || config.score.rankings.length === 0) {
      errors.push("PUZZLE.score.rankings must contain at least one ranking.");
    } else if (config.score.rankings.some((ranking) => !Number.isFinite(Number(ranking.minScore)) || !String(ranking.label ?? "").trim())) {
      errors.push("Every ranking needs a numeric minScore and a label.");
    }

    if (!String(config.storageKey ?? "").trim()) {
      errors.push("PUZZLE.storageKey must not be empty.");
    }
    return errors;
  }

  function randomSlotIndex(length, random = secureRandom) {
    if (length <= 0) return -1;
    const value = Number(random());
    const bounded = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0;
    return Math.floor(bounded * length);
  }

  function shuffleArray(values, random = secureRandom) {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = randomSlotIndex(index + 1, random);
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }

  function createSession(config, teamName, timestamp = isoTimestamp()) {
    const cleanTeamName = normaliseTeamName(teamName);
    if (!cleanTeamName) {
      throw new Error("A team name is required.");
    }

    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      sessionId: createUuid(),
      teamName: cleanTeamName,
      startTimestamp: timestamp,
      endTimestamp: null,
      enteredWords: [],
      gridSlots: Array(16).fill(null),
      solvedCategories: [],
      categoryOrder: [],
      score: Number(config.score.start),
      guessHistory: [],
      complete: false,
      resultSubmitted: false,
      submissionAttemptedAt: null,
    };
  }

  function evaluateGuess(words, config, solvedCategories = []) {
    const lookup = wordMap(config);
    const entries = words.map((word) => lookup.get(normaliseWord(word)));
    if (entries.length !== 4 || entries.some((entry) => !entry)) {
      throw new Error("A guess must contain four configured words.");
    }
    if (new Set(entries.map((entry) => entry.normalised)).size !== 4) {
      throw new Error("A guess cannot contain the same word twice.");
    }

    const unresolvedCategories = config.categories
      .map((_, categoryIndex) => categoryIndex)
      .filter((categoryIndex) => !solvedCategories.includes(categoryIndex));
    const categoryIndexes = entries.map((entry) => entry.categoryIndex);
    const singleCategory = new Set(categoryIndexes).size === 1 ? categoryIndexes[0] : null;
    const correct = singleCategory !== null && unresolvedCategories.includes(singleCategory);
    const oneAway = !correct && unresolvedCategories.some(
      (categoryIndex) => categoryIndexes.filter((value) => value === categoryIndex).length === 3,
    );
    const colours = entries.map((entry) => entry.colour);

    return {
      correct,
      categoryIndex: correct ? singleCategory : null,
      oneAway,
      colours,
      emoji: colours.map((colour) => config.palette[colour].emoji).join(""),
    };
  }

  function rankingForScore(score, config) {
    const rankings = [...config.score.rankings].sort((left, right) => Number(right.minScore) - Number(left.minScore));
    return rankings.find((ranking) => Number(score) >= Number(ranking.minScore)) ?? rankings[rankings.length - 1];
  }

  function categoryOrderEmoji(state, config, spaced = false) {
    const separator = spaced ? " " : "";
    return state.categoryOrder
      .map((categoryIndex) => config.palette[config.categories[categoryIndex].colour].emoji)
      .join(separator);
  }

  function guessHistoryEmoji(state, separator = "\n") {
    return state.guessHistory.map((guess) => guess.emoji).join(separator);
  }

  function completionPayload(state, config) {
    return {
      sessionId: state.sessionId,
      teamName: state.teamName,
      score: state.score,
      startTimestamp: state.startTimestamp,
      endTimestamp: state.endTimestamp,
      categoryOrderEmoji: categoryOrderEmoji(state, config),
      guessHistoryEmoji: guessHistoryEmoji(state, "\n"),
    };
  }

  function buildShareText(state, config) {
    const ranking = rankingForScore(state.score, config).label;
    const history = guessHistoryEmoji(state, "\n");
    return [
      config.title,
      formatText(config.text.shareTeam, { teamName: state.teamName }),
      formatText(config.text.shareScore, { score: state.score, ranking }),
      "",
      history,
    ].join("\n").trim();
  }

  function hydrateState(rawState, config) {
    if (!rawState || typeof rawState !== "object" || rawState.schemaVersion !== STATE_SCHEMA_VERSION) {
      throw new Error("Unsupported saved state.");
    }

    const lookup = wordMap(config);
    const canonicaliseStoredWord = (word) => lookup.get(normaliseWord(word))?.canonical;
    const teamName = normaliseTeamName(rawState.teamName);
    if (!teamName || typeof rawState.sessionId !== "string" || !rawState.sessionId || !isIsoTimestamp(rawState.startTimestamp)) {
      throw new Error("Saved session details are invalid.");
    }

    if (!Array.isArray(rawState.enteredWords)) {
      throw new Error("Saved words are invalid.");
    }
    const enteredWords = rawState.enteredWords.map(canonicaliseStoredWord);
    if (enteredWords.some((word) => !word) || new Set(enteredWords.map(normaliseWord)).size !== enteredWords.length) {
      throw new Error("Saved words do not match this puzzle.");
    }

    const solvedCategories = Array.isArray(rawState.solvedCategories) ? [...rawState.solvedCategories] : [];
    const categoryOrder = Array.isArray(rawState.categoryOrder) ? [...rawState.categoryOrder] : [];
    const validCategoryList = (values) => values.every(
      (value) => Number.isInteger(value) && value >= 0 && value < config.categories.length,
    ) && new Set(values).size === values.length;
    if (!validCategoryList(solvedCategories) || !validCategoryList(categoryOrder)) {
      throw new Error("Saved category progress is invalid.");
    }
    if (solvedCategories.length !== categoryOrder.length || solvedCategories.some((value) => !categoryOrder.includes(value))) {
      throw new Error("Saved category order is invalid.");
    }

    const enteredSet = new Set(enteredWords.map(normaliseWord));
    for (const categoryIndex of solvedCategories) {
      if (config.categories[categoryIndex].words.some((word) => !enteredSet.has(normaliseWord(word)))) {
        throw new Error("A saved solved group is missing one of its words.");
      }
    }

    const expectedSlotCount = 16 - solvedCategories.length * 4;
    if (!Array.isArray(rawState.gridSlots) || rawState.gridSlots.length !== expectedSlotCount) {
      throw new Error("Saved grid positions are invalid.");
    }
    const gridSlots = rawState.gridSlots.map((word) => (word === null ? null : canonicaliseStoredWord(word)));
    if (gridSlots.some((word, index) => rawState.gridSlots[index] !== null && !word)) {
      throw new Error("A saved grid word does not match this puzzle.");
    }

    const solvedWordSet = new Set(solvedCategories.flatMap(
      (categoryIndex) => config.categories[categoryIndex].words.map(normaliseWord),
    ));
    const expectedGridWords = enteredWords.map(normaliseWord).filter((word) => !solvedWordSet.has(word));
    const actualGridWords = gridSlots.filter(Boolean).map(normaliseWord);
    if (
      new Set(actualGridWords).size !== actualGridWords.length
      || expectedGridWords.length !== actualGridWords.length
      || expectedGridWords.some((word) => !actualGridWords.includes(word))
    ) {
      throw new Error("Saved grid contents are inconsistent.");
    }

    const guessHistory = Array.isArray(rawState.guessHistory)
      ? rawState.guessHistory.map((guess) => {
        if (!guess || !Array.isArray(guess.words) || guess.words.length !== 4) {
          throw new Error("Saved guess history is invalid.");
        }
        const words = guess.words.map(canonicaliseStoredWord);
        if (words.some((word) => !word) || new Set(words.map(normaliseWord)).size !== 4) {
          throw new Error("A saved guess is invalid.");
        }
        const colours = words.map((word) => lookup.get(normaliseWord(word)).colour);
        return {
          words,
          colours,
          emoji: colours.map((colour) => config.palette[colour].emoji).join(""),
          correct: Boolean(guess.correct),
          submittedAt: isIsoTimestamp(guess.submittedAt) ? guess.submittedAt : null,
        };
      })
      : [];

    const complete = solvedCategories.length === config.categories.length;
    const endTimestamp = complete && isIsoTimestamp(rawState.endTimestamp) ? rawState.endTimestamp : null;
    if (complete && !endTimestamp) {
      throw new Error("A completed saved game has no end time.");
    }

    const rawScore = Number(rawState.score);
    const score = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(Number(config.score.start), rawScore))
      : Number(config.score.start);

    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      sessionId: rawState.sessionId,
      teamName,
      startTimestamp: rawState.startTimestamp,
      endTimestamp,
      enteredWords,
      gridSlots,
      solvedCategories,
      categoryOrder,
      score,
      guessHistory,
      complete,
      resultSubmitted: complete && Boolean(rawState.resultSubmitted),
      submissionAttemptedAt: isIsoTimestamp(rawState.submissionAttemptedAt) ? rawState.submissionAttemptedAt : null,
    };
  }

  class PuzzleEngine {
    constructor(config, state, random = secureRandom) {
      this.config = config;
      this.state = state;
      this.random = random;
      this.lookup = wordMap(config);
    }

    static newGame(config, teamName, timestamp) {
      return new PuzzleEngine(config, createSession(config, teamName, timestamp));
    }

    addWord(input) {
      if (this.state.complete) return { status: "complete" };
      const normalised = normaliseWord(input);
      if (!normalised) return { status: "empty" };
      let entry = this.lookup.get(normalised);
      let corrected = false;
      if (!entry) {
        const candidates = wordEntries(this.config)
          .map((candidate) => ({ candidate, distance: damerauLevenshtein(normalised, candidate.normalised) }))
          .filter(({ candidate, distance }) => distance <= maximumTypoDistance(candidate.normalised))
          .sort((left, right) => left.distance - right.distance);
        if (candidates.length > 0 && (candidates.length === 1 || candidates[0].distance < candidates[1].distance)) {
          entry = candidates[0].candidate;
          corrected = true;
        } else {
          this.state.score = Math.max(0, this.state.score - 1);
          return { status: "invalid", deducted: 1, score: this.state.score };
        }
      }
      if (this.state.enteredWords.some((word) => normaliseWord(word) === normaliseWord(entry.canonical))) {
        return { status: "duplicate", word: entry.canonical };
      }

      const emptySlots = this.state.gridSlots
        .map((word, index) => (word === null ? index : -1))
        .filter((index) => index >= 0);
      if (emptySlots.length === 0) return { status: "full" };
      const selectedEmptySlot = emptySlots[randomSlotIndex(emptySlots.length, this.random)];
      this.state.enteredWords.push(entry.canonical);
      this.state.gridSlots[selectedEmptySlot] = entry.canonical;
      return { status: corrected ? "corrected" : "added", word: entry.canonical, input, slot: selectedEmptySlot };
    }

    shuffle() {
      if (this.state.complete) return false;
      shuffleArray(this.state.gridSlots, this.random);
      return true;
    }

    submitGuess(words, timestamp = isoTimestamp()) {
      if (this.state.complete) throw new Error("This game is already complete.");
      if (!Array.isArray(words) || words.length !== 4) throw new Error("Select exactly four words.");

      const canonicalWords = words.map((word) => this.lookup.get(normaliseWord(word))?.canonical);
      if (canonicalWords.some((word) => !word) || new Set(canonicalWords.map(normaliseWord)).size !== 4) {
        throw new Error("Select four different puzzle words.");
      }
      const gridWordSet = new Set(this.state.gridSlots.filter(Boolean).map(normaliseWord));
      if (canonicalWords.some((word) => !gridWordSet.has(normaliseWord(word)))) {
        throw new Error("A selected word is no longer unresolved.");
      }

      const evaluation = evaluateGuess(canonicalWords, this.config, this.state.solvedCategories);
      const historyEntry = {
        words: canonicalWords,
        colours: evaluation.colours,
        emoji: evaluation.emoji,
        correct: evaluation.correct,
        submittedAt: timestamp,
      };
      this.state.guessHistory.push(historyEntry);

      let deducted = 0;
      if (evaluation.correct) {
        this.state.solvedCategories.push(evaluation.categoryIndex);
        this.state.categoryOrder.push(evaluation.categoryIndex);
        const solvedWords = new Set(canonicalWords.map(normaliseWord));
        this.state.gridSlots = this.state.gridSlots.filter(
          (word) => word === null || !solvedWords.has(normaliseWord(word)),
        );

        if (this.state.solvedCategories.length === this.config.categories.length) {
          this.state.complete = true;
          this.state.endTimestamp = timestamp;
        }
      } else {
        deducted = Number(this.config.score.incorrectPenalty);
        this.state.score = Math.max(0, this.state.score - Number(this.config.score.incorrectPenalty));
      }

      return {
        ...evaluation,
        deducted,
        score: this.state.score,
        complete: this.state.complete,
        historyEntry,
      };
    }
  }

  class StateStore {
    constructor(key) {
      this.key = key;
      this.available = true;
    }

    load(config) {
      try {
        const value = root.localStorage.getItem(this.key);
        if (!value) return { state: null, error: null };
        return { state: hydrateState(JSON.parse(value), config), error: null };
      } catch (error) {
        this.available = false;
        return { state: null, error };
      }
    }

    save(state) {
      try {
        root.localStorage.setItem(this.key, JSON.stringify(state));
        this.available = true;
        return true;
      } catch (_error) {
        this.available = false;
        return false;
      }
    }

    clear() {
      try {
        root.localStorage.removeItem(this.key);
        this.available = true;
      } catch (_error) {
        this.available = false;
      }
    }
  }

  class PuzzleApp {
    constructor(config) {
      this.config = config;
      this.store = new StateStore(config.storageKey);
      this.engine = null;
      this.selectedWords = [];
      this.isSubmittingGuess = false;
      this.resultSubmissionInFlight = false;
      this.bannerTimer = null;
      this.guessUnlockTimer = null;
      this.nodes = {};
      this.syncBannerViewport = this.syncBannerViewport.bind(this);
    }

    init() {
      const errors = validateConfig(this.config);
      if (errors.length > 0) {
        this.showFatalError(errors);
        return;
      }

      this.captureNodes();
      this.applyConfiguration();
      this.bindEvents();
      const restored = this.store.load(this.config);
      if (restored.state) {
        this.engine = new PuzzleEngine(this.config, restored.state);
        this.showGame();
        this.render();
        if (this.engine.state.complete) {
          root.setTimeout(() => this.openCompletion(), 120);
          this.submitCompletedResult();
        }
      } else {
        this.showWelcome();
        if (restored.error) {
          this.setTeamMessage(this.getText("restoreFailed"), "error");
        }
      }
    }

    getText(key, values = {}) {
      return formatText(this.config.text[key], values);
    }

    captureNodes() {
      const ids = [
        "page-description", "site-header", "header-eyebrow", "header-title", "welcome-screen", "welcome-location",
        "welcome-title", "welcome-copy", "team-form", "team-name-label", "team-name", "begin-game", "team-error",
        "welcome-note-text", "game-screen", "playing-as-label", "game-heading", "view-result", "score-card",
        "score-label", "score-value", "score-track", "score-note", "word-progress", "selection-count", "board",
        "resolved-groups", "word-grid", "word-form", "word-input-label",
        "word-input", "add-word", "word-feedback", "game-actions", "submit-group", "deselect-all", "shuffle",
        "submission-status", "reset-game", "feedback-banner", "completion-dialog", "close-completion",
        "completion-kicker", "completion-title", "final-score", "points-label", "ranking-label",
        "solve-order-heading", "solve-order", "guesses-heading", "guess-history", "copy-result", "copy-status",
        "fatal-error",
      ];
      for (const id of ids) this.nodes[id] = document.getElementById(id);
    }

    applyConfiguration() {
      document.title = this.config.title;
      this.nodes["page-description"].content = this.getText("metaDescription");
      this.nodes["site-header"].setAttribute("aria-label", this.config.title);
      this.nodes["header-eyebrow"].textContent = this.getText("headerEyebrow");
      this.nodes["header-title"].textContent = this.config.title;
      this.nodes["welcome-location"].textContent = this.getText("welcomeLocation");
      this.nodes["welcome-title"].textContent = this.getText("welcomeTitle");
      this.nodes["welcome-copy"].textContent = this.getText("welcomeInstructions");
      this.nodes["team-name-label"].textContent = this.getText("teamNameLabel");
      this.nodes["begin-game"].textContent = this.getText("beginButton");
      this.nodes["welcome-note-text"].textContent = this.getText("welcomeNote");
      this.nodes["playing-as-label"].textContent = this.getText("playingAsLabel");
      this.nodes["game-heading"].textContent = this.getText("defaultTeamHeading");
      this.nodes["view-result"].textContent = this.getText("viewResultButton");
      this.nodes["score-label"].textContent = this.getText("scoreLabel");
      this.nodes["score-track"].setAttribute("aria-label", this.getText("scoreAria"));
      this.nodes["score-note"].textContent = this.getText("scorePenalty", {
        wordPenalty: 1,
        wordPoints: this.getText("pointSingular"),
        penalty: this.config.score.incorrectPenalty,
        points: this.getText(Number(this.config.score.incorrectPenalty) === 1 ? "pointSingular" : "pointPlural"),
      });
      this.nodes["score-track"].max = Number(this.config.score.start);
      this.nodes["score-value"].textContent = String(this.config.score.start);
      this.nodes["score-track"].value = Number(this.config.score.start);
      this.nodes["score-track"].setAttribute("aria-valuetext", this.getText("scoreValueAria", {
        score: this.config.score.start,
      }));
      this.nodes["word-progress"].textContent = this.getText("wordsFound", {
        found: 0,
        total: wordEntries(this.config).length,
      });
      this.nodes["selection-count"].textContent = this.getText("selectionCount", { selected: 0, maximum: 4 });
      this.nodes.board.setAttribute("aria-label", this.getText("boardAria"));
      this.nodes["resolved-groups"].setAttribute("aria-label", this.getText("solvedGroupsAria"));
      this.nodes["word-grid"].setAttribute("aria-label", this.getText("unresolvedWordsAria"));
      this.nodes["word-input-label"].textContent = this.getText("wordEntryLabel");
      this.nodes["add-word"].textContent = this.getText("addButton");
      this.nodes["game-actions"].setAttribute("aria-label", this.getText("puzzleControlsAria"));
      this.nodes["submit-group"].textContent = this.getText("submitGroupButton");
      this.nodes["deselect-all"].textContent = this.getText("deselectAllButton");
      this.nodes.shuffle.textContent = this.getText("shuffleButton");
      this.nodes["reset-game"].textContent = this.getText("resetButton");
      this.nodes["close-completion"].setAttribute("aria-label", this.getText("closeResultsAria"));
      this.nodes["completion-kicker"].textContent = this.getText("completionKicker");
      this.nodes["completion-title"].textContent = this.getText("completionTitle");
      this.nodes["points-label"].textContent = this.getText("pointsLabel");
      this.nodes["solve-order-heading"].textContent = this.getText("solveOrderHeading");
      this.nodes["solve-order"].setAttribute("aria-label", this.getText("solveOrderAria", { colours: "" }).trim());
      this.nodes["guesses-heading"].textContent = this.getText("guessesHeading");
      this.nodes["guess-history"].setAttribute("aria-label", this.getText("guessHistoryAria"));
      this.nodes["copy-result"].textContent = this.getText("copyResultButton");
    }

    bindEvents() {
      this.nodes["team-form"].addEventListener("submit", (event) => this.startGame(event));
      this.nodes["word-form"].addEventListener("submit", (event) => this.addWord(event));
      this.nodes["word-grid"].addEventListener("click", (event) => this.toggleTile(event));
      this.nodes["submit-group"].addEventListener("click", () => this.submitGroup());
      this.nodes["deselect-all"].addEventListener("click", () => this.deselectAll());
      this.nodes.shuffle.addEventListener("click", () => this.shuffle());
      this.nodes["reset-game"].addEventListener("click", () => this.resetGame());
      this.nodes["view-result"].addEventListener("click", () => this.openCompletion());
      this.nodes["close-completion"].addEventListener("click", () => this.closeCompletion());
      this.nodes["copy-result"].addEventListener("click", () => this.copyResult());
      root.addEventListener("online", () => this.submitCompletedResult(true));
      root.addEventListener("storage", (event) => this.syncSubmissionState(event));
      root.visualViewport?.addEventListener?.("resize", this.syncBannerViewport);
      root.visualViewport?.addEventListener?.("scroll", this.syncBannerViewport);
      root.addEventListener("orientationchange", this.syncBannerViewport);
      this.syncBannerViewport();
    }

    startGame(event) {
      event.preventDefault();
      const teamName = normaliseTeamName(this.nodes["team-name"].value);
      if (!teamName) {
        this.setTeamMessage(this.getText("teamNameRequired"), "error");
        this.nodes["team-name"].focus();
        return;
      }

      this.engine = PuzzleEngine.newGame(this.config, teamName, isoTimestamp());
      this.selectedWords = [];
      this.persist();
      this.showGame();
      this.render();
      this.nodes["word-input"].focus();
    }

    addWord(event) {
      event.preventDefault();
      if (!this.engine || this.engine.state.complete) return;
      const result = this.engine.addWord(this.nodes["word-input"].value);

      const messages = {
        empty: [this.getText("emptyWord"), "error"],
        invalid: [this.getText("invalidWordPenalty", { penalty: result.deducted }), "error"],
        duplicate: [this.getText("duplicateWord", { word: result.word }), "error"],
        full: [this.getText("gridFull"), "error"],
      };
      if (result.status !== "added" && result.status !== "corrected") {
        const [message, tone] = messages[result.status] ?? [this.getText("wordCouldNotBeAdded"), "error"];
        this.persist();
        if (result.deducted) this.render();
        this.setWordMessage(message, tone);
        this.nodes["word-input"].select();
        return;
      }

      this.nodes["word-input"].value = "";
      this.persist();
      this.render();
      const foundCount = this.engine.state.enteredWords.length;
      const parts = [result.status === "corrected"
        ? this.getText("wordCorrected", { input: result.input, word: result.word })
        : this.getText("wordAdded", { word: result.word })];
      if (foundCount < 4) parts.push(this.getText("findMoreWords", { count: 4 - foundCount }));
      this.setWordMessage(parts.join(" "), "success");
      this.nodes["word-input"].focus();
    }

    toggleTile(event) {
      const tile = event.target.closest(".word-tile");
      if (!tile || tile.disabled || !this.engine || this.engine.state.complete) return;
      const word = tile.dataset.word;
      const selectedIndex = this.selectedWords.findIndex((selected) => normaliseWord(selected) === normaliseWord(word));
      if (selectedIndex >= 0) {
        this.selectedWords.splice(selectedIndex, 1);
      } else if (this.selectedWords.length < 4) {
        this.selectedWords.push(word);
      } else {
        this.setWordMessage(this.getText("maxSelection"), "error");
      }
      this.updateSelectionUi();
    }

    deselectAll() {
      this.selectedWords = [];
      this.updateSelectionUi();
      this.setWordMessage(this.getText("selectionCleared"));
    }

    shuffle() {
      if (!this.engine || this.engine.state.complete) return;
      this.engine.shuffle();
      this.persist();
      this.renderGrid();
      this.updateSelectionUi();
      this.setWordMessage(this.getText("wordsShuffled"));
    }

    submitGroup() {
      if (this.isSubmittingGuess || !this.engine || this.selectedWords.length !== 4) return;
      this.isSubmittingGuess = true;
      this.updateSelectionUi();

      let result;
      try {
        result = this.engine.submitGuess([...this.selectedWords], isoTimestamp());
      } catch (error) {
        this.isSubmittingGuess = false;
        this.setWordMessage(this.getText("invalidGuess"), "error");
        this.updateSelectionUi();
        return;
      }

      this.selectedWords = [];
      this.persist();
      this.render();

      if (result.correct) {
        const category = this.config.categories[result.categoryIndex];
        this.setWordMessage(this.getText("correctGroup", { category: category.title }), "success");
      } else {
        const points = this.getText(result.deducted === 1 ? "pointSingular" : "pointPlural");
        if (result.oneAway) this.showBanner(this.getText("oneAway"), "notice");
        else this.setWordMessage(this.getText("wrongGroup", { penalty: result.deducted, points }), "error");
        this.animateScoreDeduction();
      }

      root.clearTimeout(this.guessUnlockTimer);
      this.guessUnlockTimer = root.setTimeout(() => {
        this.isSubmittingGuess = false;
        this.renderGrid();
        this.updateSelectionUi();
      }, 420);

      if (result.complete) {
        root.setTimeout(() => this.openCompletion(), 520);
        this.submitCompletedResult(true);
      }
    }

    render() {
      if (!this.engine) return;
      const { state } = this.engine;
      this.nodes["game-heading"].textContent = state.teamName;
      this.nodes["word-progress"].textContent = this.getText("wordsFound", {
        found: state.enteredWords.length,
        total: wordEntries(this.config).length,
      });
      this.nodes["view-result"].hidden = !state.complete;
      this.renderScore();
      this.renderResolvedGroups();
      this.renderGrid();
      this.renderWordForm();
      this.updateSelectionUi();
      if (state.complete) this.renderCompletion();
    }

    renderScore() {
      const score = this.engine.state.score;
      const maximum = Number(this.config.score.start);
      this.nodes["score-value"].textContent = String(score);
      this.nodes["score-track"].value = Math.max(0, Math.min(maximum, score));
      this.nodes["score-track"].setAttribute("aria-valuetext", this.getText("scoreValueAria", { score }));
    }

    renderResolvedGroups() {
      const container = this.nodes["resolved-groups"];
      container.replaceChildren();
      for (const categoryIndex of this.engine.state.categoryOrder) {
        const category = this.config.categories[categoryIndex];
        const palette = this.config.palette[category.colour];
        const group = document.createElement("article");
        group.className = "resolved-group";
        group.style.backgroundColor = palette.background;
        group.style.color = palette.foreground;
        group.setAttribute("aria-label", this.getText("solvedGroupAria", { category: category.title }));

        const heading = document.createElement("h2");
        heading.textContent = category.title;
        const words = document.createElement("p");
        words.textContent = category.words.join(" · ");
        group.append(heading, words);
        container.append(group);
      }
    }

    renderGrid() {
      const grid = this.nodes["word-grid"];
      grid.replaceChildren();
      const canSelect = this.engine.state.enteredWords.length >= 4 && !this.engine.state.complete && !this.isSubmittingGuess;

      for (const word of this.engine.state.gridSlots) {
        if (word === null) {
          const blank = document.createElement("div");
          blank.className = "blank-tile";
          blank.setAttribute("aria-hidden", "true");
          grid.append(blank);
          continue;
        }

        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "word-tile";
        // Keep long single words on one line where possible. Phrases are left
        // at the normal size so they can wrap naturally across lines.
        if (!/\s/gu.test(word) && word.length >= 8) tile.classList.add("word-tile--long");
        if (!/\s/gu.test(word) && word.length >= 11) tile.classList.add("word-tile--very-long");
        tile.dataset.word = word;
        tile.textContent = word;
        tile.disabled = !canSelect;
        const selected = this.selectedWords.some((value) => normaliseWord(value) === normaliseWord(word));
        tile.setAttribute("aria-pressed", String(selected));
        tile.setAttribute("aria-label", `${word}${selected ? this.getText("tileSelectedSuffix") : ""}`);
        grid.append(tile);
      }
      grid.hidden = this.engine.state.complete;
    }

    renderWordForm() {
      const complete = this.engine.state.complete;
      this.nodes["word-input"].disabled = complete;
      this.nodes["add-word"].disabled = complete;
      this.nodes["word-form"].hidden = complete;
    }

    updateSelectionUi() {
      if (!this.engine) return;
      const normalisedSelection = new Set(this.selectedWords.map(normaliseWord));
      for (const tile of this.nodes["word-grid"].querySelectorAll(".word-tile")) {
        const selected = normalisedSelection.has(normaliseWord(tile.dataset.word));
        tile.setAttribute("aria-pressed", String(selected));
        tile.setAttribute("aria-label", `${tile.dataset.word}${selected ? this.getText("tileSelectedSuffix") : ""}`);
      }

      this.nodes["selection-count"].textContent = this.getText("selectionCount", {
        selected: this.selectedWords.length,
        maximum: 4,
      });
      this.nodes["submit-group"].disabled = this.selectedWords.length !== 4 || this.isSubmittingGuess || this.engine.state.complete;
      this.nodes["deselect-all"].disabled = this.selectedWords.length === 0 || this.isSubmittingGuess || this.engine.state.complete;
      const unresolvedWords = this.engine.state.gridSlots.filter(Boolean).length;
      this.nodes.shuffle.disabled = unresolvedWords < 2 || this.isSubmittingGuess || this.engine.state.complete;
    }

    renderCompletion() {
      const { state } = this.engine;
      this.nodes["final-score"].textContent = String(state.score);
      this.nodes["ranking-label"].textContent = rankingForScore(state.score, this.config).label;
      this.nodes["solve-order"].textContent = categoryOrderEmoji(state, this.config, true);
      const solvedColourLabels = state.categoryOrder.map((categoryIndex) => {
        const colour = this.config.categories[categoryIndex].colour;
        return this.config.palette[colour].label;
      });
      this.nodes["solve-order"].setAttribute(
        "aria-label",
        this.getText("solveOrderAria", { colours: solvedColourLabels.join(", ") }),
      );

      const history = this.nodes["guess-history"];
      history.replaceChildren();
      state.guessHistory.forEach((guess, index) => {
        const line = document.createElement("p");
        line.textContent = guess.emoji;
        const colourLabels = guess.colours.map((colour) => this.config.palette[colour].label);
        line.setAttribute("aria-label", this.getText("guessAria", {
          number: index + 1,
          colours: colourLabels.join(", "),
        }));
        history.append(line);
      });
    }

    animateScoreDeduction() {
      const card = this.nodes["score-card"];
      card.classList.remove("score-hit");
      void card.offsetWidth;
      card.classList.add("score-hit");
      root.setTimeout(() => card.classList.remove("score-hit"), 520);
    }

    showBanner(message, tone = "notice") {
      const banner = this.nodes["feedback-banner"];
      root.clearTimeout(this.bannerTimer);
      this.syncBannerViewport();
      banner.hidden = false;
      banner.textContent = message;
      banner.dataset.tone = tone;
      banner.classList.remove("is-visible");
      void banner.offsetWidth;
      banner.classList.add("is-visible");
      this.bannerTimer = root.setTimeout(() => {
        banner.classList.remove("is-visible");
        banner.hidden = true;
      }, 3100);
    }

    syncBannerViewport() {
      const banner = this.nodes["feedback-banner"];
      if (!banner) return;
      const viewport = root.visualViewport;
      const width = Number(viewport?.width) || root.innerWidth || document.documentElement.clientWidth;
      const offsetTop = Math.max(0, Number(viewport?.offsetTop) || 0);
      const offsetLeft = Math.max(0, Number(viewport?.offsetLeft) || 0);
      banner.style.setProperty("--visual-viewport-top", `${offsetTop}px`);
      banner.style.setProperty("--visual-viewport-centre", `${offsetLeft + width / 2}px`);
      banner.style.setProperty("--visual-viewport-width", `${width}px`);
    }

    openCompletion() {
      if (!this.engine?.state.complete) return;
      this.renderCompletion();
      this.nodes["copy-status"].textContent = "";
      const dialog = this.nodes["completion-dialog"];
      if (dialog.open) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      this.nodes["copy-result"].focus();
    }

    closeCompletion() {
      const dialog = this.nodes["completion-dialog"];
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      this.nodes["view-result"].focus();
    }

    async copyResult() {
      if (!this.engine?.state.complete) return;
      const text = buildShareText(this.engine.state, this.config);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const temporary = document.createElement("textarea");
          temporary.value = text;
          temporary.setAttribute("readonly", "");
          temporary.style.position = "fixed";
          temporary.style.opacity = "0";
          document.body.append(temporary);
          temporary.select();
          const copied = document.execCommand("copy");
          temporary.remove();
          if (!copied) throw new Error("Copy command failed.");
        }
        this.nodes["copy-status"].textContent = this.getText("copySuccess");
      } catch (_error) {
        this.nodes["copy-status"].textContent = this.getText("copyFailure");
      }
    }

    resetGame() {
      if (!root.confirm(this.getText("resetConfirmation"))) return;
      root.clearTimeout(this.guessUnlockTimer);
      root.clearTimeout(this.bannerTimer);
      this.store.clear();
      this.engine = null;
      this.selectedWords = [];
      this.isSubmittingGuess = false;
      this.resultSubmissionInFlight = false;
      this.closeCompletionIfOpen();
      this.nodes["team-name"].value = "";
      this.nodes["word-feedback"].textContent = "";
      this.nodes["submission-status"].textContent = "";
      this.nodes["feedback-banner"].classList.remove("is-visible");
      this.nodes["feedback-banner"].hidden = true;
      this.showWelcome();
      this.nodes["team-name"].focus();
    }

    closeCompletionIfOpen() {
      const dialog = this.nodes["completion-dialog"];
      if (!dialog) return;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    }

    isEndpointConfigured() {
      const endpoint = String(this.config.resultsEndpoint ?? "").trim();
      return endpoint.startsWith("https://") && !endpoint.includes("YOUR_GOOGLE_APPS_SCRIPT_URL");
    }

    async submitCompletedResult(force = false) {
      if (
        !this.engine?.state.complete
        || this.engine.state.resultSubmitted
        || this.resultSubmissionInFlight
        || !this.isEndpointConfigured()
      ) return;

      const attemptedAt = Date.parse(this.engine.state.submissionAttemptedAt ?? "");
      const retryDelay = 12000;
      const elapsed = Date.now() - attemptedAt;
      if (!force && Number.isFinite(attemptedAt) && elapsed >= 0 && elapsed < retryDelay) {
        root.setTimeout(() => this.submitCompletedResult(true), retryDelay - elapsed);
        return;
      }

      const sessionId = this.engine.state.sessionId;
      this.resultSubmissionInFlight = true;
      this.engine.state.submissionAttemptedAt = isoTimestamp();
      this.persist();
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeout = root.setTimeout(() => controller?.abort(), 10000);

      try {
        await fetch(this.config.resultsEndpoint, {
          method: "POST",
          mode: "no-cors",
          credentials: "omit",
          cache: "no-store",
          keepalive: true,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify(completionPayload(this.engine.state, this.config)),
          signal: controller?.signal,
        });

        if (this.engine?.state.sessionId === sessionId) {
          this.engine.state.resultSubmitted = true;
          this.persist();
          this.nodes["submission-status"].textContent = this.getText("resultSent");
        }
      } catch (_error) {
        if (this.engine?.state.sessionId === sessionId) {
          this.nodes["submission-status"].textContent = this.getText("resultSavedForRetry");
        }
      } finally {
        root.clearTimeout(timeout);
        this.resultSubmissionInFlight = false;
      }
    }

    syncSubmissionState(event) {
      if (!this.engine || event.key !== this.config.storageKey || !event.newValue) return;
      try {
        const updated = hydrateState(JSON.parse(event.newValue), this.config);
        if (updated.sessionId === this.engine.state.sessionId && updated.resultSubmitted) {
          this.engine.state.resultSubmitted = true;
          this.nodes["submission-status"].textContent = this.getText("resultSent");
        }
      } catch (_error) {
        // Ignore unrelated or partially written storage events.
      }
    }

    persist() {
      if (!this.engine) return;
      const saved = this.store.save(this.engine.state);
      if (!saved) {
        this.nodes["submission-status"].textContent = this.getText("saveUnavailable");
      }
    }

    showWelcome() {
      this.nodes["welcome-screen"].hidden = false;
      this.nodes["game-screen"].hidden = true;
    }

    showGame() {
      this.nodes["welcome-screen"].hidden = true;
      this.nodes["game-screen"].hidden = false;
    }

    setTeamMessage(message, tone = "") {
      this.nodes["team-error"].textContent = message;
      this.nodes["team-error"].dataset.tone = tone;
    }

    setWordMessage(message, tone = "") {
      this.nodes["word-feedback"].textContent = "";
      if (message) this.showBanner(message, tone || "notice");
    }

    showFatalError(errors) {
      const page = document.querySelector(".page-shell");
      const fatal = document.getElementById("fatal-error");
      page.hidden = true;
      fatal.hidden = false;
      fatal.textContent = formatText(this.config?.text?.fatalConfiguration || "The puzzle configuration needs attention: {errors}", {
        errors: errors.join(" "),
      });
    }
  }

  const publicApi = {
    PuzzleEngine,
    buildShareText,
    categoryOrderEmoji,
    completionPayload,
    createSession,
    evaluateGuess,
    formatText,
    guessHistoryEmoji,
    hydrateState,
    normaliseTeamName,
    normaliseWord,
    rankingForScore,
    shuffleArray,
    validateConfig,
  };

  root.MuseumConnections = Object.freeze(publicApi);
  if (typeof module !== "undefined" && module.exports) module.exports = publicApi;

  if (typeof document !== "undefined") {
    const start = () => {
      const app = new PuzzleApp(root.PUZZLE);
      app.init();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
}(typeof globalThis !== "undefined" ? globalThis : window));
