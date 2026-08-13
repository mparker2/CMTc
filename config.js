/* Edit this file to change the puzzle. Game logic lives in app.js. */

const RESULTS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw1e3tvBYCU8og3uQ8M9rRO6N-kP-BSyqI9aVNQU2d2YQXuAEYw8vd4CtxS2bFLySoh/exec";

// This is lightweight obfuscation for the static site, not encryption. The key
// necessarily ships to the browser so the game can decode the puzzle locally.
const PUZZLE_ENCRYPTION_KEY = "CMT-2026";
const PUZZLE_CATEGORIES_BLOB = "GDZ2WVtEXlNhd3ZuU11QRCopM0gSfUdFJjg5DV1WEmImLjwDElxdVSI5PUJcQxAaYS47QV1FQBR5by1IXlxdQWFhdlpdQlZFYXcPD3NjehRvbxZhc3N5ZRcCGmgQHBBmGgh2ARBmc3oVCHZwTxxJFDckIEFXEggUFCwgSEBHU08wbSNFV0JXFjQodEVTRlcWLyQiSFYSHhQgIjhCR0IQDGEqJkhXXhAaYTo7X1ZDEAwYbxbutnN6egZveA9geHd/DW94D351e2ILb3gPYXh3dwVvCVAeSxBCKjk4SBAKEHQmI3tvWlVbWC1tGVhcQl1FYzoxDVpRRFNjLzVKVVVWFG9vN0JeX0dEYXd2T15FVxRvbyNCQFRBFHkWdmB9YncUb28WYXMSHhQPAhlifHQQGmEKHGFzYxBrPmEvD0ZZRlomb24Pd15VWio+PAJhU11CNyQnRR13V0QuLDoNUFVXRDBveA9RX15ZNj92FxBAR0QzITEPHhJFWTEpJw8IaxBmDB8AaGASHhQCAQAPHhJ59dUBB256Eh4UCwgVe2sSb0se";

function decodePuzzleCategories(blob, key) {
  const binary = globalThis.atob(blob);
  const encrypted = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decoded = encrypted.map((byte, index) => byte ^ keyBytes[index % keyBytes.length]);
  return JSON.parse(new TextDecoder().decode(decoded));
}

const PUZZLE = {
  storageKey: "cmt-connections-game-v2",
  title: "CMT Connections",
  teamNameBlockedNames: ["Matt", "Matty", "Matthew", "Matt P.", "Matt P", "MattP", "MattP.", "Matty P.", "Matty P", "MattyP", "MattyP.", "Matthew P.", "Matthew P", "MatthewP.", "MatthewP"],

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

  categories: decodePuzzleCategories(PUZZLE_CATEGORIES_BLOB, PUZZLE_ENCRYPTION_KEY),

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
      { minScore: 100, label: "Perfect" },
      { minScore: 90, label: "Excellent" },
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
