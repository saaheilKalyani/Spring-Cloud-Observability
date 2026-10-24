package com.lab.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LESSONS 8-12 - the single entry point for external clients.
 *
 * <p>This is also our SERVER-SIDE service discovery example: the browser only knows
 * {@code http://gateway:8080}; the gateway asks Eureka where product-service lives and forwards the call.
 */
@SpringBootApplication
public class ApiGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }
}
