/* Lesson 3 - Prometheus + Grafana */
(function () {
  const PALETTE = ["#2d5bd1", "#e07b1e", "#168a55", "#a53fb8", "#c2386b", "#0e8a83", "#b57d00", "#5a6b79"];

  /** Minimal multi-series SVG line chart: series = [{name, color, points:[[tSeconds, value], ...]}] */
  Lab.lineChart = (series, { unit = "", height = 230 } = {}) => {
    const W = 720, H = height, L = 52, R = 10, T = 10, B = 24;
    const NS = "http://www.w3.org/2000/svg";
    const el = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt !== undefined) e.textContent = txt; return e; };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Line chart of the query result" });
    const pts = series.flatMap((s) => s.points).filter((p) => isFinite(p[1]));
    if (!pts.length) { svg.append(el("text", { x: W / 2, y: H / 2, "text-anchor": "middle" }, "no data yet - generate some traffic and wait a few seconds")); return svg; }
    const t0 = Math.min(...pts.map((p) => p[0])), t1 = Math.max(...pts.map((p) => p[0]));
    let vmax = Math.max(...pts.map((p) => p[1])); if (vmax <= 0) vmax = 1; vmax *= 1.12;
    const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R), y = (v) => T + (1 - v / vmax) * (H - T - B);
    const fmt = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + "G" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k" : v >= 10 ? v.toFixed(0) : v.toFixed(2));
    for (let i = 0; i <= 4; i++) {
      const v = (vmax / 4) * i;
      svg.append(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), el("text", { x: L - 6, y: y(v) + 3, "text-anchor": "end" }, fmt(v) + (i === 4 ? " " + unit : "")));
    }
    for (let i = 0; i <= 4; i++) { const t = t0 + ((t1 - t0) / 4) * i; svg.append(el("text", { x: x(t), y: H - 6, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, new Date(t * 1000).toTimeString().slice(0, 8))); }
    series.forEach((s) => {
      const d = s.points.filter((p) => isFinite(p[1])).map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
      if (d) svg.append(el("path", { d, class: "ser", stroke: s.color }));
    });
    return svg;
  };

  const PRESETS = [
    ["Requests per second, by service", 'sum by (application) (rate(http_server_requests_seconds_count{application!="eureka-server",uri!~"/actuator.*"}[30s]))', "reqps"],
    ["Requests per product instance (load balancing!)", 'sum by (instance) (rate(http_server_requests_seconds_count{application="product-service",uri!~"/actuator.*"}[30s]))', "reqps"],
    ["Latency p95, by service", 'histogram_quantile(0.95, sum by (le, application) (rate(http_server_requests_seconds_bucket{application!="eureka-server",uri!~"/actuator.*"}[30s])))', "s"],
    ["Server errors (5xx) per second", 'sum by (application) (rate(http_server_requests_seconds_count{status=~"5.."}[30s]))', "reqps"],
    ["Gateway requests per route", "sum by (routeId) (rate(spring_cloud_gateway_requests_seconds_count[30s]))", "reqps"],
    ["Heap used per instance", 'sum by (instance) (jvm_memory_used_bytes{area="heap"})', "B"],
    ["Is every target up? (1 = yes)", "up", ""],
    ["Custom counter: product views by category", "sum by (category) (rate(lab_products_viewed_total[30s]))", "ops"],
  ];

  Lab.lessons.push({
    id: "metrics", chapter: "observe", title: "Prometheus and Grafana", minutes: 25, needs: "metrics",
    goal: "Prometheus collects the numbers, PromQL asks questions about them, Grafana draws the answers, and alert rules watch while nobody looks.",
    nodes: ["prometheus", "grafana", "api-gateway", "product-service-1", "product-service-2", "product-service-3"],
    render(root) {
      const { h } = Lab;
      root.append(Lab.stackBanner("metrics"));

      root.append(Lab.sec("Idea",
        h("div", { class: "flow" },
          h("div", { class: "node" }, h("b", {}, "Spring service"), h("span", {}, "/actuator/prometheus")), h("span", { class: "arrow" }, "←"),
          h("div", { class: "node hot" }, h("b", {}, "Prometheus"), h("span", {}, "scrapes every 5 s, stores time series")), h("span", { class: "arrow" }, "←"),
          h("div", { class: "node hot" }, h("b", {}, "Grafana"), h("span", {}, "asks PromQL, draws panels"))),
        Lab.prose(`
          <p>The arrows point <i>towards</i> the service on purpose: Prometheus <b>pulls</b>. The application only exposes a text page. Benefits: a dead service is immediately visible
          (<code>up == 0</code>), and adding a new target never needs a change inside the application.</p>
          <ul>
            <li><b>rate(x[30s])</b> turns an ever-growing counter into "per second over the last 30 s".</li>
            <li><b>sum by (label)</b> adds series together - three instances become one service line.</li>
            <li><b>histogram_quantile(0.95, ...)</b> reads the bucket series to answer "95% of requests were faster than ...".</li>
          </ul>`)));

      // ------------------------------------------------------------------ 1 targets + alerts
      const tBody = h("tbody"), alertsBox = h("div", {});
      async function refreshTargets() {
        const [t, a] = await Promise.all([Lab.get("/api/prom/api/v1/targets", { quiet: true, timeout: 4000 }), Lab.get("/api/prom/api/v1/alerts", { quiet: true, timeout: 4000 })]);
        if (!t.ok) { tBody.textContent = ""; tBody.append(h("tr", {}, h("td", { colspan: 5 }, "Prometheus is not reachable yet."))); return; }
        tBody.textContent = "";
        t.json.data.activeTargets.sort((x, y) => x.scrapeUrl.localeCompare(y.scrapeUrl)).forEach((x) => {
          const ago = ((Date.now() - Date.parse(x.lastScrape)) / 1000);
          tBody.append(h("tr", {}, h("td", {}, x.labels.job), h("td", { class: "mono" }, x.labels.instance),
            h("td", {}, h("span", { class: `badge ${x.health === "up" ? "up" : "down"}` }, x.health)),
            h("td", {}, isFinite(ago) ? ago.toFixed(0) + " s ago" : "-"), h("td", { class: "hint" }, x.lastError || "")));
        });
        alertsBox.textContent = "";
        const alerts = a.ok ? a.json.data.alerts : [];
        if (!alerts.length) alertsBox.append(h("span", { class: "badge up" }, "no alerts firing"));
        alerts.forEach((al) => alertsBox.append(h("div", { class: `callout ${al.state === "firing" ? "bad" : "warn"}` }, h("b", {}, `${al.labels.alertname} - ${al.state}`), al.annotations.summary || "")));
      }
      Lab.every(refreshTargets, 3000);
      root.append(Lab.sec("Try it",
        Lab.bench("1. Targets and alerts", "Prometheus's own view of the world. Each row is one scrape target from infra/prometheus/prometheus.yml.",
          Lab.steps(["Freeze <b>product-service-2</b> with the button. Within one or two scrapes its row turns <b>down</b>.", "After 10 seconds the <b>InstanceDown</b> alert (infra/prometheus/alerts.yml) goes from pending to firing.", "Unfreeze it and watch both recover."]),
          h("div", { class: "row" }, h("b", {}, "product-service-2"), Lab.controlButtons("product-service-2", ["pause", "kill"])),
          h("div", { class: "tblwrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["job", "instance", "health", "last scrape", "error"].map((c) => h("th", {}, c)))), tBody)), alertsBox)));

      // ------------------------------------------------------------------ 2 load generator
      let genTimer = null, sent = 0;
      const genInfo = h("span", { class: "hint" }, "not running");
      const rps = h("select", { "aria-label": "Requests per second" }, [5, 10, 20].map((n) => h("option", { value: n }, n + " per second")));
      const errMix = h("input", { type: "checkbox", id: "errmix" });
      const genBtn = h("button", { class: "btn accent", onclick: () => {
        if (genTimer) { clearInterval(genTimer); genTimer = null; genBtn.textContent = "Start traffic"; genInfo.textContent = `stopped after ${sent} requests`; return; }
        sent = 0; genBtn.textContent = "Stop traffic";
        const n = +rps.value;
        genTimer = setInterval(() => {
          for (let i = 0; i < Math.max(1, Math.round(n / 5)); i++) {
            const p = errMix.checked && Math.random() < 0.15 ? "/noretry/products/error" : ["/api/products", "/api/products/" + (1 + Math.floor(Math.random() * 8)), "/api/products/recommendations"][Math.floor(Math.random() * 3)];
            Lab.gw("GET", p, { quiet: true }); sent++;
          }
          genInfo.textContent = `${sent} requests sent`;
        }, 200);
      } }, "Start traffic");
      Lab.cleanups.push(() => genTimer && clearInterval(genTimer));
      root.append(Lab.sec(null,
        Lab.bench("2. Make the graphs move", "Metrics are only interesting while something happens. This sends requests through the gateway from your browser.",
          h("div", { class: "row" }, genBtn, rps, h("label", { class: "inline", for: "errmix" }, errMix, "include 15% failing requests"), genInfo))));

      // ------------------------------------------------------------------ 3 playground
      const preset = h("select", { "aria-label": "Preset query" }, PRESETS.map(([l], i) => h("option", { value: i }, l)));
      const query = h("textarea", { rows: 2, spellcheck: "false", "aria-label": "PromQL query" });
      const chartBox = h("div", {}), status = h("div", { class: "hint" });
      let unit = "reqps";
      query.value = PRESETS[0][1];
      preset.addEventListener("change", () => { query.value = PRESETS[+preset.value][1]; unit = PRESETS[+preset.value][2]; run(); });
      async function run() {
        const end = Math.floor(Date.now() / 1000), start = end - 300;
        const r = await Lab.get(`/api/prom/api/v1/query_range?query=${encodeURIComponent(query.value)}&start=${start}&end=${end}&step=5`, { quiet: true, timeout: 8000 });
        chartBox.textContent = "";
        if (!r.ok) { status.textContent = r.json && r.json.error ? "Query error: " + r.json.error : "Prometheus not reachable"; status.style.color = "var(--down)"; return; }
        status.style.color = ""; status.textContent = `${r.json.data.result.length} series, last 5 minutes, refreshes every 5 s`;
        const series = r.json.data.result.map((s, i) => {
          const name = Object.entries(s.metric).filter(([k]) => k !== "__name__").map(([, v]) => v).join(" / ") || "(all)";
          const inst = Lab.instKey(name);
          return { name, color: inst ? getComputedStyle(document.documentElement).getPropertyValue("--" + inst).trim() : PALETTE[i % PALETTE.length], points: s.values.map(([t, v]) => [t, parseFloat(v)]) };
        });
        chartBox.append(Lab.lineChart(series, { unit }), Lab.legend(series.map((s) => [s.name, s.color])));
      }
      Lab.every(run, 5000);
      root.append(Lab.sec(null,
        Lab.bench("3. PromQL playground", "Pick a ready-made question, then edit the query and press Run. The chart is drawn by this page from /api/v1/query_range - the same API Grafana uses.",
          h("div", { class: "row" }, preset, h("button", { class: "btn", onclick: run }, "Run")), query, status, chartBox,
          Lab.steps(["Choose <b>Requests per product instance</b>, start traffic, and compare the three lines. Switch the load balancer to <i>random</i> in lesson 6 - the lines separate.", "Choose <b>Latency p95</b>, then call the slow endpoint a few times from lesson 1 (\"Slow call\") and see the spike.", "Edit the query: replace <code>[30s]</code> with <code>[5m]</code>. What changes and why?"]))));

      // ------------------------------------------------------------------ 4 grafana
      // Single-panel embeds (d-solo) in our own grid: independent of Grafana's responsive layout (it stacks below 769 px).
      const dashes = {
        "spring-micrometer": ["Spring Boot - Micrometer overview", [[10, "HTTP request rate by application"], [11, "Latency p95 by application"], [12, "Server errors (5xx)"], [16, "Log events per second by level"]]],
        "gateway-lb": ["Gateway & Load Balancing", [[10, "Gateway requests per route"], [13, "LOAD BALANCING: requests per product instance"], [14, "Share of traffic (last 5 min)"], [16, "Scrape health (1 = UP)"]]],
      };
      const grid = h("div", { class: "cols", style: { gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" } });
      let currentDash = "spring-micrometer";
      const theme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      const drawDash = (uid) => {
        currentDash = uid; grid.textContent = "";
        dashes[uid][1].forEach(([panel, title]) => grid.append(h("iframe", { class: "graf", title, loading: "lazy", style: { height: "250px" },
          src: Lab.toolUrl("grafana", `/d-solo/${uid}/lab?orgId=1&panelId=${panel}&refresh=5s&theme=${theme()}`) })));
      };
      const dsel = Lab.seg(Object.entries(dashes).map(([u, [l]]) => [u, l]), currentDash, (u) => { dsel.set(u); drawDash(u); });
      drawDash(currentDash);
      const full = h("a", { href: Lab.toolUrl("grafana", `/d/${currentDash}/lab`), target: "_blank", rel: "noopener" }, "Open the full dashboard in a new tab");
      dsel.addEventListener("click", () => setTimeout(() => (full.href = Lab.toolUrl("grafana", `/d/${currentDash}/lab`)), 0));
      root.append(Lab.sec(null,
        Lab.bench("4. The same data as dashboards in Grafana", "Both dashboards were provisioned from JSON files (infra/grafana/dashboards) - no clicking needed, and they are in git. Four key panels are embedded here.",
          h("div", { class: "row" }, dsel, full),
          grid, h("div", { class: "hint" }, "In the full dashboard click a panel title and choose Edit to see its PromQL. Anonymous access with the Admin role is enabled for the classroom only."))));

      root.append(Lab.sec("Check yourself", Lab.qa([
        ["Prometheus pulls. When would a service need to push instead?", "Short-lived jobs (batch scripts) may finish before they are scraped; they push to a Pushgateway. Long-running services are better pulled."],
        ["Why does the graph for a counter look flat if you plot it directly, and useful with <code>rate()</code>?", "A counter only ever grows, so the raw line is a rising staircase that tells you little. <code>rate()</code> converts it to the speed of change, which is what you care about."],
        ["Three instances serve product-service. How do you get ONE line for the service?", "<code>sum by (application) (rate(...))</code> - aggregate away the <code>instance</code> label."],
        ["Where does the <code>application</code> label come from?", "Application config: <code>management.metrics.tags.application=${spring.application.name}</code> - a Micrometer common tag added to every meter."],
      ])));

      root.append(Lab.sec("Source", Lab.codeView([
        { file: "infra/prometheus/prometheus.yml", label: "prometheus.yml", focus: ["scrape_interval", "metrics_path", "targets"] },
        { file: "infra/prometheus/alerts.yml", label: "alerts.yml", focus: ["expr:"] },
        { file: "infra/grafana/provisioning/datasources/datasource.yml", label: "datasource.yml" },
        { file: "infra/grafana/dashboards/gateway-lb.json", label: "gateway-lb.json", focus: ["histogram_quantile", "http_server_requests_seconds_count"] },
        { file: "docker-compose.yml", label: "docker-compose.yml", focus: ["prometheus:", "grafana:", "GF_AUTH_ANONYMOUS_ENABLED"] },
      ])));
    },
  });
})();
