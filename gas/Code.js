/* ═══════════════════════════════════════════════
   비테라 시그니처 — 관심고객 등록 Apps Script
   웹 폼 → Google Sheets 기록 (+ 선택: Google Chat 알림)
   ═══════════════════════════════════════════════ */

var CONFIG = {
  CHAT_WEBHOOK_URL: PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK_URL') || '',
  SHEET_NAME_WEB: '관심고객'
};
var COLS = 12;

var DIR_LABEL = { south: '남향 (리버뷰)', north: '북향 (시티·마운틴뷰)', any: '상관없음' };
var TIME_LABEL = { '10-12': '오전 10~12시', '12-14': '낮 12~14시', '14-16': '오후 14~16시', '16-18': '늦은 오후 16~18시', other: '기타' };

function doGet(e) {
  var out = { result: 'ok', service: 'viterra-leads' };
  try {
    if (e && e.parameter && e.parameter.stats === '1') {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME_WEB);
      var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
      out.leads = n;
    }
  } catch (err) { out.error = err.toString(); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    /* ── 1. 요청 가드 (Sheets 접근 전) ── */
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 6000) return json({ result: 'error', message: 'bad request' });
    var data;
    try { data = JSON.parse(e.postData.contents); } catch (pe) { return json({ result: 'error', message: 'bad request' }); }
    if (!data || typeof data !== 'object') return json({ result: 'error', message: 'bad request' });
    if (data.website) return json({ result: 'success' });                       // 허니팟: 봇에게는 성공처럼
    var ft = Number(data.form_ts || 0), ct = Number(data.client_ts || 0);       // 클라이언트 타이밍(보조 신호)
    if (ft && ct && (ct - ft) < 3000) return json({ result: 'error', message: 'too fast' });

    /* ── 2. 입력 검증 ── */
    var name = String(data.name || '').trim().replace(/<[^>]*>/g, '');
    var phone = String(data.phone || '').trim().replace(/[^0-9\-]/g, '');
    if (!name || name.length < 2 || name.length > 20) return json({ result: 'error', message: 'invalid name' });
    if (!/^01[016789]\d{7,8}$/.test(phone.replace(/-/g, ''))) return json({ result: 'error', message: 'invalid phone' });
    var message = String(data.message || '').trim().substring(0, 500).replace(/<[^>]*>/g, '');
    var size = Object.keys(DIR_LABEL).indexOf(String(data.size || '')) === -1 ? '' : String(data.size);
    var vtimeKey = Object.keys(TIME_LABEL).indexOf(String(data.visit_time || '')) === -1 ? '' : String(data.visit_time);
    var vdate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.visit_date || '')) ? String(data.visit_date) : '';
    var clean = function (k) { return String(data[k] || '').replace(/<[^>]*>/g, '').substring(0, 200); };
    var source = clean('utm_source'), medium = clean('utm_medium');
    var sourceLabel = source ? (source + (medium ? ' / ' + medium : '')) : '직접유입';
    var dir = DIR_LABEL[size] || '';
    var vtime = TIME_LABEL[vtimeKey] || '';

    /* ── 3. 남용 방어 (검증 통과 건만 카운트, 원자적) ── */
    var cache = CacheService.getScriptCache();
    var dupKey = 'dup_' + phone.replace(/-/g, '');
    if (cache.get(dupKey)) return json({ result: 'success', dup: true });        // 5분 내 동일 번호 중복 무시
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return json({ result: 'error', message: 'busy' });
    try {
      var minuteKey = 'rl_' + Math.floor(Date.now() / 60000);
      var cnt = Number(cache.get(minuteKey) || 0);
      if (cnt >= 30) return json({ result: 'error', message: 'rate limited' });  // 유효 제출 분당 30건
      cache.put(minuteKey, String(cnt + 1), 120);

      /* ── 4. 시트 기록 ── */
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(CONFIG.SHEET_NAME_WEB);
      if (!sheet) { sheet = ss.getSheets()[0]; sheet.setName(CONFIG.SHEET_NAME_WEB); }
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['타임스탬프', '이름', '연락처', '관심방향', '방문희망일', '희망시간대', '문의내용',
                         '유입매체', '캠페인', '광고콘텐츠', '검색어', '페이지URL']);
        sheet.getRange(1, 1, 1, COLS).setFontWeight('bold');
        sheet.setFrozenRows(1);
        sheet.setColumnWidths(1, COLS, 140);
      }
      sheet.appendRow([new Date(), name, phone, dir, vdate, vtime, message,
                       sourceLabel, clean('utm_campaign'), clean('utm_content'), clean('utm_term'), clean('page_url')]);
      cache.put(dupKey, '1', 300);                                              // 기록 성공 후에만 중복키 저장
      var lastRow = sheet.getLastRow();
      if (lastRow > 2) sheet.getRange(2, 1, lastRow - 1, COLS).sort({ column: 1, ascending: false });
    } finally {
      lock.releaseLock();
    }

    sendChatNotification({ name: name, phone: phone, dir: dir, visitDate: vdate || '-', visitTime: vtime || '-', message: message || '-', channel: sourceLabel, campaign: clean('utm_campaign') || '-' });
    return json({ result: 'success' });
  } catch (err) {
    Logger.log('doPost error: ' + err);
    return json({ result: 'error', message: 'server error' });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sendChatNotification(lead) {
  var url = CONFIG.CHAT_WEBHOOK_URL;
  if (!url) return;
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var msg = { cards: [{ header: { title: '🔔 비테라 시그니처 새 관심고객', subtitle: now },
    sections: [{ widgets: [
      { keyValue: { topLabel: '👤 이름', content: lead.name } },
      { keyValue: { topLabel: '📞 연락처', content: lead.phone } },
      { keyValue: { topLabel: '🧭 관심방향', content: lead.dir || '-' } },
      { keyValue: { topLabel: '📅 방문희망', content: lead.visitDate + ' ' + lead.visitTime } },
      { keyValue: { topLabel: '💬 문의내용', content: lead.message } },
      { keyValue: { topLabel: '📊 유입경로', content: lead.channel + (lead.campaign !== '-' ? ' (' + lead.campaign + ')' : '') } }
    ] }, { widgets: [{ buttons: [{ textButton: { text: '📋 시트 확인', onClick: { openLink: { url: SpreadsheetApp.getActiveSpreadsheet().getUrl() } } } }] }] }] }] };
  try { UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(msg) }); } catch (err) { Logger.log(err); }
}

/* 에디터에서 1회 실행 → 권한 승인 + 헤더 생성 + 테스트 행 */
function authorizeAndTest() {
  var mock = { postData: { contents: JSON.stringify({
    name: '테스트', phone: '010-1234-5678', size: 'south', visit_date: '2026-09-01', visit_time: '10-12',
    message: '연동 테스트 (삭제해도 됨)', utm_source: 'test', utm_medium: 'manual', page_url: 'https://viterra.test/' }) } };
  Logger.log(doPost(mock).getContent());
}

/* 테스트 행 정리: 테스트 번호/이름/유입경로 패턴 삭제 */
function cleanupTestRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME_WEB);
  if (!sh || sh.getLastRow() < 2) return 0;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COLS).getValues();
  var isTest = function (r) {
    var name = String(r[1] || ''), phone = String(r[2] || ''), src = String(r[7] || ''), msg = String(r[6] || '');
    return /^010-(9999|1234|2222|5555)-/.test(phone) || /테스트|폼테스트|curl|bot|fast|빠름|CSP|리뷰|보안|E2E/i.test(name) || /^(curl|test|playwright|review|csp-test|sectest)/i.test(src) || /테스트/.test(msg);
  };
  var removed = 0;
  for (var i = vals.length - 1; i >= 0; i--) { if (isTest(vals[i])) { sh.deleteRow(i + 2); removed++; } }
  return removed;
}
