package com.lab.order;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientException;

import java.util.Map;

@RestControllerAdvice
public class ApiErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    /**
     * A downstream (product-service) call failed: timeout, connection refused, 5xx ...
     * {@code IllegalStateException("No instances available for product-service")} is what Spring Cloud
     * LoadBalancer throws when the Eureka registry has no healthy instance left.
     */
    @ExceptionHandler({RestClientException.class, IllegalStateException.class})
    ResponseEntity<Map<String, Object>> onDownstreamFailure(Exception ex) {
        log.error("Downstream call to product-service failed", ex);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "downstream_unavailable", "message", String.valueOf(ex.getMessage())));
    }
}
