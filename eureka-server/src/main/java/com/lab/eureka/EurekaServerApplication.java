package com.lab.eureka;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * LESSON 5 - The service registry.
 *
 * <p>{@code @EnableEurekaServer} is the ONLY thing needed to turn a Spring Boot app into a Eureka registry.
 * Browse its built-in dashboard at http://localhost:8761
 */
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
