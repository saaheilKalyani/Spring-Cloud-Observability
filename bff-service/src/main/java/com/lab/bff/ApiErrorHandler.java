package com.lab.bff;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientException;

import java.util.Map;
import java.util.concurrent.CompletionException;

@RestControllerAdvice
public class ApiErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    /** Any failed downstream call (parallel calls surface as CompletionException) => 503 with a clear reason. */
    @ExceptionHandler({RestClientException.class, IllegalStateException.class, CompletionException.class})
    ResponseEntity<Map<String, Object>> onDownstreamFailure(Exception ex) {
        Throwable cause = ex instanceof CompletionException && ex.getCause() != null ? ex.getCause() : ex;
        log.error("BFF could not assemble the response: downstream failure", cause);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("error", "downstream_unavailable", "message", String.valueOf(cause.getMessage())));
    }
}
