/* =====================================================================================================
   Lab core: tiny helpers + the live data every lesson shares (Eureka registry, container states, identity)
   No framework, no build step: open the files and read them - that's part of the teaching.
   ===================================================================================================== */
(function () {
  "use strict";

  const Lab = (window.Lab = { lessons: [], widgets: {}, cleanups: [] });
  const PORTS = window.LAB_PORTS || { gateway: 8880, eureka: 8761, kibana: 5601, prometheus: 9099, grafana: 3030, es: 9200, redis: 6380 };
  Lab.ports = PORTS;
  Lab.toolUrl = (tool, path = "") => `${location.protocol}//${location.hostname}:${PORTS[tool]}${path}`;

  // ------------------------------------------------------------------------------- DOM helper
  /** h("div", {class:"x", onclick:fn}, "text", childNode, [more, nodes]) */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    (function add(list) {
      for (const c of list) {
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) add(c);
        else el.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    })(kids);
    return el;
  }
  Lab.h = h;
  Lab.$ = (sel, root = document) => root.querySelector(sel);
  Lab.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  Lab.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  Lab.clock = (d = new Date()) => d.toTimeString().slice(0, 8);
  Lab.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  Lab.fmtBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
  Lab.pretty = (v) => { try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); } catch { return String(v); } };

  // ------------------------------------------------------------------------------- tiny event bus
  const listeners = {};
  Lab.on = (evt, fn) => { (listeners[evt] = listeners[evt] || new Set()).add(fn); return () => listeners[evt].delete(fn); };
  Lab.emit = (evt, data) => (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  // ------------------------------------------------------------------------------- toast
  Lab.toast = (msg, kind = "") => {
    let box = Lab.$(".toasts");
    if (!box) { box = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
    const t = h("div", { class: `toast ${kind}` }, msg);
    box.append(t);
    setTimeout(() => t.remove(), 4200);
  };

  // ------------------------------------------------------------------------------- instance naming / colours
  /** "product-service-2" | "product-2" | "product-service:product-2" -> "p2" */
  Lab.instKey = (s) => { const m = /product(?:-service)?[-:]*(?:product-)?([123])/.exec(String(s || "")); return m ? "p" + m[1] : ""; };
  Lab.instChip = (s) => h("span", { class: `chip ${Lab.instKey(s)}` }, String(s).replace(/:\d+$/, ""));
  Lab.instColorVar = (s) => ({ p1: "var(--p1)", p2: "var(--p2)", p3: "var(--p3)" }[Lab.instKey(s)] || "var(--svc-other)");

  // ------------------------------------------------------------------------------- identity (who is "logged in" in the UI)
  Lab.users = []; // filled from /gw/lab/users
  Lab.identity = localStorage.getItem("lab.identity") || "alice";
  Lab.clientId = sessionStorage.getItem("lab.clientId") || (() => { const id = Math.random().toString(36).slice(2, 8); sessionStorage.setItem("lab.clientId", id); return id; })();
  Lab.setIdentity = (id) => { Lab.identity = id; localStorage.setItem("lab.identity", id); Lab.emit("identity", id); };
  Lab.token = () => (Lab.users.find((u) => u.id === Lab.identity) || {}).token;
  Lab.authHeaders = (identity = Lab.identity) => {
    const u = Lab.users.find((x) => x.id === identity);
    return u ? { Authorization: "Bearer " + u.token } : {};
  };
  Lab.loadUsers = async () => {
    const r = await Lab.http("GET", "/gw/lab/users", { quiet: true });
    if (r.ok && Array.isArray(r.json)) Lab.users = r.json;
    return Lab.users;
  };

  // ------------------------------------------------------------------------------- HTTP
  /**
   * Every call the UI makes goes through here. It returns a plain result object (never throws) and, for calls that
   * pass through the gateway, animates the packet on the live map using the X-Upstream / X-Matched-Route headers.
   */
  Lab.http = async function (method, url, opts = {}) {
    const started = performance.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeout || 15000);
    const headers = Object.assign({}, opts.headers || {});
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";
    const res = { method, url, ok: false, status: 0, ms: 0, headers: {}, text: "", json: null, bytes: 0, error: null };
    try {
      const r = await fetch(url, { method, headers, signal: ctl.signal, cache: "no-store", body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body });
      res.status = r.status; res.ok = r.ok;
      r.headers.forEach((v, k) => (res.headers[k.toLowerCase()] = v));
      res.text = await r.text();
      res.bytes = new TextEncoder().encode(res.text).length;
      try { res.json = JSON.parse(res.text); } catch { /* not JSON */ }
    } catch (e) {
      res.error = e.name === "AbortError" ? "timeout" : String(e.message || e);
    } finally {
      clearTimeout(timer);
      res.ms = Math.round(performance.now() - started);
    }
    if (!opts.quiet && Lab.map) Lab.map.fromResponse(res);
    return res;
  };
  Lab.get = (url, opts) => Lab.http("GET", url, opts);
  Lab.post = (url, json, opts) => Lab.http("POST", url, Object.assign({ json: json === undefined ? {} : json }, opts));

  /** Through the gateway with the current identity + a stable client id (used by the rate limiter). */
  Lab.gw = (method, path, opts = {}) =>
    Lab.http(method, "/gw" + path, Object.assign({}, opts, {
      headers: Object.assign({ "X-Client-Id": Lab.clientId }, opts.auth === false ? {} : Lab.authHeaders(opts.as), opts.headers || {}),
    }));

  /** One-line description of a response for consoles. */
  Lab.describe = (res) => {
    const route = res.headers["x-matched-route"], up = res.headers["x-upstream"];
    const via = route || up ? `  route=${route || "-"} upstream=${up || "-"}` : "";
    const inst = res.headers["x-instance-id"] ? `  instance=${res.headers["x-instance-id"]}` : "";
    return `${res.method} ${res.url.replace(/^\/gw/, "")} -> ${res.status || "ERR"} ${res.error || ""} ${res.ms}ms${via}${inst}`;
  };

  // ------------------------------------------------------------------------------- consoles & JSON boxes
  Lab.consoleBox = (emptyText = "Nothing yet - press a button above.") => {
    const el = h("div", { class: "console", "data-empty": emptyText, tabindex: "0", role: "log" });
    el.log = (text, cls = "") => {
      el.append(h("span", { class: "l" }, h("span", { class: "t" }, Lab.clock() + "  "), h("span", { class: cls }, text)));
      el.scrollTop = el.scrollHeight;
      while (el.children.length > 200) el.firstChild.remove();
    };
    el.logRes = (res) => el.log(Lab.describe(res), res.ok ? "ok" : res.status === 0 || res.status >= 500 ? "bad" : "warn");
    el.clear = () => (el.textContent = "");
    return el;
  };
  Lab.jsonBox = (value, max = 4000) => {
    let txt = typeof value === "string" ? Lab.pretty(value) : JSON.stringify(value, null, 2);
    if (txt && txt.length > max) txt = txt.slice(0, max) + "\n... (" + (txt.length - max) + " more characters)";
    return h("pre", { class: "json" }, txt || "");
  };

  // ------------------------------------------------------------------------------- bar chart (distribution)
  Lab.barChart = (keys) => {
    const rows = {};
    const root = h("div", { class: "bars" });
    const ensure = (k) => {
      if (rows[k]) return rows[k];
      const fill = h("div", { class: "fill" }), val = h("span", { class: "val" }, "0");
      const row = h("div", { class: `bar c-${Lab.instKey(k)}`, style: { "--ic": Lab.instColorVar(k) } }, h("span", {}, k), h("div", { class: "track" }, fill), val);
      root.append(row); rows[k] = { fill, val, row }; return rows[k];
    };
    (keys || []).forEach(ensure);
    root.set = (counts) => {
      Object.keys(counts).forEach(ensure);
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      for (const [k, r] of Object.entries(rows)) {
        const c = counts[k] || 0;
        r.fill.style.width = (c / total) * 100 + "%";
        r.val.textContent = `${c} (${Math.round((c / total) * 100)}%)`;
      }
    };
    return root;
  };

  // ------------------------------------------------------------------------------- strip of result cells
  Lab.strip = (max = 120) => {
    const root = h("div", { class: "strip", role: "img", "aria-label": "Sequence of request results" });
    root.push = (kind, title, inst) => {
      root.append(h("span", { class: `cell ${kind}`, title, style: inst ? { "--ic": Lab.instColorVar(inst) } : null }));
      while (root.children.length > max) root.firstChild.remove();
    };
    root.clear = () => (root.textContent = "");
    return root;
  };
  Lab.legend = (items) => h("div", { class: "legend" }, items.map(([label, color]) => h("span", {}, h("i", { style: { "--ic": color } }), label)));
  Lab.instLegend = () => Lab.legend([["product-1", "var(--p1)"], ["product-2", "var(--p2)"], ["product-3", "var(--p3)"], ["failed", "var(--down)"]]);

  // ------------------------------------------------------------------------------- sections / benches
  Lab.sec = (title, ...kids) => h("section", { class: "sec" }, title ? h("h2", {}, title) : null, ...kids);
  Lab.prose = (html) => h("div", { class: "prose", html });
  Lab.callout = (kind, title, html) => h("div", { class: `callout ${kind || ""}` }, h("b", { html: title }), h("span", { html }));
  Lab.bench = (title, desc, ...body) => h("div", { class: "bench" }, h("header", {}, h("h3", {}, title), desc ? h("p", {}, desc) : null), h("div", { class: "body" }, ...body));
  Lab.steps = (items) => h("ol", { class: "steps" }, items.map((i) => h("li", {}, h("div", { html: i }))));
  Lab.qa = (pairs) => h("div", {}, pairs.map(([q, a]) => h("details", { class: "q" }, h("summary", {}, q), h("div", { class: "a", html: a }))));
  Lab.table = (head, rows, cls = "") =>
    h("div", { class: "tblwrap" }, h("table", { class: `tbl ${cls}` }, h("thead", {}, h("tr", {}, head.map((c) => h("th", {}, c)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", c && c.nodeType ? {} : { html: c === undefined ? "" : String(c) }, c && c.nodeType ? c : null)))))));
  Lab.seg = (options, current, onPick) => {
    const root = h("div", { class: "seg", role: "group" });
    const draw = (cur) => { root.textContent = ""; options.forEach(([val, label]) => root.append(h("button", { "aria-pressed": String(val === cur), onclick: () => { onPick(val); } }, label))); };
    root.set = draw; draw(current);
    return root;
  };

  // ------------------------------------------------------------------------------- code viewer (shows REAL repo files)
  const KW = /\b(public|private|protected|static|final|class|interface|record|enum|return|new|import|package|extends|implements|void|if|else|throw|throws|try|catch|finally|null|true|false|this|var|int|long|double|boolean|String|List|Map|Mono|Flux)\b/;
  function highlight(line, ext) {
    const esc = Lab.esc;
    if (ext === "java") {
      const ci = line.indexOf("//");
      if (/^\s*(\*|\/\*)/.test(line)) return `<span class="tk-c">${esc(line)}</span>`;
      let code = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : "";
      code = esc(code).replace(/(&quot;.*?&quot;)/g, '<span class="tk-s">$1</span>').replace(/(@\w+)/g, '<span class="tk-a">$1</span>').replace(KW, '<span class="tk-k">$1</span>');
      return code + (com ? `<span class="tk-c">${esc(com)}</span>` : "");
    }
    if (ext === "yml" || ext === "yaml" || ext === "conf" || ext === "sh" || ext === "env") {
      const ci = line.search(/(^|\s)#/);
      let code = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : "";
      code = esc(code).replace(/^(\s*-?\s*)([\w.\-\[\]'\/@"{}$#]+)(:)/, '$1<span class="tk-k">$2</span>$3');
      return code + (com ? `<span class="tk-c">${esc(com)}</span>` : "");
    }
    if (ext === "xml") return esc(line).replace(/(&lt;!--.*?--&gt;)/g, '<span class="tk-c">$1</span>').replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="tk-k">$2</span>');
    return esc(line);
  }
  /**
   * files: [{file:"api-gateway/src/main/resources/application.yml", label:"application.yml", focus:["y-products","Retry"]}]
   * `focus` lines are tinted and scrolled into view - robust against line-number drift when you edit the files.
   */
  Lab.codeView = (files) => {
    const tabs = h("div", { class: "codetabs", role: "tablist" }), body = h("div", { class: "codebody", tabindex: "0" });
    const root = h("div", { class: "codeview" }, tabs, body);
    const cache = {};
    async function open(i) {
      [...tabs.children].forEach((b, j) => b.setAttribute("aria-selected", String(i === j)));
      const f = files[i];
      body.textContent = "loading ...";
      if (!cache[f.file]) {
        const r = await Lab.get("/repo/" + f.file, { quiet: true });
        cache[f.file] = r.ok ? r.text : `// could not load ${f.file} (HTTP ${r.status})`;
      }
      const ext = f.file.split(".").pop(), focus = f.focus || [];
      body.textContent = "";
      let first = null;
      cache[f.file].split("\n").forEach((ln, n) => {
        const hit = focus.length && focus.some((s) => ln.includes(s));
        const row = h("div", { class: "ln" + (hit ? " hl" : "") }, h("span", {}, String(n + 1)), h("span", { html: highlight(ln, ext) || " " }));
        if (hit && !first) first = row;
        body.append(row);
      });
      if (first) body.scrollTop = Math.max(0, first.offsetTop - 40);
    }
    files.forEach((f, i) => tabs.append(h("button", { role: "tab", onclick: () => open(i) }, f.label || f.file.split("/").pop())));
    open(0);
    return root;
  };

  // ------------------------------------------------------------------------------- polling with automatic clean-up
  Lab.every = (fn, ms, immediate = true) => {
    let stopped = false, t;
    const tick = async () => { if (stopped) return; try { await fn(); } catch (e) { console.warn(e); } if (!stopped) t = setTimeout(tick, ms); };
    if (immediate) tick(); else t = setTimeout(tick, ms);
    const stop = () => { stopped = true; clearTimeout(t); };
    Lab.cleanups.push(stop);
    return stop;
  };

  // =============================================================================== shared live data
  // ------------------------------------------------ 1) Eureka registry (polled every 2 s by the app shell)
  Lab.registry = { instances: [], ok: false, at: 0 };
  Lab.events = [];                         // registry changes we observed (newest first)
  Lab.lastAction = null;                   // {name, action, t} - to measure "how long until Eureka noticed"
  let prevById = null;

  /** Rows come from Eureka's own /lab/registry endpoint, which reads the live registry (see RegistryStatsController). */
  function normalizeRegistry(rows) {
    return (rows || []).map((i) => ({
      app: i.app, id: i.id, host: i.host, port: i.port, status: i.status,
      // Eureka stores "renewal time + lease duration" in lastRenewalTimestamp (the quirk that doubles eviction time):
      // subtract the duration to get the moment the heartbeat REALLY arrived.
      lastRenewal: i.lastRenewalTimestamp - i.durationSecs * 1000, registeredAt: i.registrationTimestamp,
      renewalInterval: i.renewalIntervalSecs, duration: i.durationSecs,
      label: String(i.id).includes(":") ? String(i.id).split(":")[1] : i.id,
    })).sort((x, y) => (x.app + x.id).localeCompare(y.app + y.id));
  }

  Lab.skew = 0;   // serverClock - browserClock in ms (browsers on other devices can be seconds off)
  Lab.serverNow = () => Date.now() + Lab.skew;
  Lab.refreshRegistry = async () => {
    const t0 = Date.now();
    const st = await Lab.get("/api/eureka-stats", { quiet: true, timeout: 4000 });
    if (!st.ok || !st.json) { Lab.eurekaStats = null; Lab.registry = { instances: [], ok: false, at: Date.now() }; Lab.emit("registry", Lab.registry); return; }
    Lab.skew = st.json.serverTime - (t0 + Date.now()) / 2;
    Lab.eurekaStats = st.json;
    const list = normalizeRegistry(st.json.instances), now = Date.now();
    const byId = Object.fromEntries(list.map((i) => [i.id, i]));
    if (prevById) {
      for (const i of list) {
        const p = prevById[i.id];
        if (!p) addEvent("REGISTERED", i, `${i.id} registered (${i.status})`);
        else if (p.status !== i.status) addEvent("STATUS", i, `${i.id} status ${p.status} -> ${i.status}`);
      }
      for (const p of Object.values(prevById)) if (!byId[p.id]) addEvent("GONE", p, `${p.id} removed from the registry`);
    }
    prevById = byId;
    Lab.registry = { instances: list, ok: true, at: now };
    Lab.emit("registry", Lab.registry);
  };
  function addEvent(type, inst, text) {
    const e = { t: Date.now(), type, id: inst.id, app: inst.app, text, after: null };
    const la = Lab.lastAction;
    if (la && inst.id.includes(la.key) && e.t - la.t < 180000 && (type === "GONE" || type === "STATUS")) {
      e.after = (e.t - la.t) / 1000;
      e.text += `  - noticed ${e.after.toFixed(1)}s after you pressed ${la.action}`;
    }
    Lab.events.unshift(e);
    Lab.events.length = Math.min(Lab.events.length, 150);
    Lab.emit("event", e);
  }

  // ------------------------------------------------ 2) container states via lab-control
  Lab.containers = { list: [], ok: false };
  Lab.refreshContainers = async () => {
    const r = await Lab.get("/api/ctl/containers", { quiet: true, timeout: 5000 });
    Lab.containers = r.ok && r.json ? { list: r.json.containers, ok: true } : { list: [], ok: false };
    Lab.emit("containers", Lab.containers);
  };
  Lab.containerState = (name) => (Lab.containers.list.find((c) => c.name === name) || {}).state || "unknown";

  /** action: stop | kill | pause | unpause | start | restart */
  Lab.control = async (name, action) => {
    const key = name.replace("product-service-", "product-");
    Lab.lastAction = { key: name.startsWith("product-service") ? key : name, name, action, t: Date.now() };
    const r = await Lab.post(`/api/ctl/containers/${name}/${action}`, undefined, { timeout: 45000, quiet: true });
    if (r.ok && r.json && r.json.ok) Lab.toast(`${action} ${name}: ${r.json.message}`, "good");
    else Lab.toast(`${action} ${name} failed: ${(r.json && r.json.message) || r.error || r.status}`, "bad");
    await Lab.refreshContainers();
    return r;
  };

  /** A small live-updating group of action buttons for one container. */
  Lab.controlButtons = (name, which = ["stop", "kill", "pause"]) => {
    const labels = { stop: ["Stop (graceful)", "ghost", "SIGTERM: the app shuts down cleanly and deregisters itself from Eureka"],
      kill: ["Kill (crash)", "danger", "SIGKILL: no goodbye - Eureka must discover the death through missing heartbeats"],
      pause: ["Freeze", "warn", "Freezes the process: it still looks 'running' but answers nothing - like a network partition or a hung JVM"],
      unpause: ["Unfreeze", "accent", "Resume the frozen process"], start: ["Start", "accent", "Start the stopped container"] };
    const root = h("span", { class: "row tight" });
    const draw = () => {
      const st = Lab.containerState(name);
      root.textContent = "";
      const acts = st === "running" ? which : st === "paused" ? ["unpause"] : st === "exited" || st === "created" ? ["start"] : [];
      if (!acts.length) root.append(h("span", { class: "hint" }, !Lab.containers.ok ? "control service unavailable" : st === "unknown" ? "not started (optional profile is off)" : st));
      acts.forEach((a) => {
        const btn = h("button", { class: `btn sm ${labels[a][1]}`, title: labels[a][2], onclick: async () => { btn.disabled = true; await Lab.control(name, a); } }, labels[a][0]);
        root.append(btn);
      });
    };
    draw();
    const off = Lab.on("containers", draw);
    Lab.cleanups.push(off);
    root.dispose = off;
    return root;
  };

  /** Brings every controllable container back to "running". */
  Lab.healAll = async () => {
    await Lab.refreshContainers();
    const todo = Lab.containers.list.filter((c) => c.state !== "running");
    if (!todo.length) return Lab.toast("Everything is already running", "good");
    Lab.toast(`Healing ${todo.length} container(s) ...`);
    for (const c of todo) await Lab.control(c.name, c.state === "paused" ? "unpause" : "start");
  };

  // ------------------------------------------------ 3) a traffic probe: fires a request every N ms and paints a strip
  Lab.probe = (opts) => {
    const o = Object.assign({ path: "/api/products/whoami", every: 500, label: "Live traffic probe", quiet: true, slowMs: 1500 }, opts);
    const strip = Lab.strip(100), stat = h("span", { class: "hint" }, "stopped");
    let timer = null, ok = 0, bad = 0, slow = 0;
    const tick = async () => {
      const r = await (o.request ? o.request() : Lab.gw("GET", o.path, { timeout: 6000, quiet: o.quiet }));
      const inst = Lab.answeredBy(r);
      if (r.ok && r.ms > o.slowMs) { slow++; ok++; strip.push("limited", `${Lab.clock()}  SLOW ${r.ms}ms  ${inst}`); }
      else if (r.ok) { ok++; strip.push("", `${Lab.clock()}  ${r.ms}ms  ${inst}`, inst); }
      else { bad++; strip.push("err", `${Lab.clock()}  HTTP ${r.status || r.error}  ${r.ms}ms`); }
      stat.textContent = `${ok} ok${slow ? " (" + slow + " slow)" : ""}, ${bad} failed`;
    };
    const btn = h("button", { class: "btn sm accent", onclick: () => {
      if (timer) { clearInterval(timer); timer = null; btn.textContent = "Start"; return; }
      ok = bad = slow = 0; timer = setInterval(tick, o.every); btn.textContent = "Stop"; tick();
    } }, "Start");
    const root = h("div", { style: { display: "grid", gap: "6px" } },
      h("div", { class: "row" }, h("b", {}, o.label), btn,
        h("button", { class: "btn sm ghost", onclick: () => { strip.clear(); ok = bad = slow = 0; stat.textContent = "cleared"; } }, "Clear"), stat),
      strip);
    root.start = () => !timer && btn.click();
    root.stop = () => timer && btn.click();
    Lab.cleanups.push(() => clearInterval(timer));
    return root;
  };

  /** Three columns: what Eureka says, what the gateway's cache says, what order-service's cache says. */
  Lab.phoneBook = () => {
    const cols = h("div", { class: "cols" });
    const paint = async () => {
      const [o, g] = await Promise.all([Lab.get("/api/svc/order-service/lab/lb?service=product-service", { quiet: true, timeout: 3000 }), Lab.get("/gw/lab/lb?service=product-service", { quiet: true, timeout: 3000 })]);
      const list = (r) => (r.json ? r.json.instancesSeenByThisClient.map((i) => i.host) : null);
      const reg = Lab.registry.instances.filter((i) => i.app === "PRODUCT-SERVICE");
      const col = (title, sub, items) => h("div", { class: "col" }, h("h4", {}, title), h("div", { class: "hint" }, sub),
        h("div", { class: "row tight", style: { marginTop: "8px" } }, items === null ? h("span", { class: "hint" }, "unreachable") : items.length ? items.map((i) => Lab.instChip(i)) : h("span", { class: "hint" }, "(no instances)")));
      cols.textContent = "";
      cols.append(col("Eureka server", "the registry: source of truth", reg.map((i) => i.host + (i.status !== "UP" ? " [" + i.status + "]" : ""))),
        col("gateway's copy", "its cached, UP-only list", list(g)), col("order-service's copy", "its cached, UP-only list", list(o)));
    };
    Lab.every(paint, 1500);
    return cols;
  };

  // ------------------------------------------------ 4) load generator (fires N requests with limited concurrency)
  Lab.burst = async (count, makeRequest, { concurrency = 4, onEach } = {}) => {
    let next = 0; const results = [];
    const worker = async () => {
      while (next < count) {
        const i = next++;
        const r = await makeRequest(i);
        results[i] = r; if (onEach) onEach(r, i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker));
    return results;
  };

  /** Run fn now and again whenever the registry or container states change (auto-unsubscribed on lesson change). */
  Lab.live = (fn) => { fn(); Lab.cleanups.push(Lab.on("registry", fn), Lab.on("containers", fn)); };
  Lab.stateBadge = (state) => {
    const m = { running: ["up", "running"], paused: ["paused", "frozen"], exited: ["down", "stopped"], created: ["down", "not started"], unknown: ["", "unknown"], off: ["", "not started"] };
    const [cls, text] = m[state] || ["", state];
    return h("span", { class: `badge ${cls}` }, text);
  };
  Lab.regBadge = (status) => h("span", { class: `badge ${status === "UP" ? "up" : status === "DOWN" ? "down" : "warn"}` }, status || "not registered");
  /** instance id of whoever answered, whatever the endpoint shape */
  Lab.answeredBy = (r) => { const j = r && r.json; return (j && (j.instanceId || j.servedBy || (j.original && j.original.instanceId))) || (r && r.headers && r.headers["x-instance-id"]) || ""; };

  Lab.run = async (btn, fn) => {                 // disable a button while an async job runs
    const label = btn.textContent; btn.disabled = true;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  };
})();
