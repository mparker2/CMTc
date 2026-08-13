/*
 * Paste this into Extensions → Apps Script from the destination spreadsheet.
 * It is not part of the static website and should not be loaded by index.html.
 */

const RESULTS_SHEET_NAME = "Results";
const RESULTS_HEADERS = [
  "team_name",
  "score",
  "start_timestamp",
  "end_timestamp",
  "elapsed_time",
  "cheat_used",
  "category_order",
  "guess_history",
  "session_id",
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = JSON.parse((e.postData && e.postData.contents) || "{}");
    requireField(data, "sessionId");
    requireField(data, "teamName");
    requireField(data, "startTimestamp");
    requireField(data, "endTimestamp");
    requireField(data, "elapsedTime");

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(RESULTS_SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(RESULTS_SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(RESULTS_HEADERS);
      sheet.setFrozenRows(1);
    } else if (String(sheet.getRange(1, 5).getValue()) !== "elapsed_time") {
      // Migrate the previous seven-column layout before recording new results.
      sheet.insertColumnAfter(4);
      sheet.getRange(1, 5).setValue("elapsed_time");
    }
    if (String(sheet.getRange(1, 6).getValue()) !== "cheat_used") {
      sheet.insertColumnAfter(5);
      sheet.getRange(1, 6).setValue("cheat_used");
    }

    if (sessionAlreadyRecorded(sheet, String(data.sessionId))) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    sheet.appendRow([
      safeText(data.teamName),
      Number(data.score) || 0,
      safeText(data.startTimestamp),
      safeText(data.endTimestamp),
      safeText(data.elapsedTime),
      data.cheatUsed ? "true" : "false",
      safeText(data.categoryOrderEmoji),
      safeText(data.guessHistoryEmoji),
      safeText(data.sessionId),
    ]);

    return jsonResponse({ ok: true, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

function sessionAlreadyRecorded(sheet, sessionId) {
  const firstDataRow = 2;
  const sessionColumn = 9;
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount <= 0) return false;

  return sheet
    .getRange(firstDataRow, sessionColumn, rowCount, 1)
    .createTextFinder(sessionId)
    .matchEntireCell(true)
    .findNext() !== null;
}

function requireField(data, key) {
  if (data[key] === undefined || data[key] === null || String(data[key]).trim() === "") {
    throw new Error("Missing required field: " + key);
  }
}

function safeText(value) {
  const text = String(value === undefined || value === null ? "" : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
