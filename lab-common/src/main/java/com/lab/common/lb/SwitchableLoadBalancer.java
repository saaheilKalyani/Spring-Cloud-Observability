package com.lab.common.lb;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.loadbalancer.Request;
import org.springframework.cloud.client.loadbalancer.Response;
import org.springframework.cloud.loadbalancer.core.RandomLoadBalancer;
import org.springframework.cloud.loadbalancer.core.ReactorServiceInstanceLoadBalancer;
import org.springframework.cloud.loadbalancer.core.RoundRobinLoadBalancer;
import org.springframework.cloud.loadbalancer.core.ServiceInstanceListSupplier;
import reactor.core.publisher.Mono;

/**
 * Delegates to Spring Cloud LoadBalancer's built-in {@link RoundRobinLoadBalancer} or {@link RandomLoadBalancer}.
 *
 * <p>This is what REPLACED Netflix Ribbon: Ribbon's {@code IRule} (RoundRobinRule, RandomRule ...) became a
 * {@link ReactorServiceInstanceLoadBalancer} bean. Both algorithms share one {@link ServiceInstanceListSupplier},
 * which is the "which instances exist right now" source (here: the Eureka client's local registry cache).
 */
public class SwitchableLoadBalancer implements ReactorServiceInstanceLoadBalancer {

    private final RoundRobinLoadBalancer roundRobin;
    private final RandomLoadBalancer random;

    public SwitchableLoadBalancer(ObjectProvider<ServiceInstanceListSupplier> supplier, String serviceId) {
        this.roundRobin = new RoundRobinLoadBalancer(supplier, serviceId);
        this.random = new RandomLoadBalancer(supplier, serviceId);
    }

    @Override
    @SuppressWarnings("rawtypes")
    public Mono<Response<ServiceInstance>> choose(Request request) {
        return (LbStrategy.current() == LbStrategy.RANDOM ? random : roundRobin).choose(request);
    }
}
