/* Lesson 5 - Netflix Eureka: registration, heartbeat, eviction, self-preservation */
Lab.lessons.push({
  id: "eureka", chapter: "find", title: "Eureka registry", minutes: 30,
  goal: "A registry is only useful if it is accurate. Students watch registration, heartbeats and eviction happen in real time - and meet the mode where Eureka refuses to evict.",
  nodes: ["eureka-server", "api-gateway", "product-service-1", "product-service-2", "product-service-3", "order-service"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>Eureka is a REST service that keeps a table: <i>service name &rarr; list of live instances</i>. Instances look after their own entry (a <b>lease</b>):</p>`),
      Lab.table(["Event", "What happens", "Eureka default", "This lab"], [
        ["<b>Register</b>", "At start-up the instance <code>POST</code>s its name, host and port", "-", "-"],
        ["<b>Heartbeat</b> (renew)", "Every N seconds the instance <code>PUT</code>s 'I am alive'", "30 s", "3 s"],
        ["<b>Fetch registry</b>", "Clients download the table and cache it", "30 s", "5 s"],
        ["<b>Evict</b>", "No heartbeat for the lease duration &rarr; the server deletes the entry (in practice about 2&times; the duration, because of how Eureka stamps leases)", "90 s", "6 s"],
        ["<b>Cancel</b>", "Graceful shutdown: the instance <code>DELETE</code>s itself immediately", "-", "-"],
      ], "cmp"),
      Lab.callout("warn", "Why the lab is 10&times; faster than reality", "Real defaults mean a dead instance can stay in the table for several minutes. We shortened every timer so a lesson takes seconds - " +
        "<code>application.yml</code> of each service has the production defaults in square-bracket comments."),
      Lab.prose(`<h3>Self-preservation mode</h3>
        <p>Imagine the network cable between Eureka and half your services is cut. Their heartbeats stop arriving - but the services are probably fine!
        Evicting them all would empty the registry and cause an outage <i>created by the registry itself</i>.</p>
        <p>So Eureka keeps score: every minute it compares the heartbeats it <b>received</b> with the number it <b>expected</b>. If fewer than <b>85%</b> arrived it concludes
        "the problem is me/the network", switches to <b>self-preservation</b>, and <b>stops evicting</b>. Better a few stale entries than an empty phone book.</p>`)));

    // ------------------------------------------------------------------------------- 1 live registry
    const tbody = h("tbody"), rows = {};
    root.append(Lab.sec("Try it",
      Lab.bench("1. The live registry", "Every row is a lease. The bar shows how long ago the last heartbeat arrived, relative to the lease duration: a healthy instance keeps resetting it.",
        h("div", { class: "tblwrap" }, h("table", { class: "tbl" },
          h("thead", {}, h("tr", {}, ["Service", "Instance", "Status", "Since last heartbeat", "Drills"].map((c) => h("th", {}, c)))), tbody)),
        Lab.steps([
          "Press <b>Stop (graceful)</b> on <b>product-service-3</b>. The row disappears almost immediately: the app called <code>DELETE</code> on its way out.",
          "The stopped instance's row is gone, and its buttons with it. Press <b>Heal</b> (button under the timeline, or in the sidebar) and wait about 40 s for the row to come back. Now press <b>Kill (crash)</b> on it. The row stays for a while with a growing bar: Eureka does not know it is dead until heartbeats are missed.",
          "Read the timeline in the next experiment: it tells you exactly how many seconds Eureka needed.",
        ]))));

    function ensureRow(i) {
      if (rows[i.id]) return rows[i.id];
      const status = h("td"), bar = h("div", { class: "meter", style: { width: "190px" } }, h("i")), txt = h("div", { class: "hint", style: { marginTop: "2px" } });
      const controls = ["product-service-1", "product-service-2", "product-service-3", "order-service", "web-bff", "mobile-bff"].includes(i.host) ? Lab.controlButtons(i.host, ["stop", "kill", "pause"]) : h("span", { class: "hint" }, "(infrastructure)");
      const tr = h("tr", {}, h("td", {}, h("b", {}, i.app.toLowerCase())), h("td", { class: "mono" }, i.label + " @ " + i.host + ":" + i.port), status, h("td", {}, bar, txt), h("td", {}, controls));
      tbody.append(tr);
      return (rows[i.id] = { tr, status, bar, txt, controls, inst: i });
    }
    const emptyRow = h("tr", {}, h("td", { colspan: 5, class: "hint" }, "Registry is empty - services are still starting."));
    function paintRegistry() {
      const ids = new Set(Lab.registry.instances.map((i) => i.id));
      Object.keys(rows).forEach((id) => { if (!ids.has(id)) { rows[id].controls.dispose && rows[id].controls.dispose(); rows[id].tr.remove(); delete rows[id]; } });
      Lab.registry.instances.forEach((i) => { const r = ensureRow(i); r.inst = i; r.status.textContent = ""; r.status.append(Lab.regBadge(i.status)); });
      emptyRow.firstChild.textContent = Lab.registry.ok ? "Registry is empty - services are still starting." : "Eureka is not reachable.";
      if (Lab.registry.instances.length) emptyRow.remove(); else if (!emptyRow.isConnected) tbody.append(emptyRow);
    }
    Lab.live(paintRegistry);
    Lab.every(() => {
      Object.values(rows).forEach((r) => {
        const i = r.inst, age = Math.max(0, (Lab.serverNow() - i.lastRenewal) / 1000), dur = i.duration || 90, f = Math.min(1, age / dur);
        const fill = r.bar.firstChild;
        fill.style.width = f * 100 + "%"; fill.style.background = age > dur * 0.9 ? "var(--down)" : age > (i.renewalInterval || 30) * 1.6 ? "var(--warn)" : "var(--up)";
        r.txt.textContent = age > dur * 2.2 ? `${age.toFixed(0)} s - expired but NOT evicted` : `${age.toFixed(1)} s ago (lease ${dur} s)`;
      });
    }, 400);

    // ------------------------------------------------------------------------------- 2 timeline
    const log = h("div", { class: "console", "data-empty": "Registry changes appear here the moment this page notices them (polled every 2 s).", style: { maxHeight: "230px" } });
    const paintEvents = () => {
      log.textContent = "";
      Lab.events.slice(0, 40).forEach((e) => log.append(h("span", { class: "l" }, h("span", { class: "t" }, Lab.clock(new Date(e.t)) + "  "),
        h("span", { class: e.type === "REGISTERED" ? "ok" : e.type === "GONE" ? "bad" : "warn" }, e.type.padEnd(10)), e.text)));
    };
    paintEvents();
    Lab.cleanups.push(Lab.on("event", paintEvents));
    root.append(Lab.sec(null,
      Lab.bench("2. Timeline: how long did Eureka need?", "This page remembers when you pressed a drill button and measures the delay until the registry changed.",
        log,
        h("div", { class: "row" }, h("button", { class: "btn sm ghost", onclick: () => { Lab.events.length = 0; paintEvents(); } }, "Clear timeline"),
          h("button", { class: "btn sm accent", onclick: () => Lab.healAll() }, "Heal: start / unfreeze everything")),
        Lab.table(["Drill", "What the registry does", "Typical time here"], [
          ["Stop (graceful)", "entry removed by the instance itself (cancel)", "&lt; 3 s"],
          ["Kill (crash)", "waits for the lease to expire, then evicts", "about 12-20 s"],
          ["Freeze (partition)", "like a crash, but the process still exists", "about 12-20 s"],
        ], "cmp"))));

    // ------------------------------------------------------------------------------- 3 self-preservation
    const meterBox = h("div", {}), spBadge = h("span", { class: "badge" }, "-"), spInfo = h("div", { class: "hint" });
    async function refreshStats() {
      if (!Lab.eurekaStats) { spInfo.textContent = "Eureka stats unavailable"; return; }
      const s = Lab.eurekaStats, max = Math.max(s.renewsLastMinute, s.renewsThreshold, 1) * 1.3;
      meterBox.textContent = "";
      const m = h("div", { class: "meter" }, h("i", { style: { width: (s.renewsLastMinute / max) * 100 + "%", background: s.renewsLastMinute <= s.renewsThreshold ? "var(--down)" : "var(--up)" } }), h("u", { style: { left: (s.renewsThreshold / max) * 100 + "%" } }));
      meterBox.append(m, h("div", { class: "hint", style: { marginTop: "4px" } }, `heartbeats received in the last full minute: ${s.renewsLastMinute}   |   threshold (red mark): ${s.renewsThreshold}   |   instances registered: ${s.registeredInstances}`));
      spBadge.className = "badge " + (s.selfPreservationActive ? "down" : s.selfPreservationEnabled ? "up" : "warn");
      spBadge.textContent = s.selfPreservationActive ? "SELF-PRESERVATION ACTIVE: not evicting" : s.selfPreservationEnabled ? "self-preservation enabled, not triggered" : "self-preservation DISABLED";
      const lease = (Lab.registry.instances[0] || {}).duration;
      spInfo.textContent = lease ? `Lease duration in use: ${lease} s - ` + (lease >= 60 ? "slow-lease mode: the self-preservation drill below will work." : "fast-lease mode: great for eviction drills, too quick for the self-preservation drill (see step 1).") : "";
    }
    Lab.every(refreshStats, 2000);
    root.append(Lab.sec(null,
      Lab.bench("3. Self-preservation: see Eureka refuse to evict", "Eureka re-counts heartbeats once per minute, so this drill takes a few minutes. Start it, then continue with the next lessons and come back.",
        meterBox, h("div", { class: "row" }, spBadge), spInfo,
        Lab.steps([
          "Slow the leases to Eureka's real default. In <code>.env</code> set <code>EUREKA_LEASE_EXPIRATION=90</code> and run <code>docker compose up -d</code> in the terminal. All services restart; wait about a minute until the info line above says <i>slow-lease mode</i>, and for one full minute of steady numbers.",
          "<b>Freeze four of the seven registered services</b>: the three product instances and order-service (buttons below). That silences 4/7 of all heartbeats. Freezing only two or three is <b>not enough</b>: Eureka's threshold counts 85% of what it <i>expected</i>, and this Eureka version counts each heartbeat about twice, so the received number only falls under the red mark when more than half of the services go quiet.",
          "Watch the meter. Eureka recounts once per minute, so after about <b>1.5-2 minutes</b> the green bar drops below the red mark and the badge turns red: <b>self-preservation is active</b>.",
          "Keep watching past the lease duration (90 s, in practice about 3 minutes - see the table above). All four frozen instances stay in the registry as <b>UP</b> although they are dead - the table above still shows them with full red bars. Use lesson 7's no-retry probe to see requests being sent to the dead instances.",
          "<b>Unfreeze</b> them: heartbeats resume, the badge clears and the bars reset. For contrast set <code>EUREKA_SELF_PRESERVATION=false</code>, run <code>docker compose up -d eureka-server</code> and repeat: now Eureka evicts after the lease, true to its word - and the registry empties, exactly the outage self-preservation is designed to avoid.",
          "When you are done set <code>EUREKA_LEASE_EXPIRATION=6</code> again and run <code>docker compose up -d</code>.",
        ]),
        h("div", { class: "row" }, h("b", {}, "freeze: "), ["product-service-1", "product-service-2", "product-service-3", "order-service"].map((n) => h("span", { class: "row tight" }, h("span", { class: "hint" }, n.replace("product-service-", "product-")), Lab.controlButtons(n, ["pause"])))),
        Lab.callout("", "Teaching point", "Self-preservation protects against <i>false positives</i> at the cost of <i>stale entries</i>. Clients must therefore tolerate calling a dead instance: timeouts, retries and circuit breakers are not optional."))));

    // ------------------------------------------------------------------------------- 4 REST + dashboard
    const restOut = h("div", {});
    root.append(Lab.sec(null,
      Lab.bench("4. Eureka is just HTTP", "The Java client is a convenience; any language can register and heartbeat. Peek at the raw API.",
        Lab.table(["Call", "Meaning"], [
          ["<code>POST /eureka/apps/PRODUCT-SERVICE</code>", "register an instance (body: JSON with host, port, health URL ...)"],
          ["<code>PUT /eureka/apps/PRODUCT-SERVICE/&lt;instanceId&gt;</code>", "heartbeat / renew the lease"],
          ["<code>DELETE /eureka/apps/PRODUCT-SERVICE/&lt;instanceId&gt;</code>", "deregister (cancel)"],
          ["<code>GET /eureka/apps</code>", "the whole registry - used by every client every 5 s here"],
        ], "cmp"),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: async () => { const r = await Lab.get("/api/eureka/apps/PRODUCT-SERVICE", { quiet: true }); restOut.textContent = ""; restOut.append(Lab.jsonBox(r.json || r.text, 3500)); } }, "GET /eureka/apps/PRODUCT-SERVICE"),
          h("a", { class: "btn ghost", style: { textDecoration: "none" }, href: Lab.toolUrl("eureka", "/"), target: "_blank", rel: "noopener" }, "Open Eureka's own dashboard")),
        restOut,
        Lab.callout("warn", "A caching surprise", "<code>GET /eureka/apps</code> is answered from a <b>response cache</b>. Registrations, cancellations and status changes invalidate it, but plain heartbeats do not - " +
          "so <code>lastRenewalTimestamp</code> in that JSON can be minutes old (the cache lives up to 180 s by default). The registry table in experiment 1 therefore reads the registry directly through a small custom endpoint (<code>RegistryStatsController</code>). " +
          "Same lesson as before: a registry is eventually consistent, and each layer adds its own delay."))));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["A service crashes. Why might the gateway still send it requests for ten more seconds?", "The Eureka entry is evicted only after the lease expires, and then each client refreshes its cached copy every few seconds. Mitigation lives in the caller: short timeouts and retries on another instance (lesson 11)."],
      ["Why does <code>Stop (graceful)</code> vanish instantly but <code>Kill</code> does not?", "Graceful shutdown runs the application's shutdown hooks, which include 'deregister from Eureka'. SIGKILL gives the JVM no chance to say goodbye."],
      ["Eureka is in self-preservation. Is that a bug?", "No - it is a deliberate availability-over-consistency choice (AP in CAP terms). The red banner on the Eureka dashboard says exactly that: instances may be shown as UP when they are not."],
      ["Why did we set <code>expected-client-renewal-interval-seconds</code> on the SERVER to 3?", "Eureka computes the heartbeats it expects from that value. If the server assumed 30 s while clients beat every 3 s, its maths (and the threshold) would be 10&times; off."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "eureka-server/src/main/resources/application.yml", label: "eureka-server application.yml", focus: ["enable-self-preservation", "renewal-percent-threshold", "eviction-interval", "expected-client-renewal"] },
      { file: "eureka-server/src/main/java/com/lab/eureka/EurekaServerApplication.java", label: "@EnableEurekaServer", focus: ["@EnableEurekaServer"] },
      { file: "eureka-server/src/main/java/com/lab/eureka/RegistryStatsController.java", label: "RegistryStatsController", focus: ["getNumOfRenewsInLastMin", "isLeaseExpirationEnabled"] },
      { file: "product-service/src/main/resources/application.yml", label: "client side (eureka:)", focus: ["lease-renewal", "lease-expiration", "registry-fetch", "healthcheck", "hostname"] },
    ])));
  },
});
