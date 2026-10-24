/* Lesson 10 - Rate limiting with the Redis-backed RequestRateLimiter filter */
Lab.lessons.push({
  id: "ratelimit", chapter: "gateway", title: "Rate limiting with Redis", minutes: 20,
  goal: "A token bucket in Redis decides who may call and how fast. Students empty a bucket, watch it refill, look at the keys in Redis, and then take Redis away.",
  nodes: ["browser", "api-gateway", "redis", "product-service-1", "product-service-2", "product-service-3"],
  render(root) {
    const { h } = Lab;

    root.append(Lab.sec("Idea",
      Lab.prose(`<p>Without limits one noisy client (a bug, a scraper, an attack) can starve everyone else. The gateway is the natural place to say <i>"at most N requests per second per caller"</i>
        because every request already passes through it.</p>
        <h3>The token bucket</h3>
        <ul>
          <li>Each caller has a <b>bucket</b> that holds at most <code>burstCapacity</code> tokens.</li>
          <li>Tokens are added at <code>replenishRate</code> per second (the steady allowed rate).</li>
          <li>Each request <b>spends</b> <code>requestedTokens</code> (default 1). If the bucket has enough, the request goes through; if not, the gateway answers <b>429 Too Many Requests</b> without bothering the service.</li>
        </ul>
        <p>So a quiet caller can <b>burst</b> up to 5 requests at once, but over time only gets 2 per second.</p>`),
      Lab.table(["Plan", "Selected by", "replenishRate", "burstCapacity", "Route"], [
        ["standard", "default", "2 / s", "5", "<code>y-limited-standard</code>"],
        ["premium", "header <code>X-Plan: premium</code>", "10 / s", "20", "<code>y-limited-premium</code> (lower order, checked first)"],
      ], "cmp"),
      Lab.prose(`<p style="margin-top:8px"><b>Why Redis?</b> With several gateway instances the counters must be shared, and the check-and-spend must be atomic. The filter runs a small Lua script inside Redis that does both in one step.</p>`)));

    // ----------------------------------------------------------------------------- bucket simulator
    const plans = { standard: { rate: 2, burst: 5 }, premium: { rate: 10, burst: 20 } };
    let plan = "standard", tokens = plans.standard.burst, stamp = performance.now(), allowed = 0, rejected = 0, failOpen = 0;
    const strip = Lab.strip(150), water = h("div", { class: "water" }), num = h("div", { class: "num" }, "5"), info = h("div", { class: "hint" });
    const bucket = h("div", { class: "bucket", role: "img", "aria-label": "Token bucket fill level" }, water, num);
    const counters = h("div", { class: "stat" }, "0", h("small", {}, "allowed"), "  ", h("span", { style: { color: "var(--warn)" } }, "0"), h("small", {}, "rejected (429)"));
    const who = h("select", { "aria-label": "Bucket owner" }, [["", "this browser tab (no login)"], ["alice", "alice"], ["bob", "bob"], ["carol", "carol"]].map(([v, l]) => h("option", { value: v }, l)));
    const planSeg = Lab.seg([["standard", "Standard plan"], ["premium", "Premium plan"]], plan, (p) => { plan = p; planSeg.set(p); tokens = plans[p].burst; stamp = performance.now(); });

    const paintBucket = () => {
      const p = plans[plan], est = Math.min(p.burst, tokens + (p.rate * (performance.now() - stamp)) / 1000);
      water.style.height = (est / p.burst) * 100 + "%"; num.textContent = Math.floor(est);
      water.style.background = est < 1 ? "var(--down)" : "var(--gateway)";
    };
    Lab.every(paintBucket, 100);

    async function hit() {
      const headers = {}; if (plan === "premium") headers["X-Plan"] = "premium";
      const res = await Lab.gw("GET", "/limited/products/whoami", { as: who.value || "anonymous", headers, quiet: false, auth: who.value ? undefined : false });
      const rem = res.headers["x-ratelimit-remaining"];
      if (rem === "-1") {                      // RedisRateLimiter's signal for "I could not reach Redis, letting the request through"
        failOpen++; strip.push("dim", `HTTP ${res.status} but the limiter FAILED OPEN (X-RateLimit-Remaining: -1), ${res.ms} ms`);
      } else {
        if (rem !== undefined) { tokens = +rem; stamp = performance.now(); }
        if (res.status === 429) { rejected++; strip.push("limited", `429 at ${Lab.clock()} (remaining ${rem})`); }
        else if (res.ok) { allowed++; strip.push("", `200 at ${Lab.clock()}, tokens left ${rem === undefined ? "?" : rem}`, Lab.answeredBy(res)); }
        else strip.push("err", `HTTP ${res.status || res.error}`);
      }
      counters.childNodes[0].textContent = allowed; counters.childNodes[3].textContent = rejected;
      info.textContent = failOpen ? `${failOpen} request(s) passed because the limiter could not reach Redis: it failed OPEN (see experiment 3).` : "";
      return res;
    }
    const reset = () => { strip.clear(); allowed = rejected = failOpen = 0; counters.childNodes[0].textContent = "0"; counters.childNodes[3].textContent = "0"; info.textContent = ""; };

    root.append(Lab.sec("Try it",
      Lab.bench("1. Empty the bucket, then watch it refill", "The bucket on the left is an estimate drawn from the X-RateLimit-Remaining header of each answer plus the refill rate. Green cells = allowed, amber = rejected with 429.",
        Lab.steps([
          "Pick the <b>Standard plan</b>. Press <b>Burst of 10</b>: the first 5 pass, the rest are rejected - the bucket was 5 tokens deep.",
          "Wait two seconds, press <b>Send 1</b> a few times: about 2 tokens per second have returned, so you get a couple of green cells, then amber.",
          "Press <b>Steady 4 per second for 10 s</b>: after the initial burst is gone you see a pattern of roughly every other request rejected - you asked for 4/s, the plan allows 2/s.",
          "Switch to <b>Premium</b> and repeat. Same code path, different numbers because a different route (and different parameters) matched.",
        ]),
        h("div", { class: "row", style: { alignItems: "flex-start", gap: "18px" } }, bucket,
          h("div", { class: "grow", style: { display: "grid", gap: "10px" } },
            h("div", { class: "row" }, planSeg, h("label", { class: "inline" }, "bucket owner ", who)),
            h("div", { class: "row" },
              h("button", { class: "btn accent", onclick: () => hit() }, "Send 1"),
              h("button", { class: "btn", onclick: (e) => Lab.run(e.target, () => Lab.burst(10, hit, { concurrency: 10 })) }, "Burst of 10"),
              h("button", { class: "btn", onclick: (e) => Lab.run(e.target, async () => { for (let i = 0; i < 40; i++) { hit(); await Lab.sleep(250); } }) }, "Steady 4 per second for 10 s"),
              h("button", { class: "btn ghost", onclick: reset }, "Clear")),
            counters, strip, Lab.legend([["allowed", "var(--p1)"], ["429 rejected", "var(--warn)"], ["limiter failed open", "var(--line-strong)"], ["error", "var(--down)"]]), info)))));

    // ----------------------------------------------------------------------------- redis peek
    const rBody = h("tbody"), rNote = h("div", { class: "hint" });
    async function peek() {
      const r = await Lab.get("/gw/lab/redis/keys", { quiet: true, timeout: 4000 });
      rBody.textContent = "";
      if (!r.ok || !r.json) { rNote.textContent = "Gateway not reachable."; return; }
      rNote.textContent = r.json.error ? "Redis error: " + r.json.error : `${r.json.count} key(s). Keys expire by themselves a few seconds after the bucket is full again.`;
      r.json.keys.forEach((k) => rBody.append(h("tr", {}, h("td", { class: "mono" }, k.key.replace("request_rate_limiter.", "rrl.")), h("td", { class: "mono" }, k.value), h("td", {}, k.ttlSeconds + " s"))));
      if (!r.json.keys.length) rBody.append(h("tr", {}, h("td", { colspan: 3, class: "hint" }, "empty - send a request first")));
    }
    Lab.every(peek, 1500);
    root.append(Lab.sec(null,
      Lab.bench("2. Look inside Redis", "Each bucket is two keys: the number of tokens and the time of the last update. The Lua script recomputes the tokens from those two values at every request - there is no timer refilling anything.",
        h("div", { class: "tblwrap" }, h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, ["key", "value", "expires in"].map((c) => h("th", {}, c)))), rBody)), rNote,
        Lab.steps(["Send requests as <b>this browser tab</b>, then as <b>alice</b>, then as <b>bob</b>: each owner gets its own pair of keys - separate buckets. The bucket owner is chosen by the <code>userKeyResolver</code> bean.", "Notice the route id inside the key: the same person has a separate bucket per route."]),
        h("div", { class: "hint" }, "From a terminal:  docker exec -it redis redis-cli --scan --pattern 'request_rate_limiter*'"))));

    // ----------------------------------------------------------------------------- redis down
    root.append(Lab.sec(null,
      Lab.bench("3. Take Redis away", "What should a rate limiter do when its own storage is unavailable? Block everyone, or let everyone through?",
        Lab.steps([
          "Press <b>Stop (graceful)</b> on redis (the map node turns red).",
          "Back in experiment 1 press <b>Burst of 10</b> again. Nothing is rejected (grey cells) - but every answer reports <code>X-RateLimit-Remaining: -1</code> and takes about a second longer (the Redis command timeout). The limiter failed <b>open</b>.",
          "Look at the gateway logs (lesson 1, filter service <i>api-gateway</i>, level ERROR/WARN): the limiter logged the Redis failure.",
          "Press <b>Start</b> on redis. Limiting resumes, with a full bucket - the old state was lost (we run Redis without persistence).",
        ]),
        h("div", { class: "row" }, h("b", {}, "redis"), Lab.controlButtons("redis", ["stop", "kill"])),
        Lab.callout("", "Discuss", "Fail-open keeps the site up but removes your protection exactly when the system is struggling; fail-closed protects the backends but turns a Redis hiccup into a full outage. Spring's RedisRateLimiter fails open. If you need the opposite, implement your own <code>RateLimiter</code> bean."))));

    root.append(Lab.sec("Check yourself", Lab.qa([
      ["A client sends 100 requests in one instant against burst 5 / rate 2. How many pass and why?", "About 5 (the full bucket) - plus perhaps one more if a token refills during the burst. The rest get 429."],
      ["Why use the user id and not the IP address as the key?", "Many users share one IP (offices, mobile carriers), and one user may change IP. A trusted identity from the gateway's auth filter is fairer. The IP is only the last-resort fallback in <code>userKeyResolver</code>."],
      ["Why is the <code>X-Plan</code> header not safe for deciding limits in production?", "Predicates run before any filter and see client-supplied data. Anyone could send <code>X-Plan: premium</code>. Take the plan from a verified token claim (set by the auth filter) instead."],
      ["Does rate limiting replace a circuit breaker?", "No. Rate limiting protects you from callers being too fast; a circuit breaker protects callers from a downstream service being too slow or broken."],
    ])));

    root.append(Lab.sec("Source", Lab.codeView([
      { file: "api-gateway/src/main/resources/application.yml", label: "limiter routes", focus: ["y-limited", "RequestRateLimiter", "replenishRate", "burstCapacity", "key-resolver", "redis:"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/config/GatewayBeans.java", label: "KeyResolver", focus: ["KeyResolver", "user:", "client:", "ip:"] },
      { file: "api-gateway/src/main/java/com/lab/gateway/lab/GatewayLabController.java", label: "Redis peek endpoint", focus: ["request_rate_limiter"] },
      { file: "docker-compose.yml", label: "redis service", focus: ["redis:", "redis-server"] },
      { file: "api-gateway/pom.xml", label: "pom.xml", focus: ["redis-reactive"] },
    ])));
  },
});
