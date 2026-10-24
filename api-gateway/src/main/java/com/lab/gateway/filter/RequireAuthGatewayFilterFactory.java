package com.lab.gateway.filter;

import com.lab.gateway.config.AuthProperties;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * PER-ROUTE FILTER (custom {@code GatewayFilterFactory}).
 *
 * <p>Naming convention: class {@code RequireAuthGatewayFilterFactory} => usable in YAML as {@code RequireAuth}.
 * <pre>
 *   filters:
 *     - RequireAuth=USER        # 401 if not logged in, 403 if the user lacks the USER role
 * </pre>
 * Contrast with the GLOBAL filter: that one runs for all routes and only IDENTIFIES the caller;
 * this one is attached only to routes that need protection and ENFORCES the rule.
 */
@Component
public class RequireAuthGatewayFilterFactory extends AbstractGatewayFilterFactory<RequireAuthGatewayFilterFactory.Config> {

    public RequireAuthGatewayFilterFactory() {
        super(Config.class);
    }

    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("role");
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            FilterTrace.add(exchange, "RequireAuth(" + config.getRole() + ")[route]");
            AuthProperties.User user = exchange.getAttribute(AuthHeaderInjectionGlobalFilter.USER_ATTR);
            if (user == null) {
                return reject(exchange, HttpStatus.UNAUTHORIZED, "Missing or invalid bearer token");
            }
            if (config.getRole() != null && !config.getRole().isBlank() && !user.getRoles().contains(config.getRole())) {
                return reject(exchange, HttpStatus.FORBIDDEN,
                        "User '" + user.getId() + "' has roles " + user.getRoles() + " but this route needs " + config.getRole());
            }
            return chain.filter(exchange);
        };
    }

    private Mono<Void> reject(ServerWebExchange exchange, HttpStatus status, String reason) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        String json = "{\"error\":\"" + status.getReasonPhrase() + "\",\"message\":\"" + reason + "\",\"rejectedBy\":\"RequireAuth route filter\"}";
        DataBuffer buffer = response.bufferFactory().wrap(json.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    public static class Config {
        private String role;

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }
    }
}
