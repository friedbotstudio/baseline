/* baseline — site behavior
 *
 * Two behaviors, both progressive enhancements over working markup:
 *   1. Click-to-copy on install-command affordances.
 *   2. FAQ disclosure.
 *
 * The FAQ answers ship visible in the HTML and are collapsed here on load, so
 * a reader without JS gets every answer rather than a row of dead buttons.
 */
(function () {
  "use strict";

  var COPY_RESET_MS = 1600;
  var status = document.getElementById("copy-status");

  /* --------------------------------------------------------- analytics */

  /* gtag exists only when _data/analytics.js resolved a measurement id, which
   * happens in CI builds and nowhere else. Every call site re-checks it, so a
   * local build with no tag on the page is a no-op rather than a ReferenceError.
   */
  function analyticsReady() {
    return typeof window.gtag === "function";
  }

  /* ------------------------------------------------------------- copy */

  function announce(message) {
    if (status) status.textContent = message;
  }

  function setCopyState(button, label) {
    var slot = button.querySelector(".copy-state");
    if (slot) slot.textContent = label;
  }

  function copyCommand(button) {
    var text = button.getAttribute("data-copy") || "";
    if (!text) return;

    var done = function () {
      setCopyState(button, "copied");
      announce("Copied " + text + " to the clipboard.");
      window.clearTimeout(button._copyTimer);
      button._copyTimer = window.setTimeout(function () {
        setCopyState(button, "click to copy");
      }, COPY_RESET_MS);
    };

    var failed = function () {
      setCopyState(button, "copy failed");
      announce("Copy failed. Select the command and copy it manually.");
      window.clearTimeout(button._copyTimer);
      button._copyTimer = window.setTimeout(function () {
        setCopyState(button, "click to copy");
      }, COPY_RESET_MS);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, failed);
      return;
    }

    // Fallback for non-secure contexts, where navigator.clipboard is absent.
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "absolute";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(field);
    if (ok) done();
    else failed();
  }

  /* Every .js-copy button reports under one event name, so the install-command
   * conversion and a docs slash-command copy are told apart by command_kind
   * rather than by parsing the copied text. A button with no [data-copy-kind]
   * reads as "command": the generic case is the common one, and a new copy
   * affordance that forgets the attribute lands in the bucket that does not
   * inflate the conversion count.
   */
  function copyKind(button) {
    return button.getAttribute("data-copy-kind") || "command";
  }

  var copyButtons = document.querySelectorAll(".js-copy");
  for (var i = 0; i < copyButtons.length; i++) {
    copyButtons[i].addEventListener("click", function (event) {
      var button = event.currentTarget;
      copyCommand(button);
      var command = button.getAttribute("data-copy") || "";
      if (analyticsReady()) {
        window.gtag("event", "copy_install_command", {
          command: command,
          command_kind: copyKind(button),
        });
      }
    });
  }

  /* ------------------------------------------------------------- cta */

  /* Deliberately keyed on [data-cta] alone. Copy affordances carry [data-copy]
   * and are handled above, so a button that both copies and is a CTA would
   * otherwise report twice for one click. The two selectors stay disjoint.
   */
  var ctaLinks = document.querySelectorAll("[data-cta]");
  for (var c = 0; c < ctaLinks.length; c++) {
    ctaLinks[c].addEventListener("click", function (event) {
      var el = event.currentTarget;
      if (analyticsReady()) {
        window.gtag("event", "select_content", {
          content_type: "cta",
          content_id: el.getAttribute("data-cta"),
        });
      }
    });
  }

  /* ------------------------------------------------------------- menu */

  var bar = document.querySelector(".util-bar");
  var navToggle = document.querySelector(".nav-toggle");
  var panel = document.getElementById("util-collapse");

  function setMenu(open) {
    if (!bar || !navToggle) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) bar.classList.add("is-open");
    else bar.classList.remove("is-open");
  }

  function menuIsOpen() {
    return !!navToggle && navToggle.getAttribute("aria-expanded") === "true";
  }

  if (navToggle && panel && bar) {
    navToggle.addEventListener("click", function () {
      setMenu(!menuIsOpen());
    });

    // A same-page anchor does not reload, so the panel would stay open over the
    // section it just scrolled to.
    panel.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuIsOpen()) {
        setMenu(false);
        navToggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!menuIsOpen()) return;
      if (bar.contains(event.target)) return;
      setMenu(false);
    });

    // Leaving the narrow breakpoint with the panel open would strand the
    // is-open class on a bar that no longer collapses.
    var narrow = window.matchMedia("(max-width: 760px)");
    var onChange = function (event) {
      if (!event.matches) setMenu(false);
    };
    if (narrow.addEventListener) narrow.addEventListener("change", onChange);
    else if (narrow.addListener) narrow.addListener(onChange);
  }

  /* -------------------------------------------------------------- faq */

  function toggleFaq(button) {
    var panel = document.getElementById(button.getAttribute("aria-controls"));
    if (!panel) return;
    var open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    panel.hidden = open;
    var sign = button.querySelector(".sign");
    if (sign) sign.textContent = open ? "+" : "–";
  }

  // Collapse every row except those the markup marks as starting open. The
  // rule is declared per row rather than inferred from the row count, so a
  // page with a different number of questions behaves predictably.
  var questions = document.querySelectorAll(".faq-q");
  for (var j = 0; j < questions.length; j++) {
    var question = questions[j];
    if (!question.hasAttribute("data-start-open")) {
      var faqPanel = document.getElementById(question.getAttribute("aria-controls"));
      if (faqPanel) {
        faqPanel.hidden = true;
        question.setAttribute("aria-expanded", "false");
        var sign = question.querySelector(".sign");
        if (sign) sign.textContent = "+";
      }
    }
    question.addEventListener("click", function (event) {
      toggleFaq(event.currentTarget);
    });
  }

  /* ------------------------------------------------------- docs sidebar */

  // The sidebar ships `open` so a reader without JS gets the full menu rather
  // than a disclosure they cannot operate. With JS, it starts closed on narrow
  // viewports, where 16 open nav rows would bury the article.
  var side = document.querySelector(".docs-side");
  if (side) {
    var stacked = window.matchMedia("(max-width: 860px)");
    var syncSide = function (matches) {
      if (matches) side.removeAttribute("open");
      else side.setAttribute("open", "");
    };
    syncSide(stacked.matches);
    var onSideChange = function (event) { syncSide(event.matches); };
    if (stacked.addEventListener) stacked.addEventListener("change", onSideChange);
    else if (stacked.addListener) stacked.addListener(onSideChange);

    // A nav choice on a phone should not leave the menu covering the page.
    side.addEventListener("click", function (event) {
      if (stacked.matches && event.target.closest("a")) side.removeAttribute("open");
    });
  }

  /* -------------------------------------------------------------- toc */

  // Mark the section the reader is in. Wayfinding on a long tutorial, so it
  // earns its place on a Read surface; it changes state, never animates.
  var tocLinks = document.querySelectorAll(".toc-link");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    var targets = [];
    for (var k = 0; k < tocLinks.length; k++) {
      var id = decodeURIComponent((tocLinks[k].getAttribute("href") || "").slice(1));
      var target = id && document.getElementById(id);
      if (!target) continue;
      byId[id] = tocLinks[k];
      targets.push(target);
    }

    // The reading line. A heading at or above it has been passed; the last one
    // passed names the section the reader is in.
    var READING_LINE = 120;

    var setActive = function () {
      // Geometry decides, not intersection state. Preferring the first heading
      // inside an observer band looks equivalent but is wrong for any section
      // shorter than the band: the NEXT heading is already on screen while the
      // reader is still in the current section, so the band-first rule lights
      // the row below the one being read. Walking to the last passed heading
      // has no such case and needs no per-target bookkeeping.
      var current = null;
      for (var m = 0; m < targets.length; m++) {
        if (targets[m].getBoundingClientRect().top <= READING_LINE) current = targets[m].id;
      }
      // Above the first heading there is deliberately no active row.

      // At maxScroll the document runs out of scroll beneath the last heading,
      // which can leave it permanently below the reading line. Once the reader
      // is at the bottom, the last section is the one they are in.
      var atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && targets.length) current = targets[targets.length - 1].id;

      for (var id2 in byId) {
        if (Object.prototype.hasOwnProperty.call(byId, id2)) {
          byId[id2].classList.toggle("is-active", id2 === current);
        }
      }
    };

    // The observer is a trigger, not the source of truth: it re-runs the
    // geometry when a heading crosses the viewport, which covers reflow the
    // scroll listener would not see.
    var observer = new IntersectionObserver(function () {
      setActive();
    }, { rootMargin: "-80px 0px -70% 0px" });

    for (var t = 0; t < targets.length; t++) observer.observe(targets[t]);

    // The observer alone leaves the row stale on a jump. Clicking a TOC link
    // (or landing on a #hash) can move every heading from above-the-band to
    // above-the-band without one ever crossing it, which fires no entries, so
    // setActive never runs and the previous row stays lit. A rAF-throttled
    // scroll listener re-runs the same geometry; the observer stays as the
    // cheap path for ordinary reading.
    var queued = false;
    var onScroll = function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        setActive();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    setActive();
  }
})();
