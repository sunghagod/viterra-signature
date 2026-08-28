/* ═══════════════════════════════════════════════
   form.js — 송암공원 SK VIEW 관심고객 등록
   Google Apps Script → Google Sheets 연동
   + 입력 검증, 레이트 리미팅, XSS 방지
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Google Apps Script 배포 URL ─────────────
     admin 페이지 설정 또는 아래에 직접 입력      */
  var FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbxvuIsDstrkYdM2D39KZYOIF1M8UdXuUqMrDELjiXuBiV5GwdFvJ6U25iw6QQgaHzTp/exec';

  /* ── 폼 요소 ─────────────────────────────── */
  var form      = document.getElementById('form');
  if (!form) return;
  window.__formLoadedAt = Date.now();

  var btn       = form.querySelector('.btn-submit');
  var resultEl  = document.getElementById('formResult');
  var btnText   = '관심고객 등록하기 <i class="fa-solid fa-arrow-right"></i>';

  /* ── UTM 파라미터 수집 ───────────────────── */
  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source:   params.get('utm_source')   || '',
      utm_medium:   params.get('utm_medium')   || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content:  params.get('utm_content')  || '',
      utm_term:     params.get('utm_term')     || ''
    };
  }

  /* ── Script URL: admin 저장값 우선 ─────────── */
  function getScriptUrl() {
    try {
      var cfg = JSON.parse(localStorage.getItem('viterra_content') || '{}');
      return cfg['form-script-url'] || FALLBACK_URL;
    } catch (e) {
      return FALLBACK_URL;
    }
  }

  /* ── 입력값 검증 ──────────────────────────── */
  function validateForm() {
    var S = window.Security;
    var errors = [];

    // 이름 검증
    var nameVal = form.querySelector('[name="name"]').value;
    if (S && S.validate.name) {
      var nameResult = S.validate.name(nameVal);
      if (!nameResult.valid) errors.push(nameResult.msg);
    } else if (!nameVal.trim()) {
      errors.push('이름을 입력해주세요.');
    }

    // 전화번호 검증
    var phoneVal = form.querySelector('[name="phone"]').value;
    if (S && S.validate.phone) {
      var phoneResult = S.validate.phone(phoneVal);
      if (!phoneResult.valid) errors.push(phoneResult.msg);
    } else if (!phoneVal.trim()) {
      errors.push('연락처를 입력해주세요.');
    }

    // 메시지 검증
    var msgVal = form.querySelector('[name="message"]').value;
    if (S && S.validate.message) {
      var msgResult = S.validate.message(msgVal);
      if (!msgResult.valid) errors.push(msgResult.msg);
    }

    return errors;
  }

  /* ── 안전한 데이터 수집 ───────────────────── */
  function collectData() {
    var S = window.Security;
    var nameVal      = form.querySelector('[name="name"]').value.trim();
    var phoneVal     = form.querySelector('[name="phone"]').value.trim();
    var sizeVal      = form.querySelector('[name="size"]').value;
    var visitDateVal = form.querySelector('[name="visit_date"]').value;
    var visitTimeVal = form.querySelector('[name="visit_time"]').value;
    var msgVal       = form.querySelector('[name="message"]').value.trim();

    // Security 모듈 있으면 검증된 값 사용
    if (S && S.validate.name) {
      var nr = S.validate.name(nameVal);
      if (nr.valid) nameVal = nr.value;
    }
    if (S && S.validate.phone) {
      var pr = S.validate.phone(phoneVal);
      if (pr.valid) phoneVal = pr.value;
    }
    if (S && S.validate.message) {
      var mr = S.validate.message(msgVal);
      if (mr.valid) msgVal = mr.value;
    }

    // select 값 화이트리스트 검증
    var allowedSizes = ['', 'river', 'mountain', 'any'];
    if (allowedSizes.indexOf(sizeVal) === -1) sizeVal = '';

    var allowedTimes = ['', '10-12', '12-14', '14-16', '16-18', 'other'];
    if (allowedTimes.indexOf(visitTimeVal) === -1) visitTimeVal = '';

    // 날짜 형식 검증 (YYYY-MM-DD)
    if (visitDateVal && !/^\d{4}-\d{2}-\d{2}$/.test(visitDateVal)) visitDateVal = '';

    var utm = getUtmParams();

    return {
      name:         nameVal,
      phone:        phoneVal,
      size:         sizeVal,
      visit_date:   visitDateVal,
      visit_time:   visitTimeVal,
      message:      msgVal,
      utm_source:   utm.utm_source,
      utm_medium:   utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content:  utm.utm_content,
      utm_term:     utm.utm_term,
      page_url:     window.location.href,
      website:      (form.querySelector('[name="website"]') || {}).value || '',
      form_ts:      window.__formLoadedAt || 0,
      client_ts:    Date.now()
    };
  }

  /* ── 제출 핸들러 ─────────────────────────── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var S = window.Security;

    // 허니팟 봇 탐지: 숨겨진 필드에 값이 있으면 봇
    if (S && S.honeypot && S.honeypot.isFilled(form)) {
      // 봇에게는 성공한 것처럼 보여줌 (재시도 방지)
      showResult('success', '예약이 완료되었습니다.\n담당자가 빠르게 연락드리겠습니다.');
      form.reset();
      return;
    }

    // 타이밍 봇 탐지: 3초 이내 제출은 사람이 아님
    if (S && S.timing && S.timing.isTooFast()) {
      showResult('error', '잠시 후 다시 시도해주세요.');
      return;
    }

    // 레이트 리미팅: 30초에 1회만 허용
    if (S && S.rateLimit) {
      if (!S.rateLimit('form-submit', 30000, 1)) {
        showResult('error', '너무 자주 전송하고 있습니다.\n30초 후 다시 시도해주세요.');
        return;
      }
    }

    // 입력값 검증
    var errors = validateForm();
    if (errors.length > 0) {
      showResult('error', errors.join('\n'));
      return;
    }

    var scriptUrl = getScriptUrl();
    if (!scriptUrl) {
      showResult('error', '폼 서버 URL이 설정되지 않았습니다.\n관리자 페이지 → 설정에서 Google Script URL을 입력해주세요.');
      return;
    }

    var data = collectData();

    setLoading(true);

    /* no-cors: body를 text/plain으로 전송 (CORS 우회)
       Apps Script에서 e.postData.contents로 수신       */
    fetch(scriptUrl, {
      method: 'POST',
      mode:   'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:   JSON.stringify(data)
    })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      setLoading(false);
      if (json && json.result === 'success') {
        showResult('success', '예약이 완료되었습니다.\n담당자가 빠르게 연락드리겠습니다.');
        form.reset();
        return;
      }
      var msg = (json && json.message) || '';
      var human = {
        'too fast':      '입력이 너무 빨랐습니다. 잠시 후 다시 시도해주세요.',
        'rate limited':  '현재 접수가 많습니다. 1분 후 다시 시도해주세요.',
        'busy':          '잠시 후 다시 시도해주세요.',
        'invalid name':  '이름을 정확히 입력해주세요.',
        'invalid phone': '연락처를 정확히 입력해주세요.'
      }[msg] || '전송에 실패했습니다. 대표번호 1533-3592로 연락해주세요.';
      showResult('error', human);
    })
    .catch(function () {
      setLoading(false);
      showResult('error', '전송 중 오류가 발생했습니다.\n대표번호 1533-3592로 연락해주세요.');
    });
  });
  });

  /* ── 개인정보 상세 토글 ───────────────────── */
  var privBtn = document.getElementById('privacyToggle');
  var privBox = document.getElementById('privacyDetail');
  if (privBtn && privBox) {
    privBtn.addEventListener('click', function () {
      var open = privBox.classList.toggle('open');
      privBtn.classList.toggle('open', open);
      privBtn.firstChild.textContent = open ? '접기 ' : '내용보기 ';
    });
  }

  /* ── UI 헬퍼 ─────────────────────────────── */
  function setLoading(on) {
    btn.disabled = on;
    btn.innerHTML = on
      ? '<i class="fa-solid fa-spinner fa-spin"></i> 전송 중...'
      : btnText;
  }

  function showResult(type, msg) {
    if (!resultEl) return;
    resultEl.className = 'form-result form-result--' + type;
    // XSS 방지: textContent 사용 후 줄바꿈만 <br>로 처리
    resultEl.textContent = '';
    var lines = msg.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) resultEl.appendChild(document.createElement('br'));
      resultEl.appendChild(document.createTextNode(lines[i]));
    }
    resultEl.style.display = 'block';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (type === 'success') {
      setTimeout(function () { resultEl.style.display = 'none'; }, 6000);
    }
  }
})();
