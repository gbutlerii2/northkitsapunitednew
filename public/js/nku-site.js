// North Kitsap United website: sends the forms to the NKU Tracker, fills in the
// Home page's campaign figures from the Tracker, and filters the FAQ.
(function () {
  "use strict";
  var API = (document.documentElement.getAttribute("data-tracker-api") || "https://nku-tracker.com").replace(/\/$/, "");
  // Set in Admin > Forms. When "0", forms go only to this website (email + log), not the Tracker.
  var SEND_TRACKER = document.documentElement.getAttribute("data-send-tracker") !== "0";
  // Admin > Forms & emails can switch Zeffy off for the Donate page's Donate Now form.
  var ZEFFY_OFF = document.documentElement.getAttribute("data-zeffy") === "off";
  var ZEFFY_OFF_MSG = "Thank you. Your gift details have been sent to the North Kitsap United team, and we’ll contact you about payment.";
  (function () {
    // Remove the parts that don't apply, so hidden buttons can't submit the form.
    document.querySelectorAll(ZEFFY_OFF ? "[data-zeffy-only]" : "[data-zeffy-off]").forEach(function (el) { el.remove(); });
    if (!ZEFFY_OFF) return;
    // Pledge form in an older saved copy of the page: reword the Zeffy payment option.
    document.querySelectorAll('form[data-nku-form="pledge"] input[name="payment"]').forEach(function (box) {
      if (!/zeffy/i.test(box.value)) return;
      var label = box.closest("label");
      box.value = "Cash or bank transfer, monthly or quarterly";
      if (label) { label.textContent = ""; label.appendChild(box); label.appendChild(document.createTextNode(" " + box.value)); }
    });
    // A copy of the page saved in the admin panel before the switch existed has no Send button: add one.
    document.querySelectorAll('form[data-nku-form="zeffy"]').forEach(function (form) {
      if (form.querySelector('button[value="contact"]')) return;
      var zb = form.querySelectorAll('button[type=submit]');
      if (!zb.length) return;
      var row = zb[0].parentNode;
      Array.prototype.forEach.call(zb, function (b) { b.remove(); });
      var send = document.createElement("button");
      send.className = "btn"; send.type = "submit"; send.name = "via"; send.value = "contact"; send.textContent = "Send";
      row.appendChild(send);
      var dlg = form.closest("dialog") || form.parentNode;
      dlg.querySelectorAll("p, h3").forEach(function (el) {
        if (/zeffy/i.test(el.textContent)) el.remove();
      });
      var note = document.createElement("p");
      note.className = "p";
      note.textContent = "Send the form and it goes to the North Kitsap United team. We’ll contact you about payment.";
      form.parentNode.insertBefore(note, form);
    });
  })();

  // ---------------------------------------------------------------- forms ---
  function collect(form, submitter) {
    var out = { page: location.pathname };
    var multi = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === "submit" || el.type === "button") return;
      if (el.type === "radio") { if (el.checked) out[el.name] = el.value; return; }
      if (el.type === "checkbox") {
        var group = form.querySelectorAll('input[type=checkbox][name="' + el.name + '"]').length > 1;
        if (group) { multi[el.name] = multi[el.name] || []; if (el.checked) multi[el.name].push(el.value); }
        else if (el.checked) out[el.name] = el.value || "yes";
        return;
      }
      out[el.name] = el.value;
    });
    Object.keys(multi).forEach(function (k) { out[k] = multi[k]; });
    if (submitter && submitter.name) out[submitter.name] = submitter.value;
    return out;
  }

  // Checks the fields marked * (required), plus the format of any email and
  // amount fields, and returns the first one that needs fixing with a message.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function problemWith(form) {
    var first = null;
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), function (el) {
      if (!el.name || el.type === "hidden" || el.type === "submit" || el.closest(".hp")) return;
      var v = String(el.value || "").trim();
      var msg = "";
      if (el.required && !v) msg = "Please fill in the fields marked *.";
      else if (v && el.type === "email" && !EMAIL_RE.test(v)) msg = "Please check the email address.";
      else if (v && el.name === "amount" && !/^\$?\s*[0-9][0-9,]*(\.[0-9]{1,2})?$/.test(v)) msg = "Please enter the amount as a number, for example 250.";
      if (msg || el.hasAttribute("aria-invalid")) el.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = { el: el, msg: msg };
    });
    return first;
  }

  // Clear a field's red outline as soon as it is filled in.
  document.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el && el.getAttribute && el.getAttribute("aria-invalid") === "true" && String(el.value || "").trim()) el.setAttribute("aria-invalid", "false");
  });

  function say(form, text, isError) {
    var s = form.querySelector(".status");
    if (!s) return;
    s.textContent = text;
    s.classList.toggle("is-error", !!isError);
    if (isError && s.scrollIntoView) s.scrollIntoView({ block: "nearest" });
  }

  // The question or label a field belongs to, for the notification email.
  function labelFor(el) {
    var fs = el.closest("fieldset");
    var legend = fs && fs.querySelector("legend");
    if (legend && (el.type === "radio" || el.type === "checkbox")) return legend.textContent;
    var label = el.closest("label");
    if (!label) return "";
    var text = "";
    Array.prototype.forEach.call(label.childNodes, function (n) { if (n.nodeType === 3) text += n.textContent; });
    return text.replace(/\s+/g, " ").replace(/[:*\s]+$/, "").trim();
  }

  // Also sends the form to this website, which emails it to the people listed
  // under Admin > Form emails. Runs alongside the Tracker and never blocks it.
  function siteData(form, submitter) {
    var data = collect(form, submitter);
    var labels = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && !labels[el.name]) { var t = labelFor(el); if (t) labels[el.name] = t; }
    });
    data._labels = labels;
    return data;
  }

  function notifyByEmail(kind, form, submitter) {
    try {
      var data = siteData(form, submitter);
      fetch("/api/forms/" + encodeURIComponent(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* the email copy is best-effort */ }
  }

  document.addEventListener("submit", function (ev) {
    var form = ev.target;
    var kind = form.getAttribute("data-nku-form");
    if (!kind) return;
    ev.preventDefault();
    var submitter = ev.submitter || form.querySelector("button[type=submit]");
    var bad = problemWith(form);
    if (bad) {
      say(form, bad.msg, true);
      bad.el.focus();
      return;
    }
    var buttons = form.querySelectorAll("button[type=submit]");
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
    say(form, "Sending…");
    var request;
    // Give up after 30 seconds rather than leave "Sending…" up forever.
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : null;
    if (SEND_TRACKER) {
      notifyByEmail(kind, form, submitter);
      request = fetch(API + "/api/submit/" + encodeURIComponent(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collect(form, submitter)),
        signal: ctl ? ctl.signal : undefined,
      });
    } else {
      request = fetch("/api/forms/" + encodeURIComponent(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteData(form, submitter)),
        signal: ctl ? ctl.signal : undefined,
      });
    }
    request
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); })
      .then(function (j) {
        if (!j.ok) {
          if (window.console) console.warn("[nku] form " + kind + " was not sent (HTTP " + j.status + ")", j);
          throw new Error(j.error || (j.status === 429
            ? "Too many messages from this connection. Please wait a few minutes and try again."
            : "Sorry, that didn't send (error " + j.status + "). Please try again in a moment, or email nku@rotaryknk.org."));
        }
        var zeffyOff = kind === "zeffy" && ZEFFY_OFF;
        say(form, zeffyOff ? ZEFFY_OFF_MSG : (j.message || "Thank you. Your message has been sent to the North Kitsap United team, and we’ll get back to you soon."));
        var redirect = zeffyOff ? null : j.redirect;
        if (kind === "zeffy" && !zeffyOff) {
          // Zeffy links set in Admin > Forms & emails take priority.
          var via = (collect(form, submitter).via || "card");
          var html = document.documentElement;
          var card = html.getAttribute("data-zeffy-card"), eft = html.getAttribute("data-zeffy-eft");
          var mine = via === "eft" ? (eft || card) : (card || eft);
          if (mine) redirect = mine;
        }
        form.reset();
        if (redirect) setTimeout(function () { location.href = redirect; }, 900);
      })
      .catch(function (e) {
        var msg = e && e.name === "AbortError" ? "Sorry, that is taking too long. Please try again in a moment, or email nku@rotaryknk.org."
          : e && e.message && e.message !== "Failed to fetch" && !/NetworkError|Load failed/i.test(e.message) ? e.message
          : "Sorry, that didn't send. Please check your connection and try again.";
        say(form, msg, true);
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
      });
  });

  // ------------------------------------------------- campaign (Home page) ---
  function money(v) {
    v = Number(v) || 0;
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (v >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + Math.round(v);
  }

  var campaign = document.querySelector("[data-nku-campaign]");
  if (campaign) {
    fetch(API + "/api/public/campaign")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error();
        ["pledged", "received", "estimatedCost"].forEach(function (k) {
          campaign.querySelectorAll('[data-stat="' + k + '"]').forEach(function (el) { el.textContent = money(d[k]); });
        });
        var r = campaign.querySelector('[data-bar="received"]'), p = campaign.querySelector('[data-bar="pledged"]');
        if (r) r.style.width = d.bar.receivedPct + "%";
        if (p) p.style.width = d.bar.pledgedPct + "%";
        var bar = campaign.querySelector("[data-bar-label]");
        if (bar) bar.setAttribute("aria-label", "Campaign progress: received " + money(d.received) + " and pledged " + money(d.pledged) + " of the " + money(d.estimatedCost) + " goal");
        var asOf = campaign.querySelector('[data-stat="asOf"]');
        if (asOf) asOf.textContent = "Live from the NKU Tracker, " + new Date(d.asOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + ".";
      })
      .catch(function () {
        var asOf = campaign.querySelector('[data-stat="asOf"]');
        if (asOf) asOf.textContent = "Campaign figures are unavailable right now. Please check back soon.";
      });
  }

  // ------------------------------------------------------------ FAQ search ---
  var search = document.querySelector("[data-faq-search]");
  if (search) {
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      document.querySelectorAll("details.qa").forEach(function (d) {
        d.hidden = q && d.textContent.toLowerCase().indexOf(q) < 0;
      });
    });
  }
})();
