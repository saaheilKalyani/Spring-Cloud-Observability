package com.lab.bff;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LESSON 12 - Backend For Frontend.
 *
 * <p>ONE code base, TWO deployables. docker-compose starts it twice:
 * <pre>
 *   web-bff    SPRING_PROFILES_ACTIVE=web     -> WebBffController    (rich payload for browsers)
 *   mobile-bff SPRING_PROFILES_ACTIVE=mobile  -> MobileBffController (tiny payload for phones)
 * </pre>
 * In a real company each BFF is owned by the team that owns the front-end; here they share a repo to keep
 * the lab small. Each registers in Eureka under its OWN name so the gateway can route to either.
 */
@SpringBootApplication
public class BffApplication {
    public static void main(String[] args) {
        SpringApplication.run(BffApplication.class, args);
    }
}
