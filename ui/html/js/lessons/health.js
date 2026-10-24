/* Lesson 7 - Health checks and automatic deregistration on failure */
Lab.lessons.push({
  id: "health", chapter: "find", title: "Health checks and deregistration", minutes: 20,
  goal: "Instances fail in four different ways. Each is noticed by a different mechanism and after a different delay. Students cause every failure and measure the damage.",
  nodes: ["eureka-server", "api-gateway", "order-service", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>A registry that lists dead instances is worse than no registry. Three layers keep it honest:</p>
        <ol>
          <li><b>Heartbeat lease</b> - the instance proves it is alive every few seconds; silence means eviction (lesson 5).</li>
          <li><b>Health propagation</b> - with <code>eureka.client.healthcheck.enabled=true</code> the instance also reports <i>/actuator/health</i> to Eureka.
              Without it Eureka only knows "the process answers heartbeats", not "the database is down".</li>
          <li><b>Caller-side checks</b> - timeouts, retries (lesson 11) and optionally LoadBalancer's own <code>health-check</code> supplier that calls each instance's health URL.</li>
        </ol>`),
      Lab.table(["Failure", "How we cause it", "Who notices", "Delay", "Instance process"], [
        ["<b>Unhealthy</b> (dependency down)", "Health DOWN button", "the app itself reports DOWN; Eureka marks the entry DOWN", "~3-10 s", "running"],
        ["<b>Graceful stop</b>", "Stop (SIGTERM)", "the app deregisters itself", "~2 s + client caches", "exits cleanly"],
        ["<b>Crash</b>", "Kill (SIGKILL)", "Eureka, after missed heartbeats", "~12-20 s + client caches", "gone"],
        ["<b>Hang / partition</b>", "Freeze", "Eureka, after missed heartbeats; callers wait for timeouts meanwhile", "~12-20 s + timeouts", "exists, answers nothing"],
      ], "cmp")));

    // ------------------------------------------------------------------------- controls
    const target = h("select", { "aria-label": "Instance to break" }, [1, 2, 3].map((n) => h("option", { value: n }, "product-service-" + n)));
    target.value = "2";
    const name = () => "product-service-" + target.value;
    const act = async (fn) => { await fn(); };
    const downBtn = h("button", { class: "btn warn", onclick: () => act(async () => { Lab.lastAction = { key: "product-" + target.value, name: name(), action: "Health DOWN", t: Date.now() }; await Lab.post(`/api/svc/${name()}/admin/health/down`); Lab.toast(name() + " now reports health DOWN", "good"); }) }, "Health DOWN");
    const upBtn = h("button", { class: "btn accent", onclick: async () => { await Lab.post(`/api/svc/${name()}/admin/health/up`); Lab.toast(name() + " health restored", "good"); } }, "Health UP");
    const ctl = h("span", { class: "row tight" });
    const drawCtl = () => { ctl.textContent = ""; ctl.append(Lab.controlButtons(name(), ["stop", "kill", "pause"])); };
    drawCtl(); target.addEventListener("change", drawCtl);

    // ------------------------------------------------------------------------- probes
    const pRetry = Lab.probe({ label: "Gateway with Retry filter", path: "/api/products/whoami", every: 600, quiet: false });
    const pNoRetry = Lab.probe({ label: "Gateway without Retry", path: "/noretry/products/whoami", every: 600 });
    const pClient = Lab.probe({ label: "order-service (client-side, no retry)", every: 900,
      request: async () => {
        const r = await Lab.get("/api/svc/order-service/api/orders/client-side-demo?n=1", { quiet: true, timeout: 8000 });
        const ok = r.ok && r.json && r.json.errors.length === 0;
        return { ok, status: ok ? 200 : r.status || 502, ms: r.ms, error: r.error, headers: {}, json: { instanceId: r.json && r.json.sequence ? r.json.sequence[0] : "" } };
      } });
    const startAll = h("button", { class: "btn accent", onclick: () => { [pRetry, pNoRetry, pClient].forEach((p) => p.start()); } }, "Start all three probes");
    const stopAll = h("button", { class: "btn ghost", onclick: () => { [pRetry, pNoRetry, pClient].forEach((p) => p.stop()); } }, "Stop all");

    const events = h("div", { class: "console", "data-empty": "Registry changes will be listed here with the measured delay.", style: { maxHeight: "170px" } });
    const paintEv = () => { events.textContent = ""; Lab.events.slice(0, 14).forEach((e) => events.append(h("span", { class: "l" }, h("span", { class: "t" }, Lab.clock(new Date(e.t)) + "  "), h("span", { class: e.type === "REGISTERED" ? "ok" : e.type === "GONE" ? "bad" : "warn" }, e.text)))); };
    paintEv(); Lab.cleanups.push(Lab.on("event", paintEv));

    root.append(Lab.sec("Try it",
      Lab.bench("1. Break an instance and watch who suffers", "Three probes send a request every ~0.6 s. Each cell is one request: coloured by the instance that answered, red if it failed, amber if it was very slow.",
        Lab.steps([
          "Press <b>Start all three probes</b>. All cells are coloured: three instances answer in turn.",
          "Choose an instance and press <b>Health DOWN</b>. The process keeps running, but within a few seconds <b>its colour disappears from all three probes</b> and the timeline shows Eureka flipping it to DOWN. Press <b>Health UP</b> to heal it; the colour returns.",
          "Press <b>Kill (crash)</b> on the same instance. Compare: the probe <i>with Retry</i> stays almost entirely green (the gateway silently tried another instance); the probe <i>without Retry</i> and the client-side one show <b>red cells</b> until Eureka evicts the dead entry and the caches refresh.",
          "Start it again and try <b>Freeze</b>. Now the failures are <b>slow</b> (amber, seconds long) before they turn red: a frozen process accepts connections and never answers. Timeouts decide how bad this is.",
        ]),
        h("div", { class: "row" }, h("label", { class: "inline" }, "Instance ", target), downBtn, upBtn, ctl),
        h("div", { class: "row" }, startAll, stopAll, h("button", { class: "btn sm accent", onclick: () => Lab.healAll() }, "Heal: start / unfreeze everything")),
        pRetry, pNoRetry, pClient, Lab.instLegend(),
        h("h4", {}, "Registry timeline"), events)));

    root.append(Lab.sec(null,
      Lab.bench("2. Who knows what, right now?", "During a failure the three copies of the phone book disagree for a short time. This is the 'window of inconsistency' every client-side discovery system has.",
        Lab.phoneBook())));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["Why did the probe 'with Retry' stay green when you killed an instance?", "The gateway's <code>Retry</code> filter re-sent the failed GET to another instance chosen by the load balancer. Retries hide failures from the caller - which is good for users and bad for noticing problems, so also watch <i>error and retry metrics</i> in lesson 3."],
      ["Why must the health indicator say DOWN BEFORE the process dies to be useful?", "A DOWN instance is removed from rotation but kept alive: it can finish in-flight work, warm up again, or be inspected. A dead process gives the system no chance to react gracefully."],
      ["A freeze is worse than a crash for callers. Why?", "A crash gives 'connection refused' instantly (fail fast). A frozen process accepts the connection and then says nothing, so every caller thread is blocked until its timeout. Always configure connect and read timeouts."],
      ["Why isn't <code>healthcheck.enabled=true</code> the default?", "Historically Eureka's UP simply meant 'the JVM is sending heartbeats'. Enabling health propagation makes Eureka depend on your health indicators, so a flaky indicator can remove healthy instances - an opt-in decision."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "product-service/src/main/resources/application.yml", label: "eureka health propagation", focus: ["healthcheck", "enabled: true", "instance-info-replication", "probes"] },
      { file: "lab-common/src/main/java/com/lab/common/admin/HealthToggle.java", label: "HealthToggle", focus: ["Health.down", "Health.up"] },
      { file: "api-gateway/src/main/resources/application.yml", label: "gateway timeouts + Retry", focus: ["connect-timeout", "response-timeout", "name: Retry", "y-noretry"] },
      { file: "order-service/src/main/java/com/lab/order/ProductClientConfig.java", label: "client timeouts", focus: ["setConnectTimeout", "setReadTimeout"] },
    ])));
  },
});
