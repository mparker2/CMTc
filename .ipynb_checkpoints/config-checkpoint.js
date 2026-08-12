/* Edit this file to change the puzzle. Game logic lives in app.js. */

const RESULTS_ENDPOINT = "https://script.google.com/macros/s/AKfycbw1e3tvBYCU8og3uQ8M9rRO6N-kP-BSyqI9aVNQU2d2YQXuAEYw8vd4CtxS2bFLySoh/exec";

const PUZZLE = {
  storageKey: "cmt-connections-game-v2",
  title: "CMT Connections",

  /*
   * All words and phrases shown to players live here. Text in braces is
   * replaced with the current game value, so keep the braces when editing.
   */
  text: {
    metaDescription: "A wedding puzzle at the Cambridge Museum of Technology.",
    headerEyebrow: "Cath & Matt's wedding puzzle",
    welcomeLocation: "Cambridge Museum of Technology",
    welcomeTitle: "Find the words.\nMake the connections.",
    welcomeInstructions: "Look for 16 hidden words around the museum. Add each one here, then sort them into four connected groups.",
    teamNameLabel: "Your team name",
    beginButton: "Begin",
    welcomeNote: "You can start solving after finding any four words.",
    playingAsLabel: "Playing as",
    defaultTeamHeading: "Your team",
    viewResultButton: "View result",
    scoreLabel: "Score",
    scoreAria: "Current score",
    scorePenalty: "Incorrect groups cost {penalty} {points}.",
    scoreValueAria: "{score} points",
    wordsFound: "Words found: {found} / {total}",
    selectionCount: "{selected} of {maximum} selected",
    boardAria: "Connections board",
    solvedGroupsAria: "Solved groups",
    unresolvedWordsAria: "Unresolved words",
    solvedGroupAria: "Solved group: {category}",
    tileSelectedSuffix: ", selected",
    wordEntryLabel: "Enter a word you found",
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
    restoreFailed: "Saved progress could not be restored. Starting a new game will replace it.",
    emptyWord: "Enter a word you found.",
    invalidWord: "Not a word in this puzzle…",
    duplicateWord: "{word} has already been added.",
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
    shareScore: "Score: {score} – {ranking}",
  },

  categories: [
    {
      title: "Areas of CMT",
      colour: "yellow",
      words: ["ASH", "BLACKSTONE", "PYE", "VALVE"],
    },
    {
      title: "Waterways where we have lived",
      colour: "green",
      words: ["BÄCHLE", "RHEIN", "LEITH", "SHEAF"],
    },
    {
      title: "Ben/Bheinn Munros we have bagged",
      colour: "blue",
      words: ["MORE", "BLA", "LOMOND", "GHLAS"],
    },
    {
      title: "English/Scottish/German beers",
      colour: "purple",
      words: ["PORTER", "ALT", "KÖLSCH", "HEAVY"],
    },
  ],

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
      { minScore: 75, label: "Very good" },
      { minScore: 50, label: "Nicely done" },
      { minScore: 0, label: "Made it in the end" },
    ],
  },

  resultsEndpoint: RESULTS_ENDPOINT,
};

globalThis.RESULTS_ENDPOINT = RESULTS_ENDPOINT;
globalThis.PUZZLE = PUZZLE;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PUZZLE, RESULTS_ENDPOINT };
}
