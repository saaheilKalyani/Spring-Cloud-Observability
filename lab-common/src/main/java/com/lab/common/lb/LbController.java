package com.lab.common.lb;

import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Teaching endpoints (work in MVC and WebFlux apps):
 * <ul>
 *   <li>{@code GET  /lab/lb}                 - current strategy + the instances THIS client currently sees</li>
 *   <li>{@code POST /lab/lb/{strategy}}      - switch round-robin / random at runtime</li>
 * </ul>
 * "Instances this client sees" comes from the Eureka client's LOCAL cache - compare it with the Eureka
 * server's registry to understand why client-side discovery is only eventually consistent.
 */
@RestController
@RequestMapping("/lab/lb")
public class LbController {

    private final DiscoveryClient discoveryClient;

    public LbController(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    @GetMapping
    public Map<String, Object> state(@RequestParam(defaultValue = "product-service") String service) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("strategy", LbStrategy.current().id());
        body.put("available", LbStrategy.ids());
        body.put("service", service);
        body.put("instancesSeenByThisClient", discoveryClient.getInstances(service).stream().map(this::describe).toList());
        body.put("knownServices", discoveryClient.getServices());
        return body;
    }

    @PostMapping("/{strategy}")
    public Map<String, Object> switchStrategy(@PathVariable String strategy) {
        LbStrategy.set(LbStrategy.fromId(strategy));
        return Map.of("strategy", LbStrategy.current().id(), "available", List.copyOf(LbStrategy.ids()));
    }

    private Map<String, Object> describe(ServiceInstance i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("instanceId", i.getInstanceId());
        m.put("host", i.getHost());
        m.put("port", i.getPort());
        return m;
    }
}
