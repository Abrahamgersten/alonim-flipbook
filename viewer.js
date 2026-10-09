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
    var pdfUrl = 'pdfs/' + info.pdf + '?v=' + encodeURIComponent(info.updated || '');
    $('statusText').textContent = 'מכין את העלון לדפדוף…';
    var out;
    try {
      out = await renderPdfPages({ url: pdfUrl }, {
        mode: info.mode || 'auto',
        onProgress: function (n, total) { $('progressBar').style.width = Math.round(n / total * 100) + '%'; }
      });
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

    $('stage').style.overflow = 'hidden';
    var ratio = out.width / out.height;
    function fit() {
      var st = $('stage');
      var w = st.clientWidth - 16, h = st.clientHeight - 16;
      var portrait = w < h * 0.9 || w < 640;
      var pageW = Math.min(portrait ? w : w / 2, h * ratio);
      var pageH = pageW / ratio;
      book.style.width = (portrait ? pageW : pageW * 2) + 'px';
      book.style.height = pageH + 'px';
    }
    fit();

    var flip = new St.PageFlip(book, {
      width: out.width, height: out.height,
      size: 'stretch', minWidth: 200, maxWidth: 1400, minHeight: 280, maxHeight: 2000,
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
      if (e.key === 'ArrowLeft') { rtl ? forward() : backward(); }
      if (e.key === 'ArrowRight') { rtl ? backward() : forward(); }
    });
    $('fsBtn').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    };
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { fit(); flip.update(); label(); }, 150);
    });
  }

  main().catch(function (e) { console.error(e); fail('אירעה תקלה בטעינה. נסו לרענן.'); });
})();
