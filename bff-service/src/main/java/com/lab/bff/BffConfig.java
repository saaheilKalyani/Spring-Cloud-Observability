package com.lab.bff;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class BffConfig {

    /** {@code @LoadBalanced} => "http://product-service/..." is resolved through Eureka + Spring Cloud LoadBalancer. */
    @Bean
    @LoadBalanced
    RestClient.Builder loadBalancedBuilder() {
        return RestClient.builder();
    }
}
