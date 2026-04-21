/* =============================================================
 * DCP Downloader + Auto-Verifier
 * ?函? GAS 撠?嚗?靘陷?餃 Portal嚗? * Execute as: Me (timtim@fullshineff.com.tw)
 * Access: Anyone
 * ============================================================= */

const ADMIN_EMAIL      = 'timtim@fullshineff.com.tw';
const DCP_PORTAL_EMAIL = 'dcp-portal@fullshineff.com.tw';
const DCP_PORTAL_NAME  = 'Full Shine DCP Portal';
const LOGIN_PORTAL_VALIDATE_URL = 'REPLACE_WITH_LOGIN_PORTAL_EXEC_URL';
const API_SESSION_TTL_SECONDS = 3600;

/* --- 1. ??? --- */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
  if (action) {
    return handleApiGet_(e, action);
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Full Shine DCP Downloader')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    if (action === 'sendCheckReportEmail') {
      const session = getRequiredApiSession_(e && e.parameter);
      const payloadText = (e && e.parameter && e.parameter.payload) ? String(e.parameter.payload) : '{}';
      const payload = JSON.parse(payloadText);
      const data = sendCheckReportEmail(payload, session.email);
      return createApiResponse_({ ok: true, data: data }, null);
    }
    return createApiResponse_({ ok: false, error: 'Unsupported action: ' + action }, null);
  } catch (err) {
    return createApiResponse_({ ok: false, error: err.message || String(err) }, null);
  }
}

function handleApiGet_(e, action) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    let data;
    switch (action) {
      case 'exchangePortalToken':
        data = exchangePortalToken_((params && params.token) || '');
        break;
      case 'getOAuthToken':
        getRequiredApiSession_(params);
        data = getOAuthToken();
        break;
      case 'getDriveFolderContents':
        getRequiredApiSession_(params);
        data = getDriveFolderContents((params && params.folderUrl) || '');
        break;
      case 'ping':
        data = { ok: true, now: new Date().toISOString() };
        break;
      default:
        throw new Error('Unsupported action: ' + action);
    }
    return createApiResponse_({ ok: true, data: data }, params && params.callback);
  } catch (err) {
    return createApiResponse_({ ok: false, error: err.message || String(err) }, e && e.parameter && e.parameter.callback);
  }
}

function createApiResponse_(payload, callback) {
  if (callback) {
    const safeCallback = String(callback);
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$\.]*$/.test(safeCallback)) {
      return ContentService.createTextOutput('Invalid callback')
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(
      safeCallback + '(' + JSON.stringify(payload) + ');'
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function exchangePortalToken_(portalToken) {
  const token = String(portalToken || '').trim();
  if (!token) throw new Error('Missing portal token.');
  const portalResult = validatePortalToken_(token);
  if (!portalResult || portalResult.valid !== true) {
    throw new Error((portalResult && portalResult.reason) || 'Portal token invalid.');
  }
  const email = String(portalResult.email || '').trim();
  if (!isValidEmail_(email)) {
    throw new Error('Portal returned invalid user email.');
  }
  const apiSession = createApiSession_(email);
  return { apiSession: apiSession, email: email, expiresInSec: API_SESSION_TTL_SECONDS };
}

function validatePortalToken_(portalToken) {
  if (!LOGIN_PORTAL_VALIDATE_URL || LOGIN_PORTAL_VALIDATE_URL.indexOf('REPLACE_WITH_LOGIN_PORTAL_EXEC_URL') !== -1) {
    throw new Error('LOGIN_PORTAL_VALIDATE_URL is not configured.');
  }
  const resp = UrlFetchApp.fetch(LOGIN_PORTAL_VALIDATE_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ action: 'validateSession', token: portalToken }),
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Portal validation failed with HTTP ' + code);
  }
  const text = resp.getContentText();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('Portal returned non-JSON response.');
  }
  return data;
}

function createApiSession_(email) {
  const sessionToken = Utilities.getUuid() + '_' + Utilities.getUuid().replace(/-/g, '');
  const sessionData = { email: email, createdAt: Date.now() };
  CacheService.getScriptCache().put('api_session_' + sessionToken, JSON.stringify(sessionData), API_SESSION_TTL_SECONDS);
  return sessionToken;
}

function getRequiredApiSession_(params) {
  const p = params || {};
  const apiSession = String((p.apiSession || '')).trim();
  if (!apiSession) throw new Error('Missing apiSession.');
  const raw = CacheService.getScriptCache().get('api_session_' + apiSession);
  if (!raw) throw new Error('apiSession expired or invalid.');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error('apiSession parse failed.');
  }
  if (!data || !isValidEmail_(data.email)) {
    throw new Error('apiSession email invalid.');
  }
  return data;
}

function sendCheckReportEmail(payload, sessionEmail) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid report payload.');
  }

  const folderName = String(payload.folderName || 'Unknown Folder');
  const checkedAtRaw = String(payload.checkedAt || '');
  const checkedAt = checkedAtRaw ?
    Utilities.formatDate(new Date(checkedAtRaw), 'GMT+8', 'yyyy-MM-dd HH:mm:ss') :
    Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const reportEmailInput = String(payload.reportEmail || '').trim();
  const safeSessionEmail = String(sessionEmail || '').trim();
  const hasSessionEmail = isValidEmail_(safeSessionEmail);
  const effectiveUserEmail = hasSessionEmail ? safeSessionEmail : reportEmailInput;
  if (!isValidEmail_(effectiveUserEmail)) {
    throw new Error('User email is invalid.');
  }
  const reportEmail = isValidEmail_(reportEmailInput) ? reportEmailInput : effectiveUserEmail;

  let overallStatus = String(payload.overallStatus || '').trim();
  if (!overallStatus) {
    overallStatus = 'OK';
    if (rows.some(r => String(r.status) === 'Bad')) overallStatus = 'Error';
    else if (rows.some(r => String(r.status) === 'Missing')) overallStatus = 'Warning';
  }

  const recipients = [ADMIN_EMAIL];
  // Prevent abuse: user can only receive report to own signed-in email.
  if (reportEmail === effectiveUserEmail && recipients.indexOf(reportEmail) === -1) {
    recipients.push(reportEmail);
  }

  const subject = 'DCP Check Report: ' + overallStatus + ' - ' + folderName;
  const htmlBody = buildReportEmailHtml_({
    reportEmail: reportEmail || effectiveUserEmail || 'N/A',
    folderName: folderName,
    checkedAt: checkedAt,
    overallStatus: overallStatus,
    rows: rows
  });

  GmailApp.sendEmail(recipients.join(','), subject, '', {
    htmlBody: htmlBody,
    from: DCP_PORTAL_EMAIL,
    name: DCP_PORTAL_NAME,
    noReply: true
  });

  Logger.log('[sendCheckReportEmail] sent to: ' + recipients.join(',') + ' folder=' + folderName);
  return { sent: true, recipients: recipients };
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildReportEmailHtml_(ctx) {
  let html = ''
    + '<style>'
    + 'body{font-family:Arial,sans-serif;line-height:1.6;}'
    + 'table{border-collapse:collapse;width:100%;}'
    + 'th,td{border:1px solid #ddd;padding:8px;text-align:left;}'
    + 'th{background-color:#f2f2f2;}'
    + '.ok{color:green;font-weight:bold;}'
    + '.err{color:red;font-weight:bold;}'
    + '.warn{color:orange;font-weight:bold;}'
    + '</style>'
    + '<body>'
    + '<h1>DCP Check Log</h1>'
    + '<p>A DCP check was completed. Here are the details:</p>'
    + '<h2>Summary</h2>'
    + '<ul>'
    + '<li><b>User Email:</b> ' + escapeHtml_(ctx.reportEmail) + '</li>'
    + '<li><b>Folder Name:</b> ' + escapeHtml_(ctx.folderName) + '</li>'
    + '<li><b>Check Time:</b> ' + escapeHtml_(ctx.checkedAt) + ' (Taiwan Time)</li>'
    + '<li><b>Overall Status:</b> <span class="' + (ctx.overallStatus === 'OK' ? 'ok' : (ctx.overallStatus === 'Warning' ? 'warn' : 'err')) + '">' + escapeHtml_(ctx.overallStatus) + '</span></li>'
    + '</ul>'
    + '<h2>Asset Details</h2>'
    + '<table><thead><tr><th>No.</th><th>Asset Name</th><th>Status</th><th>Message</th></tr></thead><tbody>';

  if (!ctx.rows || ctx.rows.length === 0) {
    html += '<tr><td>1</td><td>N/A</td><td>Warning</td><td>No row details received.</td></tr>';
  } else {
    for (let i = 0; i < ctx.rows.length; i++) {
      const row = ctx.rows[i] || {};
      const status = String(row.status || 'Unknown');
      const cls = status === 'Good' ? 'ok' : (status === 'Missing' ? 'warn' : 'err');
      html += '<tr>'
           + '<td>' + (i + 1) + '</td>'
           + '<td>' + escapeHtml_(String(row.assetName || 'Unknown Asset')) + '</td>'
           + '<td class="' + cls + '">' + escapeHtml_(status) + '</td>'
           + '<td>' + escapeHtml_(String(row.message || '')) + '</td>'
           + '</tr>';
    }
  }

  html += '</tbody></table></body>';
  return html;
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* --- 2. OAuth Token嚗??垢?湔?澆 Drive API ?剁?--- */
function getOAuthToken() {
  // 甇?token 隞?timtim 撣唾?頨思遢?瑁?嚗摮? timtim Drive 銝剖歇?梁???冗
  return ScriptApp.getOAuthToken();
}

/* --- 3. ?? Drive 鞈?憭橘?BFS嚗??timeout ?脰風嚗?-- */
function getDriveFolderContents(folderUrl) {
  const folderId = _extractFolderId(folderUrl);
  if (!folderId) {
    throw new Error('Invalid Google Drive folder URL or folder ID.');
  }

  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(folderId);
  } catch (e) {
    throw new Error('Failed to open Drive folder. Please check sharing permission. ' + e.message);
  }

  const files = [];
  let totalSize = 0;
  const START_TIME = Date.now();
  const TIMEOUT_MS = 300000; // 5 ??嚗? 1 ??蝺抵?蝯?GAS 6 ???
  let truncated = false;

  // BFS folder traversal to avoid recursion depth issues.
  // path example: "sub/PKL_xxx.xml" (relative path under root folder)
  const queue = [{ folder: rootFolder, prefix: "" }];
  while (queue.length > 0 && !truncated) {
    if (Date.now() - START_TIME > TIMEOUT_MS) { truncated = true; break; }

    const { folder, prefix } = queue.shift();

    const fi = folder.getFiles();
    while (fi.hasNext()) {
      if (Date.now() - START_TIME > TIMEOUT_MS) { truncated = true; break; }
      const f = fi.next();
      const sz = f.getSize();
      files.push({
        id:   f.getId(),
        name: f.getName(),
        size: sz,
        path: prefix ? prefix + '/' + f.getName() : f.getName()
      });
      totalSize += sz;
    }

    if (!truncated) {
      const di = folder.getFolders();
      while (di.hasNext()) {
        const d = di.next();
        queue.push({
          folder: d,
          prefix: prefix ? prefix + '/' + d.getName() : d.getName()
        });
      }
    }
  }

  Logger.log('[getDriveFolderContents] folder=' + rootFolder.getName() +
             ' files=' + files.length + ' totalSize=' + totalSize +
             ' truncated=' + truncated);

  return {
    folderName: rootFolder.getName(),
    folderId:   folderId,
    fileCount:  files.length,
    totalSize:  totalSize,
    truncated:  truncated,
    files:      files  // [{ id, name, size, path }]
  };
}

function _extractFolderId(url) {
  if (!url) return null;
  const u = url.trim();
  // Pattern 1: /drive/folders/<ID>
  const m1 = u.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // Pattern 2: ?id=<ID> or &id=<ID>
  const m2 = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // Pattern 3: direct folder ID input
  const m3 = u.match(/^([a-zA-Z0-9_-]{25,})$/);
  if (m3) return m3[1];
  return null;
}

/* --- 4. ????Session嚗圾??PKL + ASSETMAP嚗?憛翰??manifest嚗?-- */
function initializeSession(assetMapText, pklText, folderName, clientName) {
  const pklInfo      = new Map();
  const assetMapInfo = new Map();
  const manifest     = {};

  // 閫?? PKL.xml
  try {
    const pklDoc   = XmlService.parse(pklText);
    const root     = pklDoc.getRootElement();
    const assetList = findElements(root, 'Asset');
    for (const asset of assetList) {
      const uuid     = getElementText(asset, 'Id')?.replace('urn:uuid:', '');
      const name     = getElementText(asset, 'OriginalFileName') ||
                       getElementText(asset, 'AnnotationText') || 'Unknown Asset';
      const hash     = getElementText(asset, 'Hash');
      const sizeText = getElementText(asset, 'Size');
      const size     = sizeText ? parseInt(sizeText, 10) : NaN;
      if (uuid && hash && !isNaN(size)) {
        pklInfo.set(uuid, { hash, size, name });
      }
    }
  } catch (e) {
    Logger.log('PKL Parse Error: ' + e.message);
    throw new Error('Failed to parse PKL.xml on server. ' + e.message);
  }

  // 閫?? ASSETMAP.xml
  try {
    const amDoc    = XmlService.parse(assetMapText);
    const root     = amDoc.getRootElement();
    const assetList = findElements(root, 'Asset');
    for (const asset of assetList) {
      const uuid      = getElementText(asset, 'Id')?.replace('urn:uuid:', '');
      const chunkList = findElements(asset, 'ChunkList');
      if (chunkList.length > 0) {
        const chunks = findElements(chunkList[0], 'Chunk');
        if (chunks.length > 0) {
          const path = getElementText(chunks[0], 'Path');
          if (uuid && path) { assetMapInfo.set(uuid, path); }
        }
      }
    }
  } catch (e) {
    Logger.log('ASSETMAP Parse Error: ' + e.message);
    throw new Error('Failed to parse ASSETMAP.xml on server. ' + e.message);
  }

  // ?蔥??manifest
  const assetsForUI = [];
  for (const [uuid, pklData] of pklInfo.entries()) {
    const path = assetMapInfo.get(uuid);
    let finalName = pklData.name;
    if ((finalName === 'Unknown Asset' || !finalName) && path) {
      finalName = path.replace(/\\/g, '/').split('/').pop();
    }
    manifest[uuid] = { hash: pklData.hash, size: pklData.size, name: finalName, path: path };
    assetsForUI.push({ uuid, name: finalName, path });
  }

  // ???脣? manifest嚗acheService ?桐? value 銝? 100KB嚗?  const cache        = CacheService.getUserCache();
  const CHUNK_SIZE   = 90000; // 90KB嚗????券?頝?  const manifestJson = JSON.stringify(manifest);
  const totalChunks  = Math.ceil(manifestJson.length / CHUNK_SIZE);

  cache.put('dcpManifest_chunks', totalChunks.toString(), 21600);
  for (let i = 0; i < totalChunks; i++) {
    cache.put('dcpManifest_' + i,
              manifestJson.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
              21600);
  }

  cache.put('log_folderName', folderName  || 'N/A', 21600);
  cache.put('client_name',    clientName  || 'Anonymous', 21600);

  Logger.log('[initializeSession] Manifest stored in ' + totalChunks +
             ' chunk(s), total ' + manifestJson.length + ' bytes.');
  return assetsForUI;
}

/* --- 5. ?寞活撽?嚗?撠?hash/size嚗????email嚗?-- */
function verifyBatch(batchFromFrontend) {
  const cache = CacheService.getUserCache();

  // ??霈??manifest
  const totalChunks = parseInt(cache.get('dcpManifest_chunks') || '0');
  if (totalChunks === 0) {
    throw new Error('Server session expired. Please re-run check.');
  }
  let manifestString = '';
  for (let i = 0; i < totalChunks; i++) {
    const chunk = cache.get('dcpManifest_' + i);
    if (chunk === null) {
      throw new Error('Server session expired (chunk ' + i + ' missing). Please re-run check.');
    }
    manifestString += chunk;
  }

  const manifest   = JSON.parse(manifestString);
  const folderName = cache.get('log_folderName') || 'N/A';
  const clientName = cache.get('client_name')    || 'Anonymous';
  const results    = [];

  for (const asset of batchFromFrontend) {
    const uuid     = asset.uuid;
    const expected = manifest[uuid];
    if (!expected) {
      results.push({ uuid, status: 'Bad', message: 'Asset not found in server manifest.' });
      continue;
    }
    switch (asset.localStatus) {
      case 'HASH_ERROR':
        results.push({ uuid, status: 'Bad', message: 'Hash calculation failed: ' + asset.message });
        break;
      case 'FILE_MISSING_LOCALLY':
        results.push({ uuid, status: 'Missing', message: 'File not found: ' + (expected.path || 'path not defined') });
        break;
      case 'NO_PATH_IN_ASSETMAP':
        results.push({ uuid, status: 'Missing', message: 'Missing from ASSETMAP' });
        break;
      case 'FILE_FOUND':
        if (asset.size !== expected.size) {
          results.push({ uuid, status: 'Bad',
                         message: 'Size Mismatch (Expected: ' + expected.size + ', Got: ' + asset.size + ')' });
        } else if (asset.hash !== expected.hash) {
          results.push({ uuid, status: 'Bad', message: 'Hash Mismatch' });
        } else {
          results.push({ uuid, status: 'Good', message: 'GOOD' });
        }
        break;
      default:
        results.push({ uuid, status: 'Bad', message: 'Unknown local status: ' + asset.localStatus });
    }
  }

  try {
    sendAdminNotification(clientName, folderName, results, manifest);
  } catch (e) {
    Logger.log('CRITICAL: Admin email failed. Error: ' + e.message);
  }

  return results;
}

/* --- 6. 撖恣?? Email --- */
function sendAdminNotification(clientName, folderName, results, manifest) {
  const CHECK_TIME = Utilities.formatDate(new Date(), 'GMT+8', 'yyyy-MM-dd HH:mm:ss');

  let overallStatus = 'OK';
  if (results.some(r => r.status === 'Bad'))     { overallStatus = 'Error'; }
  else if (results.some(r => r.status === 'Missing')) { overallStatus = 'Warning'; }

  const subject = 'DCP Download+Check Report: ' + overallStatus + ' - ' + folderName;

  let htmlBody = `
    <style>
      body  { font-family: Arial, sans-serif; line-height: 1.6; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
      .ok   { color: green;  font-weight: bold; }
      .err  { color: red;    font-weight: bold; }
      .warn { color: orange; font-weight: bold; }
    </style>
    <body>
      <h1>DCP Download + Verification Report</h1>
      <h2>Summary</h2>
      <ul>
        <li><b>Client:</b> ${clientName}</li>
        <li><b>DCP Folder:</b> ${folderName}</li>
        <li><b>Check Time:</b> ${CHECK_TIME} (Taiwan Time)</li>
        <li><b>Overall Status:</b> <span class="${overallStatus === 'OK' ? 'ok' : overallStatus === 'Warning' ? 'warn' : 'err'}">${overallStatus}</span></li>
      </ul>
      <h2>Asset Details</h2>
      <table>
        <thead><tr><th>No.</th><th>Asset Name</th><th>Status</th><th>Message</th></tr></thead>
        <tbody>`;

  let idx = 1;
  for (const res of results) {
    const assetName   = manifest[res.uuid] ? manifest[res.uuid].name : 'UUID: ' + res.uuid;
    const statusClass = res.status === 'Good' ? 'ok' : res.status === 'Bad' ? 'err' : 'warn';
    htmlBody += `<tr><td>${idx}</td><td>${assetName}</td>
                     <td class="${statusClass}">${res.status}</td>
                     <td>${res.message}</td></tr>`;
    idx++;
  }

  htmlBody += '</tbody></table></body>';

  GmailApp.sendEmail(ADMIN_EMAIL, subject, '', {
    htmlBody: htmlBody,
    from:     DCP_PORTAL_EMAIL,
    name:     DCP_PORTAL_NAME,
    noReply:  true
  });

  Logger.log('Admin notification sent for client: ' + clientName + ', folder: ' + folderName);
}

/* --- 7. XML 頛?賢?嚗? FSDcheck ?詨?嚗?-- */
function findElements(element, localName) {
  const results = [];
  function recurse(el) {
    if (el.getName() === localName) results.push(el);
    for (const child of el.getChildren()) recurse(child);
  }
  for (const child of element.getChildren()) recurse(child);
  return results;
}

function getElementText(element, localName) {
  for (const child of element.getChildren()) {
    if (child.getName() === localName) return child.getText();
  }
  return null;
}
