/* Shared helpers for the NKU admin: API calls, toasts, image upload with resizing. */
(function () {
  'use strict';
  var MAX_SIDE = 2000;

  window.nkuApi = async function (url, method, body) {
    var res = await fetch(url, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      var err = new Error(data.error || 'Something went wrong (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return data;
  };

  window.nkuToast = function (msg, kind) {
    var el = document.getElementById('nku-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nku-toast';
      el.className = 'nku-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.dataset.kind = kind || 'ok';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, kind === 'error' ? 6000 : 3000);
  };

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  // Shrinks big photos in the browser before upload, so pages stay fast.
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    var img = await loadImage(file);
    var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    var blob = await new Promise(function (r) { canvas.toBlob(r, type, 0.85); });
    if (!blob || blob.size >= file.size) return file;
    var name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type: type });
  }

  window.nkuUpload = async function (file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Please choose an image file.');
    if (file.type === 'image/svg+xml') throw new Error('SVG images are not allowed. Please use JPG or PNG.');
    var small = await shrink(file);
    var fd = new FormData();
    fd.append('file', small, small.name);
    var res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    return data;
  };

  window.nkuPickFile = function (multiple) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/gif,image/webp,image/avif';
      input.multiple = !!multiple;
      input.onchange = function () { resolve(Array.from(input.files || [])); };
      input.click();
    });
  };

  window.nkuImageFiles = function (dataTransfer) {
    return Array.from((dataTransfer && dataTransfer.files) || []).filter(function (f) { return /^image\//.test(f.type); });
  };
})();
