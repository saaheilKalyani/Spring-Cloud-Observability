/* Lesson 0 - welcome, architecture, live status of the whole lab */
Lab.lessons.push({
  id: "start", chapter: "overview", title: "Welcome to the lab", minutes: 0,
  goal: "Twelve hands-on experiments on one running system. Read the idea, press the buttons, watch the map.",
  nodes: [],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("How this console works",
      Lab.prose(`
        <p>Every lesson has the same four parts: <b>Idea</b> (what and why, in plain words), <b>Try it</b> (experiments you run
        with buttons), <b>Check yourself</b> (questions with hidden answers) and <b>Source</b> (the real code from this repository,
        loaded live, with the important lines highlighted).</p>
        <p>The <b>live system map</b> on the right is not a drawing. Dot colours come from Docker and from the Eureka registry,
        and the moving dots are the requests <i>you</i> just sent. Pause or kill a container and the map changes within seconds.</p>`),
      Lab.callout("good", "Before you start", "Pick who you are in the left sidebar (<b>Signed in as</b>). Some routes need a login: anonymous gets <code>401</code>, " +
        "<code>carol</code> gets <code>403</code>, <code>alice</code> and <code>bob</code> get through.")));

    // ---- architecture in one picture
    root.append(Lab.sec("The system you are about to poke",
      h("div", { class: "flow" },
        h("div", { class: "node" }, h("b", {}, "Browser"), h("span", {}, "this UI")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "API Gateway"), h("span", {}, "one front door: routes, filters, rate limit")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node" }, h("b", {}, "BFFs / order / product"), h("span", {}, "3 product instances behind one name")),
      ),
      Lab.prose(`
        <ul>
          <li><b>Eureka</b> keeps the phone book: which instances of which service are alive right now.</li>
          <li>The <b>gateway</b> and <b>order-service</b> look instances up in that phone book and pick one (Spring Cloud LoadBalancer).</li>
          <li>Every service writes JSON logs to <b>Logstash &rarr; Elasticsearch &rarr; Kibana</b> and publishes metrics for <b>Prometheus &rarr; Grafana</b>.</li>
          <li><b>Redis</b> stores the rate limiter's token buckets.</li>
        </ul>`)));

    // ---- live status table
    const rows = [
      ["eureka-server", "Service registry", 5, "eureka", "/"],
      ["api-gateway", "Spring Cloud Gateway", 8, null],
      ["product-service-1", "Provider, instance 1", 6, null], ["product-service-2", "Provider, instance 2", 6, null], ["product-service-3", "Provider, instance 3", 6, null],
      ["order-service", "Consumer (client-side discovery)", 4, null],
      ["web-bff", "BFF for browsers", 12, null], ["mobile-bff", "BFF for phones", 12, null],
      ["redis", "Rate limiter storage", 10, null],
      ["logstash", "Log pipeline (ELK)", 1, null], ["elasticsearch", "Log storage (ELK)", 1, null], ["kibana", "Log search UI (ELK)", 1, "kibana", "/"],
      ["prometheus", "Metrics database", 3, "prometheus", "/"], ["grafana", "Dashboards", 3, "grafana", "/"],
    ];
    const tbody = h("tbody");
    const table = h("div", { class: "tblwrap" }, h("table", { class: "tbl" },
      h("thead", {}, h("tr", {}, ["Component", "Role", "Lesson", "Docker", "Eureka", ""].map((c) => h("th", {}, c)))), tbody));
    Lab.live(() => {
      tbody.textContent = "";
      rows.forEach(([name, role, lesson, tool, path]) => {
        const reg = Lab.registry.instances.find((i) => i.host === name);
        const st = Lab.containers.ok ? Lab.containerState(name) : "unknown";
        tbody.append(h("tr", {},
          h("td", {}, h("b", {}, name)), h("td", {}, role), h("td", {}, "#" + lesson),
          h("td", {}, st === "unknown" && Lab.containers.ok ? Lab.stateBadge("off") : Lab.stateBadge(st)),
          h("td", {}, name === "eureka-server" ? Lab.regBadge(Lab.registry.ok ? "UP" : "DOWN") : ["redis", "logstash", "elasticsearch", "kibana", "prometheus", "grafana"].includes(name) ? "-" : Lab.regBadge(reg && reg.status)),
          h("td", {}, tool ? h("a", { href: Lab.toolUrl(tool, path), target: "_blank", rel: "noopener" }, "open") : "")));
      });
    });
    root.append(Lab.sec("Is everything running?", table,
      Lab.prose(`<p class="hint" style="margin-top:8px">"not started" for ELK or Prometheus/Grafana means that optional stack is switched off in <code>.env</code> (<code>COMPOSE_PROFILES</code>). Lessons 1-3 tell you the one command to start it.</p>`)));

    // ---- lesson plan
    root.append(Lab.sec("Teaching plan (about four hours)",
      Lab.table(["#", "Lesson", "Core idea students should leave with", "min"], [
        [1, "Centralized logging", "Many services, one searchable place for logs; a request id ties them together", 25],
        [2, "Actuator and Micrometer", "Every service describes its own health and numbers over HTTP", 20],
        [3, "Prometheus and Grafana", "Pull model: Prometheus scrapes, Grafana draws, alerts fire", 25],
        [4, "Discovery patterns", "Client-side picks the instance itself; server-side hides it behind a router", 15],
        [5, "Eureka", "Register, heartbeat, evict - and why Eureka sometimes refuses to evict", 30],
        [6, "Spring Cloud LoadBalancer", "Round-robin vs random, and what replaced Ribbon", 20],
        [7, "Health checks", "Four different ways an instance fails, and who notices when", 20],
        [8, "Gateway routes", "Id + predicates + filters + uri, in YAML and in Java", 25],
        [9, "Gateway filters", "Global vs per-route: logging, auth header injection, response rewriting", 25],
        [10, "Rate limiting", "Token bucket in Redis; what happens when Redis is down", 20],
        [11, "Load balancing at the gateway", "lb:// plus retries turn instance failures into non-events", 15],
        [12, "Gateway vs BFF", "One front door for everyone, or one tailored backend per client", 20],
      ], "cmp"),
      Lab.prose(`<p class="hint" style="margin-top:8px">Tip for the projector: switch to the dark theme in the sidebar and use the browser zoom (Ctrl +) - the layout adapts.</p>`)));

    root.append(Lab.sec("When something is red",
      Lab.table(["Symptom", "Likely reason", "Fix"], [
        ["Container shows <b>stopped</b> after a drill", "You killed it on purpose", "Press <b>Heal</b> in the sidebar, or <code>docker compose up -d</code>"],
        ["Map says <b>not UP in Eureka</b> right after start", "JVM still booting (about 40 s) or lease not registered yet", "Wait; Eureka shows it as soon as the first heartbeat lands"],
        ["Lesson says ELK or metrics is not running", "Optional profile is off", "<code>docker compose --profile elk up -d</code> (or <code>--profile metrics</code>)"],
        ["Everything is very slow", "Docker has too little memory", "Give Docker Desktop 6 GB, or set <code>COMPOSE_PROFILES=</code> empty in <code>.env</code>"],
      ], "cmp")));
  },
});
