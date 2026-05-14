/* baseline — site.js
 * Two behaviours, no dependencies:
 *   1. dev-console: types a Claude Code session in the hero, loops.
 *   2. cli-strip:   click-to-copy install command above the footer.
 * Both honour prefers-reduced-motion and run only when their target exists.
 */

(() => {
  "use strict";

  /* The DevTools console signature is emitted by an inline templated <script>
     in _layouts/base.njk so its counts stay bound to _data/baseline.json. */

  const reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* dev-console: live-typing Claude Code session                       */
  /* ------------------------------------------------------------------ */

  const STREAM = document.getElementById("dc-stream");

  const SCRIPT = [
    { kind: "cmd",   text: '/triage "add user-facing onboarding flow"' },
    { kind: "tick",  text: "entry: intake · exceptions: []" },
    { kind: "blank" },
    { kind: "cmd",   text: "/intake" },
    { kind: "tick",  text: "docs/intake/onboarding.md" },
    { kind: "blank" },
    { kind: "cmd",   text: "/scout" },
    { kind: "tick",  text: "12 files · 3 modules mapped" },
    { kind: "blank" },
    { kind: "cmd",   text: "/research" },
    { kind: "wait",  text: "surfacing 3 candidates via context7…" },
  ];

  const TYPE_MS = 28;     // per char while typing a command body
  const TICK_MS = 16;     // per char on success lines (faster, less performative)
  const PAUSE_AFTER_LINE = 320;
  const PAUSE_AFTER_RUN = 6500;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function appendCursor(line) {
    const c = el("span", "dc-cursor");
    c.setAttribute("aria-hidden", "true");
    line.appendChild(c);
    return c;
  }

  function removeCursor(line) {
    const c = line.querySelector(".dc-cursor");
    if (c) c.remove();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typeInto(parent, str, speed) {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      parent.appendChild(document.createTextNode(ch));
      await sleep(speed);
    }
  }

  /* For commands the slash and command name color in accent; the quoted
     argument colors in str-green. We split a command line into pieces. */
  function paintCommand(line, text) {
    const m = text.match(/^(\/[a-z-]+)(\s+)?(.*)?$/);
    if (!m) {
      line.appendChild(document.createTextNode(text));
      return;
    }
    const slash = el("span", "dc-slash", m[1]);
    line.appendChild(slash);
    if (m[2]) line.appendChild(document.createTextNode(m[2]));
    if (m[3]) {
      const arg = el("span", "dc-str", m[3]);
      line.appendChild(arg);
    }
  }

  async function renderStep(step) {
    const line = el("span", "dc-line dc-" + step.kind);

    if (step.kind === "cmd") {
      const prompt = el("span", "dc-prompt", "> ");
      line.appendChild(prompt);
      STREAM.appendChild(line);
      appendCursor(line);
      await sleep(160);
      // type characters; for cmd we paint slash/arg AFTER fully typed
      const buf = el("span", "dc-cmd-buf");
      line.insertBefore(buf, line.querySelector(".dc-cursor"));
      for (let i = 0; i < step.text.length; i++) {
        buf.appendChild(document.createTextNode(step.text[i]));
        await sleep(TYPE_MS);
      }
      // promote: replace plain buf with painted version
      buf.textContent = "";
      paintCommand(buf, step.text);
      removeCursor(line);
      STREAM.appendChild(document.createTextNode("\n"));
      await sleep(PAUSE_AFTER_LINE);
      return;
    }

    if (step.kind === "tick") {
      line.appendChild(el("span", "dc-pad", "  "));
      line.appendChild(el("span", "dc-ok", "✓ "));
      const body = el("span", "dc-dim");
      line.appendChild(body);
      STREAM.appendChild(line);
      appendCursor(line);
      await typeInto(body, step.text, TICK_MS);
      removeCursor(line);
      STREAM.appendChild(document.createTextNode("\n"));
      await sleep(PAUSE_AFTER_LINE);
      return;
    }

    if (step.kind === "wait") {
      line.appendChild(el("span", "dc-pad", "  "));
      line.appendChild(el("span", "dc-wait", "⏳ "));
      const body = el("span", "dc-dim");
      line.appendChild(body);
      STREAM.appendChild(line);
      appendCursor(line);
      await typeInto(body, step.text, TICK_MS);
      // leave the cursor blinking on this last line for a beat
      await sleep(1400);
      removeCursor(line);
      STREAM.appendChild(document.createTextNode("\n"));
      return;
    }

    if (step.kind === "blank") {
      STREAM.appendChild(document.createTextNode("\n"));
      await sleep(120);
      return;
    }
  }

  function renderStatic() {
    /* Reduced-motion: paint the whole script as final state, no animation. */
    STREAM.textContent = "";
    for (const step of SCRIPT) {
      if (step.kind === "blank") {
        STREAM.appendChild(document.createTextNode("\n"));
        continue;
      }
      const line = el("span", "dc-line dc-" + step.kind);
      if (step.kind === "cmd") {
        line.appendChild(el("span", "dc-prompt", "> "));
        const buf = el("span", "dc-cmd-buf");
        paintCommand(buf, step.text);
        line.appendChild(buf);
      } else if (step.kind === "tick") {
        line.appendChild(el("span", "dc-pad", "  "));
        line.appendChild(el("span", "dc-ok", "✓ "));
        line.appendChild(el("span", "dc-dim", step.text));
      } else if (step.kind === "wait") {
        line.appendChild(el("span", "dc-pad", "  "));
        line.appendChild(el("span", "dc-wait", "⏳ "));
        line.appendChild(el("span", "dc-dim", step.text));
      }
      STREAM.appendChild(line);
      STREAM.appendChild(document.createTextNode("\n"));
    }
  }

  async function runConsoleLoop() {
    while (true) {
      STREAM.textContent = "";
      for (const step of SCRIPT) {
        await renderStep(step);
      }
      await sleep(PAUSE_AFTER_RUN);
    }
  }

  if (STREAM) {
    if (reducedMotion) {
      renderStatic();
    } else {
      runConsoleLoop();
    }
  }

  /* ------------------------------------------------------------------ */
  /* docs sidebar: mobile hamburger drawer                              */
  /* ------------------------------------------------------------------ */

  const navToggle = document.querySelector(".nav-toggle");
  const navBackdrop = document.querySelector(".nav-backdrop");
  const navSidebar = document.getElementById("docs-sidebar");

  function setNavOpen(open) {
    document.body.classList.toggle("is-nav-open", open);
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute(
        "aria-label",
        open ? "Close documentation navigation" : "Open documentation navigation"
      );
    }
  }

  if (navToggle) {
    navToggle.addEventListener("click", () => {
      setNavOpen(!document.body.classList.contains("is-nav-open"));
    });
  }
  if (navBackdrop) {
    navBackdrop.addEventListener("click", () => setNavOpen(false));
  }
  if (navSidebar) {
    /* Close drawer when a link inside is tapped — links navigate to a new
       page anyway, but on same-page anchor links we still want the drawer
       to close so the content is visible. */
    navSidebar.addEventListener("click", (e) => {
      if (e.target.closest("a")) setNavOpen(false);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("is-nav-open")) {
      setNavOpen(false);
      if (navToggle) navToggle.focus();
    }
  });

  /* ------------------------------------------------------------------ */
  /* cli-strip: click-to-copy install command                           */
  /* ------------------------------------------------------------------ */

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        // Older browsers / insecure context: synthesize a textarea + execCommand.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (_) {}
        ta.remove();
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", "copy_install_command", { command: text });
      }
      btn.classList.add("is-copied");
      const hint = btn.querySelector(".cli-hint");
      if (hint) hint.textContent = hint.getAttribute("data-copied");
      setTimeout(() => {
        btn.classList.remove("is-copied");
        if (hint) hint.textContent = hint.getAttribute("data-default");
      }, 1800);
    });
  });

  /* ------------------------------------------------------------------ */
  /* GA4: CTA click instrumentation                                     */
  /* ------------------------------------------------------------------ */
  /* Separate selector ([data-cta]) from the copy handler ([data-copy]) so
     the cli-strip button — which has [data-copy] but not [data-cta] — does
     not double-fire as both a CTA click and a copy event. */
  document.querySelectorAll("[data-cta]").forEach((el) => {
    el.addEventListener("click", () => {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", "select_content", {
        content_type: "cta",
        content_id: el.getAttribute("data-cta"),
      });
    });
  });
})();
