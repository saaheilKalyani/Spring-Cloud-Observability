package com.lab.product;

import com.lab.product.ProductCatalog.Product;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import static net.logstash.logback.argument.StructuredArguments.kv;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private static final Logger log = LoggerFactory.getLogger(ProductController.class);

    private final ProductCatalog catalog;
    private final MeterRegistry registry;
    private final Timer lookupTimer;
    private final String instanceId;
    private final int port;

    public ProductController(ProductCatalog catalog, MeterRegistry registry,
                             @Value("${lab.instance-id}") String instanceId,
                             @Value("${server.port}") int port) {
        this.catalog = catalog;
        this.registry = registry;
        this.instanceId = instanceId;
        this.port = port;
        // A TIMER records count + total time (+ histogram buckets) -> latency percentiles in Grafana
        this.lookupTimer = Timer.builder("lab.product.lookup")
                .description("Time spent loading a product from the catalogue")
                .publishPercentileHistogram()
                .register(registry);
    }

    @GetMapping
    public Map<String, Object> list() {
        log.info("Listing {} products {}", catalog.findAll().size(), kv("servedBy", instanceId));
        return Map.of("servedBy", instanceId, "count", catalog.findAll().size(), "items", catalog.findAll());
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable int id) {
        Product product = lookupTimer.record(() -> catalog.findById(id).orElse(null));
        if (product == null) {
            log.warn("Product {} not found {}", id, kv("productId", id));
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product " + id + " not found");
        }
        // A COUNTER only goes up. Tags (productId, category) become Prometheus labels.
        Counter.builder("lab.products.viewed")
                .description("How many times a product detail was requested")
                .tag("productId", String.valueOf(id))
                .tag("category", product.category())
                .register(registry)
                .increment();
        log.info("Product {} requested {} {}", product.name(), kv("productId", id), kv("servedBy", instanceId));
        return Map.of("servedBy", instanceId, "product", product);
    }

    @GetMapping("/{id}/reviews")
    public Map<String, Object> reviews(@PathVariable int id) {
        return Map.of("servedBy", instanceId, "productId", id, "reviews", catalog.reviewsFor(id));
    }

    @GetMapping("/recommendations")
    public Map<String, Object> recommendations() {
        List<Product> shuffled = new ArrayList<>(catalog.findAll());
        Collections.shuffle(shuffled);
        return Map.of("servedBy", instanceId, "items", shuffled.subList(0, 3));
    }

    /** Who answered? The core of every load-balancing demo. */
    @GetMapping("/whoami")
    public Map<String, Object> whoami() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("service", "product-service");
        m.put("instanceId", instanceId);
        m.put("hostname", hostname());
        m.put("port", port);
        m.put("pid", ProcessHandle.current().pid());
        m.put("uptimeSeconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        return m;
    }

    /**
     * Shows the headers THIS service received. Call it through the gateway to see what the gateway injected
     * (X-User-Id ...) and what it stripped (a forged X-User-Id from the client, the raw Authorization token).
     */
    @GetMapping("/echo")
    public Map<String, Object> echo(jakarta.servlet.http.HttpServletRequest request) {
        Map<String, Object> seen = new LinkedHashMap<>();
        for (String name : List.of("X-Request-Id", "X-User-Id", "X-User-Roles", "X-User-Tier", "X-Auth-Source",
                "X-Gateway-Route", "X-Forwarded-For", "X-Client-Id", "X-Plan", "Authorization")) {
            String value = request.getHeader(name);
            seen.put(name, value == null ? "(absent)" : value);
        }
        return Map.of("servedBy", instanceId, "headersSeenByProductService", seen);
    }

    // ---------------------------------------------------------------- chaos endpoints for the labs

    /** Simulates a slow dependency -> shows up in latency panels and gateway timeouts. */
    @GetMapping("/slow")
    public Map<String, Object> slow(@RequestParam(defaultValue = "1500") long ms) throws InterruptedException {
        long bounded = Math.min(ms, 10_000);
        log.warn("Slow endpoint called, sleeping {} ms {}", bounded, kv("sleepMs", bounded));
        Thread.sleep(bounded);
        return Map.of("servedBy", instanceId, "sleptMs", bounded);
    }

    /** Throws on purpose -> ERROR log with stack trace in Kibana + 5xx in Grafana. */
    @GetMapping("/error")
    public Map<String, Object> error() {
        throw new IllegalStateException("Simulated inventory database failure on " + instanceId);
    }

    /** Emits every log level so students can filter by level in Kibana. */
    @GetMapping("/log-demo")
    public Map<String, Object> logDemo() {
        log.debug("DEBUG - very detailed diagnostic output {}", kv("demo", true));
        log.info("INFO  - normal business event: order lookup succeeded {}", kv("demo", true));
        log.warn("WARN  - something odd: inventory below safety stock {}", kv("demo", true));
        log.error("ERROR - payment provider timeout after 3 retries {}", kv("demo", true),
                new RuntimeException("Simulated downstream timeout"));
        int dice = ThreadLocalRandom.current().nextInt(1, 7);
        return Map.of("servedBy", instanceId, "emitted", List.of("DEBUG", "INFO", "WARN", "ERROR"), "dice", dice);
    }

    private static String hostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }
}
