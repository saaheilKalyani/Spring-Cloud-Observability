/* Lesson 9 - Gateway filters: global vs per-route; logging, auth header injection, response rewriting */
Lab.lessons.push({
  id: "filters", chapter: "gateway", title: "Gateway filters", minutes: 25,
  goal: "Filters change requests on the way in and responses on the way out. Some run for every route (global), some only where you attach them (per-route). Students see both in action.",
  nodes: ["browser", "api-gateway", "product-service-1", "product-service-2", "product-service-3", "order-service"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>Every request that matches a route walks through a <b>chain</b> of filters, then reaches the service, then walks back through the <i>same filters in reverse</i>.
        Code before <code>chain.filter(...)</code> is the <b>pre</b> phase, code after it the <b>post</b> phase.</p>`),
      h("div", { class: "flow" },
        h("div", { class: "node hot" }, h("b", {}, "RequestId"), h("span", {}, "global, order 1")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "Logging"), h("span", {}, "global, order 2")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "AuthHeaderInjection"), h("span", {}, "global, order 3")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node" }, h("b", {}, "RequireAuth, Retry ..."), h("span", {}, "per-route")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node" }, h("b", {}, "Service"), h("span", {}, "the response returns through the same filters, last to first"))),
      Lab.table(["", "Global filter", "Per-route filter", "default-filters"], [
        ["<b>Applies to</b>", "every route, automatically", "only routes that list it", "every route in that YAML file"],
        ["<b>Declared as</b>", "a Spring bean implementing <code>GlobalFilter</code>", "listed under a route; custom ones are a <code>GatewayFilterFactory</code> bean", "<code>default-filters:</code> in YAML"],
        ["<b>Typical use</b>", "logging, correlation ids, authentication, metrics", "rewrite paths, retries, rate limit, authorisation for one API", "a header every response should carry"],
        ["<b>In this lab</b>", "RequestId, Logging, AuthHeaderInjection", "RequireAuth, Retry, RewritePath, AddResponseHeader, RequestRateLimiter", "<code>X-Gateway: spring-cloud-gateway</code>"],
      ], "cmp")));

    // ------------------------------------------------------------------------- auth
    const who = h("select", { "aria-label": "Call as" }, [["anonymous", "anonymous (no token)"], ["alice", "alice [USER]"], ["bob", "bob [USER, ADMIN]"], ["carol", "carol [GUEST]"]].map(([v, l]) => h("option", { value: v }, l)));
    who.value = Lab.identity === "anonymous" || ["alice", "bob", "carol"].includes(Lab.identity) ? Lab.identity : "anonymous";
    const target = h("select", { "aria-label": "Target" }, [["/api/products/echo", "/api/products/echo  (product-service shows what it received)"], ["/api/orders", "/api/orders  (route with RequireAuth=USER)"], ["/api/products", "/api/products  (public)"]].map(([v, l]) => h("option", { value: v }, l)));
    const forged = h("input", { type: "checkbox", id: "forge" }), badTok = h("input", { type: "checkbox", id: "badtok" });
    const out = h("div", {});
    async function sendAuth() {
      const headers = {};
      if (forged.checked) headers["X-User-Id"] = "admin";
      if (forged.checked) headers["X-User-Roles"] = "ADMIN";
      if (badTok.checked) headers["Authorization"] = "Bearer not-a-real-token";
      const res = await Lab.gw("GET", target.value, { as: who.value, headers });
      out.textContent = "";
      out.append(h("div", { class: "row" }, h("span", { class: `badge ${res.ok ? "up" : "down"}` }, `HTTP ${res.status}`), h("span", { class: "hint" }, `X-Auth-Result: ${res.headers["x-auth-result"] || "-"}`)),
        h("div", { class: "hint" }, "filters that ran, in order (blue = global, orange = per-route):"), Lab.chain(res.headers["x-filter-trace"]));
      if (res.json && res.json.headersSeenByProductService) {
        const seen = res.json.headersSeenByProductService;
        const sent = { "X-User-Id": forged.checked ? "admin" : "(nothing)", "X-User-Roles": forged.checked ? "ADMIN" : "(nothing)", "Authorization": who.value === "anonymous" && !badTok.checked ? "(nothing)" : "Bearer ...", "X-Request-Id": "(nothing)" };
        out.append(Lab.table(["Header", "Browser sent", "product-service received"], ["X-User-Id", "X-User-Roles", "X-User-Tier", "X-Auth-Source", "Authorization", "X-Request-Id", "X-Gateway-Route"].map((k) =>
          [`<code>${k}</code>`, sent[k] || "(nothing)", `<b>${Lab.esc(seen[k])}</b>`])));
      } else out.append(Lab.jsonBox(res.text || "(empty)", 700));
    }
    root.append(Lab.sec("Try it",
      Lab.bench("1. Authentication header injection (global) and enforcement (per-route)", "The global filter works out WHO you are and tells the services behind it. The per-route filter decides whether that is enough for THIS API.",
        Lab.steps([
          "Call <b>/api/products/echo</b> as <b>anonymous</b>. The gateway injected <code>X-User-Id: anonymous</code> and <code>X-Auth-Source</code>. The browser sent neither.",
          "Call it as <b>alice</b>: now the service receives her id, roles and tier - and <b>no Authorization header</b>: the raw token never goes past the gateway.",
          "Tick <b>forge X-User-Id: admin</b> and call again as anonymous or alice: the forged values are <b>stripped and replaced</b>. This is why services behind a gateway can trust those headers.",
          "Target <b>/api/orders</b>: anonymous gets <b>401</b>, carol gets <b>403</b> (wrong role), alice and bob get <b>200</b>. In the chain, <code>RequireAuth(USER)</code> is orange: a per-route filter that stopped the request before it reached the service.",
        ]),
        h("div", { class: "row" }, h("label", { class: "inline" }, "as ", who), target),
        h("div", { class: "row" }, h("label", { class: "inline", for: "forge" }, forged, "forge X-User-Id: admin"), h("label", { class: "inline", for: "badtok" }, badTok, "send an invalid token"),
          h("button", { class: "btn accent", onclick: sendAuth }, "Send")),
        out)));

    // ------------------------------------------------------------------------- response rewriting
    const left = h("div", { class: "col" }), right = h("div", { class: "col" });
    async function compare(aPath, bPath, aTitle, bTitle) {
      const [a, b] = await Promise.all([Lab.gw("GET", aPath), Lab.gw("GET", bPath)]);
      const mk = (box, title, r) => { box.textContent = ""; box.append(h("h4", {}, title), h("div", { class: "hint" }, `HTTP ${r.status}, route ${r.headers["x-matched-route"] || "-"}, defined by ${r.headers["x-route-source"] || "-"}`), Lab.jsonBox(r.text.slice(0, 900) + (r.text.length > 900 ? " ..." : ""), 1200)); };
      mk(left, aTitle, a); mk(right, bTitle, b);
    }
    root.append(Lab.sec(null,
      Lab.bench("2. Response rewriting", "Java DSL routes use modifyResponseBody to change the answer before the client sees it. The service itself is untouched.",
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: () => compare("/api/products", "/masked/products", "/api/products (original)", "/masked/products (prices masked)") }, "Mask prices"),
          h("button", { class: "btn", onclick: () => compare("/api/products/whoami", "/dsl/whoami", "/api/products/whoami (original)", "/dsl/whoami (wrapped in an envelope)") }, "Wrap in an envelope")),
        h("div", { class: "cols" }, left, right),
        Lab.callout("warn", "Cost of body rewriting", "The gateway must buffer the whole response in memory to rewrite it. Fine for small JSON; avoid on large or streaming responses."),
        h("div", { class: "hint" }, "Header filters are cheaper: every response above also carries X-Gateway (default-filters) and X-Route-Source (AddResponseHeader on the route)."))));

    root.append(Lab.sec(null,
      Lab.bench("3. Logging filter - see it in Kibana", "LoggingGlobalFilter writes one line when a request arrives and one when the answer leaves, with route, status and duration as separate JSON fields.",
        h("div", { class: "linkrow" }, h("a", { href: "#/logs" }, "Open lesson 1's log viewer"), h("a", { href: Lab.toolUrl("kibana", "/app/discover#/view/lab-gateway-access"), target: "_blank", rel: "noopener" }, "Gateway access log in Kibana")),
        h("div", { class: "hint" }, "Try the KQL query  service : \"api-gateway\" and status >= 400  after running the 401/403 calls above."))));

    root.append(Lab.sec("Built-in filters you will meet", Lab.table(["Filter", "What it does"], [
      ["<code>AddRequestHeader</code> / <code>AddResponseHeader</code>", "add a header on the way in / out"],
      ["<code>RewritePath</code>, <code>SetPath</code>, <code>StripPrefix</code>, <code>PrefixPath</code>", "change the URL the service sees (regex, fixed, drop N segments, add prefix)"],
      ["<code>Retry</code>", "re-send on given statuses/exceptions (GET only unless told otherwise)"],
      ["<code>RequestRateLimiter</code>", "token-bucket rate limiting (lesson 10)"],
      ["<code>CircuitBreaker</code>", "stop calling a failing service, return a fallback (needs Resilience4j)"],
      ["<code>ModifyRequestBody</code> / <code>ModifyResponseBody</code>", "rewrite bodies with Java code"],
      ["<code>DedupeResponseHeader</code>, <code>RemoveRequestHeader</code>", "tidy headers (common when CORS is set twice)"],
      ["<code>RedirectTo</code>, <code>SetStatus</code>", "answer directly without calling a service"],
    ], "cmp")));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why must the auth filter REMOVE incoming <code>X-User-Id</code> headers before adding its own?", "Otherwise a client could send <code>X-User-Id: admin</code> and the services, which trust the gateway, would believe it. Strip first, then inject from verified data."],
      ["Why is authentication global but authorisation per-route?", "Identifying the caller is the same everywhere. What that caller may do differs per API, so the rule (roles) is attached to the route."],
      ["Where does a global filter sit relative to filters of a matched route?", "Global and route filters are merged into one list and sorted by <code>order</code>. Our global filters use <code>HIGHEST_PRECEDENCE + n</code> so they run first and last."],
      ["Why can't a filter change a response header after the response was sent?", "Headers are committed with the first byte. The pre-commit hook (<code>response.beforeCommit</code>) is the last safe moment - that is how RequestIdGlobalFilter writes X-Filter-Trace."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "api-gateway/src/main/java/com/lab/gateway/filter/RequestIdGlobalFilter.java", label: "RequestId (global)", focus: ["GlobalFilter", "beforeCommit", "getOrder"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/filter/LoggingGlobalFilter.java", label: "Logging (global)", focus: ["chain.filter", "doFinally"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/filter/AuthHeaderInjectionGlobalFilter.java", label: "AuthHeaderInjection (global)", focus: ["h.remove", "builder.header"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/filter/RequireAuthGatewayFilterFactory.java", label: "RequireAuth (per-route)", focus: ["AbstractGatewayFilterFactory", "reject("] },
      { file: "api-gateway/src/main/java/com/lab/gateway/config/RouteConfig.java", label: "modifyResponseBody (DSL)", focus: ["modifyResponseBody", "replaceAll"] },
      { file: "api-gateway/src/main/resources/application.yml", label: "default-filters + route filters", focus: ["default-filters", "AddResponseHeader", "RequireAuth", "RewritePath"] },
    ])));
  },
});
