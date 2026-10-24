package com.lab.common.admin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Small "control panel" endpoints shared by every servlet service. */
@RestController
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    private final HealthToggle toggle;
    private final String serviceName;
    private final String instanceId;
    private final int port;
    private final Instant startedAt = Instant.now();

    public AdminController(HealthToggle toggle, String serviceName, String instanceId, int port) {
        this.toggle = toggle;
        this.serviceName = serviceName;
        this.instanceId = instanceId;
        this.port = port;
    }

    /** Who am I? Used by the UI to show which instance answered. */
    @GetMapping("/lab/whoami")
    public Map<String, Object> whoami() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("service", serviceName);
        m.put("instanceId", instanceId);
        m.put("hostname", hostname());
        m.put("port", port);
        m.put("pid", ProcessHandle.current().pid());
        m.put("startedAt", startedAt.toString());
        m.put("uptimeSeconds", ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        m.put("healthToggle", toggle.isUp() ? "UP" : "DOWN");
        return m;
    }

    @GetMapping("/admin/health")
    public Map<String, Object> current() {
        return Map.of("instanceId", instanceId, "toggle", toggle.isUp() ? "UP" : "DOWN");
    }

    @PostMapping("/admin/health/{state}")
    public Map<String, Object> set(@PathVariable String state) {
        boolean up = "up".equalsIgnoreCase(state);
        toggle.setUp(up);
        log.warn("Health toggle switched to {} on instance {} (simulated failure drill)", up ? "UP" : "DOWN", instanceId);
        return Map.of("instanceId", instanceId, "toggle", up ? "UP" : "DOWN");
    }

    private static String hostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }
}
