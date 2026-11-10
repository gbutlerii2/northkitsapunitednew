// North Kitsap United website: sends the forms to the NKU Tracker, fills in the
// Home page's campaign figures from the Tracker, and filters the FAQ.
(function () {
  "use strict";
  var API = (document.documentElement.getAttribute("data-tracker-api") || "https://nku-tracker.com").replace(/\/$/, "");
  // Set in Admin > Forms. When "0", forms go only to this website (email + log), not the Tracker.
  var SEND_TRACKER = document.documentElement.getAttribute("data-send-tracker") !== "0";

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

  function missingRequired(form) {
    var bad = null;
    Array.prototype.forEach.call(form.querySelectorAll("[required]"), function (el) {
      var empty = !String(el.value || "").trim();
      el.setAttribute("aria-invalid", empty ? "true" : "false");
      if (empty && !bad) bad = el;
    });
    return bad;
  }

  function say(form, text, isError) {
    var s = form.querySelector(".status");
    if (!s) return;
    s.textContent = text;
    s.classList.toggle("is-error", !!isError);
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
    var bad = missingRequired(form);
    if (bad) {
      say(form, "Please fill in the fields marked *.", true);
      bad.focus();
      return;
    }
    var buttons = form.querySelectorAll("button[type=submit]");
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
    say(form, "Sending…");
    var request;
    if (SEND_TRACKER) {
      notifyByEmail(kind, form, submitter);
      request = fetch(API + "/api/submit/" + encodeURIComponent(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collect(form, submitter)),
      });
    } else {
      request = fetch("/api/forms/" + encodeURIComponent(kind), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteData(form, submitter)),
      });
    }
    request
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Sorry, that didn't send. Please try again in a moment.");
        say(form, j.message || "Thank you. Your message has been sent to the North Kitsap United team, and we’ll get back to you soon.");
        var redirect = j.redirect;
        if (kind === "zeffy") {
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
        var msg = e && e.message && e.message !== "Failed to fetch" ? e.message
          : "Sorry, that didn't send. Please check your connection and try again.";
        say(form, msg, true);
      })
      .then(function () { Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; }); });
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
        if (bar) bar.setAttribute("aria-label", "Campaign progress: received " + money(d.received) + " and pledged " + money(d.pledged) + " of the " + money(d.estimatedCost) + " estimated cost");
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
