// הופך PDF לרשימת תמונות עמודים בסדר הקריאה.
// mode: "portrait" (עומד, עמוד אחד לכל דף), "landscape" (שוכב, כל דף נחתך לשני חצאים) או "auto".
// סדר העלון השוכב לכל זוג דפים A (עליון) ו-B (תחתון): A שמאל, B ימין, B שמאל, A ימין.
(function () {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
  var MAX_H = 1600;

  function toBlob(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.88); });
  }

  async function renderSheet(page, split) {
    var base = page.getViewport({ scale: 1 });
    var scale = Math.min(3, MAX_H / base.height);
    var vp = page.getViewport({ scale: scale });
    var full = document.createElement('canvas');
    full.width = Math.round(vp.width);
    full.height = Math.round(vp.height);
    var ctx = full.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, full.width, full.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (!split) return [await toBlob(full)];
    var half = Math.floor(full.width / 2);
    var out = [];
    for (var i = 0; i < 2; i++) {
      var c = document.createElement('canvas');
      c.width = half; c.height = full.height;
      c.getContext('2d').drawImage(full, i * half, 0, half, full.height, 0, 0, half, full.height);
      out.push(await toBlob(c)); // i=0 שמאל, i=1 ימין
    }
    return out;
  }

  window.renderPdfPages = async function (source, opts) {
    opts = opts || {};
    var task = pdfjsLib.getDocument(source);
    var pdf = await task.promise;
    var first = await pdf.getPage(1);
    var v = first.getViewport({ scale: 1 });
    var mode = opts.mode || 'auto';
    var split = mode === 'landscape' || (mode === 'auto' && v.width > v.height * 1.1);
    var sheets = [];
    for (var n = 1; n <= pdf.numPages; n++) {
      var p = n === 1 ? first : await pdf.getPage(n);
      sheets.push(await renderSheet(p, split));
      if (opts.onProgress) opts.onProgress(n, pdf.numPages);
    }
    var blobs = [];
    if (!split) {
      sheets.forEach(function (s) { blobs.push(s[0]); });
    } else {
      for (var i = 0; i < sheets.length; i += 2) {
        var A = sheets[i], B = sheets[i + 1];
        if (!B) { blobs.push(A[0], A[1]); break; }
        blobs.push(A[0], B[1], B[0], A[1]); // A שמאל, B ימין, B שמאל, A ימין
      }
    }
    var first0 = blobs[0];
    var dim = await new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); };
      im.src = URL.createObjectURL(first0);
    });
    return {
      urls: blobs.map(function (b) { return URL.createObjectURL(b); }),
      width: dim.w, height: dim.h, split: split, sheets: pdf.numPages
    };
  };
})();
