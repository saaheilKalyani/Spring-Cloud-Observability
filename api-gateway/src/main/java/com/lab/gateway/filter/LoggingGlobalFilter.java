package com.lab.gateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;

import static net.logstash.logback.argument.StructuredArguments.kv;
import static org.springframework.cloud.gateway.support.ServerWebExchangeUtils.GATEWAY_REQUEST_URL_ATTR;
import static org.springframework.cloud.gateway.support.ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR;

/**
 * GLOBAL FILTER #2 - access logging (pre + post).
 *
 * <p>Code BEFORE {@code chain.filter(...)} is the "pre" phase (request on its way to the service).
 * Code in {@code doFinally} is the "post" phase (response on its way back). {@code kv(...)} makes each value a
 * separate JSON field in Elasticsearch, so Kibana can filter by {@code route}, {@code status}, {@code durationMs} ...
 */
@Component
public class LoggingGlobalFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingGlobalFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        FilterTrace.add(exchange, "Logging[global]");
        long start = System.nanoTime();
        String requestId = exchange.getAttribute(RequestIdGlobalFilter.ATTR);
        String method = exchange.getRequest().getMethod().name();
        String path = exchange.getRequest().getURI().getRawPath();

        log.info("--> {} {} {} {}", method, path, kv("requestId", requestId), kv("phase", "request"));

        // Which route matched + which concrete instance the load balancer chose, as response headers
        exchange.getResponse().beforeCommit(() -> {
            Route route = exchange.getAttribute(GATEWAY_ROUTE_ATTR);
            URI target = exchange.getAttribute(GATEWAY_REQUEST_URL_ATTR);
            if (route != null) {
                exchange.getResponse().getHeaders().set("X-Matched-Route", route.getId());
            }
            if (target != null) {
                exchange.getResponse().getHeaders().set("X-Upstream", target.getHost() + ":" + target.getPort());
            }
            return Mono.empty();
        });

        return chain.filter(exchange).doFinally(signal -> {
            Route route = exchange.getAttribute(GATEWAY_ROUTE_ATTR);
            URI target = exchange.getAttribute(GATEWAY_REQUEST_URL_ATTR);
            HttpStatusCode status = exchange.getResponse().getStatusCode();
            long ms = (System.nanoTime() - start) / 1_000_000;
            int code = status == null ? 0 : status.value();
            String upstream = target == null ? "-" : target.getHost() + ":" + target.getPort();
            String routeId = route == null ? "-" : route.getId();
            if (code >= 500) {
                log.error("<-- {} {} {} in {} ms via {} {} {} {} {}", code, method, path, ms, routeId,
                        kv("requestId", requestId), kv("status", code), kv("durationMs", ms), kv("route", routeId));
            } else if (code >= 400) {
                log.warn("<-- {} {} {} in {} ms via {} {} {} {} {}", code, method, path, ms, routeId,
                        kv("requestId", requestId), kv("status", code), kv("durationMs", ms), kv("route", routeId));
            } else {
                log.info("<-- {} {} {} in {} ms via {} -> {} {} {} {} {}", code, method, path, ms, routeId, upstream,
                        kv("requestId", requestId), kv("status", code), kv("durationMs", ms), kv("route", routeId));
            }
        });
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 20;
    }
}
