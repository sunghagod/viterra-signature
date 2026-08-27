/* ═══════════════════════════════════════════════
   content.js — 송암공원 SK VIEW
   localStorage에 저장된 콘텐츠를 페이지에 적용
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  var STORE_KEY = 'viterra_content';
  var IMG_KEY   = 'skview_images';

  /* ── 저장된 데이터 로드 ─────────────────── */
  function loadContent() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch(e) { return {}; }
  }
  function loadImages() {
    try { return JSON.parse(localStorage.getItem(IMG_KEY)) || {}; } catch(e) { return {}; }
  }

  /* ── 텍스트 data-cid 적용 (XSS 방지) ──── */
  function applyText(data) {
    Object.keys(data).forEach(function(cid) {
      // CSS 선택자 인젝션 방지: data-cid 값 검증
      if (!/^[a-zA-Z0-9\-_]+$/.test(cid)) return;
      var el = document.querySelector('[data-cid="' + cid + '"]');
      if (!el) return;
      el.textContent = data[cid];
    });
  }

  /* ── 이미지 URL 안전성 검증 ──────────── */
  function isSafeImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // data:image/* (base64) 또는 https:// 또는 상대 경로만 허용
    if (/^data:image\/[a-zA-Z+]+;base64,/.test(url)) return true;
    if (/^https?:\/\//.test(url)) return true;
    if (/^assets\//.test(url) || /^\.\//.test(url)) return true;
    // javascript:, vbscript: 등 차단
    return false;
  }

  /* ── 이미지 data-cid-bg 적용 (URL 검증) ── */
  function applyImages(imgs) {
    Object.keys(imgs).forEach(function(cid) {
      if (!/^[a-zA-Z0-9\-_]+$/.test(cid)) return;
      var url = imgs[cid];
      if (!isSafeImageUrl(url)) return;

      /* bg 이미지 (data-cid-bg) */
      var el = document.querySelector('[data-cid-bg="' + cid + '"]');
      if (el) el.style.backgroundImage = "url('" + url + "')";

      /* src 이미지 (data-cid-img) */
      var img = document.querySelector('[data-cid-img="' + cid + '"]');
      if (img) img.src = url;

      /* section 배경 (data-cid-section-bg) */
      var sec = document.querySelector('[data-cid-section-bg="' + cid + '"]');
      if (sec) sec.style.backgroundImage = 'url(' + url + ')';
    });
  }

  /* ── 특수: 섹션 bg 이미지 (s0-bg, s1-img-inner 등) ─ */
  function applySectionBgImages(imgs) {
    var sectionBgMap = {
      'hero-bg':    '.s0-bg',
      'brand-img':  '.s1-img-inner',
      'contact-img':'.s5-img',
      'loc-bg':     '.s2-bg',
      'loc-img1':   '.li0',
      'loc-img2':   '.li1',
      'loc-img3':   '.li2',
      'loc-img4':   '.li3',
    };
    Object.keys(sectionBgMap).forEach(function(cid) {
      if (!imgs[cid]) return;
      if (!isSafeImageUrl(imgs[cid])) return;
      var el = document.querySelector(sectionBgMap[cid]);
      if (el) el.style.backgroundImage = 'url(' + imgs[cid] + ')';
    });
  }

  /* ── 실행 ─────────────────────────────── */
  function init() {
    var data = loadContent();
    var imgs = loadImages();
    applyText(data);
    applyImages(imgs);
    applySectionBgImages(imgs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── 공개 API (admin.js에서 사용) ─────── */
  window.SkvContent = {
    save: function(cid, value) {
      var data = loadContent();
      data[cid] = value;
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    },
    saveImage: function(cid, dataUrl) {
      var imgs = loadImages();
      imgs[cid] = dataUrl;
      localStorage.setItem(IMG_KEY, JSON.stringify(imgs));
    },
    load: loadContent,
    loadImages: loadImages,
    reset: function() {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(IMG_KEY);
    }
  };
})();
