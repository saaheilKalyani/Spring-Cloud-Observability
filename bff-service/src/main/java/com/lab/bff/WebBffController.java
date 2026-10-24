package com.lab.bff;

import com.lab.bff.DownstreamClient.CallContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static net.logstash.logback.argument.StructuredArguments.kv;

/**
 * BFF for the BROWSER app: big screen, fast network -> rich payload.
 * One request from the browser => this class fans out to 5+ internal calls IN PARALLEL and merges the result.
 */
@RestController
@Profile("web")
@RequestMapping("/bff/web")
public class WebBffController {

    private static final Logger log = LoggerFactory.getLogger(WebBffController.class);
    private final ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();

    private final DownstreamClient downstream;
    private final String instanceId;

    public WebBffController(DownstreamClient downstream, @Value("${lab.instance-id}") String instanceId) {
        this.downstream = downstream;
        this.instanceId = instanceId;
    }

    @GetMapping("/home")
    @SuppressWarnings("unchecked")
    public Map<String, Object> home(@RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId) {
        long start = System.currentTimeMillis();
        CallContext ctx = new CallContext(userId, String.valueOf(MDC.get("requestId")), new AtomicInteger());
        log.info("Web BFF building home page {}", kv("userId", userId));

        // 1) three independent calls start together
        CompletableFuture<Map<String, Object>> products =
                CompletableFuture.supplyAsync(() -> downstream.getJson("http://product-service/api/products", ctx), pool);
        CompletableFuture<Map<String, Object>> recs =
                CompletableFuture.supplyAsync(() -> downstream.getJson("http://product-service/api/products/recommendations", ctx), pool);
        CompletableFuture<Map<String, Object>> orders =
                CompletableFuture.supplyAsync(() -> downstream.getJson("http://order-service/api/orders", ctx), pool);

        List<Map<String, Object>> allProducts = (List<Map<String, Object>>) products.join().get("items");
        List<Map<String, Object>> featured = allProducts.stream().limit(3).toList();

        // 2) the web UI shows reviews next to the featured products -> one call per product (parallel)
        List<CompletableFuture<Map<String, Object>>> reviewCalls = featured.stream()
                .map(p -> CompletableFuture.supplyAsync(
                        () -> downstream.getJson("http://product-service/api/products/" + p.get("id") + "/reviews", ctx), pool))
                .toList();

        List<Map<String, Object>> featuredWithReviews = new ArrayList<>();
        for (int i = 0; i < featured.size(); i++) {
            Map<String, Object> merged = new LinkedHashMap<>(featured.get(i));
            List<Map<String, Object>> reviews = (List<Map<String, Object>>) reviewCalls.get(i).join().get("reviews");
            merged.put("reviews", reviews);
            merged.put("averageStars", reviews.stream().mapToInt(r -> ((Number) r.get("stars")).intValue()).average().orElse(0));
            featuredWithReviews.add(merged);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("client", "web-bff");
        body.put("servedBy", instanceId);
        body.put("greeting", "Welcome back, " + userId + "!");
        body.put("catalogSize", allProducts.size());
        body.put("featured", featuredWithReviews);
        body.put("recentOrders", orders.join().get("items"));
        body.put("recommendations", recs.join().get("items"));
        body.put("meta", Map.of("downstreamCalls", ctx.callCounter().get(), "durationMs", System.currentTimeMillis() - start,
                "note", "Rich payload: full product details, reviews, order history, recommendations"));
        return body;
    }
}
