/* Lesson 2 - Spring Boot Actuator + Micrometer */
Lab.parseProm = (text) =>
  text.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
    const m = /^([a-zA-Z_:][\w:]*)(\{(.*)\})?\s+(\S+)/.exec(l);
    if (!m) return null;
    const labels = {};
    (m[3] || "").replace(/(\w+)="((?:[^"\\]|\\.)*)"/g, (_, k, v) => { labels[k] = v; });
    return { name: m[1], labels, value: parseFloat(m[4]) };
  }).filter(Boolean);

Lab.lessons.push({
  id: "actuator", chapter: "observe", title: "Actuator and Micrometer", minutes: 20,
  goal: "A running service can describe its own health and its own numbers over plain HTTP. Students read them, create their own, and change a log level without a restart.",
  nodes: ["product-service-1", "product-service-2", "product-service-3", "order-service"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`
        <p><b>Spring Boot Actuator</b> adds operational endpoints under <code>/actuator</code> by adding one dependency. <b>Micrometer</b> is the metrics library
        inside Actuator - think of it as <i>SLF4J, but for metrics</i>: your code talks to Micrometer, and a registry (Prometheus, Datadog, CloudWatch ...)
        decides how the numbers leave the process.</p>`),
      Lab.table(["Endpoint", "Answers the question", "Used by"], [
        ["<code>/health</code>", "Is this instance able to do its job? (database, disk, our own checks)", "Eureka, Docker, Kubernetes"],
        ["<code>/info</code>", "Which application and version is this?", "humans, dashboards"],
        ["<code>/metrics</code>", "What numbers do you have? (browse one at a time)", "humans while debugging"],
        ["<code>/prometheus</code>", "All numbers in one text page", "Prometheus scraper (lesson 3)"],
        ["<code>/loggers</code>", "Which log levels are set - and change them live", "operators during incidents"],
        ["<code>/mappings</code>, <code>/env</code>", "Which URLs exist? Which configuration won?", "debugging"],
      ], "cmp"),
      h("div", { style: { height: "10px" } }),
      Lab.table(["Meter type", "Goes", "Example in this lab"], [
        ["<b>Counter</b>", "only up", "<code>lab.products.viewed</code> - product detail requests, tagged by category"],
        ["<b>Gauge</b>", "up and down", "<code>lab.inventory.total.stock</code> - units in stock right now"],
        ["<b>Timer</b>", "count + total time (+ buckets)", "<code>lab.product.lookup</code> and every <code>http.server.requests</code>"],
      ], "cmp")));

    // ------------------------------------------------------------------ explorer
    const services = ["product-service-1", "product-service-2", "product-service-3", "order-service", "api-gateway", "web-bff", "mobile-bff", "eureka-server"];
    const svc = h("select", { "aria-label": "Service" }, services.map((s) => h("option", {}, s)));
    const grep = h("input", { type: "text", placeholder: "filter lines, e.g. jvm_memory or lab_", "aria-label": "Filter lines" });
    const out = h("div", {});
    const eps = [["health", "health"], ["info", "info"], ["metrics (list)", "metrics"], ["one metric", "metrics/jvm.memory.used"], ["prometheus text", "prometheus"], ["loggers", "loggers"], ["mappings", "mappings"], ["env", "env"], ["gateway routes", "gateway/routes"]];
    let lastEp = "health";
    async function show(ep) {
      lastEp = ep; out.textContent = "";
      const url = `/api/raw/${svc.value}/actuator/${ep}`;
      const r = await Lab.get(url, { quiet: true });
      Lab.map.trace(["browser", svc.value], { color: r.ok ? "#6a47c4" : "#cc3b2b", label: `GET /actuator/${ep} on ${svc.value} -> ${r.status} (${r.ms} ms)` });
      if (!r.status) return out.append(h("div", { class: "empty" }, `${svc.value} is not reachable (${r.error}). It may be stopped - use Heal in the sidebar.`));
      if (ep === "prometheus") {
        const lines = r.text.split("\n").filter((l) => !grep.value || l.toLowerCase().includes(grep.value.toLowerCase()));
        out.append(h("pre", { class: "json" }, lines.slice(0, 120).join("\n") + (lines.length > 120 ? `\n... ${lines.length - 120} more lines - narrow it with the filter` : "")), h("div", { class: "hint" }, `${r.text.split("\n").filter((l) => l && !l.startsWith("#")).length} time series, ${Lab.fmtBytes(r.bytes)}`));
      } else if (r.json) {
        out.append(Lab.jsonBox(r.json, ep === "env" || ep === "mappings" || ep === "loggers" ? 6000 : 4000));
      } else out.append(Lab.jsonBox(r.text));
      out.prepend(h("div", { class: "hint" }, `GET ${url.replace("/api/raw/" + svc.value, "http://" + svc.value + ":8080")} -> HTTP ${r.status}, ${r.ms} ms`));
    }
    grep.addEventListener("input", () => lastEp === "prometheus" && show("prometheus"));
    root.append(Lab.sec("Try it",
      Lab.bench("1. Actuator explorer", "Pick a service and an endpoint. Every service exposes the same endpoints because they all depend on spring-boot-starter-actuator.",
        h("div", { class: "row" }, h("label", { class: "inline" }, "Service ", svc), grep),
        h("div", { class: "row tight" }, eps.map(([l, ep]) => h("button", { class: "btn sm ghost", onclick: () => show(ep) }, l))),
        out)));

    // ------------------------------------------------------------------ custom meters
    const meters = h("div", {});
    async function refreshMeters() {
      const rows = [];
      let stock = null, lookupCount = 0, lookupSum = 0;
      for (const n of [1, 2, 3]) {
        const r = await Lab.get(`/api/raw/product-service-${n}/actuator/prometheus`, { quiet: true, timeout: 4000 });
        if (!r.ok) { rows.push([`product-${n}`, "-", "-", h("span", { class: "hint" }, "unreachable")]); continue; }
        const ms = Lab.parseProm(r.text);
        ms.filter((m) => m.name === "lab_products_viewed_total").forEach((m) => rows.push([`product-${n}`, m.labels.productId, m.labels.category, m.value]));
        const g = ms.find((m) => m.name === "lab_inventory_total_stock"); if (g) stock = g.value;
        const c = ms.find((m) => m.name === "lab_product_lookup_seconds_count"), s = ms.find((m) => m.name === "lab_product_lookup_seconds_sum");
        if (c) { lookupCount += c.value; lookupSum += s ? s.value : 0; }
      }
      meters.textContent = "";
      meters.append(
        h("div", { class: "cols" },
          h("div", { class: "col" }, h("h4", {}, "Gauge"), h("div", { class: "stat" }, stock === null ? "-" : String(stock), h("small", {}, "units in stock")), h("div", { class: "hint" }, "lab_inventory_total_stock")),
          h("div", { class: "col" }, h("h4", {}, "Timer"), h("div", { class: "stat" }, lookupCount ? (lookupSum / lookupCount * 1000).toFixed(3) : "-", h("small", {}, "ms average lookup")), h("div", { class: "hint" }, `${lookupCount} lookups: lab_product_lookup_seconds_count / _sum`))),
        h("div", { style: { height: "8px" } }),
        rows.length ? Lab.table(["Instance", "productId (tag)", "category (tag)", "lab_products_viewed_total"], rows) : h("div", { class: "empty" }, "No counter series yet: view a product below. A counter only appears after its first increment."));
    }
    root.append(Lab.sec(null,
      Lab.bench("2. Counter, gauge and timer - your own metrics", "The product-service creates its own meters in about six lines. Tags such as productId and category become Prometheus labels.",
        Lab.steps(["Press a few product buttons. The gateway load-balances, so the counts spread over three instances.", "Press <b>Refresh meters</b>: each instance reports only what <i>it</i> served. Adding the three up is exactly what Prometheus will do in lesson 3 with <code>sum by (category)</code>."]),
        h("div", { class: "row tight" }, [1, 2, 3, 4, 5, 6, 7, 8].map((id) => h("button", { class: "btn sm ghost", onclick: async () => { await Lab.gw("GET", "/api/products/" + id); } }, "view product " + id)),
          h("button", { class: "btn sm accent", onclick: refreshMeters }, "Refresh meters")),
        meters)));
    refreshMeters();

    // ------------------------------------------------------------------ loggers
    const lvlOut = Lab.consoleBox("Pick a level and press Apply.");
    const logSvc = h("select", {}, ["product-service-1", "product-service-2", "product-service-3", "order-service", "api-gateway"].map((s) => h("option", {}, s)));
    const lvl = Lab.seg([["DEBUG", "DEBUG"], ["INFO", "INFO"], ["WARN", "WARN"]], "INFO", (v) => { current = v; lvl.set(v); });
    let current = "INFO";
    root.append(Lab.sec(null,
      Lab.bench("3. Change a log level while the service is running", "No restart, no redeploy. The ProductController has a log.debug(...) line that is silent at INFO.",
        Lab.steps([
          "Choose <b>product-service-1</b>, level <b>INFO</b>, press <b>Call log-demo</b>. Only INFO, WARN and ERROR lines are produced.",
          "Choose <b>DEBUG</b>, press <b>Apply</b> (a <code>POST /actuator/loggers/com.lab</code>), then <b>Call log-demo</b> again. A DEBUG line is now produced as well.",
          "Open lesson 1's log viewer, filter level <b>DEBUG</b>, and find the line. Put the level back to INFO when you are done.",
        ]),
        h("div", { class: "row" }, logSvc, lvl,
          h("button", { class: "btn", onclick: async () => {
            const r = await Lab.http("POST", `/api/raw/${logSvc.value}/actuator/loggers/com.lab`, { json: { configuredLevel: current }, quiet: true });
            lvlOut.log(`POST /actuator/loggers/com.lab {"configuredLevel":"${current}"} on ${logSvc.value} -> ${r.status}`, r.status < 300 ? "ok" : "bad");
            const g = await Lab.get(`/api/raw/${logSvc.value}/actuator/loggers/com.lab`, { quiet: true });
            if (g.json) lvlOut.log(`effective level now: ${g.json.effectiveLevel}`, "k");
          } }, "Apply"),
          h("button", { class: "btn ghost", onclick: async () => {
            const direct = logSvc.value.startsWith("product") ? `/api/svc/${logSvc.value}/api/products/log-demo` : null;
            if (!direct) return lvlOut.log("log-demo exists on product-service only", "warn");
            const r = await Lab.get(direct);
            lvlOut.log(`log-demo on ${logSvc.value}: emitted ${r.json ? r.json.emitted.join(", ") : "?"}  (the DEBUG line only exists when level is DEBUG)`, r.ok ? "ok" : "bad");
          } }, "Call log-demo")),
        lvlOut)));

    // ------------------------------------------------------------------ health
    const hOut = h("div", {});
    const showHealth = async () => {
      const [hh, live] = await Promise.all([Lab.get("/api/raw/product-service-2/actuator/health", { quiet: true }), Lab.get("/api/raw/product-service-2/actuator/health/liveness", { quiet: true })]);
      hOut.textContent = "";
      hOut.append(h("div", { class: "row" }, h("b", {}, "/health: "), h("span", { class: `badge ${hh.json && hh.json.status === "UP" ? "up" : "down"}` }, `${hh.json ? hh.json.status : hh.status} (HTTP ${hh.status})`),
        h("b", {}, "  /health/liveness: "), h("span", { class: `badge ${live.json && live.json.status === "UP" ? "up" : "down"}` }, `${live.json ? live.json.status : live.status} (HTTP ${live.status})`)));
      if (hh.json && hh.json.components) hOut.append(Lab.jsonBox(Object.fromEntries(Object.entries(hh.json.components).map(([k, v]) => [k, v.status])), 800));
    };
    root.append(Lab.sec(null,
      Lab.bench("4. Health is more than 'the process is alive'", "product-2 has a custom HealthIndicator (labToggle) that we can break on purpose.",
        Lab.steps(["Press <b>Break product-2</b>. Overall <code>/health</code> turns DOWN and returns HTTP 503 - but <code>/health/liveness</code> stays UP, because the process itself is fine.",
          "Remember this: <b>Eureka will use the DOWN state</b> to stop routing traffic to it (lessons 5 and 7), while Docker's restart policy would look at liveness.",
          "Press <b>Heal product-2</b> to restore."]),
        h("div", { class: "row" },
          h("button", { class: "btn danger", onclick: async () => { await Lab.post("/api/svc/product-service-2/admin/health/down"); await showHealth(); } }, "Break product-2"),
          h("button", { class: "btn accent", onclick: async () => { await Lab.post("/api/svc/product-service-2/admin/health/up"); await showHealth(); } }, "Heal product-2"),
          h("button", { class: "btn ghost", onclick: showHealth }, "Re-read health")),
        hOut)));
    showHealth();

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why can't a Counter ever go down? What do you use for 'currently active sessions'?", "A counter is monotonic so that rate() can detect resets (restarts) safely. Values that move both ways are Gauges."],
      ["Is exposing <code>/actuator/env</code> safe on the public internet?", "No. Endpoints can leak configuration and aid attackers. Expose only what you need (<code>management.endpoints.web.exposure.include</code>), secure them, or put them on a separate management port."],
      ["The service shows liveness UP but health DOWN. Should Kubernetes restart it?", "Not necessarily. Liveness answers 'is the process stuck?' (restart helps); readiness/health answers 'can it serve right now?' (stop sending traffic, restarting rarely helps - e.g. database down)."],
      ["Why do tags like <code>productId</code> need care?", "Every distinct tag value is a separate time series. Unbounded tags (user ids, URLs with ids) explode memory in Prometheus - 'cardinality explosion'."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "product-service/src/main/resources/application.yml", label: "application.yml (management)", focus: ["management:", "exposure", "percentiles-histogram", "application:"] },
      { file: "product-service/src/main/java/com/lab/product/ProductController.java", label: "Counter + Timer", focus: ["Counter.builder", "Timer.builder", "lookupTimer.record"] },
      { file: "product-service/src/main/java/com/lab/product/ProductCatalog.java", label: "Gauge", focus: ["Gauge.builder"] },
      { file: "lab-common/src/main/java/com/lab/common/admin/HealthToggle.java", label: "HealthIndicator", focus: ["HealthIndicator", "Health.down", "Health.up"] },
      { file: "product-service/pom.xml", label: "pom.xml", focus: ["actuator", "micrometer-registry-prometheus"] },
    ])));
  },
});
