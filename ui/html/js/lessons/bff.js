/* Lesson 12 - API Gateway vs Backend For Frontend (BFF) */
Lab.lessons.push({
  id: "bff", chapter: "patterns", title: "API Gateway vs BFF", minutes: 20,
  goal: "A gateway gives every client the same front door. A BFF gives each kind of client its own tailored back-end. Students measure what that means for requests, bytes and time.",
  nodes: ["browser", "api-gateway", "web-bff", "mobile-bff", "order-service", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>Two patterns that are often confused because both sit in front of the services:</p>`),
      Lab.table(["", "API Gateway", "Backend For Frontend (BFF)"], [
        ["<b>One per ...</b>", "system (one front door for everybody)", "kind of client (web, iOS, Android, partner ...)"],
        ["<b>Main job</b>", "cross-cutting concerns: routing, authentication, rate limiting, TLS, logging", "shape the data for ONE user experience: aggregate calls, trim fields, reformat"],
        ["<b>Knows about</b>", "URLs and policies - not business meaning", "the screens of its client and which services feed them"],
        ["<b>Owned by</b>", "platform / infrastructure team", "the front-end team that uses it"],
        ["<b>Typical code</b>", "configuration and generic filters", "real code: parallel calls, mapping, caching"],
        ["<b>Risk</b>", "becoming a bottleneck or a place for business logic", "duplicated logic between BFFs; too many BFFs"],
      ], "cmp"),
      h("div", { style: { height: "10px" } }),
      h("div", { class: "flow" },
        h("div", { class: "node" }, h("b", {}, "Web app"), h("span", {}, "large screen, fast network")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "API Gateway"), h("span", {}, "auth, limits, routing")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node hot" }, h("b", {}, "web-bff"), h("span", {}, "rich page, 6 internal calls")), h("span", { class: "arrow" }, "→"),
        h("div", { class: "node" }, h("b", {}, "product, order"), h("span", {}, "domain services"))),
      Lab.prose(`<p>They <b>complement</b> each other: the gateway handles what is common to all clients; each BFF handles what is specific to one. The mobile app takes the same path through its own <code>mobile-bff</code>.</p>`)));

    // ------------------------------------------------------------------------ experiment 1
    const cards = h("div", { class: "cols" });
    const rtt = h("select", { "aria-label": "Simulated round-trip time" }, [[0, "no extra latency"], [100, "100 ms (good 4G)"], [300, "300 ms (poor mobile network)"]].map(([v, l]) => h("option", { value: v }, l)));
    rtt.value = "300";
    let warmed = false;
    const asUser = () => (Lab.identity === "anonymous" ? "alice" : Lab.identity);

    async function trial(title, subtitle, phases, preview) {
      const t0 = performance.now(); let bytes = 0, count = 0, last = null; const failed = [];
      for (const phase of phases) {
        await Lab.sleep(+rtt.value);                       // one network round trip per phase (browser <-> gateway)
        const rs = await Promise.all(phase.map((p) => Lab.gw("GET", p, { as: asUser() })));
        rs.forEach((r) => { bytes += r.bytes; count++; last = r; if (!r.ok) failed.push(r.status || r.error); });
      }
      return { title, subtitle, count, bytes, ms: Math.round(performance.now() - t0), failed, sample: preview ? preview(last) : last };
    }

    async function runAll(btn) {
      cards.textContent = "measuring ...";
      if (!warmed) {            // first calls hit cold JVMs and class loading: do one silent lap so we measure steady state
        const keep = rtt.value; rtt.value = "0";
        await trial("", "", [["/api/products", "/api/orders"], ["/api/products/1/reviews"]]); await trial("", "", [["/bff/web/home"]]); await trial("", "", [["/bff/mobile/home"]]);
        rtt.value = keep; warmed = true;
      }
      const chatty = await trial("1. Gateway only", "the browser orchestrates",
        [["/api/products", "/api/products/recommendations", "/api/orders"], ["/api/products/1/reviews", "/api/products/2/reviews", "/api/products/3/reviews"]]);
      const web = await trial("2. Gateway + web-bff", "one call, rich payload", [["/bff/web/home"]]);
      const mobile = await trial("3. Gateway + mobile-bff", "one call, slim payload", [["/bff/mobile/home"]]);
      const maxMs = Math.max(chatty.ms, web.ms, mobile.ms), maxB = Math.max(chatty.bytes, web.bytes, mobile.bytes);
      const bar = (v, max, color) => h("div", { class: "meter", style: { margin: "4px 0" } }, h("i", { style: { width: (v / max) * 100 + "%", background: color } }));
      cards.textContent = "";
      [chatty, web, mobile].forEach((c, i) => cards.append(h("div", { class: "col" },
        h("h4", {}, c.title), h("div", { class: "hint" }, c.subtitle),
        h("div", { class: "stat", style: { marginTop: "8px" } }, String(c.count), h("small", {}, c.count === 1 ? "request from the device" : "requests from the device")),
        h("div", { class: "hint" }, "time to complete the screen"), h("div", {}, h("b", {}, c.ms + " ms")), bar(c.ms, maxMs, "var(--patterns)"),
        h("div", { class: "hint" }, "bytes received by the device"), h("div", {}, h("b", {}, Lab.fmtBytes(c.bytes))), bar(c.bytes, maxB, "var(--gateway)"),
        c.failed.length ? h("div", { class: "badge down" }, "failures: " + c.failed.join(", ")) : null,
        h("details", {}, h("summary", { class: "hint", style: { cursor: "pointer" } }, "last response"), Lab.jsonBox(c.sample.text || "", 1400)))));
      const faster = Math.min(web.ms, mobile.ms) < chatty.ms;
      cards.append(h("div", { class: "col", style: { gridColumn: "1 / -1" } }, h("b", {}, "Read the result: "),
        `the mobile BFF sent ${Math.round((1 - mobile.bytes / web.bytes) * 100)}% fewer bytes than the web BFF, and both BFFs replaced ${chatty.count} device requests by 1. ` +
        (faster ? `With ${rtt.value} ms of network latency the chatty client pays the delay twice (the review calls depend on the product list) while the BFFs pay it once - the fan-out happens inside the data centre.`
                : `At ${rtt.value} ms the extra round trip of the chatty client is cheap, so the BFFs are not faster yet (they do real work inside). Raise the latency to 300 ms and run again: every device round trip you remove becomes more valuable.`)));
    }

    root.append(Lab.sec("Try it",
      Lab.bench("1. Draw the home screen three ways", "The home screen needs products, reviews of the first three, recommendations and the user's orders.",
        Lab.steps([
          "Pick a network quality, press <b>Load the home screen</b>. (You are treated as <b>alice</b> if you are anonymous - these routes need a login.)",
          "Compare the three cards: request count, time, bytes. Watch the map: for the BFF calls dots fan out from the BFF to order-service and the product instances.",
          "Raise the latency to 300 ms and run again. Which approach degrades most?",
        ]),
        h("div", { class: "row" }, h("label", { class: "inline" }, "network ", rtt), h("button", { class: "btn accent", onclick: (e) => Lab.run(e.target, () => runAll(e.target)) }, "Load the home screen")),
        cards)));

    // ------------------------------------------------------------------------ experiment 2
    const hdrOut = Lab.consoleBox("Press one of the buttons.");
    const byHeader = (type) => h("button", { class: "btn", onclick: async () => {
      const r = await Lab.gw("GET", "/bff/home", { as: asUser(), headers: type ? { "X-Client-Type": type } : {} });
      hdrOut.log(`GET /bff/home  X-Client-Type: ${type || "(none)"}  ->  ${r.status}  route=${r.headers["x-matched-route"] || "-"}  answered by ${r.json && r.json.client ? r.json.client : "-"}`, r.ok ? "ok" : "warn");
    } }, type ? `X-Client-Type: ${type}` : "no header");
    root.append(Lab.sec(null,
      Lab.bench("2. One URL, the gateway picks the BFF", "Routing by a Header predicate (Java DSL, RouteConfig): the client app only knows /bff/home.",
        h("div", { class: "row" }, byHeader("web"), byHeader("mobile"), byHeader(null)), hdrOut,
        h("div", { class: "hint" }, "Without the header no route matches, so the answer is 404: the route table is the contract."))));

    // ------------------------------------------------------------------------ experiment 3
    const isoOut = Lab.consoleBox("Press 'Call both BFFs' before and after breaking one.");
    root.append(Lab.sec(null,
      Lab.bench("3. Independent failure", "Each BFF is its own deployable. Does a problem in one affect the other?",
        Lab.steps(["Press <b>Call both BFFs</b>: both answer.", "Press <b>Kill (crash)</b> on <b>web-bff</b>, then call again: the web screen fails, the mobile screen still works.", "Press <b>Heal</b> in the sidebar to bring web-bff back (about 40 s)."]),
        h("div", { class: "row" }, h("b", {}, "web-bff"), Lab.controlButtons("web-bff", ["stop", "kill", "pause"]),
          h("button", { class: "btn accent", onclick: async () => {
            for (const p of ["/bff/web/home", "/bff/mobile/home"]) { const r = await Lab.gw("GET", p, { as: asUser() }); isoOut.log(`${p} -> ${r.status} ${r.ok ? "(" + r.json.client + ")" : r.error || ""} ${r.ms} ms`, r.ok ? "ok" : "bad"); }
          } }, "Call both BFFs")),
        isoOut)));

    root.append(Lab.sec("Which one do I need?", h("div", { class: "cols" },
      h("div", { class: "col" }, h("h4", {}, "A gateway alone is enough when"), Lab.prose(`<ul><li>all clients need roughly the same data</li><li>screens map to one or two service calls</li><li>one team owns both back-end and front-ends</li><li>you mainly need security, routing and limits</li></ul>`)),
      h("div", { class: "col" }, h("h4", {}, "Add BFFs when"), Lab.prose(`<ul><li>web and mobile need very different payloads</li><li>a screen needs many calls, or calls that depend on each other</li><li>front-end teams are blocked waiting for back-end changes</li><li>clients differ in network quality or release cadence</li></ul>`)),
      h("div", { class: "col" }, h("h4", {}, "Warning signs"), Lab.prose(`<ul><li>business rules living in the gateway or the BFF instead of the domain services</li><li>copy-pasted logic across BFFs: extract a shared service</li><li>one BFF per screen: too fine</li></ul>`)))));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Is the BFF just a second gateway?", "No. A gateway is generic infrastructure (config and filters). A BFF contains client-specific code, and it is owned by the team of that client."],
      ["Why does the BFF call services directly instead of going through the gateway again?", "It is already inside the trust boundary; the gateway has done authentication and rate limiting. An extra hop would only add latency. It still uses service discovery and load balancing."],
      ["The mobile team wants a new field. Who changes what?", "With a mobile BFF: the mobile team edits only the mobile BFF. With a shared API: every client is affected and the change needs agreement across teams."],
      ["What does the BFF do when one of its downstream calls fails?", "That is a design decision made per screen: fail the whole screen (as this lab does, 503) or return a partial page without that section. A BFF is the right place for that decision."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "bff-service/src/main/java/com/lab/bff/WebBffController.java", label: "WebBffController", focus: ["CompletableFuture", "featuredWithReviews", "downstreamCalls"] },
      { file: "bff-service/src/main/java/com/lab/bff/MobileBffController.java", label: "MobileBffController", focus: ["slim", "limit(4)", "orderCount"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/config/RouteConfig.java", label: "gateway routes to BFFs", focus: ["dsl-bff", "lb://web-bff", "lb://mobile-bff", ".header("] },
      { file: "bff-service/src/main/resources/application.yml", label: "one jar, two names", focus: ["BFF_NAME", "name:"] },
      { file: "docker-compose.yml", label: "two containers, one image", focus: ["web-bff:", "mobile-bff:", "SPRING_PROFILES_ACTIVE", "BFF_NAME"] },
    ])));
  },
});
