/* Lesson 4 - Client-side vs server-side service discovery */
Lab.lessons.push({
  id: "discovery", chapter: "find", title: "Discovery patterns", minutes: 15,
  goal: "Services start, stop and move. Callers must find a live instance by NAME, not by address. Who makes that choice - the caller or a router - is the pattern.",
  nodes: ["browser", "api-gateway", "order-service", "eureka-server", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    const step = (n, text) => h("div", { class: "node" }, h("b", {}, n), h("span", { html: text }));
    root.append(Lab.sec("Idea",
      Lab.prose(`<p>In containers and clouds an instance's IP changes at every restart and the number of instances changes with load. Hard-coding
        <code>http://10.0.0.7:8080</code> breaks. Instead each instance <b>registers</b> under a logical name (<code>product-service</code>) in a
        <b>service registry</b>, and callers ask the registry "who is alive under that name?"</p>`),
      h("h3", {}, "Client-side discovery"),
      h("div", { class: "flow" },
        step("1. ask", "caller asks the registry for <code>product-service</code>"), h("span", { class: "arrow" }, "→"),
        step("2. choose", "caller gets <i>all</i> instances and picks one (load balancer library inside the caller)"), h("span", { class: "arrow" }, "→"),
        step("3. call", "caller talks <b>directly</b> to that instance")),
      Lab.prose(`<p>In this lab: <code>order-service</code> &rarr; Eureka client &rarr; Spring Cloud LoadBalancer &rarr; <code>product-service-N</code>.</p>`),
      h("h3", {}, "Server-side discovery"),
      h("div", { class: "flow" },
        step("1. call", "caller sends the request to ONE well-known address (a router)"), h("span", { class: "arrow" }, "→"),
        step("2. look up + choose", "the router asks the registry and picks an instance"), h("span", { class: "arrow" }, "→"),
        step("3. forward", "the router forwards the request; the caller never learns instance addresses")),
      Lab.prose(`<p>In this lab: the browser knows only the <b>API Gateway</b>. Elsewhere: AWS ALB, Kubernetes Services, nginx with a service-aware config.</p>`),
      Lab.callout("", "A subtle point worth discussing", "The gateway is server-side discovery <i>for the browser</i>, but internally it uses the same client-side library (Spring Cloud LoadBalancer) to pick the instance. The patterns are about <i>who the caller is</i>, not about which code runs.")));

    // -------------------------------------------------------------------------- experiments
    const N = 9;
    const mk = (title, desc, run, extra) => {
      const strip = Lab.strip(30), bars = Lab.barChart(["product-1", "product-2", "product-3"]), info = h("div", { class: "hint" });
      const btn = h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, async () => { strip.clear(); info.textContent = "calling ..."; await run({ strip, bars, info }); }) }, `Send ${N} calls`);
      return Lab.bench(title, desc, h("div", { class: "row" }, btn, extra || null), strip, Lab.instLegend(), bars, info);
    };

    const clientSide = mk("1. Client-side: order-service picks the instance",
      "Your browser makes ONE call to order-service. Order-service then calls product-service nine times. The choice of instance is made inside order-service.",
      async ({ strip, bars, info }) => {
        const r = await Lab.get(`/api/svc/order-service/api/orders/client-side-demo?n=${N}`);
        if (!r.json || !r.json.sequence) { info.textContent = `Failed: HTTP ${r.status} ${r.error || ""}`; return; }
        r.json.sequence.forEach((inst, i) => {
          strip.push(inst === "ERROR" ? "err" : "", `call ${i + 1} -> ${inst}`, inst);
          setTimeout(() => Lab.map.trace(["order-service", "product-service-" + inst.replace("product-", "")], { color: "#0e8a83" }), 140 * i);
        });
        bars.set(r.json.distribution);
        info.textContent = `Strategy "${r.json.strategy}". Browser made 1 request; order-service made ${r.json.calls} requests in ${r.json.totalMs} ms. Registry look-ups were served from order-service's local cache.`;
      });

    const serverSide = mk("2. Server-side: the gateway picks the instance",
      "Your browser makes nine separate calls, all to the same address. It has no idea that three instances exist.",
      async ({ strip, bars, info }) => {
        const counts = {}; const t0 = performance.now();
        for (let i = 0; i < N; i++) {
          const r = await Lab.gw("GET", "/api/products/whoami");
          const inst = r.json ? r.json.instanceId : "ERROR";
          strip.push(r.ok ? "" : "err", `call ${i + 1} -> ${inst} (${r.ms} ms)`, inst);
          counts[inst] = (counts[inst] || 0) + 1; bars.set(counts);
        }
        info.textContent = `Browser made ${N} requests to ONE address (the gateway). Total ${Math.round(performance.now() - t0)} ms. The instance ids were only visible because the service echoes them in the response.`;
      });
    root.append(Lab.sec("Try it", clientSide, serverSide));

    // -------------------------------------------------------------------------- three views of the phone book
    root.append(Lab.sec(null,
      Lab.bench("3. Three copies of the phone book", "Every client keeps its own cached copy of the registry, refreshed every 5 seconds in this lab (30 s by default).",
        Lab.phoneBook(), h("div", { class: "hint" }, "Lessons 5 and 7 stop an instance and show how long these copies disagree. Eventually consistent is a deliberate trade-off: availability over perfect accuracy."))));

    root.append(Lab.sec("Compare", Lab.table(["", "Client-side", "Server-side"], [
      ["Who picks the instance", "the caller (library inside it)", "a router in the middle"],
      ["Network hops", "caller &rarr; instance (direct)", "caller &rarr; router &rarr; instance"],
      ["Caller complexity", "needs registry client + LB library in every language", "none - one URL"],
      ["Typical products", "Eureka + Spring Cloud LoadBalancer, Consul + client", "API gateway, cloud load balancers, Kubernetes Service"],
      ["Failure of the middle", "no router to fail", "router is critical and must be scaled and secured"],
      ["Best for", "service-to-service calls inside the system", "traffic coming from outside (browsers, mobile apps, partners)"],
    ], "cmp")));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why can the order-service keep working for a short while even if Eureka itself goes down?", "It keeps its last copy of the registry in memory and keeps calling those instances. That cache is also why it can send traffic to a dead instance until the next refresh."],
      ["A mobile app talks to 40 services. Which pattern would you give it and why?", "Server-side: one address, no registry client on the phone, and the gateway can enforce authentication and rate limits (lessons 8-10)."],
      ["Where is the logical name <code>product-service</code> defined?", "In the provider: <code>spring.application.name=product-service</code>. Three containers with the same name become three instances of one service."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "order-service/src/main/java/com/lab/order/ProductClientConfig.java", label: "client-side: @LoadBalanced", focus: ["@LoadBalanced", "baseUrl"] },
      { file: "order-service/src/main/java/com/lab/order/OrderController.java", label: "OrderController", focus: ["productClient.get()", "clientSideDemo"] },
      { file: "api-gateway/src/main/resources/application.yml", label: "server-side: lb:// route", focus: ["lb://product-service"] },
      { file: "product-service/src/main/resources/application.yml", label: "provider config", focus: ["application:", "name: product-service", "instance-id"] },
    ])));
  },
});
