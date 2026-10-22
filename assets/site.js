/* 冉冉國際地產官網：前端互動
   表單前端驗證與送出。
   R3.1：表單有 data-endpoint 時，送到官網進件服務（只接受新增）；沒有時維持預覽版不送出。
         前端驗證只是方便使用者，後端會再驗證一次。
   R1.1：欄位錯誤改為「輸入時」即時更新，不在離開欄位時重新驗證整張表單，
         避免錯誤訊息消失造成按鈕位移、點不到「送出」。 */
(function () {
  'use strict';

  // ---------- 表單 ----------
  var messages = {
    name: '請填寫姓名。',
    phone: '請填寫聯絡電話，例如 0912345678 或 03-1234567。',
    contact: '請填寫電話或 Email。',
    contactFormat: '請填寫有效的電話（例如 0912345678）或 Email。',
    consent: '請勾選同意，我們才能使用這些資料與你聯繫。'
  };
  var phoneOk = function (v) { return /^[0-9+()\-\s#]{8,20}$/.test(v) && v.replace(/\D/g, '').length >= 8; };

  function errorEl(form, input) {
    var ids = (input.getAttribute('aria-describedby') || '').split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      var el = form.querySelector('#' + ids[i] + '.error');
      if (el) return el;
    }
    var fs = input.closest('fieldset');
    return fs ? fs.querySelector('.error') : null;
  }

  function setError(form, input, msg) {
    var el = errorEl(form, input);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (el) { el.textContent = msg; el.hidden = false; }
    } else {
      input.removeAttribute('aria-invalid');
      if (el) { el.textContent = ''; el.hidden = true; }
    }
  }

  // 單一欄位的錯誤訊息；radio 以整組判斷，回傳 [要標示的元素, 訊息]
  function check(form, input) {
    var name = input.name;
    if (input.type === 'radio') {
      var group = form.querySelectorAll('input[name="' + name + '"]');
      var any = false;
      for (var g = 0; g < group.length; g++) if (group[g].checked) any = true;
      return [group[0], group[0].required && !any ? (messages[name] || '請選擇一項。') : ''];
    }
    if (input.type === 'checkbox') {
      return [input, input.required && !input.checked ? (messages[name] || '請勾選此項。') : ''];
    }
    var v = (input.value || '').trim();
    if (input.required && !v) return [input, messages[name] || '請填寫此欄。'];
    if (name === 'phone' && v && !phoneOk(v)) return [input, messages.phone];
    if (name === 'contact' && v && !(phoneOk(v) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))) return [input, messages.contactFormat];
    return [input, ''];
  }

  function validate(form) {
    var firstInvalid = null;
    var seen = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (input.type === 'radio') { if (seen[input.name]) continue; seen[input.name] = true; }
      var r = check(form, input);
      setError(form, r[0], r[1]);
      if (r[1] && !firstInvalid) firstInvalid = r[0];
    }
    return firstInvalid;
  }

  var loadedAt = Date.now();
  // 每張表單各自計算填寫時間（從頁面載入或上次送出成功起算）
  function startedAt(form) { return Number(form.getAttribute('data-started') || loadedAt); }
  var SENDING = '送出中，請稍候……';
  var OK_MSG = '已收到你的資料，我們會盡快與你聯繫。';
  var NET_ERR = '目前無法送出，請確認網路連線後再試一次；你填的內容都還在。';

  // 依表單類型組出送給進件服務的資料；欄位名稱與後端一致
  function payload(form) {
    var type = form.getAttribute('data-form');
    var v = function (name) { var el = form.elements[name]; return el && typeof el.value === 'string' ? el.value.trim() : ''; };
    var data = {
      form: type,
      website: v('website'),
      elapsedMs: Date.now() - startedAt(form),
      page: location.pathname,
      consent: !!(form.elements.consent && form.elements.consent.checked)
    };
    if (type === 'landowner') {
      // R3.2：只收姓名、電話，以及選填的土地位置與想詢問的事
      ['name', 'phone', 'parcel', 'note'].forEach(function (k) { data[k] = v(k); });
    } else {
      ['name', 'contact', 'org', 'note'].forEach(function (k) { data[k] = v(k); });
    }
    return data;
  }

  function send(form, status, button) {
    var endpoint = form.getAttribute('data-endpoint');
    var testEnv = form.getAttribute('data-env') === 'test';
    var prefix = testEnv ? '［測試環境］' : '';
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    form.setAttribute('aria-busy', 'true');
    button.disabled = true;
    status.removeAttribute('data-tone');
    status.textContent = SENDING;
    // text/plain：避免瀏覽器先送 CORS 預檢（進件服務不處理 OPTIONS）
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload(form)),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) { return res.json(); }).then(function (r) {
      if (r && r.ok === true) {
        status.setAttribute('data-tone', 'ok');
        status.textContent = prefix + OK_MSG;
        form.reset();
        form.setAttribute('data-started', String(Date.now()));
        form.setAttribute('data-sent', 'true');
      } else {
        status.setAttribute('data-tone', 'error');
        status.textContent = prefix + ((r && r.message) || '資料格式有誤，請檢查後再送出。');
      }
    }).catch(function () {
      status.setAttribute('data-tone', 'error');
      status.textContent = prefix + NET_ERR;
    }).then(function () {
      if (timer) clearTimeout(timer);
      form.removeAttribute('aria-busy');
      button.disabled = false;
    });
  }

  var forms = document.querySelectorAll('form[data-form]');
  for (var f = 0; f < forms.length; f++) {
    (function (form) {
      var status = form.querySelector('.form-status');
      var submitted = false;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitted = true;
        var invalid = validate(form);
        status.hidden = false;
        if (invalid) {
          status.textContent = '有欄位需要補充，請依紅字說明修改後再送出。';
          invalid.focus();
          return;
        }
        if (form.getAttribute('aria-busy') === 'true') return; // 送出中，避免重複送出
        if (form.getAttribute('data-endpoint')) {
          send(form, status, form.querySelector('button[type=submit]'));
          return;
        }
        status.textContent = '預覽版：資料已通過檢查，但不會送出。正式版上線後，這裡會顯示送出結果。';
      });
      // 送出過一次後，只更新正在輸入的那個欄位，不重新檢查整張表單
      function onEdit(e) {
        if (!submitted) return;
        var t = e.target;
        if (!t.name) return;
        var r = check(form, t);
        if (!r[1]) setError(form, r[0], '');
        if (!form.querySelector('[aria-invalid="true"]')) status.hidden = true;
      }
      form.addEventListener('input', onEdit);
      form.addEventListener('change', function (e) {
        // 選單、勾選與單選在 change 時更新；文字欄位已由 input 處理
        if (/^(select-one|checkbox|radio)$/.test(e.target.type)) onEdit(e);
      });
    })(forms[f]);
  }

  // ---------- R3.4：首頁動態（捲動淡入、游標、主視覺） ----------
  // 都是加分效果：沒有 JS、或使用者要求減少動態時，內容照常顯示。
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      for (var r = 0; r < reveals.length; r++) reveals[r].classList.add('is-in');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (var r2 = 0; r2 < reveals.length; r2++) io.observe(reveals[r2]);
    }
  }

  // 首頁輪播（Gehl 版型）：6 秒換一張，底部進度條同步；滑鼠移入或鍵盤聚焦時暫停；可手動暫停；要求減少動態時不自動播放
  // 首頁大圖：第一張以外的圖片延後到頁面載入完成才下載，避免跟第一張搶頻寬（LCP）
  var deferImgs = function () {
    var imgs = document.querySelectorAll('img[data-srcset]:not([data-near])');
    for (var d = 0; d < imgs.length; d++) {
      imgs[d].srcset = imgs[d].getAttribute('data-srcset'); imgs[d].src = imgs[d].getAttribute('data-src');
      imgs[d].removeAttribute('data-srcset'); imgs[d].removeAttribute('data-src');
    }
  };
  // 土地相片：接近畫面時才下載
  var near = document.querySelectorAll('img[data-near]');
  if (near.length) {
    var loadNear = function (img) { img.srcset = img.getAttribute('data-srcset'); img.src = img.getAttribute('data-src'); img.removeAttribute('data-srcset'); img.removeAttribute('data-src'); img.removeAttribute('data-near'); };
    if ('IntersectionObserver' in window) {
      var nio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { var box = e.target.closest('[data-land]') || e.target; box.querySelectorAll('img[data-near]').forEach(loadNear); nio.disconnect(); } }); }, { rootMargin: '600px 0px' });
      nio.observe(near[0].closest('[data-land]') || near[0]);
    } else near.forEach(loadNear);
  }
  if (document.readyState === 'complete') setTimeout(deferImgs, 300);
  else window.addEventListener('load', function () { setTimeout(deferImgs, 300); });
  var slider = document.querySelector('[data-slider]');
  if (slider) {
    var slides = slider.querySelectorAll('.slide');
    var segs = slider.querySelectorAll('.slider-seg');
    var toggle = slider.querySelector('[data-toggle]');
    var toggleIcon = slider.querySelector('[data-toggle-icon]');
    var cur = 0, timer = null, playing = !reduce, hold = false;
    slider.querySelector('.slider-bar').hidden = false;
    slider.querySelectorAll('.slider-arrow').forEach(function (b) { b.hidden = false; });
    function show(n) {
      if (n !== cur) deferImgs();
      cur = (n + slides.length) % slides.length;
      for (var i = 0; i < slides.length; i++) {
        var on = i === cur;
        slides[i].classList.toggle('is-active', on);
        if (on) { slides[i].removeAttribute('aria-hidden'); slides[i].removeAttribute('inert'); }
        else { slides[i].setAttribute('aria-hidden', 'true'); slides[i].setAttribute('inert', ''); }
        segs[i].classList.toggle('is-done', i < cur);
        if (on) segs[i].setAttribute('aria-current', 'true'); else segs[i].removeAttribute('aria-current');
      }
      // 重新開始目前這段進度條的動畫
      var note = slider.querySelector('[data-slider-note]'); if (note) note.textContent = slides[cur].getAttribute('data-note') || note.textContent;
      var span = segs[cur].querySelector('span');
      span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
      slider.querySelectorAll('[aria-controls]').forEach(function (b) { b.setAttribute('aria-controls', 'slide-' + (cur + 1)); });
      var nx = slides[(cur + 1) % slides.length].querySelector('img');
      if (nx && nx.loading === 'lazy') nx.loading = 'eager';
    }
    function schedule() {
      clearTimeout(timer);
      var run = playing && !hold && !document.hidden;
      slider.classList.toggle('is-paused', !run);
      if (run) timer = setTimeout(function () { show(cur + 1); schedule(); }, 6000);
    }
    function setPlaying(p) {
      playing = p;
      slider.classList.toggle('is-static', !p);
      toggle.setAttribute('aria-label', p ? '暫停輪播' : '播放輪播');
      toggleIcon.textContent = p ? 'Ⅱ' : '▶';
      schedule();
    }
    function go(n) { show(n); schedule(); }
    slider.querySelector('[data-prev]').addEventListener('click', function () { go(cur - 1); });
    slider.querySelector('[data-next]').addEventListener('click', function () { go(cur + 1); });
    toggle.addEventListener('click', function () { setPlaying(!playing); });
    for (var d = 0; d < segs.length; d++) segs[d].addEventListener('click', function (e) { go(Number(e.currentTarget.getAttribute('data-go'))); });
    slider.addEventListener('mouseenter', function () { hold = true; schedule(); });
    slider.addEventListener('mouseleave', function () { hold = false; schedule(); });
    slider.addEventListener('focusin', function () { hold = true; schedule(); });
    slider.addEventListener('focusout', function (e) { if (!slider.contains(e.relatedTarget)) { hold = false; schedule(); } });
    document.addEventListener('visibilitychange', schedule);
    var sx = null;
    slider.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', function (e) {
      if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });
    // 開場轉場還在播放時，等它結束再開始計時，第一張才有完整的 6 秒
    var spl = document.getElementById('splash');
    if (spl && /is-on/.test(spl.className)) setTimeout(function () { show(0); setPlaying(playing); }, 1500);
    else setPlaying(playing);
  }

  // ---------- 游標（參考 Gehl）：反相圓點；連結上縮小；[data-cursor] 區域放大並顯示說明 ----------
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1033px)').matches;
  if (fine && !reduce) {
    document.documentElement.classList.add('has-cursor');
    var dot = document.createElement('div');
    dot.className = 'cursor'; dot.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span'); dot.appendChild(label);
    document.body.appendChild(dot);
    var tx = 0, ty = 0, cx = 0, cy = 0, running = false;
    function loop() {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      dot.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      if (Math.abs(tx - cx) > 0.3 || Math.abs(ty - cy) > 0.3) requestAnimationFrame(loop); else running = false;
    }
    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!dot.classList.contains('is-on')) { cx = tx; cy = ty; dot.classList.add('is-on'); }
      if (!running) { running = true; requestAnimationFrame(loop); }
      var el = e.target;
      var link = el.closest ? el.closest('a, button, label, input, textarea, select') : null;
      var zone = el.closest ? el.closest('[data-cursor]') : null;
      var mode = zone && !link ? zone.getAttribute('data-cursor') : '';
      dot.classList.toggle('is-link', !!link);
      dot.classList.toggle('is-arrow', mode === '←' || mode === '→');
      dot.classList.toggle('is-big', !!mode && mode !== '←' && mode !== '→');
      label.textContent = mode;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { dot.classList.remove('is-on'); });
  }

  // 輪播：滑鼠在左半邊顯示 ←、右半邊顯示 →，點一下切換（鍵盤仍可用左右按鈕）
  var sl = document.querySelector('[data-slider]');
  if (sl) {
    sl.addEventListener('mousemove', function (e) {
      var r = sl.getBoundingClientRect();
      sl.setAttribute('data-cursor', e.clientX < r.left + r.width / 2 ? '←' : '→');
    });
    sl.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;
      var r = sl.getBoundingClientRect();
      var btn = sl.querySelector(e.clientX < r.left + r.width / 2 ? '[data-prev]' : '[data-next]');
      if (btn) btn.click();
    });
  }

  // 首頁捲動換色：段落標記越過畫面 70% 高度時，整頁底色漸變到該標記的顏色
  var marks = document.querySelectorAll('.bg-mark');
  var header = document.querySelector('.site-header');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  if (marks.length || (document.body.classList.contains('page-home') && header)) {
    var ticking = false;
    var update = function () {
      ticking = false;
      if (marks.length) {
        var line = window.innerHeight * 0.7, c = marks[0].getAttribute('data-bg-up');
        for (var m = 0; m < marks.length; m++) if (marks[m].getBoundingClientRect().top < line) c = marks[m].getAttribute('data-bg');
        if (c && document.body.style.getPropertyValue('--page-bg') !== c) {
          document.body.style.setProperty('--page-bg', c);
          if (themeMeta) themeMeta.setAttribute('content', c);
          var h = parseInt(c.slice(1), 16), lum = ((h >> 16) * 299 + ((h >> 8) & 255) * 587 + (h & 255) * 114) / 1000;
          document.body.classList.toggle('is-dark', lum < 110);
        }
      }
      var hero = document.querySelector('[data-slider]');
      if (hero && header) header.classList.toggle('is-solid', hero.getBoundingClientRect().bottom < 72);
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // 可橫向捲動的清單（核心業務、作品圖廊）：滑鼠可拖曳；拖曳後放開不觸發連結
  if (fine) {
    document.querySelectorAll('[data-drag]').forEach(function (box) {
      var down = false, sx0 = 0, sl0 = 0, moved = false;
      box.addEventListener('mousedown', function (e) { if (e.button !== 0) return; down = true; moved = false; sx0 = e.pageX; sl0 = box.scrollLeft; e.preventDefault(); });
      window.addEventListener('mousemove', function (e) { if (!down) return; var dx = e.pageX - sx0; if (Math.abs(dx) > 4) { moved = true; box.classList.add('is-dragging'); } box.scrollLeft = sl0 - dx; });
      window.addEventListener('mouseup', function () { if (!down) return; down = false; setTimeout(function () { box.classList.remove('is-dragging'); }, 0); });
      box.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      box.querySelectorAll('img').forEach(function (im) { im.setAttribute('draggable', 'false'); });
    });
  }

  // 宜蘭的土地：相片堆疊。點兩側照片或箭頭切換，中間一張放大；手機可左右滑
  (function () {
    var box = document.querySelector('[data-land]'); if (!box) return;
    var items = [].slice.call(box.querySelectorAll('.land-item')), n = items.length; if (n < 2) return;
    var ctrl = box.querySelector('.land-ctrl'), num = box.querySelector('[data-land-n]'), cur = 0;
    box.classList.add('is-live'); if (ctrl) ctrl.hidden = false;
    function show(i) {
      cur = (i + n) % n;
      items.forEach(function (el, k) {
        var d = k - cur; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
        el.setAttribute('data-pos', Math.abs(d) <= 2 ? String(d) : 'hide');
        el.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
        var img = el.querySelector('img'); if (img && Math.abs(d) <= 2) img.loading = 'eager';
      });
      if (num) num.textContent = String(cur + 1).padStart(2, '0');
    }
    items.forEach(function (el, k) { el.addEventListener('click', function () { if (k !== cur) show(k); }); });
    box.querySelector('[data-land-prev]').addEventListener('click', function () { show(cur - 1); });
    box.querySelector('[data-land-next]').addEventListener('click', function () { show(cur + 1); });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    box.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
    show(0);
  })();

  // 換頁轉場（參考 Gehl）：點站內連結時，沙色從下往上蓋住、換一張插圖，再前往新頁面
  var sp = window.rrSplash;
  if (sp && !sp.reduce) {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      sp.setImg(sp.pick());
      sp.el.className = 'splash is-cover';
      setTimeout(function () { location.href = url.href; }, 650);
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) sp.el.className = 'splash'; });
  }
})();
