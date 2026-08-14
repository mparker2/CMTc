(function initialiseMuseumConnections(root) {
  "use strict";

  const STATE_SCHEMA_VERSION = 1;
  const REQUIRED_COLOURS = ["yellow", "green", "blue", "purple"];
  const REQUIRED_TEXT_KEYS = [
    "metaDescription", "headerEyebrow", "welcomeLocation", "welcomeTitle", "welcomeInstructions",
    "teamNameLabel", "beginButton", "welcomeInstructionsTitle", "playingAsLabel", "defaultTeamHeading",
    "viewResultButton", "scoreLabel", "scoreAria", "scorePenalty", "scoreValueAria", "wordsFound",
    "selectionCount", "boardAria", "solvedGroupsAria", "unresolvedWordsAria", "solvedGroupAria",
    "tileSelectedSuffix", "wordEntryLabel", "allWordsFoundLabel", "addButton", "puzzleControlsAria",
    "submitGroupButton", "deselectAllButton", "shuffleButton", "resetButton", "completionKicker",
    "openMapButton", "mapTitle", "closeMapAria", "completionTitle", "pointsLabel", "solveOrderHeading", "solveOrderAria", "guessesHeading",
    "guessHistoryAria", "guessAria", "closeResultsAria", "copyResultButton", "teamNameRequired",
    "teamNameTooShort", "teamNameTooVague",
    "restoreFailed", "emptyWord", "invalidWord", "wordAlreadyFound", "duplicateWord", "gridFull", "wordCouldNotBeAdded",
    "wordCorrected", "invalidWordPenalty", "alreadyGuessed",
    "wordAdded", "findMoreWords", "maxSelection", "selectionCleared", "wordsShuffled", "invalidGuess",
    "correctGroup", "oneAway", "wrongGroup", "pointSingular", "pointPlural", "copySuccess",
    "copyFailure", "resetConfirmation", "resultSent", "resultSavedForRetry", "saveUnavailable",
    "fatalConfiguration", "shareTeam", "shareScore",
    "personalizedWelcomeDefault", "bonusRoundTitle", "bonusRoundInstructions", "bonusRoundSubmit",
    "bonusRoundLivesAria", "bonusRoundLastLifeHint", "bonusRoundSuccess", "bonusRoundFailure",
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

  function normaliseWelcomeMatch(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .replace(/æ/giu, "ae")
      .replace(/ß/giu, "ss")
      .toLocaleLowerCase("en-GB")
      .trim();
  }

  function personalizedWelcomeFor(teamName, messages = root.PERSONALIZED_WELCOMES) {
    const candidate = normaliseWelcomeMatch(teamName);
    if (!candidate || !Array.isArray(messages)) return null;

    return messages
      .filter((entry) => Number.isFinite(Number(entry?.precedence)) && String(entry?.message ?? "").trim())
      .filter((entry) => Array.isArray(entry.matches) && entry.matches.some((match) => {
        const fragment = normaliseWelcomeMatch(match);
        return fragment && candidate.includes(fragment);
      }))
      .sort((left, right) => Number(left.precedence) - Number(right.precedence))[0] ?? null;
  }

  function isTooVagueTeamName(value, config) {
    const normalised = normaliseTeamName(value).toLocaleLowerCase("en-GB");
    return (Array.isArray(config?.teamNameBlockedNames) ? config.teamNameBlockedNames : [])
      .some((name) => normaliseTeamName(name).toLocaleLowerCase("en-GB") === normalised);
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
    const bonusAnswers = config.bonusRound?.correctSurnames;
    const bonusIncorrect = config.bonusRound?.incorrectSurnames;
    const bonusNames = [...(bonusAnswers ?? []), ...(bonusIncorrect ?? [])];
    if (!Array.isArray(bonusIncorrect) || bonusIncorrect.length < 4 || new Set(bonusNames.map(normaliseWord)).size !== bonusNames.length) {
      errors.push("PUZZLE.bonusRound.incorrectSurnames must contain at least four names distinct from the correct answers.");
    }
    if (!Array.isArray(bonusAnswers) || bonusAnswers.length < 1 || new Set(bonusAnswers).size !== bonusAnswers.length || bonusAnswers.some((name) => !bonusNames?.includes(name))) {
      errors.push("PUZZLE.bonusRound.correctSurnames must contain unique configured names.");
    }
    if (!Number.isFinite(Number(config.bonusRound?.points)) || Number(config.bonusRound.points) <= 0) {
      errors.push("PUZZLE.bonusRound.points must be positive.");
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
      invalidWords: [],
      gridSlots: Array(16).fill(null),
      solvedCategories: [],
      categoryOrder: [],
      score: Number(config.score.start),
      guessHistory: [],
      complete: false,
      cheatUsed: false,
      bonusRoundUnlocked: false,
      bonusRoundCompleted: false,
      bonusRoundLives: 3,
      bonusRoundSurnames: null,
      borderEndpointsFound: { top: false, bottom: false },
      mapUnlocked: false,
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

  function elapsedTime(startTimestamp, endTimestamp) {
    const elapsedMilliseconds = Math.max(0, Date.parse(endTimestamp) - Date.parse(startTimestamp));
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function completionPayload(state, config) {
    return {
      sessionId: state.sessionId,
      teamName: state.teamName,
      score: state.score,
      startTimestamp: state.startTimestamp,
      endTimestamp: state.endTimestamp,
      elapsedTime: elapsedTime(state.startTimestamp, state.endTimestamp),
      cheatUsed: Boolean(state.cheatUsed),
      bonusCompleted: Boolean(state.bonusRoundCompleted),
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
    const invalidWords = Array.isArray(rawState.invalidWords)
      ? [...new Set(rawState.invalidWords.map(normaliseWord).filter(Boolean))]
      : [];

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
      ? Math.max(0, Math.min(Number(config.score.start) + Number(config.bonusRound?.points || 0), rawScore))
      : Number(config.score.start);
    const storedBonusSurnames = Array.isArray(rawState.bonusRoundSurnames)
      && rawState.bonusRoundSurnames.length === 9
      && new Set(rawState.bonusRoundSurnames).size === 9
      && config.bonusRound.correctSurnames.every((name) => rawState.bonusRoundSurnames.includes(name))
      && rawState.bonusRoundSurnames.every((name) => (
        config.bonusRound.correctSurnames.includes(name)
        || config.bonusRound.incorrectSurnames.includes(name)
      ))
      ? [...rawState.bonusRoundSurnames]
      : null;

    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      sessionId: rawState.sessionId,
      teamName,
      startTimestamp: rawState.startTimestamp,
      endTimestamp,
      enteredWords,
      invalidWords,
      gridSlots,
      solvedCategories,
      categoryOrder,
      score,
      guessHistory,
      complete,
      cheatUsed: Boolean(rawState.cheatUsed),
      bonusRoundUnlocked: Boolean(rawState.bonusRoundUnlocked),
      bonusRoundCompleted: Boolean(rawState.bonusRoundCompleted),
      bonusRoundLives: Math.max(0, Math.min(3, Number.isFinite(Number(rawState.bonusRoundLives)) ? Number(rawState.bonusRoundLives) : 3)),
      bonusRoundSurnames: storedBonusSurnames,
      borderEndpointsFound: {
        top: Boolean(rawState.borderEndpointsFound?.top),
        bottom: Boolean(rawState.borderEndpointsFound?.bottom),
      },
      mapUnlocked: Boolean(rawState.mapUnlocked),
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
          if (this.state.invalidWords.includes(normalised)) {
            return { status: "alreadyGuessed", score: this.state.score };
          }
          this.state.invalidWords.push(normalised);
          this.state.score = Math.max(0, this.state.score - 1);
          return { status: "invalid", deducted: 1, score: this.state.score };
        }
      }
      if (this.state.enteredWords.some((word) => normaliseWord(word) === normaliseWord(entry.canonical))) {
        return { status: "alreadyFound", word: entry.canonical };
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

    addCheatWords(inputs) {
      if (this.state.complete) return { added: [] };

      const added = [];
      const entered = new Set(this.state.enteredWords.map(normaliseWord));
      const emptySlots = this.state.gridSlots
        .map((word, index) => (word === null ? index : -1))
        .filter((index) => index >= 0);

      for (const input of inputs) {
        if (emptySlots.length === 0) break;
        const entry = this.lookup.get(normaliseWord(input));
        if (!entry || entered.has(entry.normalised)) continue;

        const selectedEmptySlot = emptySlots.shift();
        entered.add(entry.normalised);
        this.state.enteredWords.push(entry.canonical);
        this.state.gridSlots[selectedEmptySlot] = entry.canonical;
        added.push(entry.canonical);
      }

      return { added };
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
        const submittedSet = new Set(canonicalWords.map(normaliseWord));
        const alreadyGuessed = this.state.guessHistory.some((guess) => (
          Array.isArray(guess.words)
          && guess.words.length === canonicalWords.length
          && new Set(guess.words.map(normaliseWord)).size === submittedSet.size
          && guess.words.every((word) => submittedSet.has(normaliseWord(word)))
        ));
        if (alreadyGuessed) return { alreadyGuessed: true, deducted: 0, score: this.state.score };
        throw new Error("A selected word is no longer unresolved.");
      }

      const submittedSet = new Set(canonicalWords.map(normaliseWord));
      if (this.state.guessHistory.some((guess) => (
        Array.isArray(guess.words)
        && guess.words.length === canonicalWords.length
        && new Set(guess.words.map(normaliseWord)).size === submittedSet.size
        && guess.words.every((word) => submittedSet.has(normaliseWord(word)))
      ))) return { alreadyGuessed: true, deducted: 0, score: this.state.score };

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
      this.deferBonusGold = false;
      this.bonusGoldTimer = null;
      this.scrollLock = null;
      this.bannerTimer = null;
      this.guessUnlockTimer = null;
      this.nodes = {};
      this.syncBannerViewport = this.syncBannerViewport.bind(this);
      this.fitWelcomeTitle = this.fitWelcomeTitle.bind(this);
      this.fitTeamName = this.fitTeamName.bind(this);
      this.fitScoreNote = this.fitScoreNote.bind(this);
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
        "page-description", "site-header", "header-eyebrow", "header-title", "welcome-screen",
        "welcome-title", "welcome-copy", "welcome-instructions-title", "team-form", "team-name-label", "team-name", "begin-game", "team-error",
        "game-screen", "playing-as-label", "game-heading", "view-result", "score-card",
        "score-label", "score-value", "score-track", "score-note", "board",
        "resolved-groups", "word-grid", "word-form", "word-input-label",
        "word-input", "add-word", "word-feedback", "game-actions", "submit-group", "deselect-all", "shuffle",
        "submission-status", "result-separator", "reset-game", "feedback-banner", "completion-dialog", "close-completion",
        "completion-kicker", "completion-title", "final-score", "points-label", "ranking-label",
        "solve-order-heading", "solve-order", "guesses-heading", "guess-history", "copy-result", "copy-status",
        "fatal-error",
        "wheel-trigger", "bonus-dialog", "close-bonus", "bonus-title", "bonus-instructions",
        "bonus-lives", "bonus-hint", "bonus-grid", "bonus-submit", "bonus-feedback",
        "top-border", "bottom-border", "map-dialog", "close-map", "map-title", "map-image-frame", "map-image", "open-map",
      ];
      for (const id of ids) this.nodes[id] = document.getElementById(id);
    }

    applyConfiguration() {
      document.title = this.config.title;
      this.nodes["page-description"].content = this.getText("metaDescription");
      this.nodes["site-header"].setAttribute("aria-label", this.config.title);
      this.nodes["header-eyebrow"].textContent = this.getText("headerEyebrow");
      this.nodes["header-title"].alt = this.config.title;
      this.nodes["welcome-title"].textContent = this.getText("welcomeTitle");
      this.nodes["welcome-instructions-title"].textContent = this.getText("welcomeInstructionsTitle");
      this.nodes["welcome-copy"].replaceChildren(
        ...(Array.isArray(this.config.text.welcomeInstructions) ? this.config.text.welcomeInstructions : [this.config.text.welcomeInstructions])
          .map((instruction) => {
            const item = document.createElement("li");
            item.textContent = instruction;
            return item;
          }),
      );
      this.nodes["team-name-label"].textContent = this.getText("teamNameLabel");
      this.nodes["begin-game"].textContent = this.getText("beginButton");
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
      this.fitScoreNote();
      this.nodes["score-track"].max = Number(this.config.score.start);
      this.nodes["score-value"].textContent = String(this.config.score.start);
      this.nodes["score-track"].value = Number(this.config.score.start);
      this.nodes["score-track"].setAttribute("aria-valuetext", this.getText("scoreValueAria", {
        score: this.config.score.start,
      }));
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
      this.nodes["open-map"].textContent = this.getText("openMapButton");
      this.nodes["map-title"].textContent = this.getText("mapTitle");
      this.nodes["close-map"].setAttribute("aria-label", this.getText("closeMapAria"));
      this.nodes["close-completion"].setAttribute("aria-label", this.getText("closeResultsAria"));
      this.nodes["completion-kicker"].textContent = this.getText("completionKicker");
      this.nodes["completion-title"].textContent = this.getText("completionTitle");
      this.nodes["points-label"].textContent = this.getText("pointsLabel");
      this.nodes["solve-order-heading"].textContent = this.getText("solveOrderHeading");
      this.nodes["solve-order"].setAttribute("aria-label", this.getText("solveOrderAria", { colours: "" }).trim());
      this.nodes["guesses-heading"].textContent = this.getText("guessesHeading");
      this.nodes["guess-history"].setAttribute("aria-label", this.getText("guessHistoryAria"));
      this.nodes["copy-result"].textContent = this.getText("copyResultButton");
      this.nodes["bonus-title"].textContent = this.getText("bonusRoundTitle");
      this.nodes["bonus-instructions"].textContent = this.getText("bonusRoundInstructions");
      this.nodes["bonus-submit"].textContent = this.getText("bonusRoundSubmit");
      this.nodes["bonus-hint"].textContent = this.getText("bonusRoundLastLifeHint");
    }

    fitWelcomeTitle() {
      const title = this.nodes["welcome-title"];
      if (!title || !title.isConnected) return;

      const availableWidth = title.clientWidth;
      if (availableWidth <= 0) return;

      let low = 24;
      let high = 96;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const candidate = (low + high) / 2;
        title.style.fontSize = `${candidate}px`;
        if (title.scrollWidth <= availableWidth) low = candidate;
        else high = candidate;
      }
      title.style.fontSize = `${low}px`;
    }

    fitTeamName() {
      const heading = this.nodes["game-heading"];
      if (!heading || !heading.isConnected || !this.engine) return;

      // Measure a copy without the decorative transform. Measuring the live
      // transformed heading can make long names shrink much more than needed.
      const measurement = heading.cloneNode(true);
      const headingStyle = getComputedStyle(heading);
      // This is the pre-transform width; the existing scale is applied to the
      // visible heading separately, so this keeps the scaled result in bounds.
      const availableWidth = heading.clientWidth;
      const maximum = Number.parseFloat(headingStyle.fontSize);
      if (!availableWidth || !maximum) return;

      measurement.textContent = heading.textContent;
      measurement.style.position = "absolute";
      measurement.style.visibility = "hidden";
      measurement.style.pointerEvents = "none";
      measurement.style.width = `${availableWidth}px`;
      measurement.style.maxWidth = "none";
      measurement.style.transform = "none";
      measurement.style.fontSize = `${maximum}px`;
      document.body.append(measurement);

      let low = 10;
      let high = maximum;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const candidate = (low + high) / 2;
        measurement.style.fontSize = `${candidate}px`;
        const fitsLines = measurement.getBoundingClientRect().height <= candidate * 0.88 * 2 + 1;
        if (fitsLines) low = candidate;
        else high = candidate;
      }
      measurement.remove();
      heading.style.fontSize = `${low}px`;
    }

    fitScoreNote() {
      const note = this.nodes["score-note"];
      if (!note || !note.isConnected) return;
      const originalFontSize = note.style.fontSize;
      note.style.fontSize = "";
      note.style.whiteSpace = "nowrap";
      const maximum = Number.parseFloat(getComputedStyle(note).fontSize);
      const availableWidth = note.clientWidth;
      if (!availableWidth || !maximum) {
        note.style.fontSize = originalFontSize;
        return;
      }

      let low = 8;
      let high = maximum;
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const candidate = (low + high) / 2;
        note.style.fontSize = `${candidate}px`;
        if (note.scrollWidth <= availableWidth + 1) low = candidate;
        else high = candidate;
      }
      note.style.fontSize = `${low}px`;
    }

    bindEvents() {
      this.nodes["team-form"].addEventListener("submit", (event) => this.startGame(event));
      this.nodes["word-form"].addEventListener("submit", (event) => this.addWord(event));
      this.nodes["word-grid"].addEventListener("click", (event) => this.toggleTile(event));
      this.nodes["submit-group"].addEventListener("click", () => this.submitGroup());
      this.nodes["deselect-all"].addEventListener("click", () => this.deselectAll());
      this.nodes.shuffle.addEventListener("click", () => this.shuffle());
      this.nodes["reset-game"].addEventListener("click", () => this.resetGame());
      this.nodes["open-map"].addEventListener("click", () => this.openMap(false));
      this.nodes["view-result"].addEventListener("click", () => this.openCompletion());
      this.nodes["close-completion"].addEventListener("click", () => this.closeCompletion());
      this.nodes["copy-result"].addEventListener("click", () => this.copyResult());
      this.nodes["bonus-grid"].addEventListener("click", (event) => this.toggleBonusSurname(event));
      this.nodes["bonus-submit"].addEventListener("click", () => this.submitBonusRound());
      this.nodes["close-bonus"].addEventListener("click", () => this.closeBonusRound());
      this.nodes["close-map"].addEventListener("click", () => this.closeMap());
      this.bindWheelHold();
      this.bindBorderDrag();
      root.addEventListener("online", () => this.submitCompletedResult(true));
      root.addEventListener("storage", (event) => this.syncSubmissionState(event));
      root.visualViewport?.addEventListener?.("resize", this.syncBannerViewport);
      root.visualViewport?.addEventListener?.("scroll", this.syncBannerViewport);
      root.addEventListener("orientationchange", this.syncBannerViewport);
      root.addEventListener("resize", this.fitWelcomeTitle);
      root.addEventListener("resize", this.fitTeamName);
      root.addEventListener("resize", this.fitScoreNote);
      root.addEventListener("resize", () => this.fitMapImage());
      const fitScriptText = () => {
        this.fitWelcomeTitle();
        this.fitTeamName();
        this.fitScoreNote();
        root.requestAnimationFrame?.(() => {
          this.fitWelcomeTitle();
          this.fitTeamName();
          this.fitScoreNote();
        });
      };
      if (root.document?.fonts?.load) {
        root.document.fonts.load('italic 5rem "CMT Wedding Script"').then(fitScriptText);
      } else {
        fitScriptText();
      }
      this.syncBannerViewport();
    }

    bindWheelHold() {
      const wheel = this.nodes["wheel-trigger"];
      if (!wheel) return;
      const wheelImage = wheel.querySelector("img");
      if (!wheelImage) return;
      let holdStartedAt = 0;
      let holdTimer = null;
      let spinFrame = null;
      let cooldownFrame = null;
      let rotation = 0;
      let lastFrameAt = 0;
      let spinSpeed = 0;
      const stop = () => {
        if (!holdStartedAt) return;
        root.clearInterval(holdTimer);
        holdTimer = null;
        holdStartedAt = 0;
        root.cancelAnimationFrame?.(spinFrame);
        spinFrame = null;
        wheel.classList.remove("is-pressing");
        wheel.style.removeProperty("--wheel-spin-duration");

        const startRotation = rotation;
        const nextWholeRotation = Math.ceil((startRotation + 0.0001) / 360) * 360;
        let targetRotation = nextWholeRotation > startRotation ? nextWholeRotation : startRotation + 360;
        const initialSpeed = spinSpeed;
        const decelerationDuration = 0.5;
        const minimumDistance = initialSpeed * decelerationDuration / 2;
        while (targetRotation - startRotation < minimumDistance) {
          targetRotation += 360;
        }
        const totalDistance = targetRotation - startRotation;
        const decelerationDistance = initialSpeed * decelerationDuration / 2;
        const coastDistance = Math.max(0, totalDistance - decelerationDistance);
        const coastDuration = initialSpeed > 0 ? coastDistance / initialSpeed : 0;
        const cooldownDuration = coastDuration + decelerationDuration;
        const cooldownStartedAt = performance.now();
        const cooldown = (now) => {
          const elapsedSeconds = Math.min(cooldownDuration, (now - cooldownStartedAt) / 1000);
          if (elapsedSeconds <= coastDuration) {
            rotation = startRotation + (initialSpeed * elapsedSeconds);
          } else {
            const progress = (elapsedSeconds - coastDuration) / decelerationDuration;
            // Coast first, then decelerate linearly to zero exactly at the
            // target orientation. The velocity never increases or reverses.
            rotation = startRotation + coastDistance + decelerationDistance * (2 * progress - (progress ** 2));
          }
          wheelImage.style.transform = `rotate(${rotation}deg)`;
          if (elapsedSeconds < cooldownDuration) cooldownFrame = root.requestAnimationFrame(cooldown);
          else {
            cooldownFrame = null;
            rotation = 0;
            spinSpeed = 0;
            wheelImage.style.removeProperty("transform");
            wheel.classList.remove("is-cooling");
          }
        };
        root.cancelAnimationFrame?.(cooldownFrame);
        wheel.classList.add("is-cooling");
        cooldownFrame = root.requestAnimationFrame(cooldown);
      };
      const update = () => {
        const elapsed = Date.now() - holdStartedAt;
        const progress = Math.min(elapsed, 4000) / 4000;
        const easedProgress = progress * progress;
        const speed = 1.8 - (1.64 * easedProgress);
        spinSpeed = 200 + (2050 * easedProgress);
        wheel.style.setProperty("--wheel-spin-duration", `${speed}s`);
        if (elapsed >= 4000 && this.engine && !this.engine.state.bonusRoundCompleted) {
          this.engine.state.bonusRoundUnlocked = true;
          this.persist();
          stop();
          // Let pointer capture and the wheel animation settle before the
          // modal enters the top layer; opening it during the hold can make
          // mobile browsers recalculate the visual viewport unexpectedly.
          root.setTimeout(() => this.openBonusRound(), 0);
        }
      };
      const animateSpin = (now) => {
        if (!holdStartedAt) return;
        const elapsed = Date.now() - holdStartedAt;
        const progress = Math.min(elapsed, 4000) / 4000;
        const easedProgress = progress * progress;
        const degreesPerSecond = 200 + (2050 * easedProgress);
        const frameDelta = Math.min(50, now - lastFrameAt);
        spinSpeed = degreesPerSecond;
        rotation += degreesPerSecond * frameDelta / 1000;
        wheelImage.style.transform = `rotate(${rotation}deg)`;
        lastFrameAt = now;
        spinFrame = root.requestAnimationFrame(animateSpin);
      };
      const start = (event) => {
        if (!this.engine || this.engine.state.complete || this.engine.state.bonusRoundCompleted || holdStartedAt) return;
        event.preventDefault();
        wheel.classList.remove("is-entering");
        root.cancelAnimationFrame?.(cooldownFrame);
        cooldownFrame = null;
        wheel.classList.remove("is-cooling");
        wheelImage.style.removeProperty("transform");
        rotation = 0;
        wheel.setPointerCapture?.(event.pointerId);
        holdStartedAt = Date.now();
        lastFrameAt = performance.now();
        wheel.classList.add("is-pressing");
        update();
        spinFrame = root.requestAnimationFrame(animateSpin);
        holdTimer = root.setInterval(update, 80);
      };
      wheel.addEventListener("pointerdown", start);
      wheel.addEventListener("pointerup", stop);
      wheel.addEventListener("pointercancel", stop);
      wheel.addEventListener("lostpointercapture", stop);
      wheel.addEventListener("contextmenu", (event) => event.preventDefault());
      root.setTimeout(() => wheel.classList.remove("is-entering"), 2000);
    }

    bindBorderDrag() {
      this.bindBorderDragTo(this.nodes["top-border"], 1);
      this.bindBorderDragTo(this.nodes["bottom-border"], -1);
    }

    bindBorderDragTo(border, dragDirection) {
      if (!border) return;
      let dragging = false;
      let lastX = 0;
      let offset = 0;
      let lastMoveAt = 0;
      let velocity = 0;
      let inertiaFrame = null;

      const tileWidth = () => Math.max(border.clientHeight * (2048 / 199), 1);
      const maximumOffset = () => {
        const width = tileWidth();
        border.style.setProperty("--border-tile-width", `${width}px`);
        const endWidth = border.clientHeight * (1740 / 199);
        border.style.setProperty("--border-end-width", `${endWidth}px`);
        const motifPosition = dragDirection === 1 ? 0.59 : 0.41;
        border.style.setProperty("--border-end-motif-offset", `${endWidth * motifPosition}px`);
        border.style.setProperty("--border-end-travel", `${width * 3}px`);
        const initialOffset = dragDirection === 1
          ? (width * 3) + (endWidth * 0.59)
          : (width * 2) + (endWidth * 0.41);
        border.style.setProperty("--border-track-initial-offset", `${initialOffset}px`);
        return width * 3;
      };
      maximumOffset();
      const applyOffset = () => {
        border.style.setProperty("--border-drag-x", `${offset}px`);
        border.style.setProperty("--border-track-translate", `${offset * dragDirection}px`);
        if (offset >= maximumOffset() - 1) this.markBorderEndpointFound(border.id);
      };
      const stop = () => {
        if (!dragging) return;
        dragging = false;
        border.classList.remove("is-dragging");
        if (this.engine?.state.mapUnlocked) {
          velocity = 0;
          return;
        }
        if (Math.abs(velocity) < 0.02) return;

        border.classList.add("is-coasting");
        let previousFrameAt = performance.now();
        const coast = (now) => {
          const deltaTime = Math.min(40, now - previousFrameAt);
          previousFrameAt = now;
          const limit = maximumOffset();
          offset = Math.min(limit, Math.max(0, offset + velocity * deltaTime));
          applyOffset();
          if (offset <= 0 || offset >= limit) velocity = 0;
          velocity *= Math.pow(0.9, deltaTime / 16);
          if (Math.abs(velocity) >= 0.02) inertiaFrame = root.requestAnimationFrame(coast);
          else {
            inertiaFrame = null;
            border.classList.remove("is-coasting");
          }
        };
        inertiaFrame = root.requestAnimationFrame(coast);
      };
      border.addEventListener("pointerdown", (event) => {
        if (!this.engine || this.engine.state.mapUnlocked) return;
        event.preventDefault();
        root.cancelAnimationFrame?.(inertiaFrame);
        inertiaFrame = null;
        border.classList.remove("is-coasting");
        dragging = true;
        lastX = event.clientX;
        lastMoveAt = performance.now();
        velocity = 0;
        maximumOffset();
        border.classList.add("is-dragging");
        border.setPointerCapture?.(event.pointerId);
      });
      border.addEventListener("pointermove", (event) => {
        if (!dragging || this.engine?.state.mapUnlocked) return;
        const now = performance.now();
        const deltaTime = Math.max(1, now - lastMoveAt);
        const deltaX = event.clientX - lastX;
        const limit = maximumOffset();
        offset = Math.min(limit, Math.max(0, offset + ((event.clientX - lastX) * dragDirection)));
        lastX = event.clientX;
        lastMoveAt = now;
        velocity = (deltaX * dragDirection) / deltaTime;
        applyOffset();
      });
      border.addEventListener("pointerup", stop);
      border.addEventListener("pointercancel", stop);
      border.addEventListener("lostpointercapture", stop);
      border.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    markBorderEndpointFound(borderId) {
      if (!this.engine || this.engine.state.mapUnlocked) return;
      const endpoint = borderId === "top-border" ? "top" : borderId === "bottom-border" ? "bottom" : null;
      if (!endpoint || this.engine.state.borderEndpointsFound?.[endpoint]) return;

      this.engine.state.borderEndpointsFound = {
        ...(this.engine.state.borderEndpointsFound || {}),
        [endpoint]: true,
      };
      if (this.engine.state.borderEndpointsFound.top && this.engine.state.borderEndpointsFound.bottom) {
        this.engine.state.mapUnlocked = true;
        this.nodes["top-border"]?.classList.add("is-endpoint-locked");
        this.nodes["bottom-border"]?.classList.add("is-endpoint-locked");
      }
      this.persist();
      this.render();
      if (this.engine.state.mapUnlocked) root.setTimeout(() => this.openMap(true), 120);
    }

    openBonusRound() {
      if (!this.engine || this.engine.state.bonusRoundCompleted) return;
      this.bonusSelectedSurnames = new Set();
      this.bonusLives = this.engine.state.bonusRoundLives ?? 3;
      if (!Array.isArray(this.engine.state.bonusRoundSurnames)) {
        const incorrectSurnames = shuffleArray([...this.config.bonusRound.incorrectSurnames]).slice(0, 4);
        this.engine.state.bonusRoundSurnames = shuffleArray([
          ...this.config.bonusRound.correctSurnames,
          ...incorrectSurnames,
        ]);
        this.persist();
      }
      this.bonusSurnames = [...this.engine.state.bonusRoundSurnames];
      this.renderBonusRound();
      const dialog = this.nodes["bonus-dialog"];
      if (!dialog.hidden) return;
      dialog.hidden = false;
      this.lockPageScroll();
    }

    closeBonusRound() {
      const dialog = this.nodes["bonus-dialog"];
      if (dialog.hidden) return;
      dialog.hidden = true;
      this.unlockPageScroll();
    }

    openMap(showTitle = false) {
      if (!this.engine?.state.mapUnlocked) return;
      const dialog = this.nodes["map-dialog"];
      if (!dialog || !dialog.hidden) return;
      this.nodes["map-title"].hidden = !showTitle;
      dialog.hidden = false;
      this.lockPageScroll();
      this.fitMapImage();
      this.nodes["close-map"].focus({ preventScroll: true });
    }

    fitMapImage() {
      const frame = this.nodes["map-image-frame"];
      const image = this.nodes["map-image"];
      const dialog = this.nodes["map-dialog"];
      if (!frame || !image || !dialog || dialog.hidden) return;

      const panel = this.nodes["map-dialog"].querySelector(".map-panel");
      if (!panel) return;
      const panelStyle = getComputedStyle(panel);
      const panelExtras = Number.parseFloat(panelStyle.paddingLeft)
        + Number.parseFloat(panelStyle.paddingRight) + 2;
      const maximumPanelWidth = Math.min((root.innerWidth || document.documentElement.clientWidth) - 16, 46 * 16 * 2.875);
      const maximumContentWidth = Math.max(160, maximumPanelWidth - panelExtras);
      const reservedHeight = this.nodes["map-title"].hidden ? 5 * 16 : 12 * 16;
      const availableHeight = Math.max(160, (root.innerHeight || document.documentElement.clientHeight) - reservedHeight);
      const frameHeight = Math.min(availableHeight, maximumContentWidth / 0.727);
      const frameWidth = frameHeight * 0.727;
      panel.style.width = `${frameWidth + panelExtras}px`;
      frame.style.width = `${frameWidth}px`;
      frame.style.height = `${frameHeight}px`;
      image.style.width = "auto";
      image.style.height = "auto";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "100%";
    }

    closeMap() {
      const dialog = this.nodes["map-dialog"];
      if (!dialog || dialog.hidden) return;
      dialog.hidden = true;
      this.unlockPageScroll();
      if (this.engine && !this.nodes["open-map"].hidden) {
        this.nodes["open-map"].focus({ preventScroll: true });
      }
    }

    lockPageScroll() {
      if (this.scrollLock) return;
      const scrollY = root.scrollY;
      this.scrollLock = {
        scrollY,
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyWidth: document.body.style.width,
        bodyOverflow: document.body.style.overflow,
      };
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    }

    unlockPageScroll() {
      if (!this.scrollLock) return;
      const { scrollY, bodyPosition, bodyTop, bodyWidth, bodyOverflow } = this.scrollLock;
      document.body.style.position = bodyPosition;
      document.body.style.top = bodyTop;
      document.body.style.width = bodyWidth;
      document.body.style.overflow = bodyOverflow;
      this.scrollLock = null;
      root.scrollTo(0, scrollY);
    }

    renderBonusRound() {
      const grid = this.nodes["bonus-grid"];
      grid.replaceChildren();
      for (const surname of this.bonusSurnames) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bonus-surname";
        button.dataset.surname = surname;
        button.textContent = surname;
        button.setAttribute("aria-pressed", String(this.bonusSelectedSurnames.has(surname)));
        button.classList.toggle("is-selected", this.bonusSelectedSurnames.has(surname));
        grid.append(button);
      }
      const lives = Math.max(0, this.bonusLives ?? 3);
      this.nodes["bonus-lives"].textContent = "♥".repeat(lives) + "♡".repeat(3 - lives);
      this.nodes["bonus-lives"].setAttribute("aria-label", this.getText("bonusRoundLivesAria", { count: lives }));
      this.nodes["bonus-hint"].hidden = lives !== 1;
      this.nodes["bonus-submit"].disabled = this.bonusSelectedSurnames.size === 0;
    }

    toggleBonusSurname(event) {
      const button = event.target.closest(".bonus-surname");
      if (!button || this.nodes["bonus-dialog"].hidden) return;
      const surname = button.dataset.surname;
      if (this.bonusSelectedSurnames.has(surname)) this.bonusSelectedSurnames.delete(surname);
      else this.bonusSelectedSurnames.add(surname);
      this.renderBonusRound();
    }

    submitBonusRound() {
      if (!this.engine || this.engine.state.bonusRoundCompleted || this.bonusSelectedSurnames.size === 0) return;
      const answers = new Set(this.config.bonusRound.correctSurnames);
      const correct = this.bonusSelectedSurnames.size === answers.size
        && [...this.bonusSelectedSurnames].every((surname) => answers.has(surname));
      if (correct) {
        this.engine.state.score += Number(this.config.bonusRound.points);
        this.engine.state.bonusRoundCompleted = true;
        this.deferBonusGold = true;
        this.persist();
        this.render();
        this.closeBonusRound();
        this.animateBonusScore();
        root.clearTimeout(this.bonusGoldTimer);
        this.bonusGoldTimer = root.setTimeout(() => {
          this.deferBonusGold = false;
          this.renderScore();
        }, 150);
        this.showBanner(this.getText("bonusRoundSuccess", { points: this.config.bonusRound.points }), "success");
        return;
      }

      this.bonusLives -= 1;
      this.bonusSelectedSurnames = new Set();
      this.engine.state.bonusRoundLives = this.bonusLives;
      if (this.bonusLives <= 0) {
        this.engine.state.bonusRoundCompleted = true;
        this.persist();
        this.closeBonusRound();
        this.showBanner(this.getText("bonusRoundFailure"), "error");
      } else {
        this.renderBonusRound();
      }
    }

    startGame(event) {
      event.preventDefault();
      const teamName = normaliseTeamName(this.nodes["team-name"].value);
      this.nodes["team-name"].value = "";
      if (!teamName) {
        this.setTeamMessage(this.getText("teamNameRequired"), "error");
        return;
      }
      if (teamName.length < 3) {
        this.setTeamMessage(this.getText("teamNameTooShort"), "error");
        return;
      }
      if (isTooVagueTeamName(teamName, this.config)) {
        this.setTeamMessage(this.getText("teamNameTooVague"), "error");
        return;
      }

      this.engine = PuzzleEngine.newGame(this.config, teamName, isoTimestamp());
      this.selectedWords = [];
      this.persist();
      this.showGame();
      this.render();
      const personalizedWelcome = personalizedWelcomeFor(teamName);
      const welcomeMessage = personalizedWelcome?.message ?? this.getText("personalizedWelcomeDefault");
      this.showBanner(formatText(welcomeMessage, { teamname: teamName }), "notice");
    }

    addWord(event) {
      event.preventDefault();
      if (!this.engine || this.engine.state.complete) return;
      const input = this.nodes["word-input"].value;
      this.nodes["word-input"].value = "";

      if (input.startsWith("#!CHEAT:")) {
        this.engine.state.cheatUsed = true;
        const cheatWords = input.slice("#!CHEAT:".length).split(",");
        const result = this.engine.addCheatWords(cheatWords);
        this.persist();
        this.render();
        this.setWordMessage(
          result.added.length > 0
            ? `Test shortcut added ${result.added.length} word${result.added.length === 1 ? "" : "s"}.`
            : "Test shortcut found no new valid words.",
          result.added.length > 0 ? "success" : "error",
        );
        return;
      }

      const result = this.engine.addWord(input);

      const messages = {
        empty: [this.getText("emptyWord"), "error"],
        invalid: [this.getText("invalidWordPenalty", { penalty: result.deducted }), "error"],
        alreadyFound: [this.getText("wordAlreadyFound", { word: result.word }), "error"],
        alreadyGuessed: [this.getText("alreadyGuessed"), "error"],
        full: [this.getText("gridFull"), "error"],
      };
      if (result.status !== "added" && result.status !== "corrected") {
        const [message, tone] = messages[result.status] ?? [this.getText("wordCouldNotBeAdded"), "error"];
        this.persist();
        if (result.deducted) this.render();
        this.setWordMessage(message, tone);
        return;
      }

      this.persist();
      this.render();
      const foundCount = this.engine.state.enteredWords.length;
      const parts = [result.status === "corrected"
        ? this.getText("wordCorrected", { input: result.input, word: result.word })
        : this.getText("wordAdded", { word: result.word })];
      if (foundCount < 4) parts.push(this.getText("findMoreWords", { count: 4 - foundCount }));
      this.setWordMessage(parts.join(" "), "success");
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

      if (result.alreadyGuessed) {
        this.setWordMessage(this.getText("alreadyGuessed"), "error");
        root.clearTimeout(this.guessUnlockTimer);
        this.guessUnlockTimer = root.setTimeout(() => {
          this.isSubmittingGuess = false;
          this.renderGrid();
          this.updateSelectionUi();
        }, 420);
        return;
      }

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
      const headingRow = this.nodes["game-heading"].closest(".game-heading-row");
      headingRow?.classList.toggle("has-long-team-name", state.teamName.length >= 15);
      this.fitTeamName();
      this.nodes["view-result"].hidden = !state.complete;
      this.nodes["result-separator"].hidden = !state.complete;
      this.nodes["open-map"].hidden = !state.mapUnlocked;
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
      this.nodes["score-card"].classList.toggle("score-over-limit", score > maximum && !this.deferBonusGold);
      this.nodes["score-track"].setAttribute("aria-valuetext", this.getText("scoreValueAria", { score }));
      this.fitScoreNote();
    }

    renderResolvedGroups() {
      const container = this.nodes["resolved-groups"];
      const categoryOrder = this.engine.state.categoryOrder;
      const renderedOrder = [...container.children].map((group) => Number(group.dataset.categoryIndex));

      // Adding a word should not reconstruct the already-solved groups. Keep
      // the existing DOM nodes unless the solve order has actually changed.
      const orderMatches = renderedOrder.length <= categoryOrder.length
        && renderedOrder.every((categoryIndex, index) => categoryIndex === categoryOrder[index]);
      if (orderMatches && renderedOrder.length === categoryOrder.length) return;
      if (!orderMatches) container.replaceChildren();

      const firstNewGroup = orderMatches ? renderedOrder.length : 0;
      for (const categoryIndex of categoryOrder.slice(firstNewGroup)) {
        const category = this.config.categories[categoryIndex];
        const palette = this.config.palette[category.colour];
        const group = document.createElement("article");
        group.className = "resolved-group is-new";
        group.dataset.categoryIndex = String(categoryIndex);
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
      const allWordsFound = this.engine.state.enteredWords.length >= wordEntries(this.config).length;
      this.nodes["word-input-label"].textContent = this.getText(allWordsFound ? "allWordsFoundLabel" : "wordEntryLabel");
      this.nodes["word-input"].disabled = complete || allWordsFound;
      this.nodes["add-word"].disabled = complete || allWordsFound;
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

    animateBonusScore() {
      const card = this.nodes["score-card"];
      card.classList.remove("score-bonus");
      void card.offsetWidth;
      card.classList.add("score-bonus");
      root.setTimeout(() => card.classList.remove("score-bonus"), 760);
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
      this.lockPageScroll();
      this.nodes["copy-result"].focus();
    }

    closeCompletion() {
      const dialog = this.nodes["completion-dialog"];
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      this.unlockPageScroll();
      this.nodes["view-result"].focus({ preventScroll: true });
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
      this.deferBonusGold = false;
      root.clearTimeout(this.bonusGoldTimer);
      this.bonusGoldTimer = null;
      this.closeCompletionIfOpen();
      this.closeBonusRound();
      this.closeMap();
      this.nodes["team-name"].value = "";
      this.nodes["word-feedback"].textContent = "";
      this.nodes["submission-status"].textContent = "";
      this.nodes["feedback-banner"].classList.remove("is-visible");
      this.nodes["feedback-banner"].hidden = true;
      this.nodes["open-map"].hidden = true;
      this.showWelcome();
    }

    closeCompletionIfOpen() {
      const dialog = this.nodes["completion-dialog"];
      if (!dialog) return;
      const wasOpen = typeof dialog.open === "boolean" ? dialog.open : dialog.hasAttribute("open");
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      if (wasOpen) this.unlockPageScroll();
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
      this.restoreBorderEndpointPositions(false);
      this.nodes["top-border"]?.classList.add("is-locked");
      this.nodes["bottom-border"]?.classList.add("is-locked");
      this.nodes["top-border"]?.classList.remove("is-endpoint-locked");
      this.nodes["bottom-border"]?.classList.remove("is-endpoint-locked");
    }

    showGame() {
      this.nodes["welcome-screen"].hidden = true;
      this.nodes["game-screen"].hidden = false;
      this.restoreBorderEndpointPositions(Boolean(this.engine?.state.mapUnlocked));
      this.nodes["top-border"]?.classList.remove("is-locked");
      this.nodes["bottom-border"]?.classList.remove("is-locked");
      this.nodes["top-border"]?.classList.toggle("is-endpoint-locked", Boolean(this.engine?.state.mapUnlocked));
      this.nodes["bottom-border"]?.classList.toggle("is-endpoint-locked", Boolean(this.engine?.state.mapUnlocked));
    }

    restoreBorderEndpointPositions(locked) {
      const borders = [
        [this.nodes["top-border"], 1],
        [this.nodes["bottom-border"], -1],
      ];
      for (const [border, direction] of borders) {
        if (!border) continue;
        const limit = Math.max(border.clientHeight * (2048 / 199), 1) * 3;
        const offset = locked ? limit : 0;
        border.style.setProperty("--border-drag-x", `${offset}px`);
        border.style.setProperty("--border-track-translate", `${offset * direction}px`);
      }
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
    elapsedTime,
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
