/*
 * NKU on-page editor. Loaded only for logged-in editors.
 * - Click text to edit it; select text for bold / italic / link.
 * - Hover a block for a handle: drag to move, add, duplicate, delete.
 * - Drop a photo onto an image to replace it, or onto text to insert it.
 * - Save writes each changed region to /api/admin/region.
 */
(function () {
  'use strict';

  var cfgEl = document.getElementById('nku-admin-data');
  var cfg = cfgEl ? JSON.parse(cfgEl.textContent || '{}') : {};
  var regions = Array.from(document.querySelectorAll('[data-nku-region]'));
  var pagePathAttr = regions[0] ? regions[0].getAttribute('data-nku-path') : location.pathname;

  var TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,summary,dt,dd';
  var SKIP_SEL = 'script,style,iframe,svg,noscript,button,input,select,textarea,video';
  var editing = false;
  var snapshots = {};
  var dirty = false;

  // ---------- small DOM helpers ----------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function btn(label, title, onClick, cls) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', onClick);
    return b;
  }
  function regionOf(node) {
    for (var i = 0; i < regions.length; i++) if (regions[i].contains(node)) return regions[i];
    return null;
  }
  function markDirty() { dirty = true; bar.classList.add('nku-ed-dirty'); }
  function isDecorative(img) {
    return img.getAttribute('alt') === '' && /pointer-events-none/.test(img.className);
  }
  function hasOwnText(node) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3 && c.textContent.trim()) return true;
    }
    return false;
  }
  function editableAncestor(node, region) {
    var n = node.parentElement;
    while (n && n !== region) {
      if (n.getAttribute('data-nku-ed') === 'text') return n;
      n = n.parentElement;
    }
    return null;
  }
  function closestEditable(node) {
    var n = node && node.nodeType === 3 ? node.parentElement : node;
    while (n && !n.hasAttribute('data-nku-region')) {
      if (n.getAttribute && n.getAttribute('data-nku-ed') === 'text') return n;
      n = n.parentElement;
    }
    return null;
  }
  // "Photo to come" placeholders from the site design.
  function isPhotoSlot(e) {
    return !!(e && e.classList && e.classList.contains('photo') && e.getAttribute('role') === 'img');
  }
  function isBlockish(e) {
    if (e.tagName === 'IMG' || e.tagName === 'LI') return true;
    var d = getComputedStyle(e).display;
    return d.indexOf('inline') !== 0 && d !== 'contents';
  }

  // ---------- admin bar ----------
  var bar = el('div', 'nku-ed-ui nku-ed-bar');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Site editor');
  var barLeft = el('div', 'nku-ed-bar-left');
  barLeft.appendChild(el('strong', '', 'NKU Admin'));
  var who = el('span', 'nku-ed-who');
  who.textContent = cfg.email || '';
  barLeft.appendChild(who);
  var barRight = el('div', 'nku-ed-bar-right');
  bar.appendChild(barLeft);
  bar.appendChild(barRight);

  var bEdit = btn('✎ Edit this page', 'Edit this page', function () { enterEdit(); }, 'nku-ed-primary');
  var bSave = btn('Save', 'Save changes', function () { save(); }, 'nku-ed-primary');
  var bCancel = btn('Cancel', 'Discard changes', function () { cancel(); });
  var bHistory = btn('History', 'Earlier versions of this page', function () { showHistory(); });
  var bPanel = el('a', 'nku-ed-link', 'Admin panel');
  bPanel.href = '/admin-panel';
  var bOut = btn('Log out', 'Log out', async function () {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    dirty = false;
    await nkuApi('/api/admin/logout', 'POST', {}).catch(function () {});
    location.reload();
  });

  function renderBar() {
    barRight.innerHTML = '';
    if (!regions.length) {
      var note = el('span', 'nku-ed-note', cfg.editable === 'none' ? 'This page is edited from the admin panel.' : '');
      barRight.appendChild(note);
    } else if (editing) {
      barRight.appendChild(el('span', 'nku-ed-note', 'Editing: click text to change it, drag ⠿ to move'));
      barRight.appendChild(bHistory);
      barRight.appendChild(bCancel);
      barRight.appendChild(bSave);
    } else {
      barRight.appendChild(bEdit);
    }
    barRight.appendChild(bPanel);
    barRight.appendChild(bOut);
  }
  document.body.appendChild(bar);
  document.body.classList.add('nku-ed-has-bar');
  renderBar();

  // ---------- serialising ----------
  function cleanRegionHtml(region) {
    var c = region.cloneNode(true);
    c.querySelectorAll('.nku-ed-ui, script').forEach(function (n) { n.remove(); });
    c.querySelectorAll('[data-nku-wasclosed]').forEach(function (n) { n.removeAttribute('open'); });
    c.querySelectorAll('*').forEach(function (n) {
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
      n.removeAttribute('data-nku-ed');
      n.removeAttribute('data-nku-wasclosed');
      if (n.getAttribute('draggable') === 'true' && n.hasAttribute('data-nku-drag')) n.removeAttribute('draggable');
      n.removeAttribute('data-nku-drag');
      if (n.classList && n.classList.length) {
        Array.from(n.classList).forEach(function (k) { if (k.indexOf('nku-ed-') === 0) n.classList.remove(k); });
        if (!n.classList.length) n.removeAttribute('class');
      }
    });
    return c.innerHTML.trim();
  }

  // ---------- making things editable ----------
  function makeEditable(root, region) {
    var nodes = [];
    if (root !== region && root.matches && (root.matches(TEXT_SEL) || hasOwnText(root))) nodes.push(root);
    root.querySelectorAll('*').forEach(function (n) {
      if (n.closest(SKIP_SEL) || n.closest('.nku-ed-ui')) return;
      if (n.matches(TEXT_SEL) || hasOwnText(n)) nodes.push(n);
    });
    nodes.forEach(function (n) {
      if (n.getAttribute('data-nku-ed') === 'text') return;
      // Labels wrapping an input etc.: typing there could delete the field.
      if (n.querySelector('input,select,textarea,button')) return;
      if (editableAncestor(n, region)) return;
      n.setAttribute('data-nku-ed', 'text');
      n.setAttribute('contenteditable', 'true');
      n.setAttribute('spellcheck', 'true');
    });
  }

  function enterEdit() {
    if (editing || !regions.length) return;
    editing = true;
    document.body.classList.add('nku-ed-editing');
    regions.forEach(function (r) {
      snapshots[r.getAttribute('data-nku-region')] = cleanRegionHtml(r);
      r.querySelectorAll('details:not([open])').forEach(function (d) { d.setAttribute('open', ''); d.setAttribute('data-nku-wasclosed', ''); });
      makeEditable(r, r);
    });
    renderBar();
    nkuToast('Editing on. Click any text to change it.');
  }

  function changedRegions() {
    return regions.filter(function (r) { return cleanRegionHtml(r) !== snapshots[r.getAttribute('data-nku-region')]; });
  }

  async function save() {
    var changed = changedRegions();
    if (!changed.length) { nkuToast('No changes to save.'); return; }
    bSave.disabled = true;
    bSave.textContent = 'Saving…';
    try {
      for (var i = 0; i < changed.length; i++) {
        var r = changed[i];
        await nkuApi('/api/admin/region', 'POST', {
          action: 'save',
          path: r.getAttribute('data-nku-path'),
          id: r.getAttribute('data-nku-region'),
          html: cleanRegionHtml(r),
        });
      }
      dirty = false;
      nkuToast('Saved. Your changes are live.');
      setTimeout(function () { location.reload(); }, 700);
    } catch (ex) {
      nkuToast(ex.status === 401 ? 'Your login has expired. Open the admin panel in a new tab, log in, then click Save again.' : ex.message, 'error');
      bSave.disabled = false;
      bSave.textContent = 'Save';
    }
  }

  function cancel() {
    if (changedRegions().length && !confirm('Throw away your unsaved changes?')) return;
    dirty = false;
    location.reload();
  }

  window.addEventListener('beforeunload', function (e) {
    if (editing && dirty && changedRegions().length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- history ----------
  async function showHistory() {
    var overlay = el('div', 'nku-ed-ui nku-ed-modal-bg');
    var modal = el('div', 'nku-ed-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Page history');
    modal.appendChild(el('h2', '', 'Page history'));
    var body = el('div', '', '<p>Loading…</p>');
    modal.appendChild(body);
    var close = btn('Close', 'Close', function () { overlay.remove(); });
    modal.appendChild(close);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    body.innerHTML = '';
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      var id = r.getAttribute('data-nku-region');
      var path = r.getAttribute('data-nku-path');
      var sec = el('div', 'nku-ed-hist');
      if (regions.length > 1) sec.appendChild(el('h3', '', 'Section: ' + id));
      try {
        var data = await nkuApi('/api/admin/region?path=' + encodeURIComponent(path) + '&id=' + encodeURIComponent(id));
        var list = el('ul');
        if (!data.versions.length) list.appendChild(el('li', '', '<em>No earlier versions yet.</em>'));
        data.versions.forEach(function (v) {
          var li = el('li');
          var when = new Date(v.updatedAt).toLocaleString();
          li.appendChild(el('span', '', when + ' · ' + (v.updatedBy || '')));
          li.appendChild(btn('Restore', 'Restore this version', (function (ts, p, rid) {
            return async function () {
              if (!confirm('Restore the version from ' + when + '?')) return;
              try { await nkuApi('/api/admin/region', 'POST', { action: 'restore', path: p, id: rid, ts: ts }); dirty = false; location.reload(); }
              catch (ex) { nkuToast(ex.message, 'error'); }
            };
          })(v.ts, path, id)));
          list.appendChild(li);
        });
        sec.appendChild(list);
        sec.appendChild(btn('Reset to original', 'Go back to the text the site was built with', (function (p, rid) {
          return async function () {
            if (!confirm('Put this back to the original text? (Your current version is kept in history.)')) return;
            try { await nkuApi('/api/admin/region', 'POST', { action: 'reset', path: p, id: rid }); dirty = false; location.reload(); }
            catch (ex) { nkuToast(ex.message, 'error'); }
          };
        })(path, id), 'nku-ed-danger'));
      } catch (ex) {
        sec.appendChild(el('p', '', ex.message));
      }
      body.appendChild(sec);
    }
  }

  // ---------- formatting toolbar ----------
  var fmt = el('div', 'nku-ed-ui nku-ed-fmt');
  fmt.setAttribute('role', 'toolbar');
  fmt.setAttribute('aria-label', 'Text formatting');
  var savedRange = null;
  function exec(cmd, arg) {
    if (savedRange) { var s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
    document.execCommand(cmd, false, arg || null);
    markDirty();
    updateFmt();
  }
  function currentLink() {
    var s = getSelection();
    if (!s.rangeCount) return null;
    var n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode);
    return n ? n.closest('a') : null;
  }
  fmt.appendChild(btn('<b>B</b>', 'Bold', function () { exec('bold'); }));
  fmt.appendChild(btn('<i>I</i>', 'Italic', function () { exec('italic'); }));
  fmt.appendChild(btn('<u>U</u>', 'Underline', function () { exec('underline'); }));
  fmt.appendChild(btn('🔗', 'Add or change link', function () {
    var a = currentLink();
    var url = prompt('Link address (https://…, /page, or an email address):', a ? a.getAttribute('href') : 'https://');
    if (url === null) return;
    if (url === '') { exec('unlink'); return; }
    if (/^[^\s@/]+@[^\s@]+$/.test(url)) url = 'mailto:' + url;
    if (a) { a.setAttribute('href', url); markDirty(); }
    else exec('createLink', url);
  }));
  fmt.appendChild(btn('Unlink', 'Remove link', function () {
    var a = currentLink();
    if (a && getSelection().isCollapsed) { a.replaceWith.apply(a, Array.from(a.childNodes)); markDirty(); }
    else exec('unlink');
  }));
  fmt.appendChild(btn('Clear', 'Remove bold/italic/etc.', function () { exec('removeFormat'); }));
  document.body.appendChild(fmt);

  function updateFmt() {
    if (!editing) { fmt.classList.remove('show'); return; }
    var s = getSelection();
    if (!s.rangeCount) { fmt.classList.remove('show'); return; }
    var host = closestEditable(s.anchorNode);
    if (!host || (s.isCollapsed && !currentLink())) { fmt.classList.remove('show'); return; }
    savedRange = s.getRangeAt(0).cloneRange();
    var rect = savedRange.getBoundingClientRect();
    if (!rect.width && !rect.height) rect = host.getBoundingClientRect();
    fmt.classList.add('show');
    var top = rect.top + window.scrollY - fmt.offsetHeight - 8;
    if (top < window.scrollY + 70) top = rect.bottom + window.scrollY + 8;
    var left = Math.max(8, Math.min(rect.left + window.scrollX + rect.width / 2 - fmt.offsetWidth / 2, window.scrollX + document.documentElement.clientWidth - fmt.offsetWidth - 8));
    fmt.style.top = top + 'px';
    fmt.style.left = left + 'px';
  }
  document.addEventListener('selectionchange', updateFmt);

  // ---------- block handle (move / add / duplicate / delete) ----------
  var handle = el('div', 'nku-ed-ui nku-ed-handle');
  var grip = el('span', 'nku-ed-grip', '⠿');
  grip.title = 'Drag to move';
  grip.setAttribute('draggable', 'true');
  handle.appendChild(grip);
  var hoverBlock = null;
  handle.appendChild(btn('+', 'Add a paragraph below', function () { if (hoverBlock) addAfter(hoverBlock); }));
  handle.appendChild(btn('⧉', 'Duplicate', function () { if (hoverBlock) duplicate(hoverBlock); }));
  handle.appendChild(btn('🗑', 'Delete', function () { if (hoverBlock) removeBlock(hoverBlock); }));
  document.body.appendChild(handle);

  function blockFor(node) {
    var n = node && node.nodeType === 3 ? node.parentElement : node;
    var region = n && regionOf(n);
    if (!region || (n.closest && n.closest('.nku-ed-ui'))) return null;
    var candidate = null;
    while (n && n !== region) {
      if (n.tagName === 'IMG' && !isDecorative(n)) return n;
      if (isPhotoSlot(n)) return n;
      if (n.getAttribute && n.getAttribute('data-nku-ed') === 'text') candidate = n;
      n = n.parentElement;
    }
    if (candidate && !isBlockish(candidate)) {
      // Inline editable (e.g. a button-style link): use its nearest block parent instead.
      var p = candidate.parentElement;
      while (p && p !== region && !isBlockish(p)) p = p.parentElement;
      return p && p !== region ? p : null;
    }
    return candidate;
  }

  function placeHandle(block) {
    hoverBlock = block;
    if (!block) { handle.classList.remove('show'); return; }
    var r = block.getBoundingClientRect();
    handle.classList.add('show');
    var left = r.left + window.scrollX - handle.offsetWidth - 6;
    if (left < 4) left = r.left + window.scrollX + 4;
    handle.style.left = left + 'px';
    handle.style.top = r.top + window.scrollY + 'px';
  }

  document.addEventListener('mousemove', function (e) {
    if (!editing || dragging) return;
    // Leave the handle where it is while a button is held (dragging or selecting text).
    if (e.buttons & 1) return;
    if (handle.contains(e.target)) return;
    var b = blockFor(e.target);
    if (b !== hoverBlock) {
      if (hoverBlock) hoverBlock.classList.remove('nku-ed-hover');
      if (b) b.classList.add('nku-ed-hover');
      placeHandle(b);
    }
  });

  function placeCaret(node, atEnd) {
    var r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!atEnd);
    var s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    node.focus && node.focus();
  }

  function newSiblingFor(block) {
    var tag = block.tagName === 'LI' ? 'li' : 'p';
    var n = document.createElement(tag);
    if (block.tagName === 'P' || block.tagName === 'LI') n.className = block.className.replace(/\bnku-ed-\S+/g, '').trim();
    if (!n.className) n.removeAttribute('class');
    return n;
  }

  function addAfter(block) {
    var n = newSiblingFor(block);
    n.innerHTML = '<br>';
    block.after(n);
    makeEditable(n, regionOf(n));
    placeCaret(n);
    markDirty();
  }

  function duplicate(block) {
    var c = block.cloneNode(true);
    c.classList.remove('nku-ed-hover');
    block.after(c);
    makeEditable(c, regionOf(c));
    markDirty();
  }

  function removeBlock(block) {
    var parent = block.parentNode;
    var next = block.nextSibling;
    block.classList.remove('nku-ed-hover');
    block.remove();
    placeHandle(null);
    markDirty();
    showUndo(function () { parent.insertBefore(block, next); });
  }

  function showUndo(fn) {
    var t = document.getElementById('nku-ed-undo');
    if (t) t.remove();
    t = el('div', 'nku-ed-ui nku-ed-undo', 'Deleted. ');
    t.id = 'nku-ed-undo';
    t.appendChild(btn('Undo', 'Undo delete', function () { fn(); t.remove(); markDirty(); }));
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 8000);
  }

  // Drag to move.
  var dragging = null;
  var dropLine = el('div', 'nku-ed-ui nku-ed-dropline');
  document.body.appendChild(dropLine);
  var dropTarget = null;

  grip.addEventListener('dragstart', function (e) {
    if (!hoverBlock) { e.preventDefault(); return; }
    dragging = hoverBlock;
    dragging.classList.add('nku-ed-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'nku-block');
    try { e.dataTransfer.setDragImage(dragging, 10, 10); } catch (ex) { /* ignore */ }
  });
  grip.addEventListener('dragend', function () { endDrag(); });

  function endDrag() {
    if (dragging) dragging.classList.remove('nku-ed-dragging');
    dragging = null;
    dropTarget = null;
    dropLine.classList.remove('show');
  }

  function computeDrop(e) {
    var t = blockFor(document.elementFromPoint(e.clientX, e.clientY));
    if (!t || !dragging || t === dragging || dragging.contains(t) || t.contains(dragging)) return null;
    // List items move within lists; other blocks don't go inside lists.
    if (dragging.tagName === 'LI' && t.tagName !== 'LI') return null;
    if (dragging.tagName !== 'LI' && t.tagName === 'LI') t = t.closest('ul,ol') || t;
    var r = t.getBoundingClientRect();
    var sideways = r.height > 0 && r.width < 0.6 * (t.parentElement ? t.parentElement.getBoundingClientRect().width : r.width) && getComputedStyle(t.parentElement).display.indexOf('flex') >= 0;
    var before = sideways ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    return { target: t, before: before, rect: r, sideways: sideways };
  }

  // ---------- file drops (images) ----------
  function hasFiles(e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0; }
  var fileHover = null;

  document.addEventListener('dragover', function (e) {
    if (!editing) { if (hasFiles(e)) e.preventDefault(); return; }
    if (dragging) {
      var d = computeDrop(e);
      dropTarget = d;
      if (d) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropLine.classList.add('show');
        if (d.sideways) {
          dropLine.style.cssText = 'top:' + (d.rect.top + scrollY) + 'px;left:' + ((d.before ? d.rect.left : d.rect.right) + scrollX - 2) + 'px;width:4px;height:' + d.rect.height + 'px';
        } else {
          dropLine.style.cssText = 'top:' + ((d.before ? d.rect.top : d.rect.bottom) + scrollY - 2) + 'px;left:' + (d.rect.left + scrollX) + 'px;width:' + d.rect.width + 'px;height:4px';
        }
      } else {
        dropLine.classList.remove('show');
      }
      return;
    }
    if (hasFiles(e)) {
      e.preventDefault();
      var b = blockFor(document.elementFromPoint(e.clientX, e.clientY));
      if (fileHover !== b) {
        if (fileHover) fileHover.classList.remove('nku-ed-filehover');
        fileHover = b;
        if (b) b.classList.add('nku-ed-filehover');
      }
      e.dataTransfer.dropEffect = b ? 'copy' : 'none';
    }
  });

  document.addEventListener('drop', async function (e) {
    if (dragging) {
      e.preventDefault();
      var d = dropTarget;
      var moving = dragging;
      endDrag();
      if (d) {
        if (d.before) d.target.before(moving);
        else d.target.after(moving);
        markDirty();
        placeHandle(moving);
      }
      return;
    }
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (fileHover) fileHover.classList.remove('nku-ed-filehover');
    var target = fileHover;
    fileHover = null;
    if (!editing) { nkuToast('Click "Edit this page" first, then drop the image.', 'error'); return; }
    var files = nkuImageFiles(e.dataTransfer);
    if (!files.length) { nkuToast('Only image files can be dropped here.', 'error'); return; }
    if (!target) { nkuToast('Drop the image onto a picture or a paragraph.', 'error'); return; }
    if (target.tagName === 'IMG') await replaceImage(target, files[0]);
    else if (isPhotoSlot(target)) await fillPhotoSlot(target, files[0]);
    else await insertImageAfter(target, files[0]);
  });

  async function replaceImage(img, file) {
    img.classList.add('nku-ed-busy');
    try {
      var r = await nkuUpload(file);
      img.src = r.url;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      markDirty();
      nkuToast('Image replaced. Remember to Save.');
    } catch (ex) { nkuToast(ex.message, 'error'); }
    img.classList.remove('nku-ed-busy');
  }

  async function fillPhotoSlot(slot, file) {
    slot.classList.add('nku-ed-busy');
    try {
      var r = await nkuUpload(file);
      var img = document.createElement('img');
      img.src = r.url;
      img.alt = (slot.getAttribute('aria-label') || '').replace(/^Photo to come:\s*/i, '');
      img.className = 'img-full';
      slot.replaceWith(img);
      markDirty();
      nkuToast('Photo added. Click it to check its description, then Save.');
    } catch (ex) {
      slot.classList.remove('nku-ed-busy');
      nkuToast(ex.message, 'error');
    }
  }

  async function insertImageAfter(block, file) {
    var anchor = block.tagName === 'LI' ? block.closest('ul,ol') || block : block;
    var ph = el('p', 'nku-ed-ui nku-ed-uploading', 'Uploading image…');
    anchor.after(ph);
    try {
      var r = await nkuUpload(file);
      var img = document.createElement('img');
      img.src = r.url;
      img.alt = '';
      img.className = 'rounded-lg my-4';
      img.style.width = '100%';
      img.style.height = 'auto';
      ph.replaceWith(img);
      markDirty();
      nkuToast('Image added. Click it to describe it, then Save.');
    } catch (ex) {
      ph.remove();
      nkuToast(ex.message, 'error');
    }
  }

  // ---------- image popover ----------
  var imgPop = el('div', 'nku-ed-ui nku-ed-imgpop');
  var popImg = null;
  imgPop.appendChild(btn('Replace…', 'Choose a new picture', async function () {
    var f = (await nkuPickFile())[0];
    if (f && popImg) replaceImage(popImg, f);
  }));
  imgPop.appendChild(btn('Description', 'Text for people who can\'t see the image', function () {
    if (!popImg) return;
    var alt = prompt('Describe this image:', popImg.getAttribute('alt') || '');
    if (alt !== null) { popImg.setAttribute('alt', alt); markDirty(); }
  }));
  [['S', '33%'], ['M', '50%'], ['L', '75%'], ['Full', '100%']].forEach(function (s) {
    imgPop.appendChild(btn(s[0], 'Width ' + s[1], function () {
      if (!popImg) return;
      popImg.style.width = s[1];
      popImg.style.height = 'auto';
      popImg.style.marginLeft = 'auto';
      popImg.style.marginRight = 'auto';
      popImg.style.display = 'block';
      markDirty();
      showImgPop(popImg);
    }));
  });
  imgPop.appendChild(btn('Delete', 'Remove image', function () { if (popImg) { removeBlock(popImg); hideImgPop(); } }, 'nku-ed-danger'));
  document.body.appendChild(imgPop);

  function showImgPop(img) {
    popImg = img;
    var r = img.getBoundingClientRect();
    imgPop.classList.add('show');
    imgPop.style.top = Math.max(r.top + scrollY + 8, scrollY + 72) + 'px';
    imgPop.style.left = Math.max(8, r.left + scrollX + 8) + 'px';
  }
  function hideImgPop() { imgPop.classList.remove('show'); popImg = null; }

  // ---------- clicks, keys, paste inside regions ----------
  document.addEventListener('click', function (e) {
    if (!editing) return;
    if (e.target.closest('.nku-ed-ui')) return;
    var region = regionOf(e.target);
    if (!region) { hideImgPop(); return; }
    // Don't follow links or toggle FAQ answers while editing.
    if (e.target.closest('a, summary')) e.preventDefault();
    if (e.target.closest('button, input[type=submit]')) { e.preventDefault(); e.stopPropagation(); }
    if (e.target.tagName === 'IMG' && !isDecorative(e.target)) { showImgPop(e.target); return; }
    var slot = e.target.closest('.photo');
    if (isPhotoSlot(slot)) {
      hideImgPop();
      nkuPickFile().then(function (files) { if (files[0]) fillPhotoSlot(slot, files[0]); });
      return;
    }
    hideImgPop();
  }, true);

  // Forms must not send anything to the Tracker while a page is being edited.
  document.addEventListener('submit', function (e) {
    if (editing && regionOf(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    var host = closestEditable(e.target);
    if (!host) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isBlockish(host) || /^(TD|TH|SUMMARY|DT|DD|FIGCAPTION)$/.test(host.tagName)) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        return;
      }
      e.preventDefault();
      var s = getSelection();
      if (!s.rangeCount) return;
      var range = s.getRangeAt(0);
      range.deleteContents();
      var tail = document.createRange();
      tail.setStart(range.endContainer, range.endOffset);
      tail.setEnd(host, host.childNodes.length);
      var frag = tail.extractContents();
      var n = /^H\d$/.test(host.tagName) ? document.createElement('p') : newSiblingFor(host);
      n.appendChild(frag);
      if (!n.textContent.trim() && !n.querySelector('img')) n.innerHTML = '<br>';
      if (!host.textContent.trim() && !host.querySelector('img')) host.innerHTML = '<br>';
      host.after(n);
      makeEditable(n, regionOf(n));
      placeCaret(n);
      markDirty();
      return;
    }
    if (e.key === 'Backspace' && !host.textContent.trim() && !host.querySelector('img') && isBlockish(host)) {
      var all = Array.from(regionOf(host).querySelectorAll('[data-nku-ed="text"]'));
      var prev = all[all.indexOf(host) - 1];
      e.preventDefault();
      host.remove();
      if (prev) placeCaret(prev, true);
      markDirty();
    }
  });

  document.addEventListener('input', function (e) { if (editing && regionOf(e.target)) markDirty(); });

  document.addEventListener('paste', function (e) {
    if (!editing) return;
    var host = closestEditable(e.target);
    if (!host) return;
    var files = nkuImageFiles(e.clipboardData);
    e.preventDefault();
    if (files.length) { insertImageAfter(blockFor(host) || host, files[0]); return; }
    // Paste as plain text so the page keeps its own styling.
    var text = (e.clipboardData.getData('text/plain') || '').replace(/\r\n/g, '\n');
    document.execCommand('insertText', false, text);
  });

  window.addEventListener('scroll', function () {
    if (hoverBlock) placeHandle(hoverBlock);
    if (popImg) showImgPop(popImg);
    updateFmt();
  }, { passive: true });

  // Opened from the admin panel's "Edit on page" button.
  var params = new URLSearchParams(location.search);
  if (params.get('edit') === '1' && regions.length) {
    params.delete('edit');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
    enterEdit();
  }
})();
