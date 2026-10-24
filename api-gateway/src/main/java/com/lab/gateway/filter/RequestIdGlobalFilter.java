package com.lab.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * GLOBAL FILTER #1 - correlation id.
 *
 * <p>A {@link GlobalFilter} applies to EVERY route without being mentioned in any route definition.
 * Here: make sure every request carries an {@code X-Request-Id}, forward it to the service, echo it to the
 * client and expose the filter trace. Search this id in Kibana to follow the request through all services.
 */
@Component
public class RequestIdGlobalFilter implements GlobalFilter, Ordered {

    public static final String HEADER = "X-Request-Id";
    public static final String ATTR = "lab.requestId";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String requestId = exchange.getRequest().getHeaders().getFirst(HEADER);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }
        exchange.getAttributes().put(ATTR, requestId);
        FilterTrace.add(exchange, "RequestId[global]");

        ServerHttpRequest request = exchange.getRequest().mutate().header(HEADER, requestId).build();
        // Response headers must be written BEFORE the response is committed => register a callback.
        // Doing it here (not earlier) matters: the service ALSO returns X-Request-Id, and set() replaces its copy
        // instead of sending the header twice ("abc, abc").
        final String id = requestId;
        exchange.getResponse().beforeCommit(() -> {
            exchange.getResponse().getHeaders().set(HEADER, id);
            exchange.getResponse().getHeaders().set("X-Filter-Trace", FilterTrace.render(exchange));
            return Mono.empty();
        });

        return chain.filter(exchange.mutate().request(request).build());
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
