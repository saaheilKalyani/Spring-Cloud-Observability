package com.lab.common.lb;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.cloud.loadbalancer.annotation.LoadBalancerClients;
import org.springframework.context.annotation.Bean;

/**
 * Switch it on with {@code lab.lb.enabled=true}. Replaces the default LoadBalancer algorithm for EVERY
 * service this application calls through {@code lb://} or a {@code @LoadBalanced} client.
 */
@AutoConfiguration
@ConditionalOnProperty(prefix = "lab.lb", name = "enabled", havingValue = "true")
@LoadBalancerClients(defaultConfiguration = SwitchableLoadBalancerConfiguration.class)
public class LabLoadBalancerAutoConfiguration {

    @Bean
    InitializingBean initialLbStrategy(@Value("${lab.lb.default-strategy:round-robin}") String strategy) {
        return () -> LbStrategy.set(LbStrategy.fromId(strategy));
    }

    @Bean
    LbController lbController(DiscoveryClient discoveryClient) {
        return new LbController(discoveryClient);
    }
}
