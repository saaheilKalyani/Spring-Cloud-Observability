package com.lab.common.lb;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The two Spring Cloud LoadBalancer strategies we teach.
 *
 * <p>Real applications pick ONE strategy at start-up (via a {@code @LoadBalancerClient} configuration).
 * For the classroom we keep the choice in a JVM-wide holder so the UI can flip it at runtime
 * and students see the effect immediately.
 */
public enum LbStrategy {
    ROUND_ROBIN("round-robin"),
    RANDOM("random");

    private static final AtomicReference<LbStrategy> CURRENT = new AtomicReference<>(ROUND_ROBIN);

    private final String id;

    LbStrategy(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }

    public static LbStrategy current() {
        return CURRENT.get();
    }

    public static void set(LbStrategy strategy) {
        CURRENT.set(strategy);
    }

    public static LbStrategy fromId(String id) {
        return Arrays.stream(values())
                .filter(s -> s.id.equalsIgnoreCase(id) || s.name().equalsIgnoreCase(id))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown strategy '" + id + "'. Use round-robin or random"));
    }

    public static List<String> ids() {
        return Arrays.stream(values()).map(LbStrategy::id).toList();
    }
}
