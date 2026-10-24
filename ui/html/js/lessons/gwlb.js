/* Lesson 11 - Load balancing at the gateway: lb:// + Spring Cloud LoadBalancer + Retry */
Lab.lessons.push({
  id: "gwlb", chapter: "gateway", title: "Load balancing at the gateway", minutes: 15,
  goal: "The gateway does not need a hard-coded address: lb://product-service plus the LoadBalancer spreads traffic - and a Retry filter turns a dead instance into a non-event.",
  nodes: ["browser", "api-gateway", "eureka-server", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>In a route, <code>uri: lb://product-service</code> is not a URL. The prefix <code>lb</code> triggers a gateway filter that
        (1) takes <code>product-service</code> as a service id, (2) asks <b>Spring Cloud LoadBalancer</b> for an instance from the Eureka-fed list, and
        (3) rewrites the target to e.g. <code>http://product-service-2:8080</code>. It is exactly the library from lesson 6, running inside the gateway.</p>`),
      h("div", { class: "flow" },
        h("div", { class: "node" }, h("b", {}, "Request"), h("span", {}, "GET /api/products/whoami")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "Route match"), h("span", {}, "uri = lb://product-service")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "LoadBalancer filter"), h("span", {}, "service id → one instance")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node" }, h("b", {}, "Netty HTTP client"), h("span", {}, "connect-timeout, response-timeout"))),
      Lab.prose(`<p>Because the instance list can be a few seconds stale (lesson 7), the gateway pairs the load balancer with a <b>Retry</b> filter:
        a failed attempt is repeated, and the load balancer is asked <i>again</i> - which, with round-robin, naturally returns a different instance.</p>`)));

    // ------------------------------------------------------------------- 1 distribution
    let strategy = "round-robin";
    const bars = Lab.barChart(["product-1", "product-2", "product-3"]), strip = Lab.strip(60), info = h("div", { class: "hint" });
    const seg = Lab.seg([["round-robin", "Round-robin"], ["random", "Random"]], strategy, async (s) => { await Lab.post("/gw/lab/lb/" + s, undefined, { quiet: true }); strategy = s; seg.set(s); Lab.toast("Gateway now uses " + s, "good"); });
    Lab.get("/gw/lab/lb", { quiet: true }).then((r) => { if (r.json) { strategy = r.json.strategy; seg.set(strategy); } });
    root.append(Lab.sec("Try it",
      Lab.bench("1. Spread over three instances", "Only the gateway's algorithm changes here (lesson 6 switched both applications at once).",
        h("div", { class: "row" }, seg,
          h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, async () => {
            strip.clear(); const counts = {}; const t0 = performance.now();
            await Lab.burst(30, () => Lab.gw("GET", "/api/products/whoami", { quiet: true }), { concurrency: 1, onEach: (r) => { const inst = Lab.answeredBy(r) || "ERROR"; counts[inst] = (counts[inst] || 0) + 1; bars.set(counts); strip.push(r.ok ? "" : "err", `${inst} - served by ${r.headers["x-upstream"] || "?"}`, inst); Lab.map.trace(["browser", "api-gateway", "product-service-" + inst.replace("product-", "")], { color: "#2d5bd1" }); } });
            info.textContent = `30 sequential requests in ${Math.round(performance.now() - t0)} ms with ${strategy}.`;
          }) }, "Send 30 requests")),
        strip, Lab.instLegend(), bars, info)));

    // ------------------------------------------------------------------- 2 retry
    const resultBox = h("div", {}), regInfo = h("div", { class: "hint" });
    Lab.live(() => { const up = Lab.registry.instances.filter((i) => i.app === "PRODUCT-SERVICE" && i.status === "UP").map((i) => i.host.replace("product-service-", "product-")); regInfo.textContent = `Eureka currently lists UP: ${up.join(", ") || "none"}`; });
    const failure = h("select", { "aria-label": "Failure type" }, [["kill", "Kill an instance (connection refused / unknown host)"], ["pause", "Freeze an instance (hangs until the 4 s response timeout)"]].map(([v, l]) => h("option", { value: v }, l)));
    const which = h("select", { "aria-label": "Instance" }, [1, 2, 3].map((n) => h("option", { value: n }, "product-service-" + n)));
    const ctl = h("span", { class: "row tight" });
    const drawCtl = () => { ctl.textContent = ""; ctl.append(Lab.controlButtons("product-service-" + which.value, ["stop", "kill", "pause"])); };
    drawCtl(); which.addEventListener("change", drawCtl);

    async function compare() {
      const n = failure.value === "pause" ? 12 : 24; resultBox.textContent = "running ...";
      const rows = [];
      for (const [label, path] of [["WITH Retry filter", "/api/products/whoami"], ["WITHOUT Retry filter", "/noretry/products/whoami"]]) {
        const results = await Lab.burst(n, () => Lab.gw("GET", path, { quiet: true, timeout: 20000 }), { concurrency: 4 });
        const ok = results.filter((r) => r.ok).length, codes = {};
        results.filter((r) => !r.ok).forEach((r) => (codes[r.status || r.error] = (codes[r.status || r.error] || 0) + 1));
        const avg = Math.round(results.reduce((a, r) => a + r.ms, 0) / n);
        rows.push([`<b>${label}</b>`, `${ok} / ${n}`, `<span style="color:${n - ok ? "var(--down)" : "inherit"}">${n - ok}</span>`, Object.entries(codes).map(([c, k]) => `${c} &times; ${k}`).join(", ") || "-", avg + " ms"]);
      }
      resultBox.textContent = ""; resultBox.append(Lab.table(["Route", "succeeded", "failed", "failure codes", "average time"], rows, "cmp"));
    }
    root.append(Lab.sec(null,
      Lab.bench("2. Retry: failures nobody sees", "Break one instance, then send the same traffic down two routes that differ only in the Retry filter.",
        Lab.steps([
          "Choose an instance and the kind of failure. Press the matching button (<b>Kill</b> or <b>Freeze</b>). Eureka still lists the instance as UP for a while - that is the stale window.",
          "<em>Immediately</em> press <b>Compare</b>. Requests that the load balancer sends to the dead instance fail on the route without retry. On the route with retry nearly all of them succeed on another instance - nearly: retries lower the failure rate, they do not remove it (two attempts in a row can hit the same dead instance).",
          "With <b>Freeze</b> the retried requests are <b>slower</b> (they waited for the 4 s response timeout first): retries convert errors into latency. Budget for that.",
          "Press <b>Heal</b> in the sidebar when you are done.",
        ]),
        h("div", { class: "row" }, h("label", { class: "inline" }, "failure ", failure), h("label", { class: "inline" }, "instance ", which), ctl),
        regInfo,
        h("div", { class: "row" }, h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, compare) }, "Compare retry vs no retry"), h("button", { class: "btn sm accent", onclick: () => Lab.healAll() }, "Heal: start / unfreeze everything")),
        resultBox)));

    root.append(Lab.sec(null, Lab.bench("3. What the gateway can currently see", "The gateway's own cached list (UP instances only) next to the registry and order-service's copy.", Lab.phoneBook())));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why retry only <code>GET</code> by default?", "A GET is idempotent: repeating it is harmless. Retrying a POST might create two orders if the first attempt actually succeeded but the answer was lost."],
      ["What happens if ALL instances are down?", "The load balancer has nothing to choose from and the gateway answers <b>503 Service Unavailable</b> at once: try stopping all three instances and calling /api/products."],
      ["Which two timeouts protect the gateway's threads from a frozen service?", "<code>httpclient.connect-timeout</code> (establishing the connection) and <code>httpclient.response-timeout</code> (waiting for the answer). Without a response timeout a frozen instance would hold the connection forever."],
      ["Does the gateway call Eureka on every request?", "No. It uses the local cached list (refreshed every 5 s here). That keeps the registry out of the request path - and is why the list can be stale."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "api-gateway/src/main/resources/application.yml", label: "lb:// + Retry + timeouts", focus: ["lb://product-service", "name: Retry", "retries", "statuses", "connect-timeout", "response-timeout", "ttl:"] },
      { file: "lab-common/src/main/java/com/lab/common/lb/LabLoadBalancerAutoConfiguration.java", label: "shared LB config", focus: ["@LoadBalancerClients"] },
      { file: "api-gateway/pom.xml", label: "pom.xml", focus: ["eureka-client", "gateway-server-webflux"] },
    ])));
  },
});
