(function () {
  var OWNER = 'Abrahamgersten', REPO = 'alonim-flipbook', BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/';
  var BASE = location.origin + location.pathname.replace(/admin\.html$/, '');
  var $ = function (id) { return document.getElementById(id); };
  var schools = {};

  // קישור התקנה חד-פעמי: admin.html#t=TOKEN
  if (location.hash.indexOf('#t=') === 0) {
    localStorage.setItem('alonim_token', decodeURIComponent(location.hash.slice(3)));
    history.replaceState(null, '', location.pathname);
  }
  function token() { return localStorage.getItem('alonim_token') || ''; }

  function say(text, err) {
    var m = $('msg'); m.hidden = false; m.textContent = text; m.className = 'msg' + (err ? ' err' : '');
  }

  async function gh(path, opts) {
    opts = opts || {};
    var r = await fetch(API + path + (opts.method ? '' : '?ref=' + BRANCH + '&t=' + Date.now()), {
      method: opts.method || 'GET',
      headers: { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (r.status === 404 && !opts.method) return null;
    if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r.json();
  }

  function b64FromBuffer(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function b64FromText(t) { return btoa(unescape(encodeURIComponent(t))); }
  function textFromB64(b) { return decodeURIComponent(escape(atob(b.replace(/\n/g, '')))); }

  async function put(path, contentB64, message, sha) {
    var body = { message: message, content: contentB64, branch: BRANCH };
    if (sha) body.sha = sha;
    return gh(path, { method: 'PUT', body: body });
  }
  async function del(path, sha, message) {
    return gh(path, { method: 'DELETE', body: { message: message, sha: sha, branch: BRANCH } });
  }

  // מוחק את קבצי העלון הקודם (תיקיית תמונות, או PDF בפורמט הישן)
  async function removeIssue(x) {
    if (x.folder) {
      var files = await gh('issues/' + x.folder);
      for (var i = 0; i < (files || []).length; i++) await del('issues/' + x.folder + '/' + files[i].name, files[i].sha, 'remove old page');
    } else if (x.pdf) {
      var p = await gh('pdfs/' + x.pdf);
      if (p) await del('pdfs/' + x.pdf, p.sha, 'remove old pdf');
    }
  }

  async function loadSchools() {
    schools = {};
    var dir = await gh('data');
    var files = (dir || []).filter(function (f) { return /\.json$/.test(f.name); });
    for (var i = 0; i < files.length; i++) {
      var f = await gh('data/' + files[i].name);
      var info = JSON.parse(textFromB64(f.content));
      info.slug = files[i].name.replace(/\.json$/, '');
      info._sha = f.sha;
      schools[info.slug] = info;
    }
    render();
  }

  function render() {
    var sel = $('school'), keep = sel.value;
    sel.innerHTML = '<option value="">+ בית ספר חדש</option>';
    Object.keys(schools).forEach(function (s) {
      var o = document.createElement('option'); o.value = s; o.textContent = schools[s].name; sel.appendChild(o);
    });
    sel.value = schools[keep] ? keep : '';
    onSchoolChange();

    var list = $('list');
    var slugs = Object.keys(schools);
    list.innerHTML = slugs.length ? '' : '<p class="hint">עדיין אין בתי ספר.</p>';
    slugs.forEach(function (s) {
      var x = schools[s], url = BASE + '?s=' + s;
      var d = document.createElement('div'); d.className = 'school';
      d.innerHTML = '<div class="name"></div><div class="meta"></div><div class="link"></div><div class="row"></div>';
      d.querySelector('.name').textContent = x.name;
      d.querySelector('.meta').textContent = 'עודכן: ' + new Date(x.updated).toLocaleString('he-IL') + ' · ' + (x.mode === 'auto' ? 'זיהוי אוטומטי' : x.mode === 'landscape' ? 'שוכב' : 'עומד');
      d.querySelector('.link').textContent = url;
      var row = d.querySelector('.row');
      function btn(t, cls, fn) { var b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t; b.onclick = fn; row.appendChild(b); }
      btn('העתקת קישור', '', function () { navigator.clipboard.writeText(url); this.textContent = 'הועתק ✓'; });
      btn('פתיחה', 'sec', function () { window.open(url, '_blank'); });
      btn('שליחה בוואטסאפ', 'sec', function () { window.open('https://wa.me/?text=' + encodeURIComponent('העלון של ' + x.name + ': ' + url), '_blank'); });
      btn('עדכון עלון', 'sec', function () { $('school').value = s; onSchoolChange(); $('uploadCard').scrollIntoView(); });
      btn('מחיקה', 'danger', async function () {
        if (!confirm('למחוק את ' + x.name + ' והקישור שלו?')) return;
        try {
          var j = await gh('data/' + s + '.json');
          await del('data/' + s + '.json', j.sha, 'delete ' + s);
          await removeIssue(x);
        } catch (e) { say(String(e), true); }
        loadSchools();
      });
      list.appendChild(d);
    });
  }

  function onSchoolChange() {
    var s = schools[$('school').value];
    $('newNameBox').hidden = !!s;
    $('formTitle').textContent = s ? 'עדכון עלון: ' + s.name : 'עלון חדש';
    if (s) { $('mode').value = s.mode || 'auto'; $('dir').value = s.dir || 'rtl'; }
  }

  function newSlug() {
    var a = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
    var r = crypto.getRandomValues(new Uint8Array(8));
    for (var i = 0; i < 8; i++) s += a[r[i] % a.length];
    return s;
  }

  async function upload() {
    var file = $('file').files[0];
    var existing = schools[$('school').value];
    var name = existing ? existing.name : $('name').value.trim();
    if (!name) return say('חסר שם בית ספר.', true);
    if (!file) return say('בחרו קובץ PDF.', true);
    if (file.size > 40 * 1024 * 1024) return say('הקובץ גדול מ-40MB. כווצו אותו ונסו שוב.', true);
    $('uploadBtn').disabled = true;
    try {
      say('מעלה את הקובץ…');
      var slug = existing ? existing.slug : newSlug();
      var stamp = Date.now();
      var folder = slug + '-' + stamp;
      say('מפרק את ה-PDF לעמודים…');
      var out = await renderPdfPages({ data: new Uint8Array(await file.arrayBuffer()) }, {
        mode: $('mode').value,
        onProgress: function (n, t) { say('מפרק את ה-PDF לעמודים… ' + n + '/' + t); }
      });
      var images = [];
      for (var k = 0; k < out.blobs.length; k++) {
        say('מעלה עמוד ' + (k + 1) + ' מתוך ' + out.blobs.length + '…');
        var fn = String(k + 1).padStart(2, '0') + '.jpg';
        await put('issues/' + folder + '/' + fn, b64FromBuffer(await out.blobs[k].arrayBuffer()), 'page ' + fn + ' ' + slug);
        images.push(fn);
      }
      var info = { name: name, mode: $('mode').value, dir: $('dir').value, folder: folder, images: images, width: out.width, height: out.height, updated: new Date(stamp).toISOString() };
      var cur = await gh('data/' + slug + '.json');
      await put('data/' + slug + '.json', b64FromText(JSON.stringify(info, null, 1)), 'update ' + slug, cur && cur.sha);
      if (existing) await removeIssue(existing);
      var url = BASE + '?s=' + slug;
      say('הועלה. ממתין שהאתר יתעדכן (בדרך כלל עד כדקה-שתיים)…');
      var ok = false;
      for (var i = 0; i < 60 && !ok; i++) {
        await new Promise(function (r) { setTimeout(r, 4000); });
        try {
          var a = await fetch(BASE + 'data/' + slug + '.json?t=' + Date.now(), { cache: 'no-store' });
          var j = a.ok && await a.json();
          if (j && j.folder === folder) { var b = await fetch(BASE + 'issues/' + folder + '/' + images[images.length - 1], { method: 'HEAD', cache: 'no-store' }); ok = b.ok; }
        } catch (e) {}
      }
      say(ok ? 'מוכן! הקישור: ' + url : 'הועלה, אבל האתר עוד לא התעדכן. נסו את הקישור בעוד כמה דקות: ' + url);
      $('file').value = ''; $('name').value = '';
      await loadSchools();
    } catch (e) {
      say('ההעלאה נכשלה: ' + e.message, true);
    }
    $('uploadBtn').disabled = false;
  }

  async function start() {
    if (!token()) { $('tokenCard').hidden = false; return; }
    $('tokenCard').hidden = true; $('uploadCard').hidden = false; $('listCard').hidden = false;
    try { await loadSchools(); }
    catch (e) { $('list').textContent = 'שגיאה בטעינה: ' + e.message; if (/401|403/.test(e.message)) { localStorage.removeItem('alonim_token'); $('tokenCard').hidden = false; } }
  }

  $('saveToken').onclick = function () { localStorage.setItem('alonim_token', $('token').value.trim()); start(); };
  $('school').onchange = onSchoolChange;
  $('uploadBtn').onclick = upload;
  start();
})();
