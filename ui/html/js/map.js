/* =====================================================================================================
   The live system map (right-hand column).
   - node colour  = real state (Docker container state + Eureka registry status)
   - moving dots  = the requests YOU just made, travelling along the path the response headers revealed
   ===================================================================================================== */
(function () {
  "use strict";
  const { h } = Lab;
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}, ...kids) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    kids.forEach((k) => e.append(k.nodeType ? k : document.createTextNode(k)));
    return e;
  };

  // id, label, sub-label, x, y, w, h, kind
  const NODES = [
    ["browser", "Browser", "this lab UI", 130, 8, 100, 36, "client"],
    ["api-gateway", "API Gateway", "Spring Cloud Gateway", 100, 78, 160, 44, "java"],
    ["redis", "Redis", "rate limiter", 6, 84, 76, 32, "infra"],
    ["eureka-server", "Eureka", "registry", 278, 84, 76, 32, "java"],
    ["web-bff", "web-bff", "BFF (browser)", 8, 166, 104, 40, "java"],
    ["mobile-bff", "mobile-bff", "BFF (phone)", 128, 166, 104, 40, "java"],
    ["order-service", "order-service", "client-side LB", 248, 166, 104, 40, "java"],
    ["product-service-1", "product-1", "instance 1", 8, 250, 104, 40, "java"],
    ["product-service-2", "product-2", "instance 2", 128, 250, 104, 40, "java"],
    ["product-service-3", "product-3", "instance 3", 248, 250, 104, 40, "java"],
    ["logstash", "Logstash", "tcp :5000", 8, 340, 104, 34, "infra"],
    ["elasticsearch", "Elasticsearch", "spring-logs-*", 128, 340, 104, 34, "infra"],
    ["kibana", "Kibana", "dashboards", 248, 340, 104, 34, "infra"],
    ["prometheus", "Prometheus", "scrapes /actuator", 8, 410, 104, 34, "infra"],
    ["grafana", "Grafana", "dashboards", 128, 410, 104, 34, "infra"],
  ];
  const by = Object.fromEntries(NODES.map((n) => [n[0], { id: n[0], label: n[1], sub: n[2], x: n[3], y: n[4], w: n[5], h: n[6], kind: n[7] }]));
  const center = (id) => ({ x: by[id].x + by[id].w / 2, y: by[id].y + by[id].h / 2 });
  const EDGES = [["browser", "api-gateway"], ["api-gateway", "redis"], ["api-gateway", "eureka-server", "reg"],
    ["api-gateway", "web-bff"], ["api-gateway", "mobile-bff"], ["api-gateway", "order-service"],
    ["api-gateway", "product-service-1"], ["api-gateway", "product-service-2"], ["api-gateway", "product-service-3"],
    ...["web-bff", "mobile-bff", "order-service"].flatMap((a) => ["product-service-1", "product-service-2", "product-service-3"].map((b) => [a, b])),
    ["logstash", "elasticsearch"], ["elasticsearch", "kibana"], ["prometheus", "grafana"]];

  const state = {};   // id -> up|down|paused|warn|unknown|off
  const gEls = {};    // id -> {box, dot, sub}
  let svg, pktLayer, noteEl, selected = new Set();

  function build() {
    svg = svgEl("svg", { viewBox: "0 0 360 456", role: "img", "aria-label": "Live map of the lab: gateway, Eureka, services and observability tools" });
    const edges = svgEl("g");
    EDGES.forEach(([a, b, kind]) => {
      const A = center(a), B = center(b);
      edges.append(svgEl("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: "edge" + (kind ? " " + kind : ""), style: kind ? "" : "stroke-width:1" }));
    });
    svg.append(edges);
    svg.append(svgEl("text", { x: 8, y: 330, class: "sub" }, "Centralized logs (ELK)"), svgEl("text", { x: 8, y: 400, class: "sub" }, "Metrics"));
    NODES.forEach(([id]) => {
      const n = by[id];
      const g = svgEl("g", { "data-node": id });
      const box = svgEl("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 7, class: "nodebox" });
      const t1 = svgEl("text", { x: n.x + n.w / 2, y: n.y + (n.h > 36 ? 18 : 15), "text-anchor": "middle", style: "font-weight:700" }, n.label);
      const t2 = svgEl("text", { x: n.x + n.w / 2, y: n.y + (n.h > 36 ? 31 : 27), "text-anchor": "middle", class: "sub" }, n.sub);
      const dot = svgEl("circle", { cx: n.x + n.w - 8, cy: n.y + 8, r: 5, class: "st unknown" });
      g.append(box, t1, t2);
      if (n.kind !== "client") g.append(dot);
      svg.append(g);
      gEls[id] = { box, dot, sub: t2 };
    });
    pktLayer = svgEl("g");
    svg.append(pktLayer);
  }

  function setState(id, st) {
    if (!gEls[id] || state[id] === st) return;
    state[id] = st;
    gEls[id].dot.setAttribute("class", "st " + (st === "off" ? "unknown" : st));
    gEls[id].box.style.strokeDasharray = st === "off" ? "4 3" : "";
    gEls[id].box.style.opacity = st === "off" ? ".55" : "1";
  }

  // --------------------------------------------------------------------- state from the shared live data
  function refreshStates() {
    const reg = Lab.registry, ctl = Lab.containers;
    const regById = {};
    reg.instances.forEach((i) => { regById[i.host] = i; });         // hostName == compose service name
    NODES.forEach(([id, , , , , , , kind]) => {
      if (kind === "client") return;
      const c = ctl.list.find((x) => x.name === id);
      const r = regById[id];
      let st = "unknown";
      if (id === "eureka-server") {
        st = c && c.state === "paused" ? "paused" : reg.ok ? "up" : "down";
      } else if (kind === "java") {
        // Java services: Docker state when we can see it, Eureka registry status on top of it
        if (c && c.state === "paused") st = "paused";
        else if (c && c.state !== "running") st = "down";
        else st = !r ? (reg.ok ? (c ? "warn" : "down") : "unknown") : r.status === "UP" ? "up" : "warn";
      } else {
        // infrastructure (redis, ELK, Prometheus, Grafana): only Docker knows
        if (c) st = c.state === "running" ? "up" : c.state === "paused" ? "paused" : "down";
        else st = ctl.ok ? "off" : "unknown";            // container does not exist = optional profile not started
      }
      setState(id, st);
    });
    const up = reg.instances.filter((i) => i.status === "UP").length;
    gEls["eureka-server"].sub.textContent = reg.ok ? `${up}/${reg.instances.length} UP registered` : "unreachable";
  }

  // --------------------------------------------------------------------- packets
  function packet(ids, color, label) {
    const pts = ids.filter((i) => by[i]).map(center);
    if (pts.length < 2) return;
    const dot = svgEl("circle", { r: 5, fill: color, class: "pkt", cx: pts[0].x, cy: pts[0].y });
    pktLayer.append(dot);
    const seg = 260, total = seg * (pts.length - 1), t0 = performance.now();
    const hitNode = (i) => { const b = gEls[ids[i]]; if (b) { b.box.classList.add("sel"); setTimeout(() => !selected.has(ids[i]) && b.box.classList.remove("sel"), 450); } };
    let lastHit = -1;
    (function frame(now) {
      const e = now - t0;
      if (e >= total) { dot.remove(); return; }
      const i = Math.min(Math.floor(e / seg), pts.length - 2), f = (e - i * seg) / seg;
      dot.setAttribute("cx", pts[i].x + (pts[i + 1].x - pts[i].x) * f);
      dot.setAttribute("cy", pts[i].y + (pts[i + 1].y - pts[i].y) * f);
      if (f > 0.85 && lastHit !== i + 1) { lastHit = i + 1; hitNode(i + 1); }
      requestAnimationFrame(frame);
    })(t0);
    if (label && noteEl) noteEl.textContent = label;
  }

  const colorFor = (res) => (res.status === 0 || res.status >= 500 ? "#cc3b2b" : res.status >= 400 ? "#c48a00" : getComputedStyle(document.body).getPropertyValue("--accent") || "#2d5bd1");

  Lab.map = {
    mount(container) {
      build();
      noteEl = h("div", { class: "mapnote", "aria-live": "polite" }, "Make a request in any experiment - watch it travel here.");
      container.append(
        h("div", { class: "mapcard" },
          h("h2", {}, "Live system map", h("small", {}, "real container + registry state")),
          h("div", { class: "map" }, svg),
          h("div", { class: "maplegend" },
            h("span", {}, h("i", { style: { background: "var(--up)" } }), "running & registered"),
            h("span", {}, h("i", { style: { background: "var(--warn)" } }), "running, not UP in Eureka"),
            h("span", {}, h("i", { style: { background: "var(--paused)" } }), "frozen"),
            h("span", {}, h("i", { style: { background: "var(--down)" } }), "stopped / dead")),
          noteEl));
      Lab.on("registry", refreshStates);
      Lab.on("containers", refreshStates);
      refreshStates();
    },
    /** highlight the components a lesson is about */
    select(ids) {
      selected = new Set(ids || []);
      Object.entries(gEls).forEach(([id, g]) => g.box.classList.toggle("sel", selected.has(id)));
    },
    /** animate an explicit path: map.trace(["browser","api-gateway","product-service-2"]) */
    trace(ids, opts = {}) { packet(ids, opts.color || "#2d5bd1", opts.label); },
    /** called automatically by Lab.http for every non-quiet response */
    fromResponse(res) {
      const url = res.url;
      if (url.startsWith("/gw/") && !url.startsWith("/gw/lab/")) {
        const up = (res.headers["x-upstream"] || "").split(":")[0];
        const route = res.headers["x-matched-route"];
        const path = ["browser", "api-gateway"];
        if (up && by[up]) path.push(up);
        packet(path, colorFor(res), `${res.method} ${url.replace("/gw", "")}  ->  ${res.status || "no response"}${route ? "  via route " + route : ""}${up ? "  ->  " + up : ""}  (${res.ms} ms)`);
        if (up === "web-bff" || up === "mobile-bff") {
          setTimeout(() => {
            packet([up, "order-service"], "#8a9bab");
            ["product-service-1", "product-service-2", "product-service-3"].forEach((p, i) => setTimeout(() => packet([up, p], "#8a9bab"), 80 * i));
          }, 520);
        }
        if (up === "order-service" && res.json && res.json.productServiceInstance) setTimeout(() => packet(["order-service", String(res.json.productServiceInstance).replace("product-", "product-service-")], "#8a9bab"), 520);
      } else {
        const m = /^\/api\/svc\/([a-z0-9-]+)\//.exec(url);
        if (m && by[m[1]]) packet(["browser", m[1]], colorFor(res), `${res.method} direct to ${m[1]} (bypassing the gateway)  ->  ${res.status}  (${res.ms} ms)`);
      }
    },
    refresh: refreshStates,
  };
})();
