/* Lesson 1 - Centralized log aggregation with ELK */
Lab.lessons.push({
  id: "logs", chapter: "observe", title: "Centralized logging with ELK", minutes: 25, needs: "elk",
  goal: "Eight services write logs on eight machines. Students learn to find the one line that matters - in one place, in seconds.",
  nodes: ["api-gateway", "order-service", "product-service-1", "logstash", "elasticsearch", "kibana"],
  render(root) {
    const { h } = Lab;
    root.append(Lab.stackBanner("elk"));

    // ------------------------------------------------------------------------------------ IDEA
    root.append(Lab.sec("Idea",
      Lab.prose(`
        <p>With one server you read <code>app.log</code>. With a dozen containers that are created and destroyed all day, the logs
        are scattered and often gone when you need them. <b>Log aggregation</b> ships every log line to one searchable store.</p>`),
      h("div", { class: "flow" },
        h("div", { class: "node" }, h("b", {}, "Spring service"), h("span", {}, "Logback writes JSON")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "Logstash"), h("span", {}, "input → filter → output")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "Elasticsearch"), h("span", {}, "index spring-logs-DATE")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "Kibana"), h("span", {}, "search and charts"))),
      Lab.prose(`
        <p>Two details make this useful rather than just big:</p>
        <ul>
          <li><b>Structured (JSON) logs.</b> <code>level</code>, <code>service</code>, <code>status</code> and <code>durationMs</code> are separate fields, so you can filter
              "all <i>ERROR</i> from <i>order-service</i> slower than 500 ms" without regex.</li>
          <li><b>A correlation id.</b> The gateway creates <code>X-Request-Id</code>; every service copies it into every log line. One id = the whole journey of one request.</li>
        </ul>`)));

    // ------------------------------------------------------------------------------------ TRY IT: generate
    const gen = Lab.consoleBox("Press a button: the request goes through the gateway and produces log lines.");
    const lastRid = h("code", {}, "-");
    const fire = async (label, method, path, opts) => {
      const r = await Lab.gw(method, path, opts);
      gen.logRes(r);
      const rid = r.headers["x-request-id"];
      if (rid) { lastRid.textContent = rid; ridInput.value = rid; }
      return r;
    };
    const btns = [
      ["Browse products", () => fire("", "GET", "/api/products")],
      ["Place an order", async () => { if (Lab.identity === "anonymous") return Lab.toast("Pick alice or bob in the sidebar first - orders need a login", "bad"); await fire("", "POST", "/api/orders", { json: { productId: 3, quantity: 1 } }); }],
      ["Slow call (1.5 s)", () => fire("", "GET", "/noretry/products/slow?ms=1500")],
      ["Cause an error", () => fire("", "GET", "/noretry/products/error")],
      ["Emit every log level", () => fire("", "GET", "/api/products/log-demo")],
      ["Burst of 20", async () => { await Lab.burst(20, () => Lab.gw("GET", "/api/products"), { concurrency: 5 }); gen.log("20 requests sent", "ok"); }],
    ];
    root.append(Lab.sec("Try it",
      Lab.bench("1. Produce some logs", "Each button sends a request through the gateway. Watch the map, then look for the log lines below.",
        h("div", { class: "row" }, btns.map(([t, fn]) => h("button", { class: "btn", onclick: (e) => Lab.run(e.target, fn) }, t))),
        gen,
        h("div", { class: "hint" }, "Request id of the last call: ", lastRid))));

    // ------------------------------------------------------------------------------------ TRY IT: viewer
    const sel = (opts) => h("select", {}, opts.map(([v, l]) => h("option", { value: v }, l)));
    const svcSel = sel([["", "any service"], ["api-gateway", "api-gateway"], ["order-service", "order-service"], ["product-service", "product-service"], ["web-bff", "web-bff"], ["mobile-bff", "mobile-bff"]]);
    const lvlSel = sel([["", "any level"], ["ERROR", "ERROR"], ["WARN", "WARN"], ["INFO", "INFO"], ["DEBUG", "DEBUG"]]);
    const textIn = h("input", { type: "text", placeholder: "words in the message", "aria-label": "Search text" });
    const ridInput = h("input", { type: "text", placeholder: "request id", "aria-label": "Request id", style: { width: "130px" } });
    const winSel = sel([["now-5m", "last 5 min"], ["now-15m", "last 15 min"], ["now-1h", "last hour"]]);
    winSel.value = "now-15m";
    const box = h("div", { class: "logbox", tabindex: "0" });
    const summary = h("div", { class: "hint" }, "waiting for logs ...");

    async function search() {
      const filter = [{ range: { "@timestamp": { gte: winSel.value } } }];
      if (svcSel.value) filter.push({ term: { service: svcSel.value } });
      if (lvlSel.value) filter.push({ term: { level: lvlSel.value } });
      if (ridInput.value.trim()) filter.push({ term: { requestId: ridInput.value.trim() } });
      const must = textIn.value.trim() ? [{ simple_query_string: { query: textIn.value.trim(), fields: ["message", "stack_trace"], default_operator: "and" } }] : [];
      const tracing = !!ridInput.value.trim();
      const r = await Lab.post("/api/es/spring-logs-*/_search", { size: 80, sort: [{ "@timestamp": tracing ? "asc" : "desc" }], query: { bool: { filter, must } } }, { quiet: true, timeout: 8000 });
      box.textContent = "";
      if (!r.ok) { box.append(h("div", { class: "empty" }, r.status === 404 ? "No logs yet - press a button in experiment 1." : "Elasticsearch is not reachable yet.")); summary.textContent = ""; return; }
      const hits = r.json.hits.hits.map((x) => x._source);
      const services = new Set(hits.map((x) => x.service));
      summary.textContent = `${r.json.hits.total.value} matching log lines` + (tracing ? ` - this request touched ${services.size} service(s): ${[...services].join(" → ")}` : "");
      if (!hits.length) box.append(h("div", { class: "empty" }, "No lines match. Logs arrive 1-3 seconds after the request."));
      hits.forEach((s) => box.append(h("div", { class: "logrow" },
        h("span", { class: "mono" }, (s["@timestamp"] || "").slice(11, 23)),
        h("span", { class: `lv ${s.level}` }, s.level),
        h("span", { class: "mono hide-sm", title: s.instance }, s.service),
        h("span", { class: "mono rid", title: "click to follow this request id", onclick: () => { ridInput.value = s.requestId || ""; search(); } }, s.requestId || ""),
        h("span", { class: "msg" }, s.message, s.stack_trace ? h("div", { class: "hint mono" }, s.stack_trace.split("\n").slice(0, 2).join(" | ")) : null))));
    }
    [svcSel, lvlSel, winSel].forEach((e) => e.addEventListener("change", search));
    [textIn, ridInput].forEach((e) => e.addEventListener("keydown", (ev) => ev.key === "Enter" && search()));
    const auto = h("input", { type: "checkbox", checked: true, id: "autolog" });
    Lab.every(() => auto.checked && search(), 2500);

    root.append(Lab.sec(null,
      Lab.bench("2. Live log viewer (queries Elasticsearch)", "This is what Kibana does, in forty lines of JavaScript: a search request to Elasticsearch on the index pattern spring-logs-*.",
        h("div", { class: "row" }, svcSel, lvlSel, winSel, textIn, ridInput, h("button", { class: "btn sm", onclick: search }, "Search"),
          h("button", { class: "btn sm ghost", onclick: () => { svcSel.value = lvlSel.value = ""; textIn.value = ridInput.value = ""; search(); } }, "Reset"),
          h("label", { class: "inline hint", for: "autolog" }, auto, "refresh every 2.5 s")),
        box, summary,
        h("div", { class: "hint" }, "Times are UTC. Click any request id to follow that one request. When a request id is set, lines are shown oldest-first so you read the story in order."))));

    // ------------------------------------------------------------------------------------ TRY IT: trace
    const traceOut = h("div", { class: "hint" }, "");
    root.append(Lab.sec(null,
      Lab.bench("3. Follow one order through three services", "This is the payoff of a correlation id.",
        Lab.steps([
          "Make sure you are signed in as <b>alice</b> or <b>bob</b> (sidebar).",
          "Press the button: the browser calls the gateway, which calls <code>order-service</code>, which calls <code>product-service</code> through the load balancer.",
          "The viewer above filters to that request id. Read the lines top to bottom: gateway &rarr; order-service &rarr; product-service &rarr; gateway.",
        ]),
        h("div", { class: "row" }, h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, async () => {
          if (Lab.identity === "anonymous") return Lab.toast("Pick alice or bob in the sidebar first", "bad");
          const r = await Lab.gw("POST", "/api/orders", { json: { productId: 1 + Math.floor(Math.random() * 8), quantity: 1 } });
          const rid = r.headers["x-request-id"];
          ridInput.value = rid; lastRid.textContent = rid; svcSel.value = lvlSel.value = ""; textIn.value = "";
          traceOut.textContent = `Order created (HTTP ${r.status}). Request id ${rid}. Searching logs ...`;
          for (let i = 0; i < 6; i++) { await Lab.sleep(1200); await search(); if (box.querySelectorAll(".logrow").length >= 5) break; }
          traceOut.textContent = `Request id ${rid}: ${summary.textContent}`;
        }) }, "Place an order and trace it")), traceOut)));

    // ------------------------------------------------------------------------------------ TRY IT: Kibana
    const kib = (path) => Lab.toolUrl("kibana", "/app/discover#/" + path);
    const q = (kql) => `?_g=(time:(from:now-15m,to:now))&_a=(index:'spring-logs',query:(language:kuery,query:'${encodeURIComponent(kql)}'))`;
    root.append(Lab.sec(null,
      Lab.bench("4. Open the same data in Kibana", "Kibana is already configured: a data view called spring-logs-* and three saved searches were created at start-up.",
        h("div", { class: "linkrow" },
          h("a", { href: kib("view/lab-all-logs"), target: "_blank", rel: "noopener" }, "All service logs"),
          h("a", { href: kib("view/lab-errors-only"), target: "_blank", rel: "noopener" }, "Errors only"),
          h("a", { href: kib("view/lab-gateway-access"), target: "_blank", rel: "noopener" }, "Gateway access log"),
          h("a", { href: kib(q('service : "order-service" and level : "WARN"')), target: "_blank", rel: "noopener" }, "order-service warnings (KQL)")),
        Lab.steps([
          "Open <b>Errors only</b>, then press <b>Cause an error</b> in experiment 1. The new line appears after a refresh, with the stack trace as one searchable field.",
          "In the left field list click <code>service</code> &rarr; <i>Visualize</i> to get a bar chart of log volume per service.",
          "Type a KQL filter such as <code>status &gt;= 500 and durationMs &gt; 100</code> in the search bar. Numeric fields work because the index template (<code>infra/elk/es-init.sh</code>) typed them as numbers.",
        ]))));

    // ------------------------------------------------------------------------------------ TRY IT: outage
    root.append(Lab.sec(null,
      Lab.bench("5. What if Logstash dies?", "Logging must never take a service down. Check that the claim is true.",
        Lab.steps([
          "Press <b>Kill (crash)</b> on Logstash, then press <b>Burst of 20</b> in experiment 1. The requests still succeed.",
          "Start Logstash again and wait about 15 seconds (the appender reconnects every 10 s). Search the viewer: the lines sent during the outage arrive late - up to the 2048 events the in-memory ring buffer can hold. Beyond that, they are dropped.",
          "Discuss: this is why large systems put a durable buffer (Kafka, or Filebeat reading files) between services and Logstash.",
        ]),
        h("div", { class: "row" }, h("b", {}, "logstash"), Lab.controlButtons("logstash", ["stop", "kill"]))
      )));

    // ------------------------------------------------------------------------------------ CHECK YOURSELF
    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why does the log appender send events asynchronously through a ring buffer?", "So the request thread never waits for the network. If Logstash is slow or down the service keeps answering; the price is that events can be dropped when the buffer is full."],
      ["Why is there one index per day (<code>spring-logs-2026.10.23</code>)?", "Retention becomes trivial and cheap: deleting an old day is dropping one index instead of deleting millions of documents. Searches over 'last 15 minutes' only touch today's index."],
      ["What is the difference between a log line and a metric?", "A log is one event with detail ('order 1005 failed: timeout'). A metric is a number that summarises many events over time ('3 failures per second'). You need both - lesson 2 and 3 cover metrics."],
      ["Where would you add a rule that removes passwords from log lines before they are stored?", "In the Logstash <code>filter</code> block (<code>mutate</code> / <code>gsub</code>) - and ideally also in the application so secrets are never logged at all."],
    ])));

    // ------------------------------------------------------------------------------------ SOURCE
    root.append(Lab.sec("Source", Lab.codeView([
      { file: "lab-common/src/main/resources/logback-spring.xml", label: "logback-spring.xml", focus: ["LogstashTcpSocketAppender", "customFields", "ringBufferSize"] },
      { file: "infra/elk/logstash/pipeline/logstash.conf", label: "logstash.conf", focus: ["input {", "filter {", "output {", "needs-attention"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/filter/LoggingGlobalFilter.java", label: "LoggingGlobalFilter.java", focus: ["kv("] },
      { file: "lab-common/src/main/java/com/lab/common/web/LabRequestFilter.java", label: "LabRequestFilter.java", focus: ["MDC.put", "REQUEST_ID"] },
      { file: "infra/elk/es-init.sh", label: "es-init.sh (index template)", focus: ["strings_as_keywords", "durationMs"] },
    ])));
  },
});
