/* Lesson 6 - Spring Cloud LoadBalancer (round-robin / random), the replacement of Netflix Ribbon */
Lab.lessons.push({
  id: "loadbalancer", chapter: "find", title: "Spring Cloud LoadBalancer", minutes: 20,
  goal: "Three instances, one name. Which one gets the next request? Students switch the algorithm live and measure the difference - and learn what replaced Ribbon.",
  nodes: ["api-gateway", "order-service", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`
        <p>Discovery answers <i>"which instances exist?"</i>. A <b>load balancer</b> answers <i>"which one do I use for THIS request?"</i>.
        Spring Cloud LoadBalancer is a small library that sits behind every <code>lb://service</code> URI and every <code>@LoadBalanced</code> client.</p>
        <ul>
          <li><b>Round-robin</b> - take turns: 1, 2, 3, 1, 2, 3 ... Perfectly even, predictable, ignores how busy each instance is.</li>
          <li><b>Random</b> - roll a die each time. No shared counter (cheaper under heavy concurrency), evens out over many requests but can be lumpy in a short run.</li>
        </ul>
        <p>Both are built in. A third family (weighted, zone-preferring, same-instance-preferred, health-checking) is available as
        <code>ServiceInstanceListSupplier</code> decorators.</p>`),
      h("h3", {}, "It replaced Netflix Ribbon"),
      Lab.table(["", "Netflix Ribbon (old)", "Spring Cloud LoadBalancer (now)"], [
        ["Status", "maintenance mode since 2018; removed from Spring Cloud in 2020.0", "the only supported client-side load balancer"],
        ["Programming model", "blocking, <code>IRule</code>, <code>ILoadBalancer</code>", "reactive-friendly: <code>ReactorServiceInstanceLoadBalancer</code>"],
        ["Algorithm", "<code>RoundRobinRule</code>, <code>RandomRule</code>, ...", "<code>RoundRobinLoadBalancer</code>, <code>RandomLoadBalancer</code>"],
        ["Where instances come from", "<code>ServerList</code>", "<code>ServiceInstanceListSupplier</code> (Eureka, Consul, Kubernetes ...)"],
        ["Per-service config", "<code>@RibbonClient</code>, <code>&lt;svc&gt;.ribbon.*</code> properties", "<code>@LoadBalancerClient</code>, <code>spring.cloud.loadbalancer.*</code>"],
        ["HTTP clients", "<code>RestTemplate</code>, Feign", "<code>RestClient</code>, <code>WebClient</code>, <code>RestTemplate</code>, OpenFeign, Gateway"],
      ], "cmp")));

    // ------------------------------------------------------------------ strategy switch
    const status = h("div", { class: "hint" });
    let current = "round-robin";
    async function readStrategy() {
      const [g, o] = await Promise.all([Lab.get("/gw/lab/lb", { quiet: true }), Lab.get("/api/svc/order-service/lab/lb", { quiet: true })]);
      if (g.json) current = g.json.strategy;
      seg.set(current);
      status.textContent = `gateway: ${g.json ? g.json.strategy : "?"}   |   order-service: ${o.json ? o.json.strategy : "?"}`;
    }
    async function apply(strategy) {
      await Promise.all([Lab.post("/gw/lab/lb/" + strategy, undefined, { quiet: true }), Lab.post("/api/svc/order-service/lab/lb/" + strategy, undefined, { quiet: true })]);
      Lab.toast("Both the gateway and order-service now use " + strategy, "good");
      await readStrategy();
    }
    const seg = Lab.seg([["round-robin", "Round-robin"], ["random", "Random"]], current, apply);
    readStrategy();

    // ------------------------------------------------------------------ distribution
    const bars = Lab.barChart(["product-1", "product-2", "product-3"]), strip = Lab.strip(90), info = h("div", { class: "hint" });
    const nSel = h("select", { "aria-label": "Number of requests" }, [[9, "9 requests"], [30, "30 requests"], [300, "300 requests (fast)"]].map(([v, l]) => h("option", { value: v }, l)));
    async function measure(via) {
      strip.clear(); bars.set({ "product-1": 0, "product-2": 0, "product-3": 0 });
      const n = +nSel.value, counts = {}; const t0 = performance.now();
      const bump = (inst) => { counts[inst] = (counts[inst] || 0) + 1; bars.set(counts); };
      if (via === "gateway") {
        await Lab.burst(n, () => Lab.gw("GET", "/api/products/whoami", { quiet: n > 9 }), { concurrency: n > 30 ? 10 : 1, onEach: (r) => { const inst = Lab.answeredBy(r) || "ERROR"; if (strip.children.length < 90) strip.push(r.ok ? "" : "err", `${inst}`, inst); bump(inst); } });
      } else {
        let left = n;
        while (left > 0) {
          const chunk = Math.min(left, 50); left -= chunk;
          const r = await Lab.get(`/api/svc/order-service/api/orders/client-side-demo?n=${chunk}`, { quiet: true, timeout: 30000 });
          (r.json ? r.json.sequence : []).forEach((inst) => { if (strip.children.length < 90) strip.push(inst === "ERROR" ? "err" : "", inst, inst); bump(inst); });
        }
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0), vals = Object.values(counts), spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
      info.textContent = `${total} requests in ${Math.round(performance.now() - t0)} ms, strategy ${current}. Gap between the busiest and quietest instance: ${spread} request(s).`;
    }

    root.append(Lab.sec("Try it",
      Lab.bench("1. Pick the algorithm", "One switch changes both the API Gateway and order-service (they each have their own load balancer, set by the same shared configuration class).",
        h("div", { class: "row" }, seg), status),
      Lab.bench("2. Measure the distribution", "Send requests and watch the coloured cells: each colour is one instance. Switch the algorithm and repeat.",
        Lab.steps([
          "With <b>round-robin</b> and <b>9 requests via the gateway</b> every instance gets exactly 3, and the colours repeat in a fixed cycle.",
          "Switch to <b>random</b> and repeat: the cells come in any order and the bars are lumpy (4-1-4 happens).",
          "Run <b>300 requests</b> with random: the bars converge on ~33% each. <i>Random is fair in the long run, round-robin is fair in the short run.</i>",
          "Now press the second button (<b>via order-service</b>): the same algorithm, but running inside a different application.",
        ]),
        h("div", { class: "row" }, nSel,
          h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, () => measure("gateway")) }, "Send via the gateway"),
          h("button", { class: "btn ghost", onclick: (e) => Lab.run(e.target, () => measure("order")) }, "Send via order-service")),
        strip, Lab.instLegend(), bars, info)));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Round-robin gives each instance the same NUMBER of requests. When is that unfair?", "When requests differ in cost or instances differ in speed or current load. A slow instance still gets one third of the traffic. Remedies: weighted or least-connections strategies, or removing unhealthy instances (lesson 7)."],
      ["Why is the random strategy popular in huge clusters?", "No shared counter to update on every request, so no contention between threads, and independent clients never march in lock-step onto the same instance."],
      ["Where do we replace the algorithm in code?", "By declaring a <code>ReactorLoadBalancer&lt;ServiceInstance&gt;</code> bean via <code>@LoadBalancerClient</code>/<code>@LoadBalancerClients</code>. See the Source tabs: our <code>SwitchableLoadBalancer</code> simply delegates to the two built-in classes."],
      ["The instance list is cached for 5 s here (35 s default). What does that mean for a new instance?", "It receives no traffic until the next refresh. Cache time is a trade-off between accuracy and the cost of asking the registry."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "lab-common/src/main/java/com/lab/common/lb/SwitchableLoadBalancer.java", label: "SwitchableLoadBalancer", focus: ["RoundRobinLoadBalancer", "RandomLoadBalancer", "choose("] },
      { file: "lab-common/src/main/java/com/lab/common/lb/SwitchableLoadBalancerConfiguration.java", label: "configuration bean", focus: ["ReactorLoadBalancer", "getLazyProvider"] },
      { file: "lab-common/src/main/java/com/lab/common/lb/LabLoadBalancerAutoConfiguration.java", label: "@LoadBalancerClients", focus: ["@LoadBalancerClients"] },
      { file: "order-service/src/main/resources/application.yml", label: "order-service: lab.lb + cache", focus: ["loadbalancer:", "cache:", "ttl:", "lb:"] },
    ])));
  },
});
