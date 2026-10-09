(function () {
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var slug = (params.get('s') || '').replace(/[^a-zA-Z0-9_-]/g, '');

  function fail(msg) {
    $('title').textContent = 'עלון';
    $('status').innerHTML = '<p class="err">' + msg + '</p>';
  }

  function blankPage() {
    var c = document.createElement('canvas');
    c.width = 10; c.height = 14;
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 10, 14);
    return c.toDataURL('image/png');
  }

  async function main() {
    if (!slug) return fail('הקישור חסר מזהה בית ספר. בקשו קישור מעודכן.');
    var res = await fetch('data/' + slug + '.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return fail('העלון לא נמצא. ייתכן שהקישור שגוי או שהעלון עדיין בהעלאה, נסו שוב בעוד דקה.');
    var info = await res.json();
    document.title = info.name + ' - עלון';
    $('title').textContent = info.name;

    var rtl = info.dir !== 'ltr';
    $('statusText').textContent = 'מכין את העלון לדפדוף…';
    var out;
    try {
      if (info.images) {
        // עמודים מוכנים מראש (מהר). שמירה במטמון הדפדפן לפי גרסה.
        var urls = info.images.map(function (f) { return 'issues/' + info.folder + '/' + f; });
        var done = 0;
        await Promise.all(urls.map(function (u) {
          return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { done++; $('progressBar').style.width = Math.round(done / urls.length * 100) + '%'; res(); };
            im.onerror = function () { rej(new Error('img ' + u)); };
            im.src = u;
          });
        }));
        out = { urls: urls, width: info.width, height: info.height };
      } else {
        out = await renderPdfPages({ url: 'pdfs/' + info.pdf + '?v=' + encodeURIComponent(info.updated || '') }, {
          mode: info.mode || 'auto',
          onProgress: function (n, total) { $('progressBar').style.width = Math.round(n / total * 100) + '%'; }
        });
      }
    } catch (e) {
      console.error(e);
      return fail('לא הצלחנו לטעון את קובץ העלון. נסו לרענן, ואם זה לא עוזר בקשו קישור מעודכן.');
    }

    var pages = out.urls.slice();
    var realCount = pages.length;
    if (pages.length % 2) pages.push(blankPage());
    var n = pages.length;
    var ordered = rtl ? pages.slice().reverse() : pages;

    var book = $('book');
    book.hidden = false;
    $('status').hidden = true;
    $('controls').hidden = false;
    $('controls').dir = rtl ? 'rtl' : 'ltr';

        var ratio = out.width / out.height;
    function fit() {
      // הספר מתאים לרוחב המסך (לא לגובה), כדי שהטקסט יהיה גדול וחד; המסך גולל אנכית
      var st = $('stage');
      var w = st.clientWidth - 16;
      // עמוד אחד בכל פעם, גדול ככל האפשר (עד 1500px), כמו מצב ההגדלה
      var portrait = true;
      var pageW = Math.min(w, 1500);
      var pageH = pageW / ratio;
      book.style.width = (portrait ? pageW : pageW * 2) + 'px';
      book.style.height = pageH + 'px';
    }
    fit();
    // עמוד בודד תמיד: ספריית הדפדוף עוברת לתצוגת עמוד אחד כשרוחב הספר קטן מפי 2 מ-minWidth
    var flipMin = Math.min(800, Math.floor(parseInt(book.style.width, 10) * 0.9));

    var flip = new St.PageFlip(book, {
      width: out.width, height: out.height,
      size: 'stretch', minWidth: flipMin, maxWidth: 1600, minHeight: 280, maxHeight: 3200,
      showCover: true, usePortrait: true, mobileScrollSupport: false,
      drawShadow: true, maxShadowOpacity: 0.45, flippingTime: 800,
      startPage: rtl ? n - 1 : 0, autoSize: true
    });
    flip.loadFromImages(ordered);

    function label() {
      var i = flip.getCurrentPageIndex();
      var r = function (k) { return rtl ? n - k : k + 1; }; // מספר עמוד בסדר קריאה (מ-1)
      var single = flip.getOrientation() === 'portrait' || i === 0 || i === n - 1;
      var a = r(i), b = single ? a : r(i + 1);
      var lo = Math.min(a, b), hi = Math.max(a, b);
      lo = Math.min(lo, realCount); hi = Math.min(hi, realCount);
      $('pageInfo').textContent = lo === hi ? 'עמוד ' + lo + ' מתוך ' + realCount : 'עמודים ' + lo + '-' + hi + ' מתוך ' + realCount;
    }
    flip.on('flip', label);
    flip.on('changeOrientation', label);
    label();

    var forward = function () { rtl ? flip.flipPrev() : flip.flipNext(); };
    var backward = function () { rtl ? flip.flipNext() : flip.flipPrev(); };
    $('nextBtn').onclick = forward;
    $('prevBtn').onclick = backward;
    document.addEventListener('keydown', function (e) {
      if (!$('reader').hidden) return;
      if (e.key === 'ArrowLeft') { rtl ? forward() : backward(); }
      if (e.key === 'ArrowRight') { rtl ? backward() : forward(); }
    });
    $('fsBtn').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    };
    // קריאה בהגדלה: העמוד/ים הנוכחיים ברזולוציה מלאה, עם זום וגלילה
    var zoom = 1;
    function visible() {
      var i = flip.getCurrentPageIndex();
      var single = flip.getOrientation() === 'portrait' || i === 0 || i === n - 1;
      return single ? [i] : [i, i + 1];
    }
    function renderReader() {
      var idx = visible().filter(function (k) { return ordered[k] && ordered[k].indexOf('data:') !== 0; });
      var sc = $('rScroll');
      var base = Math.min(sc.clientWidth - 16, 1000 * idx.length) / idx.length;
      var box = $('rPages'); box.innerHTML = '';
      idx.forEach(function (k) {
        var im = new Image(); im.src = ordered[k]; im.alt = 'עמוד'; im.style.width = Math.round(base * zoom) + 'px'; box.appendChild(im);
      });
      $('rZoom').textContent = Math.round(zoom * 100) + '%';
      $('rInfo').textContent = $('pageInfo').textContent;
    }
    function go(fwd) {
      var next = rtl ? !fwd : fwd;
      next ? flip.turnToNextPage() : flip.turnToPrevPage();
      label(); renderReader(); $('rScroll').scrollTo(0, 0);
    }
    function setZoom(z) { zoom = Math.max(1, Math.min(3, z)); renderReader(); }
    $('zoomBtn').onclick = function () { zoom = 1; $('reader').hidden = false; label(); renderReader(); $('rClose').focus(); };
    $('rClose').onclick = function () { $('reader').hidden = true; $('zoomBtn').focus(); };
    $('rPlus').onclick = function () { setZoom(zoom + 0.5); };
    $('rMinus').onclick = function () { setZoom(zoom - 0.5); };
    $('rNext').onclick = function () { go(true); };
    $('rPrev').onclick = function () { go(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('reader').hidden) $('rClose').onclick(); });
    window.addEventListener('resize', function () { if (!$('reader').hidden) renderReader(); });
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        fit();
        if (parseInt(book.style.width, 10) >= 2 * flipMin) return location.reload();
        flip.update(); label();
      }, 150);
    });
  }

  main().catch(function (e) { console.error(e); fail('אירעה תקלה בטעינה. נסו לרענן.'); });
})();
