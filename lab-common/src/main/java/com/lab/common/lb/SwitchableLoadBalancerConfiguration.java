package com.lab.common.lb;

import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.loadbalancer.core.ReactorLoadBalancer;
import org.springframework.cloud.loadbalancer.core.ServiceInstanceListSupplier;
import org.springframework.cloud.loadbalancer.support.LoadBalancerClientFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

/**
 * Per-service (child context) LoadBalancer configuration.
 *
 * <p>Deliberately NOT annotated with {@code @Configuration} and NOT in a component-scanned package:
 * Spring Cloud LoadBalancer creates one child application context per target service, and this class is
 * registered into each of them through {@code @LoadBalancerClients(defaultConfiguration = ...)}.
 */
public class SwitchableLoadBalancerConfiguration {

    @Bean
    public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(
            Environment environment, LoadBalancerClientFactory loadBalancerClientFactory) {
        String serviceId = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new SwitchableLoadBalancer(
                loadBalancerClientFactory.getLazyProvider(serviceId, ServiceInstanceListSupplier.class), serviceId);
    }
}
