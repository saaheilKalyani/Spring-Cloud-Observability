package com.lab.gateway.filter;

import com.lab.gateway.config.AuthProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import static net.logstash.logback.argument.StructuredArguments.kv;

/**
 * GLOBAL FILTER #3 - authentication header injection.
 *
 * <ol>
 *   <li>STRIP any identity headers the client sent (otherwise anyone could write {@code X-User-Id: admin});</li>
 *   <li>validate the {@code Authorization: Bearer <token>} header;</li>
 *   <li>INJECT trusted {@code X-User-Id / X-User-Roles / X-User-Tier} headers for the services behind us;</li>
 *   <li>remember the user on the exchange so per-route filters ({@link RequireAuthGatewayFilterFactory}) and the
 *       rate-limiter key resolver can use it.</li>
 * </ol>
 * It does NOT reject anonymous calls - deciding which routes need a login is a PER-ROUTE concern.
 */
@Component
public class AuthHeaderInjectionGlobalFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(AuthHeaderInjectionGlobalFilter.class);
    public static final String USER_ATTR = "lab.authenticatedUser";

    private final AuthProperties auth;

    public AuthHeaderInjectionGlobalFilter(AuthProperties auth) {
        this.auth = auth;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        FilterTrace.add(exchange, "AuthHeaderInjection[global]");

        String authorization = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        AuthProperties.User user = null;
        String result = "anonymous";
        if (authorization != null && authorization.startsWith("Bearer ")) {
            user = auth.getUsers().get(authorization.substring(7).trim());
            result = user == null ? "invalid-token" : "authenticated:" + user.getId();
        }

        ServerHttpRequest.Builder builder = exchange.getRequest().mutate().headers(h -> {
            h.remove("X-User-Id");
            h.remove("X-User-Roles");
            h.remove("X-User-Tier");
            h.remove("X-Auth-Source");
            h.remove(HttpHeaders.AUTHORIZATION);          // the raw token never reaches the services
        });

        if (user != null) {
            exchange.getAttributes().put(USER_ATTR, user);
            builder.header("X-User-Id", user.getId())
                    .header("X-User-Roles", String.join(",", user.getRoles()))
                    .header("X-User-Tier", user.getTier())
                    .header("X-Auth-Source", "gateway");
        } else {
            builder.header("X-User-Id", "anonymous").header("X-Auth-Source", "gateway-anonymous");
        }

        final String authResult = result;
        exchange.getResponse().getHeaders().set("X-Auth-Result", authResult);
        log.debug("Auth header injection {} {}", kv("authResult", authResult),
                kv("requestId", exchange.getAttribute(RequestIdGlobalFilter.ATTR)));

        return chain.filter(exchange.mutate().request(builder.build()).build());
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 30;
    }
}
