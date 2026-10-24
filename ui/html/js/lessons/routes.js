/* Lesson 8 - Spring Cloud Gateway: routes (YAML + Java DSL) and predicates */
/** Spring prints predicates and filters with Java toString noise; show only the readable part. */
Lab.cleanPredicate = (p) => String(p)
  .replace(/\(*RouteDefinitionRouteLocator\$\$Lambda\/0x[0-9a-f]+@?[0-9a-f]*\s*&&\s*/g, "")
  .replace(/,?\s*match trailing slash: (true|false)/g, "")
  .replace(/Paths: /g, "Path ").replace(/Methods: /g, "Method ").replace(/Header: /g, "Header ").replace(/Query: param=/g, "Query ").replace(/Cookie: name=/g, "Cookie ")
  .replace(/ regexp=/g, " = ").replace(/^\(+|\)+$/g, "").replace(/\)\s*&&\s*\(?/g, "  AND  ").replace(/\s*&&\s*/g, "  AND  ").replace(/\s+/g, " ").trim();
Lab.cleanFilter = (f) => {
  let s = String(f).replace(/,\s*order\s*=\s*\d+\]$/, "").replace(/^\[/, "").replace(/^\[|\]$/g, "");
  s = s.replace(/^(?:[\w.]*\.)?(\w+?)GatewayFilterFactory\$\$Lambda\S*$/, "$1");             // custom / built-in lambda filters: keep the name
  const retry = /^Retry .*retries = (\d+).*statuses = list\[(.*?)\], methods = list\[(.*?)\]/.exec(s);
  if (retry) return `Retry retries=${retry[1]} on ${retry[2].replace(/(\d{3}) [A-Z_]+/g, "$1")} for ${retry[3]}`;
  return s.replace(/name = /g, "").replace(/value = /g, "").replace(/, override = true/, "").replace(/ template = /, " ").replace(/\s+/g, " ").trim();
};
Lab.chain = (trace) => {
  const { h } = Lab;
  const root = h("div", { class: "chain" });
  (trace || "").split(" > ").filter(Boolean).forEach((f, i, a) => {
    const global = f.includes("[global]"), route = f.includes("[route]");
    root.append(h("span", { class: `f ${global ? "global" : route ? "route" : ""}` }, f.replace("[global]", "").replace("[route]", "")));
    if (i < a.length - 1) root.append(h("span", { class: "sep" }, "→"));
  });
  root.append(h("span", { class: "sep" }, "→"), h("span", { class: "f upstream" }, "proxy to service"));
  return root;
};

Lab.lessons.push({
  id: "routes", chapter: "gateway", title: "Gateway routes and predicates", minutes: 25,
  goal: "A gateway is a table of routes. Each route says WHEN it applies (predicates), WHAT to change (filters) and WHERE to send it (uri). Same table, written in YAML or Java.",
  nodes: ["browser", "api-gateway", "product-service-1", "product-service-2", "product-service-3", "order-service", "web-bff", "mobile-bff"],
  render(root) {
    const { h } = Lab;
    Lab.cleanups.push(() => { document.cookie = "lab-beta=; path=/; max-age=0"; });

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>A <b>route</b> has four parts:</p>`),
      Lab.table(["Part", "Question it answers", "Example"], [
        ["<b>id</b>", "What do we call it in logs and metrics?", "<code>y-products</code>"],
        ["<b>predicates</b>", "Does this request belong to me? (all must be true)", "<code>Path=/api/products/**</code>, <code>Method=GET</code>"],
        ["<b>filters</b>", "What do we change on the way in and out?", "<code>AddRequestHeader</code>, <code>Retry</code>, <code>RewritePath</code>"],
        ["<b>uri</b>", "Where do we send it?", "<code>lb://product-service</code> (load-balanced by name) or <code>https://example.org</code>"],
      ], "cmp"),
      Lab.prose(`<p>The gateway walks the routes in <b>order</b> (lowest number first; ties keep file order) and uses the <b>first route whose predicates all match</b>.
        No match = <code>404</code>. This is why more specific routes need a lower <code>order</code>.</p>
        <h3>The same route, two syntaxes</h3>`),
      h("div", { class: "cols" },
        h("div", { class: "col" }, h("h4", {}, "YAML (application.yml)"), h("pre", { class: "json" }, `- id: y-orders
  uri: lb://order-service
  predicates:
    - Path=/api/orders/**
  filters:
    - RequireAuth=USER`)),
        h("div", { class: "col" }, h("h4", {}, "Java DSL (RouteConfig.java)"), h("pre", { class: "json" }, `.route("dsl-orders", r -> r
    .path("/api/orders/**")
    .filters(f -> f.filter(
        requireAuth.apply(c -> c.setRole("USER"))))
    .uri("lb://order-service"))`))),
      Lab.prose(`<p style="margin-top:10px"><b>Rule of thumb.</b> YAML for static routing that operations may tune without recompiling. Java DSL when a route needs real code
        (a lambda that rewrites a body, a bean, a computed condition). In this lab ids beginning <code>y-</code> come from YAML and <code>dsl-</code> from Java; both end up in one table.</p>`)));

    // ----------------------------------------------------------------------- live route table
    const tbody = h("tbody"), routesById = {};
    async function loadRoutes() {
      const r = await Lab.get("/api/raw/api-gateway/actuator/gateway/routes", { quiet: true });
      tbody.textContent = "";
      if (!r.ok || !Array.isArray(r.json)) { tbody.append(h("tr", {}, h("td", { colspan: 6, class: "hint" }, "Could not read /actuator/gateway/routes (gateway still starting?)"))); return; }
      r.json.sort((a, b) => a.order - b.order || a.route_id.localeCompare(b.route_id)).forEach((x) => {
        routesById[x.route_id] = x;
        const filters = (x.filters || []).map(Lab.cleanFilter);
        tbody.append(h("tr", {}, h("td", {}, String(x.order)), h("td", { class: "mono" }, x.route_id),
          h("td", {}, h("span", { class: `badge ${x.route_id.startsWith("dsl-") ? "info" : "up"}` }, x.route_id.startsWith("dsl-") ? "Java DSL" : "YAML")),
          h("td", { class: "mono" }, Lab.cleanPredicate(x.predicate)), h("td", { class: "mono" }, filters.length ? filters.map((f) => h("div", {}, f)) : "-"), h("td", { class: "mono" }, x.uri)));
      });
    }
    loadRoutes();
    root.append(Lab.sec("Try it",
      Lab.bench("1. The live route table", "Read from the running gateway: GET /actuator/gateway/routes. Edit api-gateway/src/main/resources/application.yml, run docker compose up -d --build api-gateway, then press Reload.",
        h("div", { class: "tblwrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["order", "id", "defined in", "predicates", "filters", "uri"].map((c) => h("th", {}, c)))), tbody)),
        h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: loadRoutes }, "Reload")))));

    // ----------------------------------------------------------------------- request builder
    const method = h("select", { "aria-label": "HTTP method" }, ["GET", "POST", "PUT", "DELETE"].map((m) => h("option", {}, m)));
    const path = h("input", { type: "text", value: "/api/products", style: { flex: "1", minWidth: "220px" }, "aria-label": "Path and query" });
    const hk = [0, 1, 2].map(() => h("input", { type: "text", placeholder: "header", style: { width: "130px" } })), hv = [0, 1, 2].map(() => h("input", { type: "text", placeholder: "value", style: { width: "140px" } }));
    const beta = h("input", { type: "checkbox", id: "betacookie" });
    beta.addEventListener("change", () => { document.cookie = beta.checked ? "lab-beta=true; path=/" : "lab-beta=; path=/; max-age=0"; });
    const result = h("div", {}), asWho = h("span", { class: "hint" });
    const setWho = () => (asWho.textContent = `as ${Lab.identity}`); setWho(); Lab.cleanups.push(Lab.on("identity", setWho));

    const preset = (label, why, m, p, headers = {}, cookie = false) => h("button", { class: "btn sm ghost", title: why, onclick: () => {
      method.value = m; path.value = p; hk.forEach((e, i) => { e.value = Object.keys(headers)[i] || ""; hv[i].value = Object.values(headers)[i] || ""; });
      beta.checked = cookie; beta.dispatchEvent(new Event("change")); send();
    } }, label);

    async function send() {
      const headers = {}; hk.forEach((k, i) => { if (k.value.trim()) headers[k.value.trim()] = hv[i].value; });
      const res = await Lab.gw(method.value, path.value, { headers, json: method.value === "POST" ? {} : undefined });
      const rid = res.headers["x-matched-route"], hd = res.headers;
      result.textContent = "";
      result.append(
        h("div", { class: "row" }, h("span", { class: `badge ${res.ok ? "up" : res.status >= 500 || !res.status ? "down" : "warn"}` }, `HTTP ${res.status || "none"}`), h("span", { class: "hint" }, `${res.ms} ms  ${asWho.textContent}`)),
        h("dl", { class: "kv" },
          h("dt", {}, "matched route"), h("dd", {}, rid || "(none - the gateway answered 404 itself)"),
          h("dt", {}, "forwarded to"), h("dd", {}, hd["x-upstream"] || "-"),
          h("dt", {}, "route defined by"), h("dd", {}, hd["x-route-source"] || "-"),
          h("dt", {}, "other response headers"), h("dd", {}, ["x-gateway", "x-beta", "x-auth-result", "x-ratelimit-remaining", "x-instance-id"].filter((k) => hd[k]).map((k) => `${k}: ${hd[k]}`).join("   ") || "-")),
        hd["x-filter-trace"] ? h("div", {}, h("div", { class: "hint" }, "custom filters that ran, in order:"), Lab.chain(hd["x-filter-trace"])) : null,
        rid && routesById[rid] ? Lab.callout("", "Why this route", `It matched because: <code>${Lab.esc(Lab.cleanPredicate(routesById[rid].predicate))}</code>`) :
          Lab.callout(res.status === 404 ? "warn" : "", "Why no route?", "No route's predicates were all true, so no route handled it. Method, path, headers, query, cookie and time are all checked."),
        Lab.jsonBox(res.text.length ? res.text : "(empty body)", 1500));
    }

    root.append(Lab.sec(null,
      Lab.bench("2. Send a request and see which route wins", "Try the presets one by one, then edit the request freely. Each preset exercises a different predicate.",
        h("div", { class: "row tight" },
          preset("Path + Method", "y-products", "GET", "/api/products"),
          preset("Query: ?preview=true", "y-products-preview has order -10 and a Query predicate", "GET", "/api/products?preview=true"),
          preset("Cookie: beta user", "sets cookie lab-beta=true", "GET", "/api/products/whoami", {}, true),
          preset("Wrong method: POST", "y-products allows GET only", "POST", "/api/products"),
          preset("Time window", "Between(2020, 2099)", "GET", "/promo/hot"),
          preset("Expired window", "Before(2020)", "GET", "/promo-expired/x"),
          preset("Java DSL route", "dsl-whoami-envelope", "GET", "/dsl/whoami"),
          preset("Header picks the BFF", "Header X-Client-Type", "GET", "/bff/home", { "X-Client-Type": "mobile" }),
          preset("No route", "nothing matches", "GET", "/nowhere")),
        h("div", { class: "row" }, method, path, h("button", { class: "btn accent", onclick: send }, "Send"), asWho),
        h("div", { class: "row tight" }, h("span", { class: "hint" }, "request headers:"), hk.map((k, i) => [k, hv[i]]).flat(), h("label", { class: "inline", for: "betacookie" }, beta, "cookie lab-beta=true")),
        result)));

    root.append(Lab.sec("Predicates at a glance", Lab.table(["Predicate", "Matches when ...", "Example"], [
      ["<b>Path</b>", "the URL path matches an Ant pattern", "<code>Path=/api/products/**</code>"],
      ["<b>Method</b>", "the HTTP verb is listed", "<code>Method=GET,POST</code>"],
      ["<b>Header</b>", "a header exists and matches a regex", "<code>Header=X-Client-Type, mobile</code>"],
      ["<b>Query</b>", "a query parameter exists (optionally with a value)", "<code>Query=preview, true</code>"],
      ["<b>Cookie</b>", "a cookie matches", "<code>Cookie=lab-beta, true</code>"],
      ["<b>After / Before / Between</b>", "the current time is in the window", "<code>Between=2020-01-01T00:00Z[UTC], 2099-..</code>"],
      ["<b>Host</b>", "the Host header matches", "<code>Host=**.example.org</code>"],
      ["<b>RemoteAddr</b>", "the caller's IP is in a range", "<code>RemoteAddr=192.168.1.1/24</code>"],
      ["<b>Weight</b>", "weighted random choice inside a group - canary releases", "<code>Weight=group1, 8</code> and <code>Weight=group1, 2</code>"],
    ], "cmp")));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Two routes both match <code>GET /api/products?preview=true</code>. Which wins and how do you control it?", "The one with the lower <code>order</code>. <code>y-products-preview</code> has <code>order: -10</code>, so it wins over <code>y-products</code> (order 0). Without an explicit order the file order decides."],
      ["Why does <code>POST /api/products</code> return 404 rather than 405?", "No route matched, so no backend was even contacted: the gateway has no idea the URL 'exists'. The <code>Method</code> predicate is part of route matching, not a validation after it."],
      ["<code>lb://product-service</code> - what does <code>lb</code> mean?", "A special scheme: a filter (ReactiveLoadBalancerClientFilter) replaces it with a concrete instance's host and port chosen by Spring Cloud LoadBalancer from the registry (lessons 4-6)."],
      ["When would you choose the Java DSL over YAML?", "When the route contains logic (a lambda, an injected bean, a condition you compute), or you want compile-time checking and refactoring support."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "api-gateway/src/main/resources/application.yml", label: "YAML routes", focus: ["- id:", "predicates:", "Path=", "Query=", "Cookie=", "Between=", "Before="] },
      { file: "api-gateway/src/main/java/com/lab/gateway/config/RouteConfig.java", label: "Java DSL routes", focus: [".route(", ".path(", ".header(", ".uri("] },
    ])));
  },
});
