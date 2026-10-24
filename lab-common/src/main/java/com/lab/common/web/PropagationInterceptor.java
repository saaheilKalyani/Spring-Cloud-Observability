package com.lab.common.web;

import org.slf4j.MDC;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.IOException;

/**
 * Forwards the correlation id and the gateway-verified identity on every OUTGOING service-to-service call.
 *
 * <p>This is why one click in the UI produces log lines with the SAME {@code requestId} in the gateway,
 * the order-service and the product-service - search that id in Kibana and you see the whole journey.
 */
public class PropagationInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        String requestId = MDC.get(LabRequestFilter.MDC_KEY);
        if (requestId != null) {
            request.getHeaders().set(LabRequestFilter.REQUEST_ID, requestId);
        }
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            String user = sra.getRequest().getHeader("X-User-Id");
            if (user != null) {
                request.getHeaders().set("X-User-Id", user);
            }
        }
        return execution.execute(request, body);
    }
}
