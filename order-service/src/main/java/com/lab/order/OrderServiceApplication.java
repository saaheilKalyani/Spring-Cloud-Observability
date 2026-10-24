package com.lab.order;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LESSONS 4 and 6 - the "consumer" service that demonstrates CLIENT-SIDE service discovery.
 * It never knows an IP address: it asks "product-service" and Spring Cloud LoadBalancer picks an instance.
 */
@SpringBootApplication
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
