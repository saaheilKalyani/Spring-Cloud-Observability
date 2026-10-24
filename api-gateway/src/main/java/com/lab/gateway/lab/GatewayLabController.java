package com.lab.gateway.lab;

import com.lab.gateway.config.AuthProperties;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Teaching endpoints served by the gateway itself (a controller mapping wins over route mappings).
 * They are NOT part of a real gateway - they exist so the lab UI can show what happens inside.
 */
@RestController
@RequestMapping("/lab")
public class GatewayLabController {

    private final AuthProperties auth;
    private final ReactiveStringRedisTemplate redis;

    public GatewayLabController(AuthProperties auth, ReactiveStringRedisTemplate redis) {
        this.auth = auth;
        this.redis = redis;
    }

    /** Demo identities for the UI "login" dropdown (tokens are public on purpose - this is a classroom). */
    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return auth.getUsers().entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("token", e.getKey());
            m.put("id", e.getValue().getId());
            m.put("roles", e.getValue().getRoles());
            m.put("tier", e.getValue().getTier());
            return m;
        }).toList();
    }

    /** Peek into Redis: the token buckets the RequestRateLimiter keeps (two keys per caller per route). */
    @GetMapping("/redis/keys")
    public Mono<Map<String, Object>> rateLimiterKeys() {
        return redis.keys("request_rate_limiter.*")
                .sort()
                .concatMap(key -> Mono.zip(
                        redis.opsForValue().get(key).defaultIfEmpty(""),
                        redis.getExpire(key).defaultIfEmpty(Duration.ZERO))
                        .map(t -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("key", key);
                            m.put("value", t.getT1());
                            m.put("ttlSeconds", t.getT2().toSeconds());
                            return m;
                        }))
                .collectList()
                .map(list -> Map.<String, Object>of("count", list.size(), "keys", list))
                // Redis down (lesson 10 chaos drill) => report it instead of failing the request
                .onErrorResume(e -> Mono.just(Map.<String, Object>of("count", 0, "keys", List.of(),
                        "error", String.valueOf(e.getMessage()))));
    }
}
