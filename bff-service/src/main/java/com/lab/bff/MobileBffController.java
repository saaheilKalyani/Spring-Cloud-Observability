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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static net.logstash.logback.argument.StructuredArguments.kv;

/**
 * BFF for the MOBILE app: small screen, flaky network, battery -> MINIMAL payload, few calls, short field names.
 * Same back-end services as the web BFF, completely different shape of response.
 */
@RestController
@Profile("mobile")
@RequestMapping("/bff/mobile")
public class MobileBffController {

    private static final Logger log = LoggerFactory.getLogger(MobileBffController.class);

    private final DownstreamClient downstream;
    private final String instanceId;

    public MobileBffController(DownstreamClient downstream, @Value("${lab.instance-id}") String instanceId) {
        this.downstream = downstream;
        this.instanceId = instanceId;
    }

    @GetMapping("/home")
    @SuppressWarnings("unchecked")
    public Map<String, Object> home(@RequestHeader(value = "X-User-Id", defaultValue = "anonymous") String userId) {
        long start = System.currentTimeMillis();
        CallContext ctx = new CallContext(userId, String.valueOf(MDC.get("requestId")), new AtomicInteger());
        log.info("Mobile BFF building home screen {}", kv("userId", userId));

        List<Map<String, Object>> products = (List<Map<String, Object>>)
                downstream.getJson("http://product-service/api/products", ctx).get("items");
        int orderCount = ((Number) downstream.getJson("http://order-service/api/orders", ctx).get("count")).intValue();

        // Only what the phone screen actually renders: id, short name, price
        List<Map<String, Object>> slim = products.stream().limit(4)
                .map(p -> Map.<String, Object>of("id", p.get("id"), "n", p.get("name"), "p", p.get("price")))
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("client", "mobile-bff");
        body.put("servedBy", instanceId);
        body.put("hi", userId);
        body.put("items", slim);
        body.put("orders", orderCount);
        body.put("meta", Map.of("downstreamCalls", ctx.callCounter().get(), "durationMs", System.currentTimeMillis() - start,
                "note", "Slim payload: 4 items, 3 fields each, only an order COUNT"));
        return body;
    }
}
