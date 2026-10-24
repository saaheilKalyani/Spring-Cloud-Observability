package com.lab.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Every servlet-based service runs this filter first. It:
 * <ol>
 *   <li>reads (or creates) the {@code X-Request-Id} correlation id and puts it in the logging MDC,
 *       so EVERY log line of this request carries {@code requestId} -> searchable in Kibana</li>
 *   <li>stamps the response with {@code X-Instance-Id} / {@code X-Service-Name} so the UI can show
 *       WHICH instance answered (this is how we visualise load balancing)</li>
 * </ol>
 */
public class LabRequestFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    private final String serviceName;
    private final String instanceId;

    public LabRequestFilter(String serviceName, String instanceId) {
        this.serviceName = serviceName;
        this.instanceId = instanceId;
    }

    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = request.getHeader(REQUEST_ID);
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString().substring(0, 8);
        }
        MDC.put(MDC_KEY, requestId);
        response.setHeader(REQUEST_ID, requestId);
        response.setHeader("X-Instance-Id", instanceId);
        response.setHeader("X-Service-Name", serviceName);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
