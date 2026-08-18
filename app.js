/* ============================================================
   Daily Postcard — app logic
   Nothing in here needs editing. See config.js / questions.js.
   ============================================================ */

(function () {
  "use strict";

  var CFG   = window.CONFIG   || {};
  var BANK  = window.QUESTIONS || [];
  var NAMES = CFG.names || [];

  var PHOTO_MAX     = 1400;   // longest edge we keep, px
  var PHOTO_QUALITY = 0.72;   // jpeg quality

  var todayEl   = document.getElementById("today-body");
  var archiveEl = document.getElementById("archive-body");

  var EMOJI = CFG.reactions ||
    ["\u2764\ufe0f", "\ud83d\ude02", "\ud83e\udd79", "\ud83d\udd25"];

  var db = null;
  var archiveLoaded = false;

  // Reactions and replies for every day, keyed "date|whoseAnswer".
  var RX = {};          // -> [{author, emojis, updated_at}]
  var RP = {};          // -> [{author, body, at}]
  var openPanel = "";   // which respond panel is showing, so a
                        // re-render can put it back

  /* ---------- tiny helpers ---------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x";
  }

  /* ---------- dates ---------- */

  // "2026-08-17" in the configured timezone, so both campuses
  // roll over to the new question at the same instant.
  function todayKey() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CFG.timezone || "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  function prettyDate(key, opts) {
    var p = key.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return new Intl.DateTimeFormat("en-US", Object.assign({
      timeZone: "UTC", weekday: "long", month: "long", day: "numeric"
    }, opts || {})).format(d);
  }

  // Shown in the timezone from config.js, so a time on a postcard
  // means the same thing to both of you regardless of campus.
  function clockTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: CFG.timezone || "America/New_York",
      hour: "numeric", minute: "2-digit"
    }).format(d);
  }

  function shortDate(key) {
    var p = key.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", month: "short", day: "numeric"
    }).format(d).toUpperCase();
  }

  /* ---------- question of the day ---------- */

  // Days elapsed since the epoch, from the date string itself.
  function dayNumber(key) {
    var p = key.split("-");
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }

  // Step through the list by a stride that shares no factor with its
  // length. That visits EVERY question exactly once before any of
  // them repeats, in a scattered order rather than 1-2-3. Still pure
  // arithmetic on the date, so both of you always get the same one.
  function strideFor(n) {
    function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
    var s = Math.max(1, Math.floor(n / 3));
    while (s < n && gcd(s, n) !== 1) s++;
    return gcd(s, n) === 1 ? s : 1;
  }

  function questionFor(key) {
    var n = BANK.length;
    if (!n) return "(No questions in questions.js yet.)";
    var i = (dayNumber(key) * strideFor(n)) % n;
    return BANK[(i + n) % n];
  }

  /* ---------- who am I (remembered locally) ---------- */

  function savedName() {
    try {
      var n = localStorage.getItem("dp:name");
      return NAMES.indexOf(n) > -1 ? n : "";
    } catch (e) { return ""; }
  }

  function rememberName(n) {
    try { localStorage.setItem("dp:name", n); } catch (e) {}
  }

  /* ---------- who's using this phone ---------- */

  /* ---------- notifications ---------- */

  function seenKey() { return "dp:seen:" + savedName(); }

  function lastSeen() {
    try { return localStorage.getItem(seenKey()) || "1970-01-01T00:00:00Z"; }
    catch (e) { return "1970-01-01T00:00:00Z"; }
  }

  function markSeen() {
    try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch (e) {}
  }

  // Everything the other person has done to a thread that's yours —
  // either it hangs off your answer, or you've replied in it.
  function activityForMe() {
    var me = savedName();
    if (!me) return [];
    var items = [];

    Object.keys(RX).forEach(function (k) {
      var parts = k.split("|"), date = parts[0], target = parts[1];
      if (target !== me) return;
      RX[k].forEach(function (r) {
        if (r.author === me) return;
        items.push({ kind: "reaction", date: date, target: target,
                     who: r.author, what: r.emojis, at: r.at });
      });
    });

    Object.keys(RP).forEach(function (k) {
      var parts = k.split("|"), date = parts[0], target = parts[1];
      var mineThread = target === me || RP[k].some(function (r) {
        return r.author === me;
      });
      if (!mineThread) return;
      RP[k].forEach(function (r) {
        if (r.author === me) return;
        items.push({ kind: "reply", date: date, target: target,
                     who: r.author, what: r.body, at: r.at });
      });
    });

    items.sort(function (a, b) { return (a.at < b.at) ? 1 : -1; });
    return items;
  }

  function paintWhoami() {
    var bar = document.getElementById("whoami");
    if (!bar) return;
    var me = savedName();
    if (!me) { bar.innerHTML = ""; return; }

    var items  = activityForMe();
    var since  = lastSeen();
    var unseen = items.filter(function (i) { return i.at > since; });

    bar.innerHTML =
      '<button class="bell" id="bell-btn" aria-label="Notifications">' +
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M18 8.8a6 6 0 1 0-12 0c0 5.2-2 6.6-2 6.6h16s-2-1.4-2-6.6z" ' +
            'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<path d="M13.7 19a2 2 0 0 1-3.4 0" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>" +
        (unseen.length ? '<span class="bell-dot"></span>' : "") +
      "</button>" +
      '<div class="bell-pop" id="bell-pop" hidden>' +
        '<p class="bell-head">Activity</p>' +
        (items.length
          ? '<div class="bell-list">' + items.slice(0, 12).map(function (i) {
              var fresh = i.at > since ? " is-new" : "";
              return '<button type="button" class="bell-item' + fresh +
                  '" data-date="' + esc(i.date) + '">' +
                '<span class="bell-line"><strong>' + esc(i.who) + "</strong> " +
                  (i.kind === "reaction"
                    ? "reacted " + esc(i.what)
                    : "replied") +
                  (i.target === savedName() ? " to your answer" : "") +
                "</span>" +
                (i.kind === "reply"
                  ? '<span class="bell-quote">' + esc(i.what) + "</span>"
                  : "") +
                '<span class="bell-when">' + esc(prettyDate(i.date)) + "</span>" +
              "</button>";
            }).join("") + "</div>"
          : '<p class="bell-empty">Nothing yet.</p>') +
      "</div>" +
      '<button class="avatar" id="avatar-btn" ' +
        'aria-label="Signed in as ' + esc(me) + '">' +
        esc(me.charAt(0).toUpperCase()) +
      "</button>" +
      '<div class="avatar-pop" id="avatar-pop" hidden>' +
        '<p class="avatar-who">Signed in as <strong>' + esc(me) + "</strong></p>" +
        '<button class="avatar-switch" id="avatar-switch">Switch account</button>' +
      "</div>";

    var btn     = document.getElementById("avatar-btn");
    var pop     = document.getElementById("avatar-pop");
    var bellBtn = document.getElementById("bell-btn");
    var bellPop = document.getElementById("bell-pop");

    function close() {
      pop.hidden = true;
      bellPop.hidden = true;
      document.removeEventListener("pointerdown", away, true);
    }
    function away(e) {
      if (!bar.contains(e.target)) close();
    }
    function open(which) {
      pop.hidden = which !== pop;
      bellPop.hidden = which !== bellPop;
      document.addEventListener("pointerdown", away, true);
    }

    btn.onclick = function () {
      if (pop.hidden) open(pop); else close();
    };

    bellBtn.onclick = function () {
      if (bellPop.hidden) {
        open(bellPop);
        // Opening the list is what counts as reading it.
        markSeen();
        var dot = bellBtn.querySelector(".bell-dot");
        if (dot) dot.remove();
      } else {
        close();
      }
    };

    Array.prototype.forEach.call(bar.querySelectorAll(".bell-item"),
      function (b) {
        b.onclick = function () {
          close();
          var isToday = b.dataset.date === todayKey();
          var tab = document.querySelector(
            '[data-tab="' + (isToday ? "today" : "archive") + '"]');
          if (tab) tab.click();
        };
      });

    document.getElementById("avatar-switch").onclick = function () {
      close();
      renderChooser(true);
    };
  }

  // The first thing a new phone sees. Also reachable any time via
  // "Switch", so you can hand the phone over or fix a mis-tap.
  function renderChooser(canCancel) {
    document.body.classList.add("choosing");
    todayEl.innerHTML =
      '<div class="card chooser">' +
        '<p class="datestamp">Daily Postcard</p>' +
        '<h1 class="chooser-q">Who\u2019s this?</h1>' +
        '<p class="chooser-sub">This phone will stay signed in as ' +
          "whoever you pick.</p>" +
        '<div class="chooser-row">' +
          NAMES.map(function (n) {
            return '<button class="chooser-btn" data-name="' + esc(n) + '">' +
              esc(n) + "</button>";
          }).join("") +
        "</div>" +
        (canCancel
          ? '<button class="btn-quiet" id="chooser-cancel">Never mind</button>'
          : "") +
      "</div>";

    Array.prototype.forEach.call(
      todayEl.querySelectorAll("[data-name]"), function (b) {
        b.onclick = function () {
          rememberName(b.dataset.name);
          document.body.classList.remove("choosing");
          paintWhoami();
          clearPending();
          loadToday();
        };
      });

    var cancel = document.getElementById("chooser-cancel");
    if (cancel) cancel.onclick = function () {
      document.body.classList.remove("choosing");
      paintWhoami();
      renderToday();
    };
  }

  /* ---------- setup check ---------- */

  function configProblems() {
    var out = [];
    if (!NAMES.length || NAMES.length !== 2)
      out.push("<code>names</code> in config.js needs exactly two names.");
    if (!CFG.supabaseUrl || CFG.supabaseUrl.indexOf("PASTE_") === 0)
      out.push("<code>supabaseUrl</code> in config.js is still a placeholder.");
    if (!CFG.supabaseKey || CFG.supabaseKey.indexOf("PASTE_") === 0)
      out.push("<code>supabaseKey</code> in config.js is still a placeholder.");
    if (!window.supabase)
      out.push("The Supabase library didn't load — check your internet connection.");
    return out;
  }

  function setupCard(problems) {
    return '<div class="card">' +
      '<div class="alert"><strong>Almost there.</strong>' +
        '<ul class="alert-list">' + problems.map(function (p) {
          return "<li>" + p + "</li>";
        }).join("") + "</ul>" +
      "</div>" +
      '<p class="pc-question" style="padding-top:0">' +
        "Fix the above in <em>config.js</em>, then refresh." +
      "</p></div>";
  }

  // Turns Postgres's terse "column X does not exist" into the thing
  // you actually need to do about it.
  function setupHint(e) {
    var msg = String((e && e.message) || e || "");
    if (/does not exist/i.test(msg)) {
      return "<br><br>That means your database is missing a column this " +
        "version of the app needs. Open <code>schema.sql</code> and run the " +
        "whole file in the Supabase SQL Editor — it's safe to re-run.";
    }
    return "";
  }

  /* ============================================================
     PHOTOS
     ============================================================ */

  // Shrink and re-encode before upload. A straight iPhone photo is
  // 3-5 MB; this gets it to roughly 100-200 KB with no visible
  // difference at postcard size, so the free tier lasts years.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      function paint(src, w, h) {
        var scale = Math.min(1, PHOTO_MAX / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var c = document.createElement("canvas");
        c.width = cw; c.height = ch;
        c.getContext("2d").drawImage(src, 0, 0, cw, ch);
        c.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error("That image couldn’t be processed."));
        }, "image/jpeg", PHOTO_QUALITY);
      }

      function viaImg() {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
          try { paint(img, img.naturalWidth, img.naturalHeight); }
          catch (e) { reject(e); }
          URL.revokeObjectURL(url);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error("That file didn’t look like an image."));
        };
        img.src = url;
      }

      // createImageBitmap honours the EXIF rotation an iPhone
      // writes, so sideways photos come out the right way up.
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: "from-image" })
          .then(function (bm) { paint(bm, bm.width, bm.height); })
          .catch(viaImg);
      } else {
        viaImg();
      }
    });
  }

  // A web page can't launch Photo Booth — browsers don't allow
  // starting native apps. This is the equivalent done in-page:
  // live webcam preview, one button to capture. Phones skip it
  // and use the real camera app instead, which is better.
  var camStream = null;

  function canUseWebcam() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      window.isSecureContext !== false &&
      !window.matchMedia("(pointer: coarse)").matches;
  }

  function stopCamera() {
    if (!camStream) return;
    camStream.getTracks().forEach(function (t) { t.stop(); });
    camStream = null;
  }

  function openCamera(existing) {
    var slot = document.getElementById("photo-slot");
    if (!slot) return;

    slot.innerHTML =
      '<div class="cam">' +
        '<video id="cam-view" autoplay playsinline muted></video>' +
        '<div class="cam-actions">' +
          '<button type="button" class="btn cam-shot" id="cam-shot">Capture</button>' +
          '<button type="button" class="photo-mini" id="cam-cancel">Cancel</button>' +
        "</div>" +
      "</div>";

    var video = document.getElementById("cam-view");

    function bail(e) {
      stopCamera();
      paintPhotoSlot(existing);
      var err = document.getElementById("form-error");
      if (err) {
        err.innerHTML = '<div class="alert"><strong>Couldn’t open the camera.</strong> ' +
          esc((e && e.message) || e || "") +
          " You can still choose a picture from your files.</div>";
      }
    }

    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1600 }, height: { ideal: 1600 } },
      audio: false
    }).then(function (stream) {
      camStream = stream;
      video.srcObject = stream;
    }).catch(bail);

    document.getElementById("cam-cancel").onclick = function () {
      stopCamera();
      paintPhotoSlot(existing);
    };

    document.getElementById("cam-shot").onclick = function () {
      if (!video.videoWidth) return;
      var c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext("2d").drawImage(video, 0, 0);
      c.toBlob(function (b) {
        stopCamera();
        if (!b) return bail(new Error("The capture came back empty."));
        shrink(b).then(function (blob) {
          clearPending();
          state.photoBlob = blob;
          state.photoPreview = URL.createObjectURL(blob);
          paintPhotoSlot(existing);
        }).catch(bail);
      }, "image/jpeg", 0.92);
    };
  }

  function uploadPhoto(key, name, blob) {
    var path = key + "/" + slug(name) + ".jpg";
    return db.storage.from("photos")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" })
      .then(function (res) {
        if (res.error) throw res.error;
        var url = db.storage.from("photos").getPublicUrl(path).data.publicUrl;
        // Cache-buster, so replacing a photo actually shows the new one
        // rather than the CDN's copy of the old one.
        if (/^data:/i.test(url)) return url;
        return url + (url.indexOf("?") > -1 ? "&" : "?") + "v=" + Date.now();
      });
  }

  /* ---------- postcard markup ---------- */

  var POSTMARK =
    '<svg class="pc-postmark" width="78" height="78" viewBox="0 0 62 62" aria-hidden="true">' +
      '<circle cx="31" cy="31" r="27" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="31" cy="31" r="21" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<path d="M8 22h46M8 40h46" stroke="currentColor" stroke-width="1.2" opacity=".8"/>' +
    "</svg>";

  function snapshot(url, tilt, at) {
    if (!url) return "";
    return '<div class="pc-snap" style="--snap-tilt:' + tilt + 'deg">' +
      '<img src="' + esc(url) + '" alt="" loading="lazy">' +
      '<div class="snap-time">' + esc(clockTime(at)) + "</div>" +
    "</div>";
  }

  // If an image fails to load, say so plainly. Silently dropping the
  // frame makes a misconfigured storage bucket look identical to
  // "they didn't attach anything", which is impossible to debug.
  function hideBrokenPhotos(root) {
    var imgs = root.querySelectorAll(".pc-snap img, .yours-snap img");
    Array.prototype.forEach.call(imgs, function (img) {
      img.onerror = function () {
        var frame = img.closest(".pc-snap") || img.closest(".yours-snap");
        if (!frame) return;
        frame.innerHTML = '<div class="snap-broken">Photo didn’t load</div>';
        frame.classList.add("is-broken");
      };
      if (img.complete && img.naturalWidth === 0) img.onerror();
    });
  }

  // The emoji stuck on someone's answer, plus the Respond control
  // and its panel. Rendered for both people, on today's card and
  // on every card in the archive.
  function respondBlock(date, target) {
    var me = savedName();
    var stuck = allEmojis(date, target);
    var replies = RP[slotKey(date, target)] || [];
    var isOpen = openPanel === slotKey(date, target);

    var chips = stuck.length
      ? '<div class="rx-chips">' + stuck.map(function (e) {
          return '<span class="rx-chip">' + esc(e) + "</span>";
        }).join("") + "</div>"
      : "";

    var mine = emojisFrom(date, target, me);
    var picker = (target === me)
      ? '<p class="rx-note">This one\u2019s yours \u2014 reply below.</p>'
      : '<div class="rx-picker">' + EMOJI.map(function (e) {
          return '<button type="button" class="rx-pick' +
            (mine.indexOf(e) > -1 ? " is-on" : "") +
            '" data-emoji="' + esc(e) + '">' + esc(e) + "</button>";
        }).join("") + "</div>";

    var thread = replies.length
      ? '<div class="rp-list">' + replies.map(function (r) {
          return '<div class="rp-item' +
              (r.author === me ? " rp-item--mine" : "") + '">' +
            '<div class="rp-who">' + esc(r.author) +
              '<span class="rp-when">' + esc(clockTime(r.at)) + "</span></div>" +
            '<div class="rp-body">' + esc(r.body) + "</div>" +
          "</div>";
        }).join("") + "</div>"
      : "";

    return chips +
      '<div class="respond" data-date="' + esc(date) +
        '" data-target="' + esc(target) + '">' +
        '<button type="button" class="respond-btn">Respond' +
          (replies.length
            ? '<span class="respond-n">' + replies.length + "</span>"
            : "") +
        "</button>" +
        '<div class="respond-panel"' + (isOpen ? "" : " hidden") + ">" +
          picker + thread +
          '<div class="rp-form">' +
            '<textarea class="rp-input" rows="2" placeholder="Say something\u2026"></textarea>' +
            '<button type="button" class="rp-send">Send</button>' +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function postcard(key, question, byName) {
    var tilts = [-2.4, 2.1];
    var notes = NAMES.map(function (n, i) {
      var row = byName[n] || {};
      // Left-hand note tucks its snapshot into the left corner,
      // right-hand note into the right — text wraps around it.
      var stamped = clockTime(row.at);
      return '<div class="pc-note ' + (i === 0 ? "pc-note--l" : "pc-note--r") + '">' +
        '<div class="pc-from">From ' + esc(n) + "</div>" +
        '<div class="pc-answer">' + esc(row.answer) + "</div>" +
        // With a photo the time lives on the polaroid's white strip;
        // without one it sits quietly under the handwriting.
        (row.photo
          ? snapshot(row.photo, tilts[i], row.at)
          : (stamped ? '<div class="pc-time">' + esc(stamped) + "</div>" : "")) +
        respondBlock(key, n) +
      "</div>";
    }).join('<div class="pc-vline"></div>');

    return '<article class="postcard">' +
      '<div class="pc-head">' +
        '<div class="pc-meta">' +
          '<div class="pc-kicker">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6c-6.1-4.4-9.1-7.7-9.1-11.3A5.05 5.05 0 0 1 12 6.3a5.05 5.05 0 0 1 9.1 3c0 3.6-3 6.9-9.1 11.3z"/></svg>' +
            "Daily Postcard</div>" +
          '<div class="pc-date">' +
            '<span class="pc-date-full">' +
              esc(prettyDate(key, { year: "numeric" })) + "</span>" +
            '<span class="pc-date-short">' +
              esc(prettyDate(key, { weekday: undefined, year: "numeric" })) + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="pc-frank">' + POSTMARK +
          '<div class="pc-stamp"><span>' + esc(shortDate(key)) + "</span></div>" +
        "</div>" +
      "</div>" +
      '<p class="pc-question">' + esc(question) + "</p>" +
      '<div class="pc-divider"></div>' +
      '<div class="pc-notes">' + notes + "</div>" +
    "</article>";
  }

  /* ============================================================
     REACTIONS + REPLIES
     ============================================================ */

  function slotKey(date, target) { return date + "|" + target; }

  function loadActivity() {
    return Promise.all([
      db.from("reactions").select("date,target_name,author_name,emojis,updated_at"),
      db.from("replies").select("date,target_name,author_name,body,at")
        .order("at", { ascending: true })
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      if (res[1].error) throw res[1].error;

      RX = {}; RP = {};
      (res[0].data || []).forEach(function (r) {
        if (!r.emojis) return;
        var k = slotKey(r.date, r.target_name);
        (RX[k] = RX[k] || []).push({
          author: r.author_name, emojis: r.emojis, at: r.updated_at
        });
      });
      (res[1].data || []).forEach(function (r) {
        var k = slotKey(r.date, r.target_name);
        (RP[k] = RP[k] || []).push({
          author: r.author_name, body: r.body, at: r.at
        });
      });
    });
  }

  function emojisFrom(date, target, author) {
    var list = RX[slotKey(date, target)] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].author === author) return list[i].emojis.split(" ").filter(Boolean);
    }
    return [];
  }

  function allEmojis(date, target) {
    var out = [];
    (RX[slotKey(date, target)] || []).forEach(function (r) {
      r.emojis.split(" ").filter(Boolean).forEach(function (e) { out.push(e); });
    });
    return out;
  }

  function toggleEmoji(date, target, emoji) {
    var me = savedName();
    var mine = emojisFrom(date, target, me);
    var i = mine.indexOf(emoji);
    if (i > -1) mine.splice(i, 1);
    else mine.push(emoji);

    return db.from("reactions").upsert(
      { date: date, target_name: target, author_name: me,
        emojis: mine.join(" "), updated_at: new Date().toISOString() },
      { onConflict: "date,target_name,author_name" }
    ).then(function (res) {
      if (res.error) throw res.error;
      return loadActivity();
    });
  }

  function postReply(date, target, body) {
    return db.from("replies").insert({
      date: date, target_name: target, author_name: savedName(),
      body: body, at: new Date().toISOString()
    }).then(function (res) {
      if (res.error) throw res.error;
      return loadActivity();
    });
  }

  // Called after any render that contains postcards.
  function wireResponses(root, rerender) {
    Array.prototype.forEach.call(root.querySelectorAll(".respond"),
      function (box) {
        var date   = box.dataset.date;
        var target = box.dataset.target;
        var panel  = box.querySelector(".respond-panel");
        var input  = box.querySelector(".rp-input");
        var errBox = null;

        function fail(e) {
          if (!errBox) {
            errBox = document.createElement("div");
            errBox.className = "alert rp-error";
            panel.appendChild(errBox);
          }
          errBox.innerHTML = "<strong>Didn\u2019t send.</strong> " +
            esc((e && e.message) || e || "");
        }

        box.querySelector(".respond-btn").onclick = function () {
          panel.hidden = !panel.hidden;
          openPanel = panel.hidden ? "" : slotKey(date, target);
          if (!panel.hidden && input) input.focus();
        };

        Array.prototype.forEach.call(box.querySelectorAll(".rx-pick"),
          function (b) {
            b.onclick = function () {
              b.disabled = true;
              openPanel = slotKey(date, target);
              toggleEmoji(date, target, b.dataset.emoji)
                .then(rerender).catch(function (e) { b.disabled = false; fail(e); });
            };
          });

        var send = box.querySelector(".rp-send");
        if (send) {
          send.onclick = function () {
            var body = (input.value || "").trim();
            if (!body) return;
            send.disabled = true;
            send.textContent = "Sending\u2026";
            openPanel = slotKey(date, target);
            postReply(date, target, body)
              .then(rerender)
              .catch(function (e) {
                send.disabled = false;
                send.textContent = "Send";
                fail(e);
              });
          };
        }
      });
  }

  /* ============================================================
     TODAY
     ============================================================ */

  var state = {
    key: "", question: "", byName: {},
    photoBlob: null,      // a newly picked photo, not uploaded yet
    photoPreview: "",     // object URL for that photo
    dropPhoto: false      // true if they removed an already-saved one
  };

  function clearPending() {
    stopCamera();
    if (state.photoPreview) URL.revokeObjectURL(state.photoPreview);
    state.photoBlob = null;
    state.photoPreview = "";
    state.dropPhoto = false;
  }

  // Removing doesn't delete the row — it blanks the answer, which
  // the loaders read as "hasn't answered". Keeps the database free
  // of a delete policy, so nothing can wipe your history.
  // Removing doesn't delete the row — it blanks the answer, which
  // the loaders read as "hasn't answered". Keeps the database free
  // of a delete policy, so nothing can wipe your history.
  function mountRemove() {
    var host = document.getElementById("remove-host");
    var me = savedName();
    if (!host || !me || !state.byName[me]) return;

    function idle() {
      host.innerHTML = '<button class="btn-quiet" id="rm-go">Remove my answer</button>';
      document.getElementById("rm-go").onclick = ask;
    }

    function ask() {
      var hadPhoto = state.byName[me] && state.byName[me].photo;
      host.innerHTML =
        '<div class="confirm">' +
          '<p class="confirm-q">Remove your answer for today?' +
            (hadPhoto ? " The photo comes off too." : "") + "</p>" +
          '<div class="confirm-row">' +
            '<button class="confirm-no" id="rm-no">Keep it</button>' +
            '<button class="confirm-yes" id="rm-yes">Remove</button>' +
          "</div>" +
        "</div>";
      document.getElementById("rm-no").onclick = idle;
      document.getElementById("rm-yes").onclick = go;
    }

    function go() {
      var yes = document.getElementById("rm-yes");
      yes.disabled = true;
      yes.textContent = "Removing\u2026";
      db.from("entries").upsert(
        { date: state.key, name: me, answer: "",
          question: state.question, photo: null, at: null },
        { onConflict: "date,name" }
      ).then(function (res) {
        if (res.error) throw res.error;
        clearPending();
        archiveLoaded = false;
        return loadToday();
      }).catch(function (e) {
        host.innerHTML = '<div class="alert"><strong>Couldn\u2019t remove that.</strong> ' +
          esc(e.message || e) + "</div>";
      });
    }

    idle();
  }

  function renderToday() {
    stopCamera();
    var key = state.key, q = state.question, byName = state.byName;
    var answered = NAMES.filter(function (n) { return byName[n]; });

    // Both in — reveal.
    if (answered.length === 2) {
      todayEl.innerHTML =
        '<p class="reveal-note">Both answers are in</p>' +
        postcard(key, q, byName) +
        '<div id="remove-host" class="reveal-foot"></div>';
      hideBrokenPhotos(todayEl);
      wireResponses(todayEl, renderToday);
      mountRemove();
      return;
    }

    var me = savedName();

    // I've answered, they haven't — waiting room.
    if (me && byName[me]) {
      var them = NAMES.find(function (n) { return n !== me; });
      var mine = byName[me];
      todayEl.innerHTML =
        '<div class="card waiting">' +
          '<svg class="seal" width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden="true">' +
            '<rect x="1" y="1" width="70" height="54" rx="7" fill="#FDF4EC" stroke="#E8D8CC" stroke-width="1.5"/>' +
            '<path d="M2 5l34 25L70 5" stroke="#E8D8CC" stroke-width="1.5" fill="none"/>' +
            '<circle cx="36" cy="34" r="11" fill="#F0D9D9" stroke="#C97B84" stroke-width="1.5"/>' +
            '<path d="M36 39c-4-3-6.5-5-6.5-7.6a3.1 3.1 0 0 1 6.5-1.6 3.1 3.1 0 0 1 6.5 1.6c0 2.6-2.5 4.6-6.5 7.6z" fill="#C97B84"/>' +
          "</svg>" +
          '<h2 class="waiting-head">Sealed and sent.</h2>' +
          '<p class="waiting-sub">Waiting on ' + esc(them) +
            ". Nothing shows up here until you've both answered.</p>" +
          '<div class="yours">' +
            '<div class="yours-label">What you wrote</div>' +
            (mine.photo ? '<div class="yours-snap"><img src="' +
               esc(mine.photo) + '" alt=""></div>' : "") +
            '<div class="yours-text">' + esc(mine.answer) + "</div>" +
          "</div>" +
          '<button class="btn-quiet" id="edit-btn">Change my answer</button>' +
          '<div id="remove-host"></div>' +
        "</div>";
      hideBrokenPhotos(todayEl);
      document.getElementById("edit-btn").onclick = function () {
        clearPending();
        renderForm(mine.answer, mine.photo);
      };
      mountRemove();
      return;
    }

    clearPending();
    renderForm("", "");
  }

  var CAMERA_ICON =
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.8A1 1 0 0 1 8.7 4.7h6.6a1 1 0 0 1 .9.5L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9z" ' +
        'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12.6" r="3.4" stroke="currentColor" stroke-width="1.5"/>' +
    "</svg>";

  var LIBRARY_ICON =
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<rect x="3" y="5" width="18" height="14" rx="2.2" ' +
        'stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M3.6 16.2l4.6-4.3a1.6 1.6 0 0 1 2.2 0l3.1 2.9m0 0l2.1-1.9a1.6 1.6 0 0 1 2.2 0l2.2 2" ' +
        'stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="9" cy="9.4" r="1.3" fill="currentColor"/>' +
    "</svg>";

  // `existing` is a URL already saved on the server, if any.
  function paintPhotoSlot(existing) {
    var slot = document.getElementById("photo-slot");
    if (!slot) return;

    var showing = state.photoPreview ||
                  (!state.dropPhoto && existing ? existing : "");

    if (showing) {
      slot.innerHTML =
        '<div class="photo-preview">' +
          '<div class="photo-tag">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
              '<path d="M4.5 12.8l4.6 4.6L19.5 7" stroke="currentColor" ' +
                'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
            "</svg>Photo attached</div>" +
          '<img src="' + esc(showing) + '" alt="Your attached photo">' +
          '<div class="photo-actions">' +
            '<button type="button" class="photo-mini" id="photo-retake">Retake</button>' +
            '<button type="button" class="photo-mini" id="photo-lib-btn">Camera roll</button>' +
          "</div>" +
          '<button type="button" class="btn-quiet photo-drop" id="photo-drop">' +
            "Remove photo</button>" +
        "</div>";
      document.getElementById("photo-retake").onclick = function () {
        if (canUseWebcam()) openCamera(existing);
        else document.getElementById("photo-cam").click();
      };
      document.getElementById("photo-lib-btn").onclick = function () {
        document.getElementById("photo-lib").click();
      };
      document.getElementById("photo-drop").onclick = function () {
        clearPending();
        state.dropPhoto = true;
        paintPhotoSlot(existing);
      };
    } else {
      slot.innerHTML =
        '<button type="button" class="photo-btn" id="photo-shoot">' +
          CAMERA_ICON + "<span>Take a photo</span>" +
        "</button>" +
        '<button type="button" class="photo-btn photo-btn--alt" id="photo-pick">' +
          LIBRARY_ICON + "<span>Choose from camera roll</span>" +
        "</button>";
      document.getElementById("photo-shoot").onclick = function () {
        if (canUseWebcam()) openCamera(existing);
        else document.getElementById("photo-cam").click();
      };
      document.getElementById("photo-pick").onclick = function () {
        document.getElementById("photo-lib").click();
      };
    }
  }

  function renderForm(prefill, existingPhoto) {
    var me = savedName();

    todayEl.innerHTML =
      '<div class="card">' +
        '<p class="datestamp">' + esc(prettyDate(state.key)) + "</p>" +
        '<h1 class="question">' + esc(state.question) + "</h1>" +
        '<hr class="rule">' +
        '<div id="form-error"></div>' +
        '<div class="field">' +
          '<label class="label" for="answer">Your answer</label>' +
          '<textarea id="answer" placeholder="Take your time&hellip;">' +
            esc(prefill) + "</textarea>" +
        "</div>" +
        '<div class="field">' +
          '<span class="label">Photo <span class="label-opt">optional</span></span>' +
          '<input type="file" id="photo-cam" accept="image/*" ' +
            'capture="environment" class="photo-input">' +
          '<input type="file" id="photo-lib" accept="image/*" class="photo-input">' +
          '<div id="photo-slot"></div>' +
        "</div>" +
        '<button class="btn" id="send">Seal it</button>' +
      "</div>";

    var answer = document.getElementById("answer");
    var send   = document.getElementById("send");

    paintPhotoSlot(existingPhoto);

    function tookPhoto(input) {
      var f = input.files && input.files[0];
      input.value = "";              // so picking the same file twice works
      if (!f) return;

      var err = document.getElementById("form-error");
      err.innerHTML = '<div class="alert">Getting that photo ready&hellip;</div>';

      shrink(f).then(function (blob) {
        clearPending();
        state.photoBlob = blob;
        state.photoPreview = URL.createObjectURL(blob);
        err.innerHTML = "";
        paintPhotoSlot(existingPhoto);
      }).catch(function (e) {
        err.innerHTML = '<div class="alert"><strong>Couldn’t use that photo.</strong> ' +
          esc(e.message || e) + "</div>";
      });
    }

    ["photo-cam", "photo-lib"].forEach(function (id) {
      document.getElementById(id).onchange = function () {
        tookPhoto(this);
      };
    });

    send.onclick = function () {
      var name = savedName();
      var text = answer.value.trim();
      var err  = document.getElementById("form-error");
      err.innerHTML = "";

      if (!name) {
        renderChooser(false);
        return;
      }
      if (!text) {
        err.innerHTML = '<div class="alert">Write something before sealing it.</div>';
        return;
      }

      send.disabled = true;
      send.textContent = state.photoBlob ? "Sending photo…" : "Sending…";

      var photoStep = state.photoBlob
        ? uploadPhoto(state.key, name, state.photoBlob)
        : Promise.resolve(state.dropPhoto ? null : (existingPhoto || null));

      photoStep.then(function (photoUrl) {
        send.textContent = "Sending…";
        return db.from("entries").upsert(
          { date: state.key, name: name, answer: text,
            question: state.question, photo: photoUrl,
            at: new Date().toISOString() },
          { onConflict: "date,name" }
        );
      }).then(function (res) {
        if (res.error) throw res.error;
        clearPending();
        archiveLoaded = false;         // archive may have a new postcard
        return loadToday();
      }).catch(function (e) {
        send.disabled = false;
        send.textContent = "Seal it";
        err.innerHTML = '<div class="alert"><strong>Couldn’t save.</strong> ' +
          esc(e.message || e) + "</div>";
      });
    };
  }

  function loadToday() {
    state.key = todayKey();
    state.question = questionFor(state.key);

    return loadActivity()
      .then(function () {
        return db.from("entries")
          .select("name,answer,photo,at")
          .eq("date", state.key);
      })
      .then(function (res) {
        if (res.error) throw res.error;
        state.byName = {};
        (res.data || []).forEach(function (row) {
          // A removed answer is stored blank rather than deleted,
          // so the day simply reads as unanswered again.
          if (row.answer && row.answer.trim()) {
            state.byName[row.name] =
              { answer: row.answer, photo: row.photo, at: row.at };
          }
        });
        renderToday();
        paintWhoami();
      })
      .catch(function (e) {
        todayEl.innerHTML = '<div class="card"><div class="alert">' +
          "<strong>Couldn\u2019t reach Supabase.</strong> " + esc(e.message || e) +
          setupHint(e) + "</div></div>";
      });
  }

  /* ============================================================
     ARCHIVE
     ============================================================ */

  function loadArchive() {
    archiveEl.innerHTML = '<p class="placeholder">Sorting the mail&hellip;</p>';

    loadActivity()
      .then(function () {
        return db.from("entries")
          .select("date,name,answer,question,photo,at")
          .order("date", { ascending: false });
      })
      .then(function (res) {
        if (res.error) throw res.error;

        var days = {};
        var order = [];
        (res.data || []).forEach(function (row) {
          if (!row.answer || !row.answer.trim()) return;   // removed
          if (!days[row.date]) { days[row.date] = {}; order.push(row.date); }
          days[row.date][row.name] = row;
        });

        // Only fully-answered days become postcards. A day where
        // one of you never replied stays private.
        var complete = order.filter(function (d) {
          return NAMES.every(function (n) { return days[d][n]; });
        });

        if (!complete.length) {
          archiveEl.innerHTML =
            '<div class="empty">' +
              '<svg width="64" height="50" viewBox="0 0 72 56" fill="none" aria-hidden="true">' +
                '<rect x="1" y="1" width="70" height="54" rx="7" fill="#FDF4EC" stroke="#E8D8CC" stroke-width="1.5"/>' +
                '<path d="M2 5l34 25L70 5" stroke="#E8D8CC" stroke-width="1.5" fill="none"/>' +
              "</svg>" +
              '<h2 class="empty-head">No postcards yet</h2>' +
              '<p class="empty-sub">A day shows up here once you’ve ' +
                "both answered it.</p>" +
            "</div>";
          archiveLoaded = true;
          return;
        }

        var tilts = [-0.7, 0.5, -0.4, 0.8, -0.6, 0.3];

        var cards = complete.map(function (d, i) {
          var byName = {};
          NAMES.forEach(function (n) {
            byName[n] = { answer: days[d][n].answer,
                          photo: days[d][n].photo,
                          at: days[d][n].at };
          });
          // Prefer the question stored with the entry, so editing
          // questions.js never rewrites history.
          var q = days[d][NAMES[0]].question ||
                  days[d][NAMES[1]].question ||
                  questionFor(d);
          return postcard(d, q, byName).replace(
            '<article class="postcard">',
            '<article class="postcard" style="--tilt:' + tilts[i % tilts.length] + 'deg">'
          );
        }).join("");

        archiveEl.innerHTML =
          '<div class="archive-head"><span class="archive-count">' +
            complete.length + (complete.length === 1 ? " postcard" : " postcards") +
          "</span></div>" +
          '<div class="archive-list">' + cards + "</div>";

        hideBrokenPhotos(archiveEl);
        wireResponses(archiveEl, loadArchive);
        archiveLoaded = true;
      })
      .catch(function (e) {
        archiveEl.innerHTML = '<div class="card"><div class="alert">' +
          "<strong>Couldn’t load the archive.</strong> " + esc(e.message || e) +
          setupHint(e) + "</div></div>";
      });
  }

  /* ============================================================
     TABS + BOOT
     ============================================================ */

  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    Array.prototype.forEach.call(tabs, function (btn) {
      btn.onclick = function () {
        Array.prototype.forEach.call(tabs, function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        var name = btn.dataset.tab;
        document.getElementById("view-today")
          .classList.toggle("is-hidden", name !== "today");
        document.getElementById("view-archive")
          .classList.toggle("is-hidden", name !== "archive");
        if (name === "archive" && !archiveLoaded) loadArchive();
      };
    });
  }

  function boot() {
    initTabs();

    var problems = configProblems();
    if (problems.length) {
      todayEl.innerHTML = setupCard(problems);
      archiveEl.innerHTML = setupCard(problems);
      return;
    }

    db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

    paintWhoami();
    if (!savedName()) renderChooser(false);   // first run on this phone
    else loadToday();

    // Coming back to the tab should show whatever arrived while you
    // were away — a new answer, a reaction, a reply. Refetches
    // quietly and puts back anything you were part-way through
    // typing, so this can never eat a draft.
    var lastRefresh = 0;

    function softRefresh() {
      if (document.hidden) return;
      var now = Date.now();
      if (now - lastRefresh < 4000) return;      // don't thrash
      lastRefresh = now;

      if (document.body.classList.contains("choosing")) return;

      var ta = document.getElementById("answer");
      var draft = ta ? ta.value : null;

      var replyBox = document.querySelector(
        ".respond-panel:not([hidden]) .rp-input");
      var replyDraft = replyBox ? replyBox.value : null;

      var rolled = state.key !== todayKey();
      if (rolled) archiveLoaded = false;

      loadToday().then(function () {
        var ta2 = document.getElementById("answer");
        if (ta2 && draft) ta2.value = draft;
        var rb2 = document.querySelector(
          ".respond-panel:not([hidden]) .rp-input");
        if (rb2 && replyDraft) rb2.value = replyDraft;

        var onArchive = !document.getElementById("view-archive")
          .classList.contains("is-hidden");
        if (onArchive) loadArchive();
        else archiveLoaded = false;
      });
    }

    document.addEventListener("visibilitychange", softRefresh);
    window.addEventListener("focus", softRefresh);
  }

  boot();
})();
