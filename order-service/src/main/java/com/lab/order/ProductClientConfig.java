package com.lab.order;

import com.lab.common.web.PropagationInterceptor;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * CLIENT-SIDE DISCOVERY in one annotation.
 *
 * <p>{@code @LoadBalanced} adds an interceptor to the builder. When we call {@code http://product-service/...}
 * the interceptor treats "product-service" as a LOGICAL name (not a DNS host), asks Spring Cloud LoadBalancer
 * for an instance (list comes from the Eureka client's local registry cache), rewrites the URL to
 * {@code http://product-service-2:8080/...} and sends it.
 *
 * <p>This replaces the old Ribbon-enabled {@code RestTemplate}. Ribbon is end-of-life since Spring Cloud 2020.
 */
@Configuration
public class ProductClientConfig {

    @Bean
    @LoadBalanced
    RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }

    @Bean
    RestClient productClient(@LoadBalanced RestClient.Builder builder) {
        // A frozen instance (docker pause) accepts TCP connections but never answers -> always set timeouts!
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return builder
                .baseUrl("http://product-service")            // logical service id, NOT a host name
                .requestFactory(factory)
                .requestInterceptor(new PropagationInterceptor())
                .build();
    }
}
