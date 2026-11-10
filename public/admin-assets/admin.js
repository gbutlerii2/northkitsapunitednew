/* Admin panel page behaviour. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };

  // ---- log in ----
  var login = $('#login-form');
  if (login) {
    login.addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('#login-error');
      err.classList.add('hidden');
      var btn = login.querySelector('button');
      btn.disabled = true;
      try {
        var r = await nkuApi('/api/admin/login', 'POST', { email: $('#email').value, password: $('#password').value });
        location.href = r.mustChangePassword ? '/admin-panel/users' : login.dataset.next || '/admin-panel';
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }

  // ---- log out ----
  $$('#nku-logout, #nku-logout-m').forEach(function (b) {
    b.addEventListener('click', async function () {
      await nkuApi('/api/admin/logout', 'POST', {}).catch(function () {});
      location.href = '/admin-panel';
    });
  });

  // ---- pages: reset ----
  $$('[data-reset-path]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!confirm('Put ' + b.dataset.resetPath + ' back to its original text? Your edits are kept in History, so this can be undone.')) return;
      try {
        for (var id of b.dataset.resetIds.split(',')) {
          await nkuApi('/api/admin/region', 'POST', { action: 'reset', path: b.dataset.resetPath, id: id });
        }
        location.reload();
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  });

  // ---- news list: delete ----
  $$('[data-delete-news]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!confirm('Delete "' + b.dataset.title + '"? This cannot be undone.')) return;
      try {
        await nkuApi('/api/admin/news', 'DELETE', { id: b.dataset.deleteNews });
        location.reload();
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  });

  // ---- news edit ----
  var form = $('#news-form');
  if (form) {
    var rte = window.nkuRte($('#body-editor'));
    var cover = $('#cover-drop');
    var setCover = function (url) {
      $('#image').value = url || '';
      $('#cover-preview').src = url || '';
      $('#cover-preview').classList.toggle('hidden', !url);
      $('#cover-hint').classList.toggle('hidden', !!url);
    };
    var uploadCover = async function (file) {
      if (!file) return;
      cover.classList.add('busy');
      try {
        var r = await nkuUpload(file);
        setCover(r.url);
        dirty = true;
      } catch (ex) { nkuToast(ex.message, 'error'); }
      cover.classList.remove('busy');
    };
    cover.addEventListener('click', async function () { uploadCover((await nkuPickFile())[0]); });
    cover.addEventListener('keydown', async function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); uploadCover((await nkuPickFile())[0]); } });
    cover.addEventListener('dragover', function (e) { e.preventDefault(); cover.classList.add('over'); });
    cover.addEventListener('dragleave', function () { cover.classList.remove('over'); });
    cover.addEventListener('drop', function (e) { e.preventDefault(); cover.classList.remove('over'); uploadCover(nkuImageFiles(e.dataTransfer)[0]); });
    $('#cover-remove').addEventListener('click', function () { setCover(''); dirty = true; });

    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    $('#body-editor').addEventListener('input', function () { dirty = true; });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        var r = await nkuApi('/api/admin/news', 'POST', {
          id: form.dataset.id || undefined,
          title: $('#title').value,
          date: $('#date').value,
          slug: $('#slug').value,
          summary: $('#summary').value,
          image: $('#image').value,
          imageAlt: $('#imageAlt').value,
          body: rte.getHtml(),
          published: $('#published').checked,
        });
        dirty = false;
        nkuToast(r.post.published ? 'Saved. The post is live.' : 'Saved as a draft.');
        if (!form.dataset.id) location.replace('/admin-panel/news/edit?id=' + r.post.id);
        else $('#slug').value = r.post.slug;
      } catch (ex) { nkuToast(ex.message, 'error'); }
      btn.disabled = false;
    });
  }

  // ---- media library ----
  var grid = $('#media-grid');
  if (grid) {
    var drop = $('#media-drop');
    var render = async function () {
      try {
        var r = await nkuApi('/api/admin/media');
        if (!r.items.length) { grid.innerHTML = '<p class="text-sm text-nku-gray-light col-span-full">No images uploaded yet.</p>'; return; }
        grid.innerHTML = '';
        r.items.forEach(function (it) {
          var card = document.createElement('div');
          card.className = 'nku-card p-2 text-xs';
          card.innerHTML = '<img loading="lazy" class="w-full h-32 object-cover rounded mb-2" alt=""><div class="truncate font-medium"></div><div class="text-nku-gray-light"></div><div class="flex gap-1 mt-2"><button class="nku-btn nku-btn-sm" data-a="copy">Copy link</button><button class="nku-btn nku-btn-sm nku-btn-danger" data-a="del">Delete</button></div>';
          card.querySelector('img').src = it.url;
          card.children[1].textContent = it.name;
          card.children[2].textContent = (it.size / 1024).toFixed(0) + ' KB · ' + (it.uploadedAt || '').slice(0, 10);
          card.querySelector('[data-a=copy]').onclick = function () {
            navigator.clipboard.writeText(location.origin + it.url).then(function () { nkuToast('Link copied'); });
          };
          card.querySelector('[data-a=del]').onclick = async function () {
            if (!confirm('Delete this image? Any page or post that uses it will show a broken image.')) return;
            try { await nkuApi('/api/admin/media', 'DELETE', { key: it.key }); render(); } catch (ex) { nkuToast(ex.message, 'error'); }
          };
          grid.appendChild(card);
        });
      } catch (ex) { nkuToast(ex.message, 'error'); }
    };
    var uploadMany = async function (files) {
      if (!files.length) return;
      drop.classList.add('busy');
      var ok = 0;
      for (var f of files) {
        try { await nkuUpload(f); ok++; } catch (ex) { nkuToast(f.name + ': ' + ex.message, 'error'); }
      }
      drop.classList.remove('busy');
      if (ok) nkuToast(ok + ' image' + (ok > 1 ? 's' : '') + ' uploaded');
      render();
    };
    drop.addEventListener('click', async function () { uploadMany(await nkuPickFile(true)); });
    drop.addEventListener('keydown', async function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); uploadMany(await nkuPickFile(true)); } });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); uploadMany(nkuImageFiles(e.dataTransfer)); });
    render();
  }

  // ---- form emails ----
  var fe = $('#form-emails');
  if (fe) {
    fe.addEventListener('submit', async function (e) {
      e.preventDefault();
      var perForm = {};
      $$('[data-kind]', fe).forEach(function (i) { perForm[i.dataset.kind] = i.value; });
      try {
        var r = await nkuApi('/api/admin/form-emails', 'POST', { action: 'save', defaultTo: $('#defaultTo').value, perForm: perForm, sendToTracker: $('#sendToTracker').checked, zeffyCardUrl: $('#zeffyCardUrl').value, zeffyEftUrl: $('#zeffyEftUrl').value });
        $('#defaultTo').value = r.settings.defaultTo;
        $$('[data-kind]', fe).forEach(function (i) { i.value = r.settings.perForm[i.dataset.kind] || ''; });
        nkuToast(r.settings.sendToTracker ? 'Saved. Forms go to the Tracker and email.' : 'Saved. Forms go to email only (Tracker off).');
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
    $('#form-emails-test').addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await nkuApi('/api/admin/form-emails', 'POST', { action: 'test', to: $('#testTo').value });
        nkuToast('Test email sent. Check your inbox (and spam folder).');
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  }

  // ---- users ----
  var pw = $('#pw-form');
  if (pw) {
    pw.addEventListener('submit', async function (e) {
      e.preventDefault();
      if ($('#newPassword').value !== $('#newPassword2').value) { nkuToast('The two new passwords do not match.', 'error'); return; }
      try {
        await nkuApi('/api/admin/users', 'POST', { action: 'password', currentPassword: $('#currentPassword').value, password: $('#newPassword').value });
        pw.reset();
        nkuToast('Password changed.');
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  }
  var add = $('#add-user-form');
  if (add) {
    add.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        await nkuApi('/api/admin/users', 'POST', { action: 'add', email: $('#newEmail').value, name: $('#newName').value, password: $('#newUserPassword').value });
        location.reload();
      } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  }
  $$('[data-remove-user]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!confirm('Remove ' + b.dataset.removeUser + '? They will no longer be able to log in.')) return;
      try { await nkuApi('/api/admin/users', 'POST', { action: 'remove', email: b.dataset.removeUser }); location.reload(); } catch (ex) { nkuToast(ex.message, 'error'); }
    });
  });
})();
