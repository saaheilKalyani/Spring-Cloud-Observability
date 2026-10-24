package com.lab.gateway.config;

import com.lab.gateway.filter.AuthHeaderInjectionGlobalFilter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class GatewayBeans {

    /**
     * RATE LIMITING - "who is being limited?"
     *
     * <p>The Redis token bucket needs a KEY per caller. The gateway itself prefixes the route id
     * ({@code request_rate_limiter.{<route-id>.<key>}.tokens}), so every route has its own bucket per caller.
     * We only decide WHO the caller is:
     * <ol>
     *   <li>the user authenticated by the gateway (trusted),</li>
     *   <li>else the {@code X-Client-Id} header (lab convenience - spoofable, never do this in production),</li>
     *   <li>else the remote IP address.</li>
     * </ol>
     * Referenced from YAML as {@code key-resolver: "#{@userKeyResolver}"}.
     */
    @Bean
    KeyResolver userKeyResolver() {
        return exchange -> {
            AuthProperties.User user = exchange.getAttribute(AuthHeaderInjectionGlobalFilter.USER_ATTR);
            if (user != null) {
                return Mono.just("user:" + user.getId());
            }
            String client = exchange.getRequest().getHeaders().getFirst("X-Client-Id");
            if (client != null && !client.isBlank()) {
                return Mono.just("client:" + client);
            }
            InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
            return Mono.just("ip:" + (remote == null ? "unknown" : remote.getAddress().getHostAddress()));
        };
    }
}
