/* A small rich-text editor for news posts: formatting buttons, links, drag-and-drop images. */
(function () {
  'use strict';

  var BUTTONS = [
    { cmd: 'formatBlock', arg: 'P', label: 'Paragraph', text: '¶' },
    { cmd: 'formatBlock', arg: 'H2', label: 'Heading', text: 'H2' },
    { cmd: 'formatBlock', arg: 'H3', label: 'Subheading', text: 'H3' },
    { sep: true },
    { cmd: 'bold', label: 'Bold', text: '<b>B</b>' },
    { cmd: 'italic', label: 'Italic', text: '<i>I</i>' },
    { cmd: 'underline', label: 'Underline', text: '<u>U</u>' },
    { sep: true },
    { cmd: 'insertUnorderedList', label: 'Bulleted list', text: '• List' },
    { cmd: 'insertOrderedList', label: 'Numbered list', text: '1. List' },
    { cmd: 'formatBlock', arg: 'BLOCKQUOTE', label: 'Quote', text: '❝' },
    { sep: true },
    { cmd: 'link', label: 'Add link', text: '🔗' },
    { cmd: 'unlink', label: 'Remove link', text: '⛓︎̸' },
    { cmd: 'image', label: 'Insert image', text: '🖼 Image' },
    { cmd: 'video', label: 'Insert YouTube video', text: '▶ Video' },
    { sep: true },
    { cmd: 'undo', label: 'Undo', text: '↶' },
    { cmd: 'redo', label: 'Redo', text: '↷' },
  ];

  // Strips Word/Google Docs styling from pasted HTML, keeping structure.
  function cleanPasted(html) {
    var t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('script,style,meta,link,title,xml,o\\:p').forEach(function (n) { n.remove(); });
    t.content.querySelectorAll('*').forEach(function (el) {
      Array.from(el.attributes).forEach(function (a) {
        var keep = (el.tagName === 'A' && a.name === 'href') || (el.tagName === 'IMG' && (a.name === 'src' || a.name === 'alt'));
        if (!keep) el.removeAttribute(a.name);
      });
    });
    t.content.querySelectorAll('span,font,div').forEach(function (el) {
      if (el.tagName === 'DIV') { var p = document.createElement('p'); p.innerHTML = el.innerHTML; el.replaceWith(p); }
      else el.replaceWith.apply(el, Array.from(el.childNodes));
    });
    return t.innerHTML;
  }

  function youtubeId(url) {
    var m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
    return m ? m[1] : /^[\w-]{6,}$/.test(url) ? url : null;
  }

  window.nkuRte = function (host) {
    host.innerHTML = '';
    var bar = document.createElement('div');
    bar.className = 'nku-rte-bar';
    bar.setAttribute('role', 'toolbar');
    var area = document.createElement('div');
    area.className = 'nku-rte-area prose';
    area.contentEditable = 'true';
    area.innerHTML = host.dataset.html || '<p><br></p>';
    host.appendChild(bar);
    host.appendChild(area);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }

    var savedRange = null;
    var saveSel = function () {
      var s = getSelection();
      if (s.rangeCount && area.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
    };
    var restoreSel = function () {
      area.focus();
      if (savedRange) { var s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
    };
    document.addEventListener('selectionchange', saveSel);

    var insertImageAt = async function (file, range) {
      var ph = document.createElement('p');
      ph.className = 'nku-ed-uploading';
      ph.textContent = 'Uploading image…';
      if (range) { range.collapse(false); range.insertNode(ph); } else area.appendChild(ph);
      try {
        var r = await nkuUpload(file);
        var img = document.createElement('img');
        img.src = r.url;
        img.alt = '';
        var p = document.createElement('p');
        p.appendChild(img);
        ph.replaceWith(p);
        area.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (ex) {
        ph.remove();
        nkuToast(ex.message, 'error');
      }
    };

    BUTTONS.forEach(function (b) {
      if (b.sep) { var s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); return; }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = b.text;
      btn.title = b.label;
      btn.setAttribute('aria-label', b.label);
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', async function () {
        restoreSel();
        if (b.cmd === 'link') {
          var url = prompt('Link address (https://…, /page, or an email address):', 'https://');
          if (!url) return;
          if (/^[^\s@/]+@[^\s@]+$/.test(url)) url = 'mailto:' + url;
          restoreSel();
          if (getSelection().isCollapsed) document.execCommand('insertHTML', false, '<a href="' + url.replace(/"/g, '&quot;') + '">' + url.replace(/</g, '&lt;') + '</a>');
          else document.execCommand('createLink', false, url);
        } else if (b.cmd === 'image') {
          var files = await nkuPickFile();
          if (files[0]) insertImageAt(files[0], savedRange);
        } else if (b.cmd === 'video') {
          var v = youtubeId(prompt('Paste a YouTube link:') || '');
          if (!v) return;
          restoreSel();
          document.execCommand('insertHTML', false, '<div class="aspect-video my-4"><iframe src="https://www.youtube.com/embed/' + v + '" title="Video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="width:100%;height:100%;aspect-ratio:16/9"></iframe></div><p><br></p>');
        } else if (b.cmd === 'formatBlock') {
          document.execCommand('formatBlock', false, '<' + b.arg + '>');
        } else {
          document.execCommand(b.cmd, false, null);
        }
        area.dispatchEvent(new Event('input', { bubbles: true }));
      });
      bar.appendChild(btn);
    });

    area.addEventListener('paste', function (e) {
      var files = nkuImageFiles(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        var s = getSelection();
        insertImageAt(files[0], s.rangeCount ? s.getRangeAt(0) : null);
        return;
      }
      var html = e.clipboardData.getData('text/html');
      if (html) {
        e.preventDefault();
        document.execCommand('insertHTML', false, cleanPasted(html));
      }
    });

    area.addEventListener('dragover', function (e) {
      if (Array.from(e.dataTransfer.types).indexOf('Files') >= 0) { e.preventDefault(); area.classList.add('over'); }
    });
    area.addEventListener('dragleave', function () { area.classList.remove('over'); });
    area.addEventListener('drop', function (e) {
      var files = nkuImageFiles(e.dataTransfer);
      area.classList.remove('over');
      if (!files.length) return;
      e.preventDefault();
      var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (!range && document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
      }
      files.forEach(function (f) { insertImageAt(f, range && area.contains(range.startContainer) ? range : null); });
    });

    // Click an image to set its description or remove it.
    area.addEventListener('click', function (e) {
      if (e.target.tagName !== 'IMG') return;
      var img = e.target;
      var alt = prompt('Describe this image for people who can\'t see it.\n(Clear the box and press OK to remove the image.)', img.alt || '');
      if (alt === null) return;
      if (alt === '' && confirm('Remove this image?')) img.remove();
      else img.alt = alt;
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });

    return {
      getHtml: function () {
        var c = area.cloneNode(true);
        c.querySelectorAll('.nku-ed-uploading').forEach(function (n) { n.remove(); });
        return c.innerHTML.replace(/<p><br><\/p>\s*$/, '');
      },
    };
  };
})();
