/* Edit this file to change the puzzle. Game logic lives in app.js. */

const RESULTS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw1e3tvBYCU8og3uQ8M9rRO6N-kP-BSyqI9aVNQU2d2YQXuAEYw8vd4CtxS2bFLySoh/exec";

// This is lightweight obfuscation for the static site, not encryption. The key
// necessarily ships to the browser so the game can decode the puzzle locally.
const PUZZLE_ENCRYPTION_KEY = "CMT-2026";
const PUZZLE_CATEGORIES_BLOB = "GDZ2WVtEXlNhd3ZuU11QRCopM0gSfUdFJjg5DV1WEmImLjwDElxdVSI5PUJcQxAaYS47QV1FQBR5by1IXlxdQWFhdlpdQlZFYXcPD3NjehRvbxZhc3N5ZRcCGmgQHBBmGgh2ARBmc3oVCHZwTxxJFDckIEFXEggUFCwgSEBHU08wbSNFV0JXFjQodEVTRlcWLyQiSFYSHhQgIjhCR0IQDGEqJkhXXhAaYTo7X1ZDEAwYbxbutnN6egZveA9geHd/DW94D351e2ILb3gPYXh3dwVvCVAeSxBCKjk4SBAKEHQmI3tvWlVbWC1tGVhcQl1FYzoxDVpRRFNjLzVKVVVWFG9vN0JeX0dEYXd2T15FVxRvbyNCQFRBFHkWdmB9YncUb28WYXMSHhQPAhlifHQQGmEKHGFzYxBrPmEvD0ZZRlomb24Pd15VWio+PAJhU11CNyQnRR13V0QuLDoNUFVXRDBveA9RX15ZNj92FxBAR0QzITEPHhJFWTEpJw8IaxBmDB8AaGASHhQCAQAPHhJ59dUBB256Eh4UCwgVe2sSb0se";
const PUZZLE_PHOTO_CLUES_BLOB = "OG8fYnd8YXULb24PWllWUiYjC11aX0ZZcmM+XVUSHhQOAgZoEAoQXiopMEhcb0JeLDk7HxxaQlFhYXZvfnEQDGElPUlWVVxpMyU7WV0DHFwzKnYBEGJ6cwoDdhcQWFtSJyg6ckJYXUIseXpHQlcQGmEPFWhxeH5zYXd2RVtUVlMtEiRFXURdA20nJEoQHBBlCwgVaxAKEF4qKTBIXG9CXiw5OxscWkJRYWF2fX1iZnMRb24PWllWUiYjC11aX0ZZdGM+XVUSHhQBARVueWNmeQ0IdhcQWFtSJyg6ckJYXUIsdXpHQlcQGmEFEWxkaRAMYSU9SVZVXGkzJTtZXQkcXDMqdgEQd3p6Ah52FxBYW1InKDpyQlhdQix8ZANYQFdRYWF2YXd5Zn5hd3ZFW1RWUy0SJEVdRF0HcmM+XVdXEBphDBh5EAoQXiopMEhcb0JeLDk7HAAeWEYkb3gPYml3FHlvPERWVFdYHD08QkZfAwVtJyRKEBwQegwAG2N2EggUKyQwSVdebUYrIiBCAwQcXDMqdgEQZnN6FQh2FxBYW1InKDpyQlhdQix8YQNYQFUUb28VfnoSCBQrJDBJV15tRisiIEIDBhxcMyp2UA==";
const PUZZLE_BONUS_ROUND_BLOB = "OG83QkBCV1U3HiFfXFFfUzBvbnYQYEBZIDk7XxAcEHAvKDlEXFcQGmEFO0FeUVxSYWF2ZV1UVUUsI3YBEGBTRCgoJg9vHBBfLS47X0BVUUIQOCZDU11XRWF3Dw92VVxCYWF2flpRRRRvbxNCXVRWT2FhdmlTRltFYWF2eltcXl8wb3gPf1VXXiIjdgEQdVZTOm94D3ZRVlk2Pz1MXBIeFAcoOExcVUsUb28YSEFSW0QmIXYBEHRdWCRveA9hUV9BIiEwDx4SdEQmODBEVV1TWC1veA9hU1pYJig2SEBXV0RhYXZ5WlFRXSY/LQ8eEn9XKCwmDx4ScFcqITFUEBwQdSw/N0JAUVwUb28HWfGWWkRhECk=";

function decodePuzzleBlob(blob, key) {
  const binary = globalThis.atob(blob);
  const encrypted = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decoded = encrypted.map((byte, index) => byte ^ keyBytes[index % keyBytes.length]);
  return JSON.parse(new TextDecoder().decode(decoded));
}

const PUZZLE = {
  storageKey: "cmt-connections-game-v2",
  title: "CMT Connections",
  revealWordsAfter: "2026-09-12T17:30:00+01:00",
  teamNameBlockedNames: ["Matt", "Matty", "Matthew", "Matt P.", "Matt P", "MattP", "MattP.", "Matty P.", "Matty P", "MattyP", "MattyP.", "Matthew P.", "Matthew P", "MatthewP.", "MatthewP"],
  photoClues: decodePuzzleBlob(PUZZLE_PHOTO_CLUES_BLOB, PUZZLE_ENCRYPTION_KEY),
  bonusRound: {
    ...decodePuzzleBlob(PUZZLE_BONUS_ROUND_BLOB, PUZZLE_ENCRYPTION_KEY),
    points: 50,
  },

  /*
   * All words and phrases shown to players live here. Text in braces is
   * replaced with the current game value, so keep the braces when editing.
   */
  text: {
    metaDescription: "A wedding puzzle at the Cambridge Museum of Technology.",
    headerEyebrow: "Cath & Matt's wedding puzzle",
    welcomeLocation: "Cambridge Museum of Technology",
    welcomeTitle: "Find the words.\nMake the connections.",
    welcomeInstructionsTitle: "How to play",
    welcomeInstructions: [
      "Look for 16 hidden words on wooden squares around the museum.",
      "Enter each word here to build the connections wall (please don't move the physical squares).",
      "Sort the wall into four connected groups.",
      "You can start solving once you have found any four words or more.",
      "You lose points for incorrect words or groups, so guess wisely! Highest scoring team wins!",
      "Enter your team name below to get started:",
    ],
    teamNameLabel: "Your team name",
    beginButton: "Begin",
    playingAsLabel: "Playing as",
    defaultTeamHeading: "Your team",
    viewResultButton: "View result",
    scoreLabel: "Score",
    scoreAria: "Current score",
    scorePenalty: "Incorrect words cost {wordPenalty} {wordPoints}, incorrect groups cost {penalty} {points}.",
    scoreValueAria: "{score} points",
    wordsFound: "Words found: {found} / {total}",
    selectionCount: "{selected} of {maximum} selected",
    boardAria: "Connections board",
    solvedGroupsAria: "Solved groups",
    unresolvedWordsAria: "Unresolved words",
    solvedGroupAria: "Solved group: {category}",
    tileSelectedSuffix: ", selected",
    wordEntryLabel: "Enter a word you found",
    allWordsFoundLabel: "All words found - time to connect!",
    addButton: "Add",
    puzzleControlsAria: "Puzzle controls",
    submitGroupButton: "Submit group",
    deselectAllButton: "Deselect all",
    shuffleButton: "Shuffle",
    resetButton: "Reset game",
    openMapButton: "Open map",
    mapTitle: "CMT map unlocked",
    closeMapAria: "Close map",
    revealWordsTitle: "Would you like a hand?",
    revealWordsMessage: "The words can now be revealed if you would like to keep playing.",
    revealWordsButton: "Reveal words",
    keepSolvingButton: "Keep searching",
    closeRevealWordsAria: "Close word reveal",
    completionKicker: "All connections found",
    completionTitle: "Congratulations!",
    pointsLabel: "points",
    solveOrderHeading: "Solve order",
    solveOrderAria: "Category solve order: {colours}",
    guessesHeading: "Your guesses",
    guessHistoryAria: "Guess history",
    guessAria: "Guess {number}: {colours}",
    closeResultsAria: "Close results",
    copyResultButton: "Copy result",
    personalizedWelcomeDefault: "Welcome {teamname}! Enjoy the puzzle!",
    bonusRoundTitle: "Bonus Round Unlocked!",
    bonusRoundInstructions: "There are a lot of Matts at this wedding...\nCan you find them all?",
    bonusRoundSubmit: "Submit answers",
    bonusRoundLivesAria: "Lives remaining: {count}",
    bonusRoundLastLifeHint: "hint: there are five",
    bonusRoundSuccess: "Correct! {points} points added.",
    bonusRoundSuccessNoPoints: "Correct!",
    bonusRoundFailure: "No extra points for you...",

    teamNameRequired: "Enter a team name to begin.",
    teamNameTooShort: "Team names must be at least 3 characters.",
    teamNameTooVague: "There are a lot of Matts at this wedding, can you be more specific?",
    restoreFailed: "Saved progress could not be restored. Starting a new game will replace it.",
    emptyWord: "Enter a word you found.",
    invalidWord: "Not a word in this puzzle…",
    wordAlreadyFound: "{word} already found",
    wordCorrected: "{input} corrected to {word}.",
    invalidWordPenalty: "Not a word in this puzzle — {penalty} point deducted.",
    duplicateWord: "{word} has already been added.",
    alreadyGuessed: "Already guessed!",
    gridFull: "All available spaces are already filled.",
    wordCouldNotBeAdded: "That word could not be added.",
    wordAdded: "{word} added.",
    findMoreWords: "Find {count} more to start making groups.",
    maxSelection: "Choose no more than four words.",
    selectionCleared: "Selection cleared.",
    wordsShuffled: "Unsolved words shuffled.",
    invalidGuess: "That group could not be submitted. Please choose four different unresolved words.",
    correctGroup: "Correct: {category}.",
    oneAway: "One away…",
    wrongGroup: "Not a group — {penalty} {points} deducted.",
    pointSingular: "point",
    pointPlural: "points",
    copySuccess: "Result copied.",
    copyFailure: "Could not copy automatically. Press and hold the result to copy it.",
    resetConfirmation: "Reset this game? Your team name, score and all progress will be removed from this device.",
    resultSent: "Result sent.",
    resultSavedForRetry: "Result saved on this device — it will retry when online.",
    saveUnavailable: "Progress cannot be saved in this browser.",
    fatalConfiguration: "The puzzle configuration needs attention: {errors}",

    shareTeam: "Team: {teamName}",
    shareScore: "Score: {score}",
  },

  categories: decodePuzzleBlob(PUZZLE_CATEGORIES_BLOB, PUZZLE_ENCRYPTION_KEY),

  palette: {
    yellow: { background: "#F1E1A6", foreground: "#3D351A", emoji: "🟨", label: "yellow" },
    green: { background: "#C6D8B9", foreground: "#1F3A2D", emoji: "🟩", label: "green" },
    blue: { background: "#B8D3C8", foreground: "#18382F", emoji: "🟦", label: "blue" },
    purple: { background: "#d8badb", foreground: "#311436", emoji: "🟪", label: "purple" },
  },

  score: {
    start: 100,
    incorrectPenalty: 5,
    rankings: [
      { minScore: 150, label: "Show off!" },
      { minScore: 135, label: "Exceptional" },
      { minScore: 101, label: "You needed those bonus points..." },
      { minScore: 100, label: "Perfect!" },
      { minScore: 85, label: "Excellent" },
      { minScore: 75, label: "Not bad" },
      { minScore: 50, label: "Made it in the end" },
      { minScore: 0, label: "Better luck... next time??" },
    ],
  },

  resultsEndpoint: RESULTS_ENDPOINT,
};

globalThis.RESULTS_ENDPOINT = RESULTS_ENDPOINT;
globalThis.PUZZLE = PUZZLE;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PUZZLE, RESULTS_ENDPOINT };
}
