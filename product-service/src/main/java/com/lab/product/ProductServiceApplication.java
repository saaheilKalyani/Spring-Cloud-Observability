package com.lab.product;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LESSONS 4-7 - the "provider" service.
 *
 * <p>There is NO {@code @EnableDiscoveryClient} here on purpose: since Spring Cloud 2020 the presence of
 * {@code spring-cloud-starter-netflix-eureka-client} on the classpath is enough to register with Eureka.
 *
 * <p>We run THREE copies of this exact image (product-service-1/2/3). Same {@code spring.application.name},
 * different {@code INSTANCE_ID} -> Eureka groups them under one logical service: PRODUCT-SERVICE.
 */
@SpringBootApplication
public class ProductServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProductServiceApplication.class, args);
    }
}
