package com.lab.gateway.config;

import com.lab.gateway.filter.RequireAuthGatewayFilterFactory;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import reactor.core.publisher.Mono;

import java.time.Instant;

/**
 * LESSON 8 - routes defined in JAVA ("Java DSL").
 *
 * <p>The same concepts as the YAML in {@code application.yml} (id, predicates, filters, uri) but type-safe,
 * refactor-friendly and able to contain real logic (lambdas, injected beans). Both styles are merged into one
 * route table - see {@code GET /actuator/gateway/routes}. Route ids starting with {@code dsl-} come from here.
 *
 * <p>Rule of thumb: YAML for simple, static routing that ops may edit; Java DSL when the route needs code.
 */
@Configuration
public class RouteConfig {

    @Bean
    RouteLocator dslRoutes(RouteLocatorBuilder builder, RequireAuthGatewayFilterFactory requireAuth) {
        return builder.routes()

                // ---- RESPONSE REWRITING: wrap the upstream JSON in an envelope --------------------------------
                .route("dsl-whoami-envelope", r -> r
                        .path("/dsl/whoami")
                        .and().method(HttpMethod.GET)
                        .filters(f -> f
                                .rewritePath("/dsl/whoami", "/api/products/whoami")
                                .addResponseHeader("X-Route-Source", "java-dsl")
                                .modifyResponseBody(String.class, String.class,
                                        (exchange, body) -> Mono.just(
                                                "{\"_gateway\":{\"rewritten\":true,\"by\":\"modifyResponseBody (Java DSL)\",\"at\":\""
                                                        + Instant.now() + "\"},\"original\":" + body + "}")))
                        .uri("lb://product-service"))

                // ---- RESPONSE REWRITING: mask sensitive fields for everybody who uses this URL ----------------
                .route("dsl-masked-products", r -> r
                        .path("/masked/products")
                        .and().method(HttpMethod.GET)
                        .filters(f -> f
                                .rewritePath("/masked/products", "/api/products")
                                .addResponseHeader("X-Route-Source", "java-dsl")
                                .modifyResponseBody(String.class, String.class,
                                        (exchange, body) -> Mono.just(body.replaceAll("\"price\":[0-9.]+", "\"price\":\"***masked***\""))))
                        .uri("lb://product-service"))

                // ---- BFF routing by HEADER predicate: same URL, different back-end per client type ------------
                .route("dsl-bff-by-header-mobile", r -> r
                        .path("/bff/home")
                        .and().header("X-Client-Type", "mobile")
                        .filters(f -> f
                                .rewritePath("/bff/home", "/bff/mobile/home")
                                .filter(requireAuth.apply(c -> c.setRole("USER")))
                                .addResponseHeader("X-Route-Source", "java-dsl"))
                        .uri("lb://mobile-bff"))
                .route("dsl-bff-by-header-web", r -> r
                        .path("/bff/home")
                        .and().header("X-Client-Type", "web")
                        .filters(f -> f
                                .rewritePath("/bff/home", "/bff/web/home")
                                .filter(requireAuth.apply(c -> c.setRole("USER")))
                                .addResponseHeader("X-Route-Source", "java-dsl"))
                        .uri("lb://web-bff"))

                // ---- BFF routing by PATH: explicit entry points ---------------------------------------------
                .route("dsl-bff-web", r -> r
                        .path("/bff/web/**")
                        .filters(f -> f.filter(requireAuth.apply(c -> c.setRole("USER")))
                                .addResponseHeader("X-Route-Source", "java-dsl"))
                        .uri("lb://web-bff"))
                .route("dsl-bff-mobile", r -> r
                        .path("/bff/mobile/**")
                        .filters(f -> f.filter(requireAuth.apply(c -> c.setRole("USER")))
                                .addResponseHeader("X-Route-Source", "java-dsl"))
                        .uri("lb://mobile-bff"))
                .build();
    }
}
