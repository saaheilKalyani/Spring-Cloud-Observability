package com.lab.order;

import com.lab.common.lb.LbStrategy;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import static net.logstash.logback.argument.StructuredArguments.kv;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    public record Order(long id, String userId, int productId, String productName, int quantity,
                        double total, String status, String createdAt, String priceFetchedFrom) {
    }

    public record CreateOrder(int productId, int quantity) {
    }

    private final Map<Long, Order> orders = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(1000);
    private final RestClient productClient;
    private final MeterRegistry registry;
    private final String instanceId;

    public OrderController(RestClient productClient, MeterRegistry registry,
                           @Value("${lab.instance-id}") String instanceId) {
        this.productClient = productClient;
        this.registry = registry;
        this.instanceId = instanceId;
        seed("alice", 1, "Mechanical Keyboard", 1, 89.99);
        seed("alice", 5, "Noise-Cancelling Headset", 1, 199.99);
        seed("alice", 7, "Laptop Stand", 2, 79.80);
        seed("bob", 2, "4K Monitor 27\"", 2, 658.00);
        seed("bob", 8, "Portable SSD 1TB", 1, 94.00);
    }

    private void seed(String user, int productId, String name, int qty, double total) {
        long id = sequence.incrementAndGet();
        orders.put(id, new Order(id, user, productId, name, qty, total, "DELIVERED", Instant.now().toString(), "seed-data"));
    }

    /** Orders of the caller. The gateway injects X-User-Id after validating the token (see AuthHeaderInjectionGlobalFilter). */
    @GetMapping
    public Map<String, Object> list(@RequestHeader(value = "X-User-Id", required = false) String userId) {
        List<Order> result = orders.values().stream()
                .filter(o -> userId == null || "anonymous".equals(userId) || o.userId().equals(userId))
                .sorted((a, b) -> Long.compare(b.id(), a.id()))
                .toList();
        log.info("Listing orders {} {}", kv("userId", userId), kv("count", result.size()));
        return Map.of("servedBy", instanceId, "userId", String.valueOf(userId), "count", result.size(), "items", result);
    }

    @GetMapping("/{id}")
    public Order get(@PathVariable long id) {
        Order order = orders.get(id);
        if (order == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order " + id + " not found");
        }
        return order;
    }

    /** Creates an order. Calls product-service through the load balancer to read the price. */
    @PostMapping
    @SuppressWarnings("unchecked")
    public Map<String, Object> create(@RequestBody CreateOrder request,
                                      @RequestHeader(value = "X-User-Id", required = false) String userId) {
        String user = userId == null ? "anonymous" : userId;
        log.info("Creating order {} {} {}", kv("userId", user), kv("productId", request.productId()), kv("quantity", request.quantity()));

        // ---- CLIENT-SIDE DISCOVERY happens right here: "/api/products/{id}" on logical host "product-service"
        Map<String, Object> response = productClient.get()
                .uri("/api/products/{id}", request.productId())
                .retrieve()
                .body(Map.class);

        Map<String, Object> product = (Map<String, Object>) response.get("product");
        String servedBy = String.valueOf(response.get("servedBy"));
        double price = ((Number) product.get("price")).doubleValue();

        long id = sequence.incrementAndGet();
        Order order = new Order(id, user, request.productId(), String.valueOf(product.get("name")), request.quantity(),
                Math.round(price * request.quantity() * 100) / 100.0, "CREATED", Instant.now().toString(), servedBy);
        orders.put(id, order);

        Counter.builder("lab.orders.created").description("Orders created").tag("user", user).register(registry).increment();
        log.info("Order {} created, price taken from {} {}", id, servedBy, kv("orderId", id));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("servedBy", instanceId);
        body.put("order", order);
        body.put("productServiceInstance", servedBy);
        body.put("lbStrategy", LbStrategy.current().id());
        return body;
    }

    /**
     * Calls product-service {@code n} times and reports WHICH instance answered each time.
     * Round-robin => 1,2,3,1,2,3 ... random => any order. This is the live proof of client-side load balancing.
     */
    @GetMapping("/client-side-demo")
    @SuppressWarnings("unchecked")
    public Map<String, Object> clientSideDemo(@RequestParam(defaultValue = "6") int n) {
        int calls = Math.max(1, Math.min(n, 50));
        List<String> sequenceOfInstances = new ArrayList<>();
        Map<String, Integer> distribution = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        long start = System.currentTimeMillis();
        for (int i = 0; i < calls; i++) {
            try {
                Map<String, Object> who = productClient.get().uri("/api/products/whoami").retrieve().body(Map.class);
                String instance = String.valueOf(who.get("instanceId"));
                sequenceOfInstances.add(instance);
                distribution.merge(instance, 1, Integer::sum);
            } catch (Exception e) {
                sequenceOfInstances.add("ERROR");
                errors.add(e.getClass().getSimpleName() + ": " + e.getMessage());
                log.error("Client-side call {} of {} failed {}", i + 1, calls, kv("attempt", i + 1), e);
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pattern", "CLIENT-SIDE discovery: order-service picks the instance itself");
        body.put("caller", instanceId);
        body.put("strategy", LbStrategy.current().id());
        body.put("calls", calls);
        body.put("sequence", sequenceOfInstances);
        body.put("distribution", distribution);
        body.put("errors", errors);
        body.put("totalMs", System.currentTimeMillis() - start);
        return body;
    }
}
