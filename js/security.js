/* ═══════════════════════════════════════════════
   security.js — 송암공원 SK VIEW 보안 모듈
   XSS 방지, 입력 검증, 레이트 리미팅
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     1. XSS 방지 — HTML 새니타이저
     ══════════════════════════════════════════════ */

  // 허용할 태그와 속성 화이트리스트
  var ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'br', 'span', 'small', 'p', 'ul', 'li'];
  var ALLOWED_ATTRS = ['class', 'style'];

  /**
   * HTML 문자열에서 허용된 태그만 남기고 나머지 제거
   * script, iframe, on* 이벤트 핸들러 등 차단
   */
  function sanitizeHTML(html) {
    if (typeof html !== 'string') return '';

    // 1) script, iframe, object, embed 태그 완전 제거
    html = html.replace(/<\s*(script|iframe|object|embed|link|style|meta|base)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '');
    html = html.replace(/<\s*(script|iframe|object|embed|link|style|meta|base)[^>]*\/?>/gi, '');

    // 2) on* 이벤트 핸들러 속성 제거 (onclick, onerror 등)
    html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    // 3) javascript:, data:, vbscript: URL 스킴 제거
    html = html.replace(/(?:href|src|action)\s*=\s*(?:"[^"]*(?:javascript|data|vbscript)\s*:[^"]*"|'[^']*(?:javascript|data|vbscript)\s*:[^']*')/gi, '');

    // 4) DOM 파서를 이용한 안전한 태그 필터링
    var doc = new DOMParser().parseFromString(html, 'text/html');
    cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  function cleanNode(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 1) { // Element
        var tag = child.tagName.toLowerCase();
        if (ALLOWED_TAGS.indexOf(tag) === -1) {
          // 허용되지 않은 태그: 자식 노드만 살리고 태그 제거
          while (child.firstChild) {
            node.insertBefore(child.firstChild, child);
          }
          node.removeChild(child);
        } else {
          // 허용된 태그: 위험한 속성 제거
          var attrs = Array.prototype.slice.call(child.attributes);
          for (var j = 0; j < attrs.length; j++) {
            var attrName = attrs[j].name.toLowerCase();
            if (ALLOWED_ATTRS.indexOf(attrName) === -1 || attrName.indexOf('on') === 0) {
              child.removeAttribute(attrs[j].name);
            }
          }
          cleanNode(child);
        }
      }
    }
  }

  /**
   * 문자열을 안전하게 이스케이프 (textContent 대신 사용)
   */
  function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }


  /* ══════════════════════════════════════════════
     2. 입력값 검증
     ══════════════════════════════════════════════ */

  var validators = {
    /** 이름: 2~20자, 한글/영문/공백 */
    name: function (val) {
      val = (val || '').trim();
      if (!val) return { valid: false, msg: '이름을 입력해주세요.' };
      if (val.length < 2 || val.length > 20) return { valid: false, msg: '이름은 2~20자로 입력해주세요.' };
      if (!/^[가-힣a-zA-Z\s]+$/.test(val)) return { valid: false, msg: '이름은 한글 또는 영문만 입력 가능합니다.' };
      return { valid: true, value: val };
    },

    /** 전화번호: 한국 휴대폰 (010-XXXX-XXXX) */
    phone: function (val) {
      val = (val || '').trim().replace(/\s/g, '');
      if (!val) return { valid: false, msg: '연락처를 입력해주세요.' };
      // 하이픈 유무 모두 허용
      var cleaned = val.replace(/-/g, '');
      if (!/^01[016789]\d{7,8}$/.test(cleaned)) {
        return { valid: false, msg: '올바른 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)' };
      }
      // 포맷팅
      var formatted = cleaned.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
      return { valid: true, value: formatted };
    },

    /** 메시지: 최대 500자, 위험 문자 제거 */
    message: function (val) {
      val = (val || '').trim();
      if (val.length > 500) return { valid: false, msg: '문의사항은 500자 이내로 작성해주세요.' };
      // HTML 태그 제거
      val = val.replace(/<[^>]*>/g, '');
      return { valid: true, value: val };
    }
  };


  /* ══════════════════════════════════════════════
     3. 레이트 리미팅 (폼 스팸 방지)
     ══════════════════════════════════════════════ */

  var rateLimitStore = {};

  /**
   * 레이트 리미트 체크
   * @param {string} key - 식별키
   * @param {number} intervalMs - 제한 간격(ms)
   * @param {number} maxCount - 간격 내 최대 허용 횟수
   * @returns {boolean} true = 허용, false = 차단
   */
  function rateLimit(key, intervalMs, maxCount) {
    var now = Date.now();
    if (!rateLimitStore[key]) {
      rateLimitStore[key] = [];
    }

    // 만료된 기록 제거
    rateLimitStore[key] = rateLimitStore[key].filter(function (t) {
      return now - t < intervalMs;
    });

    if (rateLimitStore[key].length >= maxCount) {
      return false; // 차단
    }

    rateLimitStore[key].push(now);
    return true; // 허용
  }


  /* ══════════════════════════════════════════════
     4. 비밀번호 해싱 (SHA-256)
     ══════════════════════════════════════════════ */

  /**
   * SHA-256 해시 생성 (async)
   * @param {string} text
   * @returns {Promise<string>} hex 해시
   */
  function sha256(text) {
    var encoder = new TextEncoder();
    var data = encoder.encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buffer) {
      var hashArray = Array.from(new Uint8Array(buffer));
      return hashArray.map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }


  /* ══════════════════════════════════════════════
     5. CSRF 토큰 (세션 기반)
     ══════════════════════════════════════════════ */

  var csrfToken = null;

  function generateCSRFToken() {
    var arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    csrfToken = Array.from(arr, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
    sessionStorage.setItem('csrf_token', csrfToken);
    return csrfToken;
  }

  function getCSRFToken() {
    if (!csrfToken) {
      csrfToken = sessionStorage.getItem('csrf_token') || generateCSRFToken();
    }
    return csrfToken;
  }


  /* ══════════════════════════════════════════════
     6. 허니팟 봇 탐지
     ══════════════════════════════════════════════ */

  /**
   * 허니팟 필드 삽입 — 사람 눈에 보이지 않는 가짜 필드.
   * 봇은 모든 input을 채우므로, 이 필드에 값이 있으면 = 봇
   */
  function injectHoneypot(formEl) {
    if (!formEl || formEl.querySelector('.hp-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'hp-wrap';
    // 시각적으로 완전히 숨김 (display:none은 똑똑한 봇이 건너뛰므로 다른 방법 사용)
    wrap.setAttribute('style',
      'position:absolute;left:-9999px;top:-9999px;' +
      'width:1px;height:1px;overflow:hidden;opacity:0;' +
      'pointer-events:none;tab-index:-1;'
    );
    wrap.setAttribute('aria-hidden', 'true');
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'website';       // 봇이 좋아하는 필드명
    input.tabIndex = -1;
    input.autocomplete = 'off';
    wrap.appendChild(input);
    formEl.appendChild(wrap);
  }

  function isHoneypotFilled(formEl) {
    if (!formEl) return false;
    var hp = formEl.querySelector('[name="website"]');
    return hp && hp.value.length > 0;
  }


  /* ══════════════════════════════════════════════
     7. 타이밍 봇 탐지
     ══════════════════════════════════════════════ */

  var formLoadTime = 0;
  var MIN_FILL_TIME = 3000; // 사람이 폼을 채우는 최소 시간 (3초)

  function markFormLoaded() {
    formLoadTime = Date.now();
  }

  function isTooFast() {
    if (!formLoadTime) return false;
    return (Date.now() - formLoadTime) < MIN_FILL_TIME;
  }


  /* ══════════════════════════════════════════════
     8. 클릭재킹 방어 (Framebusting)
     ══════════════════════════════════════════════ */

  function preventFraming() {
    // 이 페이지가 iframe 안에 있으면 탈출
    try {
      if (window.self !== window.top) {
        // iframe 안에 갇혀 있음 → 최상위로 이동
        window.top.location = window.self.location;
      }
    } catch (e) {
      // cross-origin iframe → 접근 차단, 화면 가림
      document.body.innerHTML =
        '<div style="position:fixed;inset:0;background:#000;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;font-size:20px;z-index:99999">' +
        '이 페이지는 직접 접속해야 합니다.</div>';
    }
  }


  /* ══════════════════════════════════════════════
     9. DevTools 감지 & 콘솔 경고
     ══════════════════════════════════════════════ */

  function initConsoleWarning() {
    // 콘솔에 경고 메시지 표시 (페이스북 스타일)
    var warnStyle = 'color:#e53e3e;font-size:24px;font-weight:bold;';
    var infoStyle = 'color:#666;font-size:14px;';
    console.log('%c경고!', warnStyle);
    console.log(
      '%c이 브라우저 기능은 개발자용입니다.\n' +
      '누군가 여기에 코드를 붙여넣으라고 했다면\n' +
      '사기 피해를 입을 수 있습니다.\n' +
      '본인이 무엇을 하는지 모른다면 이 창을 닫아주세요.',
      infoStyle
    );
  }

  /** DOM 변조 감시 — 핵심 수치(세대수, 가격 등)가 조작되면 경고 */
  var protectedCids = ['stat-units', 'stat-floors', 'stat-bldgs', 'stat-area'];
  var originalValues = {};

  function snapshotProtectedValues() {
    protectedCids.forEach(function (cid) {
      var el = document.querySelector('[data-cid="' + cid + '"]');
      if (el) originalValues[cid] = el.textContent;
    });
  }

  function watchDOMTampering() {
    if (typeof MutationObserver === 'undefined') return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var el = m.target;
        if (!el || !el.dataset) return;
        var cid = el.dataset.cid;
        if (!cid || protectedCids.indexOf(cid) === -1) return;

        var original = originalValues[cid];
        if (original && el.textContent !== original) {
          // 변조 감지 → 원래 값 복원
          el.textContent = original;
          console.warn('[보안] 콘텐츠 변조가 감지되어 원래 값으로 복원되었습니다: ' + cid);
        }
      });
    });

    protectedCids.forEach(function (cid) {
      var el = document.querySelector('[data-cid="' + cid + '"]');
      if (el) {
        observer.observe(el, { childList: true, characterData: true, subtree: true });
      }
    });
  }


  /* ══════════════════════════════════════════════
     10. 우클릭 / 드래그 / 복사 방지 (콘텐츠 보호)
     ══════════════════════════════════════════════ */

  function enableContentProtection() {
    // localhost(개발 환경)에서는 보호 비활성화
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;

    // 우클릭 방지
    document.addEventListener('contextmenu', function (e) {
      // input, textarea는 허용
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
    });

    // 텍스트 선택 방지 (CSS도 병행)
    document.addEventListener('selectstart', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
    });

    // 드래그 방지 (이미지 끌어가기 차단)
    document.addEventListener('dragstart', function (e) {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
      }
    });

    // 키보드 단축키 차단 (Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12)
    document.addEventListener('keydown', function (e) {
      var dominated = e.ctrlKey || e.metaKey;
      // Ctrl+U (소스보기), Ctrl+S (저장)
      if (dominated && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
      }
      // Ctrl+Shift+I (개발자도구), Ctrl+Shift+J (콘솔)
      if (dominated && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
      }
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
    });
  }


  /* ══════════════════════════════════════════════
     11. 이미지 보호 (오버레이 방식)
     ══════════════════════════════════════════════ */

  function protectImages() {
    // 모든 주요 이미지에 투명 오버레이를 씌워 직접 저장 방지
    var images = document.querySelectorAll(
      '.s0-bg, .s1-img-inner, .s2-bg, .s5-img, .pcard-img, .s4-card-bg'
    );
    images.forEach(function (img) {
      if (img.querySelector('.img-shield')) return;
      var shield = document.createElement('div');
      shield.className = 'img-shield';
      shield.setAttribute('style',
        'position:absolute;inset:0;z-index:2;' +
        'background:transparent;pointer-events:auto;'
      );
      if (getComputedStyle(img).position === 'static') {
        img.style.position = 'relative';
      }
      img.appendChild(shield);
    });
  }


  /* ══════════════════════════════════════════════
     12. 자동 초기화 (페이지 로드 시 실행)
     ══════════════════════════════════════════════ */

  function autoInit() {
    // 클릭재킹 방어
    preventFraming();

    // 콘솔 경고
    initConsoleWarning();

    // localhost가 아니고 admin이 아닌 경우에만 콘텐츠 보호 적용
    var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    var isAdmin = window.location.pathname.indexOf('admin') !== -1;
    if (!isAdmin && !isLocal) {
      document.body.classList.add('protected');
      enableContentProtection();
      protectImages();
    }

    // 폼 허니팟
    var form = document.getElementById('form');
    if (form) {
      injectHoneypot(form);
      markFormLoaded();
    }

    // DOM 변조 감시 (약간의 딜레이 후 원본값 스냅샷)
    setTimeout(function () {
      snapshotProtectedValues();
      watchDOMTampering();
    }, 3000);
  }

  // DOM 로드 후 자동 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }


  /* ══════════════════════════════════════════════
     공개 API
     ══════════════════════════════════════════════ */

  window.Security = {
    sanitizeHTML: sanitizeHTML,
    escapeHTML: escapeHTML,
    validate: validators,
    rateLimit: rateLimit,
    sha256: sha256,
    csrf: {
      generate: generateCSRFToken,
      get: getCSRFToken
    },
    honeypot: {
      inject: injectHoneypot,
      isFilled: isHoneypotFilled
    },
    timing: {
      markLoaded: markFormLoaded,
      isTooFast: isTooFast
    }
  };

})();
