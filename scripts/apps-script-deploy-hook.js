// Apps Script — paste into the bound script editor of "SSL Site Content".
// Triggers a Vercel rebuild when any tab is edited. Debounced so an editor
// making a flurry of changes only triggers one rebuild.
//
// Setup:
//   1. Spreadsheet > Extensions > Apps Script.
//   2. Paste this file in. Save.
//   3. Run `setUp` once (it requests permissions and registers the trigger).
//   4. In Project Settings, add Script Property `DEPLOY_HOOK_URL` = the Vercel hook URL.

const DEBOUNCE_SECONDS = 30;

function setUp() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onEditDebounced')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  SpreadsheetApp.getUi()
    .createMenu('SSL site')
    .addItem('Rebuild now', 'rebuildNow')
    .addToUi();
}

function onEditDebounced() {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const last = Number(props.getProperty('lastEditAt') ?? '0');
  props.setProperty('lastEditAt', String(now));

  // Schedule a one-shot trigger DEBOUNCE_SECONDS from now, replacing any pending one.
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'firePending')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('firePending')
    .timeBased()
    .after(DEBOUNCE_SECONDS * 1000)
    .create();
}

function firePending() {
  rebuildNow();
}

function rebuildNow() {
  const url = PropertiesService.getScriptProperties().getProperty('DEPLOY_HOOK_URL');
  if (!url) {
    SpreadsheetApp.getActiveSpreadsheet().toast('DEPLOY_HOOK_URL not set');
    return;
  }
  UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  SpreadsheetApp.getActiveSpreadsheet().toast('Site rebuild triggered.');
}
