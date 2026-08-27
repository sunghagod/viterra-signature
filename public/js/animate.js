/**
 * animate.js — GSAP 2-step FX Engine (완전판)
 * 송암공원 SK VIEW
 *
 * ── 의존 라이브러리 ──────────────────────────────────────
 *   js/lib/gsap.min.js        : GSAP 3 core
 *   js/lib/CustomEase.min.js  : 커스텀 베지어 이징
 *
 * ── 2단계 실행 흐름 ──────────────────────────────────────
 *   PRE  단계 : blur(8px)→0 + autoAlpha 0→1   [data-pre  기본 0.3s]
 *   MAIN 단계 : fx별 위치·스케일·자간 변환    [data-main 기본 data-dur]
 *   OUT  단계 : data-out > 0 이면 hold 후 소멸 [선택]
 *
 * ── data-* 속성 전체 목록 ────────────────────────────────
 *   data-fx        필수  효과 이름
 *   data-delay     0     시작 딜레이 (초)
 *   data-dur       0.9   기준 시간 (초)
 *   data-pre       0.3   blur/fade 1단계 시간 (초)
 *   data-main      dur   메인 2단계 시간 (초)
 *   data-x         0     move fx 시작 X 오프셋 (px)
 *   data-y         0     move / fade-up 시작 Y 오프셋 (px)
 *   data-ls-from   0.5em letter-in 시작 자간
 *   data-ls-to     0em   letter-in 끝 자간
 *   data-sx-from   5     track-pop 시작 scaleX
 *   data-stagger   0.08  stagger 자식 간격 (초)
 *   data-kid-y     18    stagger 자식 시작 Y (px)
 *   data-hold      0.6   out 전 유지 시간 (초)
 *   data-out       0     out 지속 시간 (0 = 없음)
 *   data-out-x     0     out 추가 X 이동
 *   data-out-y     0     out 추가 Y 이동
 *   data-out-blur  0     out blur 강도
 *
 * ── FX 타입 ──────────────────────────────────────────────
 *   hero | from-center | move | fade
 *   fade-up | fade-down | fade-left | fade-right
 *   slide-left | track-pop | letter-in | stagger
 *   clip-left | clip-right | expand | mask-up
 */

(function (global) {
  'use strict';

  /* ── 커스텀 이징 등록 ────────────────────────────────── */
  /* CustomEase가 로드된 경우에만 등록 */
  function registerEases() {
    if (!global.CustomEase) return;
    CustomEase.create('luxOut',    'M0,0 C0.16,1 0.3,1 1,1');
    CustomEase.create('luxInOut',  'M0,0 C0.76,0 0.24,1 1,1');
    CustomEase.create('luxReveal', 'M0,0 C0.22,1 0.36,1 1,1');
    CustomEase.create('blurFade',  'M0,0 C0.25,0.46 0.45,0.94 1,1');
  }

  var EASE_OUT    = 'power3.out';
  var EASE_INOUT  = 'power3.inOut';
  var EASE_REVEAL = 'power4.inOut';

  function getEaseOut()    { return global.CustomEase ? 'luxOut'    : EASE_OUT;    }
  function getEaseInOut()  { return global.CustomEase ? 'luxInOut'  : EASE_INOUT;  }
  function getEaseReveal() { return global.CustomEase ? 'luxReveal' : EASE_REVEAL; }

  /* ── 유틸 ─────────────────────────────────────────────── */
  function num(el, attr, fallback) {
    var v = el.getAttribute(attr);
    var n = v === null ? NaN : parseFloat(v);
    return isNaN(n) ? fallback : n;
  }

  function str(el, attr, fallback) {
    var v = el.getAttribute(attr);
    return v === null ? fallback : v;
  }

  function deltaFromCenter(el) {
    var r  = el.getBoundingClientRect();
    var cx = r.left + r.width  / 2;
    var cy = r.top  + r.height / 2;
    return {
      x: window.innerWidth  / 2 - cx,
      y: window.innerHeight / 2 - cy
    };
  }

  /* ── letter-split ────────────────────────────────────── */
  function splitLetters(el) {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    var text = el.textContent;
    el.innerHTML = text.split('').map(function (ch) {
      return ch === ' '
        ? '<span class="sp-sp" aria-hidden="true"> </span>'
        : '<span class="sp-ch" style="display:inline-block">' + ch + '</span>';
    }).join('');
  }

  /* ── word-split (mask-up용) ──────────────────────────── */
  function splitWords(el) {
    if (el.dataset.wsplit) return;
    el.dataset.wsplit = '1';
    var html = el.innerHTML.trim();
    /* <br> 기준으로 줄 분리 → 각 줄에서 텍스트 노드만 단어 분리 */
    el.innerHTML = html.split(/<br\s*\/?>/gi).map(function (line) {
      /* HTML 태그(<span> 등)와 텍스트를 분리해서 처리 */
      return line.replace(/((?:<[^>]+>)+)|([^<]+)/g, function (m, tag, text) {
        if (tag) return tag;                       /* 태그는 그대로 유지 */
        return text.trim().split(/\s+/).filter(function (w) { return w; }).map(function (w) {
          return '<span class="sp-w-wrap">' +
                 '<span class="sp-w">' + w + '</span></span>';
        }).join(' ');
      });
    }).join('<br>');
  }

  /* ══════════════════════════════════════════════════════
     killFx
     ══════════════════════════════════════════════════════ */
  function killFx(container) {
    if (!container || !global.gsap) return;
    if (container._fxTl) { container._fxTl.kill(); container._fxTl = null; }
    gsap.killTweensOf(container.querySelectorAll('[data-fx]'));
    gsap.killTweensOf(container.querySelectorAll('.sp-ch,.sp-w,.sp-w-wrap'));
  }

  /* ══════════════════════════════════════════════════════
     resetFx — clearProps → autoAlpha:0
     ══════════════════════════════════════════════════════ */
  function resetFx(container) {
    if (!container || !global.gsap) return;
    killFx(container);
    var targets = container.querySelectorAll('[data-fx]');
    if (!targets.length) return;
    gsap.set(targets, { clearProps: 'all' });
    gsap.set(targets, { autoAlpha: 0 });
  }

  /* ══════════════════════════════════════════════════════
     prepFx — 초기 숨김 (transform/filter는 건드리지 않음)
     ══════════════════════════════════════════════════════ */
  function prepFx(container) {
    if (!container || !global.gsap) return;
    var targets = container.querySelectorAll('[data-fx]');
    if (!targets.length) return;
    gsap.killTweensOf(targets);
    gsap.set(targets, { autoAlpha: 0, clearProps: 'transform,filter' });
  }

  /* ══════════════════════════════════════════════════════
     playFxIn — 2단계 애니메이션 실행
     ══════════════════════════════════════════════════════ */
  function playFxIn(container) {
    if (!container || !global.gsap) return;
    killFx(container);

    var targets = container.querySelectorAll('[data-fx]');
    if (!targets.length) return;

    /* visibility:visible 보장 */
    gsap.set(targets, { autoAlpha: 0, visibility: 'visible' });

    var tl = gsap.timeline({ defaults: { ease: getEaseOut() } });

    targets.forEach(function (el) {
      var fx      = el.getAttribute('data-fx');
      var delay   = num(el, 'data-delay', 0);
      var dur     = num(el, 'data-dur',   0.9);
      var preDur  = num(el, 'data-pre',   0.3);
      var mainDur = num(el, 'data-main',  dur);

      /* ── PRE 단계 : blur/fade ──────────────────────── */
      tl.fromTo(el,
        { autoAlpha: 0, filter: 'blur(8px)' },
        { autoAlpha: 1, filter: 'blur(0px)', duration: preDur, ease: 'power2.out' },
        delay
      );

      var t0     = delay + preDur;   /* MAIN 시작 */
      var tEnd   = t0 + mainDur;     /* MAIN 종료 (OUT 계산용) */

      /* out 파라미터 */
      var hold    = num(el, 'data-hold',     0.6);
      var outDur  = num(el, 'data-out',      0);
      var outX    = num(el, 'data-out-x',    0);
      var outY    = num(el, 'data-out-y',    0);
      var outBlur = num(el, 'data-out-blur', 0);

      /* ── MAIN 단계 : fx별 ──────────────────────────── */
      switch (fx) {

        /* ── hero : 미세 scale/y 복귀 ─────────────────── */
        case 'hero':
          tl.fromTo(el,
            { y: 24, scale: 0.97 },
            { y: 0,  scale: 1,   duration: mainDur, ease: getEaseOut() },
            t0
          );
          break;

        /* ── from-center : 뷰포트 중앙에서 이동 ────────── */
        case 'from-center': {
          var d = deltaFromCenter(el);
          tl.fromTo(el,
            { x: d.x, y: d.y, scale: 0.94 },
            { x: 0,   y: 0,   scale: 1,    duration: mainDur, ease: getEaseOut() },
            t0
          );
          break;
        }

        /* ── move : data-x, data-y 에서 0,0 으로 ────────── */
        case 'move': {
          var mx = num(el, 'data-x', 0);
          var my = num(el, 'data-y', 0);
          tl.fromTo(el,
            { x: mx, y: my },
            { x: 0,  y: 0,  duration: mainDur, ease: getEaseOut() },
            t0
          );
          break;
        }

        /* ── fade : 이동 없음 (pre에서 이미 등장) ─────── */
        case 'fade':
          tl.to(el, { duration: Math.max(0.01, mainDur) }, t0);
          break;

        /* ── fade-up ────────────────────────────────────── */
        case 'fade-up': {
          var fy = num(el, 'data-y', 52);
          tl.fromTo(el, { y: fy }, { y: 0, duration: mainDur, ease: getEaseOut() }, t0);
          break;
        }

        /* ── fade-down ──────────────────────────────────── */
        case 'fade-down': {
          var fdy = num(el, 'data-y', -52);
          tl.fromTo(el, { y: fdy }, { y: 0, duration: mainDur, ease: getEaseOut() }, t0);
          break;
        }

        /* ── fade-left ──────────────────────────────────── */
        case 'fade-left':
          tl.fromTo(el, { x: -52 }, { x: 0, duration: mainDur, ease: getEaseOut() }, t0);
          break;

        /* ── fade-right ─────────────────────────────────── */
        case 'fade-right':
          tl.fromTo(el, { x: 52 }, { x: 0, duration: mainDur, ease: getEaseOut() }, t0);
          break;

        /* ── slide-left : 더 작은 이동 ─────────────────── */
        case 'slide-left':
          tl.fromTo(el, { x: 36 }, { x: 0, duration: mainDur, ease: getEaseOut() }, t0);
          break;

        /* ── track-pop : 가로 팽창 ──────────────────────── */
        case 'track-pop': {
          var sxFrom = num(el, 'data-sx-from', 5);
          gsap.set(el, { transformOrigin: '50% 50%' });
          tl.fromTo(el,
            { scaleX: sxFrom },
            { scaleX: 1, duration: mainDur, ease: getEaseReveal() },
            t0
          );
          break;
        }

        /* ── letter-in : 자간 축소 ──────────────────────── */
        case 'letter-in': {
          var lsFrom = str(el, 'data-ls-from', '0.45em');
          var lsTo   = str(el, 'data-ls-to',   '0em');
          gsap.set(el, { letterSpacing: lsFrom });
          tl.to(el, {
            letterSpacing: lsTo,
            duration: mainDur,
            ease: getEaseInOut()
          }, t0);
          break;
        }

        /* ── clip-left : 왼쪽에서 클립 해제 ────────────── */
        case 'clip-left':
          gsap.set(el, { clipPath: 'inset(0 100% 0 0)' });
          tl.to(el, {
            clipPath: 'inset(0 0% 0 0)',
            duration: mainDur,
            ease: getEaseReveal()
          }, t0);
          break;

        /* ── clip-right : 오른쪽에서 클립 해제 ─────────── */
        case 'clip-right':
          gsap.set(el, { clipPath: 'inset(0 0 0 100%)' });
          tl.to(el, {
            clipPath: 'inset(0 0% 0 0)',
            duration: mainDur,
            ease: getEaseReveal()
          }, t0);
          break;

        /* ── expand : scaleX 0→1 ────────────────────────── */
        case 'expand':
          gsap.set(el, { scaleX: 0, transformOrigin: 'left center' });
          tl.to(el, { scaleX: 1, duration: mainDur, ease: getEaseReveal() }, t0);
          break;

        /* ── mask-up : 단어별 mask 상승 ─────────────────── */
        case 'mask-up': {
          splitWords(el);
          var words = el.querySelectorAll('.sp-w');
          gsap.set(words, { y: '110%' });
          tl.to(words, {
            y: '0%',
            duration: mainDur,
            stagger: 0.06,
            ease: getEaseOut()
          }, t0);
          tEnd = t0 + mainDur + (words.length - 1) * 0.06;
          break;
        }

        /* ── stagger : 자식 순차 등장 ───────────────────── */
        case 'stagger': {
          var kids   = Array.prototype.slice.call(el.children || []);
          var stag   = num(el, 'data-stagger', 0.08);
          var kidY   = num(el, 'data-kid-y',   18);
          var kidDur = Math.max(0.6, Math.min(1.1, mainDur));

          if (kids.length) {
            gsap.set(kids, { autoAlpha: 0, y: kidY, visibility: 'visible' });
            tl.to(kids, {
              autoAlpha: 1, y: 0,
              duration: kidDur,
              stagger: stag,
              ease: getEaseOut()
            }, t0);
            tEnd = t0 + kidDur + (kids.length - 1) * stag;
          }
          break;
        }

        default:
          tl.to(el, { autoAlpha: 1, duration: mainDur }, t0);
      }

      /* ── OUT 단계 (공통) ─────────────────────────────── */
      if (outDur > 0) {
        var outStart = tEnd + hold;
        var outVars  = {
          autoAlpha: 0,
          duration:  outDur,
          ease:      'power1.inOut'
        };
        if (outX)    outVars.x      = '+=' + outX;
        if (outY)    outVars.y      = '+=' + outY;
        if (outBlur) outVars.filter = 'blur(' + outBlur + 'px)';
        tl.to(el, outVars, outStart);
      }
    });

    container._fxTl = tl;
    return tl;
  }

  /* ══════════════════════════════════════════════════════
     섹션 단위 헬퍼
     ══════════════════════════════════════════════════════ */
  function prepSection(sec)  { if (sec) prepFx(sec); }
  function resetSection(sec) { if (sec) resetFx(sec); }
  function playSection(sec)  { if (sec) return playFxIn(sec); }

  /* ── 모바일 IntersectionObserver ─────────────────────── */
  function initIO() {
    var secs = document.querySelectorAll('.sec');
    secs.forEach(function (s) { prepFx(s); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        playFxIn(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.15 });

    secs.forEach(function (s) { io.observe(s); });
  }

  /* ══════════════════════════════════════════════════════
     전역 API 노출
     ══════════════════════════════════════════════════════ */
  global.AnimateFx = {
    kill:         killFx,
    reset:        resetFx,
    prep:         prepFx,
    play:         playFxIn,
    prepSection:  prepSection,
    resetSection: resetSection,
    playSection:  playSection,
    initIO:       initIO
  };

  /* ── DOMContentLoaded 에서 CustomEase 등록 ───────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerEases);
  } else {
    registerEases();
  }

}(window));
