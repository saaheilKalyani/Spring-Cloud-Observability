package com.lab.common.admin;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * A switch that lets us fake an application-level failure (e.g. "database is down") WITHOUT killing the process.
 *
 * <p>Flow the students observe:
 * <pre>
 *   POST /admin/health/down
 *     -> /actuator/health = DOWN
 *     -> Eureka client (healthcheck.enabled=true) pushes status DOWN to the registry
 *     -> other clients' next registry fetch no longer lists the instance as UP
 *     -> LoadBalancer stops sending traffic to it  (process is still running!)
 * </pre>
 */
public class HealthToggle implements HealthIndicator {

    private final AtomicBoolean up = new AtomicBoolean(true);

    public boolean isUp() {
        return up.get();
    }

    public void setUp(boolean value) {
        up.set(value);
    }

    @Override
    public Health health() {
        return up.get()
                ? Health.up().withDetail("toggle", "UP (set via POST /admin/health/up)").build()
                : Health.down().withDetail("toggle", "DOWN (simulated failure, POST /admin/health/up to heal)").build();
    }
}
