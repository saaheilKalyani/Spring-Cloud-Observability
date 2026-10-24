package com.lab.eureka;

import com.netflix.appinfo.InstanceInfo;
import com.netflix.appinfo.LeaseInfo;
import com.netflix.discovery.shared.Application;
import com.netflix.eureka.registry.PeerAwareInstanceRegistry;
import com.netflix.eureka.registry.PeerAwareInstanceRegistryImpl;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Exposes the numbers behind Eureka's SELF-PRESERVATION decision as JSON so the lab UI can draw them.
 *
 * <pre>
 *   expected renews/min  = instances x (60 / heartbeat interval)
 *   threshold            = expected x renewal-percent-threshold (0.85)
 *   renews in last min   = heartbeats the server REALLY received
 *
 *   renews in last min  &lt;=  threshold   -> self-preservation: Eureka STOPS evicting expired leases
 * </pre>
 */
@RestController
public class RegistryStatsController {

    private final PeerAwareInstanceRegistry registry;
    private final boolean selfPreservationConfigured;
    private final double renewalPercentThreshold;

    public RegistryStatsController(PeerAwareInstanceRegistry registry,
                                   @Value("${eureka.server.enable-self-preservation:true}") boolean selfPreservationConfigured,
                                   @Value("${eureka.server.renewal-percent-threshold:0.85}") double renewalPercentThreshold) {
        this.registry = registry;
        this.selfPreservationConfigured = selfPreservationConfigured;
        this.renewalPercentThreshold = renewalPercentThreshold;
    }

    @GetMapping("/lab/registry")
    public Map<String, Object> stats() {
        PeerAwareInstanceRegistryImpl impl = (PeerAwareInstanceRegistryImpl) registry;
        long renewsLastMin = impl.getNumOfRenewsInLastMin();
        long threshold = impl.getNumOfRenewsPerMinThreshold();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("selfPreservationEnabled", selfPreservationConfigured);
        m.put("renewalPercentThreshold", renewalPercentThreshold);
        m.put("renewsLastMinute", renewsLastMin);
        m.put("renewsThreshold", threshold);
        // true => Eureka believes it is the one with a problem (network partition) and stops evicting
        m.put("selfPreservationActive", selfPreservationConfigured && !impl.isLeaseExpirationEnabled());
        m.put("leaseExpirationEnabled", impl.isLeaseExpirationEnabled());
        // lets the UI compute "seconds since last heartbeat" without trusting the browser's clock
        m.put("serverTime", System.currentTimeMillis());
        // Read straight from the registry, NOT from /eureka/apps: that endpoint is served from a response cache that
        // heartbeats do not invalidate, so its lease timestamps can be minutes old.
        List<Map<String, Object>> instances = new ArrayList<>();
        for (Application app : registry.getSortedApplications()) {
            for (InstanceInfo i : app.getInstances()) {
                LeaseInfo lease = i.getLeaseInfo();
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("app", app.getName());
                row.put("id", i.getInstanceId());
                row.put("host", i.getHostName());
                row.put("port", i.getPort());
                row.put("status", i.getStatus().name());
                row.put("renewalIntervalSecs", lease == null ? 30 : lease.getRenewalIntervalInSecs());
                row.put("durationSecs", lease == null ? 90 : lease.getDurationInSecs());
                row.put("lastRenewalTimestamp", lease == null ? 0 : lease.getRenewalTimestamp());
                row.put("registrationTimestamp", lease == null ? 0 : lease.getRegistrationTimestamp());
                instances.add(row);
            }
        }
        m.put("registeredInstances", instances.size());
        m.put("instances", instances);
        return m;
    }
}
