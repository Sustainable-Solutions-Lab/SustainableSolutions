/**
 * Apps Script for the "SSL Site Content" spreadsheet — manual rebuild button.
 *
 * This file is REFERENCE ONLY. It does not run from the repo; it lives in the
 * spreadsheet's bound script editor. See the install steps at the bottom.
 *
 * Why this exists: the on-edit trigger is debounced, so it can fire while you
 * are still editing and deploy a half-finished sheet (this happened: two of
 * six Featured rows shipped missing). This button lets you say "I am done
 * now", which is a thing a timer cannot know.
 *
 * It also waits out Google's publish-to-web cache. The published CSVs the
 * build reads are a snapshot that lags the live sheet by a couple of minutes,
 * so firing a deploy the instant you finish editing can still bake in stale
 * data. PROPAGATION_WAIT_MS holds the deploy back to let that snapshot catch
 * up. That wait is the whole point of the button, so do not set it to 0.
 */

/** Vercel deploy hook. Stored in Script Properties, never hardcoded here. */
function getDeployHookUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('VERCEL_DEPLOY_HOOK_URL');
  if (!url) {
    throw new Error(
      'VERCEL_DEPLOY_HOOK_URL is not set. Project Settings → Script Properties → add it.'
    );
  }
  return url;
}

/** How long to wait for Google's published-CSV snapshot to catch up. */
var PROPAGATION_WAIT_MS = 90 * 1000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SSL Site')
    .addItem('Rebuild site now', 'rebuildSiteNow')
    .addItem('Rebuild immediately (skip wait)', 'rebuildSiteImmediately')
    .addToUi();
}

/** Menu entry: wait for the CSV snapshot to catch up, then deploy. */
function rebuildSiteNow() {
  var ui = SpreadsheetApp.getUi();
  var seconds = Math.round(PROPAGATION_WAIT_MS / 1000);
  var answer = ui.alert(
    'Rebuild site',
    'Waits ' + seconds + ' seconds for Google to republish the sheet, then triggers ' +
      'a Vercel deploy.\n\nKeep this dialog closed and leave the tab open until you ' +
      'see the confirmation.\n\nContinue?',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer !== ui.Button.OK) return;

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Waiting ' + seconds + 's for the published CSV to catch up…',
    'Rebuild site',
    seconds
  );
  Utilities.sleep(PROPAGATION_WAIT_MS);
  triggerDeploy_('manual');
}

/** Menu entry: deploy right now. Only for changes already known to have
 *  propagated (e.g. you edited a while ago and just forgot to publish). */
function rebuildSiteImmediately() {
  triggerDeploy_('manual-nowait');
}

function triggerDeploy_(reason) {
  var response;
  try {
    response = UrlFetchApp.fetch(getDeployHookUrl_(), {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ reason: reason }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    SpreadsheetApp.getUi().alert('Rebuild failed', String(err), SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Vercel is building. The site updates in about a minute.',
      'Rebuild triggered',
      10
    );
  } else {
    SpreadsheetApp.getUi().alert(
      'Rebuild failed',
      'Vercel returned HTTP ' + code + '.\n\n' + response.getContentText().slice(0, 500),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/*
 * ---------------------------------------------------------------------------
 * INSTALL
 * ---------------------------------------------------------------------------
 * 1. Open the "SSL Site Content" spreadsheet.
 * 2. Extensions → Apps Script. (If an onEdit deploy trigger already lives
 *    there, leave it alone and paste this alongside it. The only name that
 *    could collide is onOpen — if one exists, merge the addMenu calls rather
 *    than keeping two onOpen functions, because only one will run.)
 * 3. Paste this file's contents into the editor and Save.
 * 4. Project Settings (gear, left sidebar) → Script Properties → Add script
 *    property:
 *        Name:  VERCEL_DEPLOY_HOOK_URL
 *        Value: the deploy hook URL from
 *               Vercel → sustainablesolutions → Settings → Git → Deploy Hooks
 *               (create one named "sheet-rebuild" on branch main if none exists)
 *    Script Properties keep the hook out of the script body, so anyone with
 *    view access to the sheet cannot read it and trigger deploys.
 * 5. Reload the spreadsheet tab. An "SSL Site" menu appears next to Help.
 * 6. First run only: choose "Rebuild site now", and Google will ask you to
 *    authorize the script (it needs permission to call an external URL).
 *    Approve it once.
 *
 * USE
 * ---------------------------------------------------------------------------
 * Finish all your edits, then SSL Site → Rebuild site now. It waits ~90s for
 * Google to republish, fires the deploy, and toasts when Vercel accepts it.
 * The site is live roughly a minute after that.
 *
 * Apps Script caps a single execution at 6 minutes, so the 90s sleep is well
 * within budget. If you raise PROPAGATION_WAIT_MS, stay under ~5 minutes.
 */
