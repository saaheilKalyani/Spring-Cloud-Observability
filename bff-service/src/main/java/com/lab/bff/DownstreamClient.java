package com.lab.bff;

import org.slf4j.MDC;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Calls internal services through the client-side load balancer ("http://product-service/...").
 * The BFF talks to services DIRECTLY - it is inside the trust boundary, behind the API gateway.
 */
@Component
public class DownstreamClient {

    /** Who is calling, so we can forward identity + correlation id (MDC is thread-local; we run in worker threads). */
    public record CallContext(String userId, String requestId, AtomicInteger callCounter) {
    }

    private final RestClient client;

    DownstreamClient(@LoadBalanced RestClient.Builder builder) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.client = builder.requestFactory(factory).build();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getJson(String url, CallContext ctx) {
        ctx.callCounter().incrementAndGet();
        MDC.put("requestId", ctx.requestId());
        try {
            return client.get().uri(url)
                    .header("X-Request-Id", ctx.requestId())
                    .header("X-User-Id", ctx.userId())
                    .retrieve()
                    .body(Map.class);
        } finally {
            MDC.remove("requestId");
        }
    }
}
