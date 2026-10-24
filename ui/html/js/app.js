/* =====================================================================================================
   App shell: sidebar, router, lesson frame, boot sequence.
   A lesson is a plain object registered with Lab.lessons.push({...}) - see js/lessons/*.js
   ===================================================================================================== */
(function () {
  "use strict";
  const { h, $ } = Lab;

  // The order follows the course outline you teach: observability first, then discovery, then the gateway.
  const CHAPTERS = [
    { key: "overview", title: "Start here", color: "var(--overview)" },
    { key: "observe", title: "See what is happening", color: "var(--observe)" },
    { key: "find", title: "Find the services", color: "var(--find)" },
    { key: "gateway", title: "Control the traffic", color: "var(--gateway)" },
    { key: "patterns", title: "Design pattern", color: "var(--patterns)" },
  ];

  // ---------------------------------------------------------------- stack availability banner (ELK / metrics are optional profiles)
  Lab.stackBanner = (kind) => {
    const cfg = {
      elk: { name: "ELK (Elasticsearch, Logstash, Kibana)", ram: "about 2 GB of RAM", check: () => Lab.get("/api/es/_cluster/health", { quiet: true, timeout: 3000 }), cmd: "docker compose --profile elk up -d" },
      metrics: { name: "Prometheus and Grafana", ram: "about 400 MB of RAM", check: () => Lab.get("/api/prom/api/v1/targets", { quiet: true, timeout: 3000 }), cmd: "docker compose --profile metrics up -d" },
    }[kind];
    const box = h("div", { class: "callout warn", hidden: true },
      h("b", {}, `${cfg.name} is not running`),
      h("span", {}, `This lesson needs it (${cfg.ram}). Start it in a terminal in the project folder, wait about a minute, and this notice disappears by itself: `),
      h("code", {}, cfg.cmd));
    Lab.every(async () => { const r = await cfg.check(); const up = r.ok; box.hidden = up; box.dataset.up = up; Lab.emit("stack-" + kind, up); }, 5000);
    return box;
  };

  // ---------------------------------------------------------------- sidebar
  function buildRail() {
    const rail = $("#rail");
    const visited = JSON.parse(localStorage.getItem("lab.visited") || "{}");
    const nav = h("nav", { class: "nav", "aria-label": "Lessons" });
    let n = 0;
    CHAPTERS.forEach((ch) => {
      const lessons = Lab.lessons.filter((l) => l.chapter === ch.key);
      if (!lessons.length) return;
      nav.append(h("div", { class: "chapter", style: { "--c": ch.color } }, h("i", {}), ch.title));
      lessons.forEach((l) => {
        const num = l.chapter === "overview" ? "" : ++n + ". ";
        l.number = num;
        nav.append(h("a", { href: "#/" + l.id, "data-id": l.id, class: visited[l.id] ? "done" : "", style: { "--c": ch.color } },
          h("span", { class: "tick", "aria-hidden": "true" }, "✓"), num + l.title, l.minutes ? h("small", {}, l.minutes + " min") : null));
      });
    });

    const idSel = h("select", { id: "identity", "aria-label": "Signed-in user", onchange: (e) => Lab.setIdentity(e.target.value) });
    const fillUsers = () => {
      idSel.textContent = "";
      idSel.append(h("option", { value: "anonymous" }, "anonymous (no token)"));
      Lab.users.forEach((u) => idSel.append(h("option", { value: u.id }, `${u.id}  [${u.roles.join(", ")}]`)));
      idSel.value = Lab.users.some((u) => u.id === Lab.identity) ? Lab.identity : "anonymous";
    };
    Lab.fillUsers = fillUsers;

    const theme = h("button", { onclick: () => {
      const dark = document.documentElement.dataset.theme !== "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      localStorage.setItem("lab.theme", dark ? "dark" : "light");
    } }, "Switch light / dark");

    rail.append(
      h("div", { class: "brand" }, h("div", {}, h("b", {}, "Spring Cloud Lab"), h("span", {}, "Observability, discovery, gateway")),
        h("button", { class: "navtoggle", "aria-expanded": "false", onclick: (e) => { const open = rail.classList.toggle("open"); e.target.setAttribute("aria-expanded", String(open)); } }, "Lessons")),
      nav,
      h("div", { class: "railfoot" },
        h("div", {}, h("label", { for: "identity" }, "Signed in as (used for every request)"), idSel),
        h("button", { onclick: () => Lab.healAll(), title: "Starts or unfreezes every container that a drill stopped" }, "Heal: restart anything that is down"),
        theme));
  }

  // ---------------------------------------------------------------- router
  function route() {
    const id = location.hash.replace(/^#\//, "") || "start";
    const lesson = Lab.lessons.find((l) => l.id === id) || Lab.lessons[0];
    Lab.cleanups.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });

    document.body.dataset.chapter = lesson.chapter;
    document.title = `${lesson.title} - Spring Cloud Lab`;
    document.querySelectorAll(".nav a").forEach((a) => { a.removeAttribute("aria-current"); if (a.dataset.id === lesson.id) a.setAttribute("aria-current", "page"); });
    const visited = JSON.parse(localStorage.getItem("lab.visited") || "{}");
    visited[lesson.id] = true; localStorage.setItem("lab.visited", JSON.stringify(visited));
    document.querySelector(`.nav a[data-id="${lesson.id}"]`)?.classList.add("done");

    const main = $("#main");
    main.textContent = "";
    const ch = CHAPTERS.find((c) => c.key === lesson.chapter);
    main.append(h("header", { class: "lesson-head" },
      h("h1", {}, (lesson.number || "") + lesson.title),
      h("p", { class: "goal" }, lesson.goal),
      h("div", { class: "meta" }, h("span", { class: "pill accent" }, ch.title), lesson.minutes ? h("span", { class: "pill" }, `${lesson.minutes} minutes`) : null,
        lesson.needs ? h("span", { class: "pill" }, "needs " + (lesson.needs === "elk" ? "ELK profile" : "metrics profile")) : null)));
    try { lesson.render(main); } catch (e) { console.error(e); main.append(Lab.callout("bad", "This lesson failed to draw", Lab.esc(e.message))); }

    const idx = Lab.lessons.indexOf(lesson), prev = Lab.lessons[idx - 1], next = Lab.lessons[idx + 1];
    main.append(h("div", { class: "row", style: { marginTop: "30px", maxWidth: "780px", justifyContent: "space-between" } },
      prev ? h("a", { class: "btn ghost", href: "#/" + prev.id, style: { textDecoration: "none" } }, "← " + (prev.number || "") + prev.title) : h("span"),
      next ? h("a", { class: "btn accent", href: "#/" + next.id, style: { textDecoration: "none" } }, (next.number || "") + next.title + " →") : h("span")));

    $("#rail").classList.remove("open");
    Lab.map.select(lesson.nodes || []);
    document.querySelector(".main").scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    const saved = localStorage.getItem("lab.theme");
    if (saved) document.documentElement.dataset.theme = saved;
    else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";

    buildRail();
    Lab.map.mount($("#mapcol"));
    window.addEventListener("hashchange", route);

    // shared live data, polled for the whole session (not tied to a lesson)
    const poll = (fn, ms) => { const loop = async () => { try { await fn(); } catch (e) { /* offline */ } setTimeout(loop, ms); }; loop(); };
    poll(Lab.refreshRegistry, 2000);
    poll(Lab.refreshContainers, 3000);
    Lab.loadUsers().then(() => { Lab.fillUsers(); });
    // the gateway may still be starting: retry for a while
    let tries = 0; const retry = setInterval(async () => { if (Lab.users.length || tries++ > 40) return clearInterval(retry); await Lab.loadUsers(); Lab.fillUsers(); }, 3000);
    route();
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
