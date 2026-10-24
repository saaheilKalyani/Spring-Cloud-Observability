package com.lab.gateway.filter;

import org.springframework.web.server.ServerWebExchange;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Teaching aid: every CUSTOM filter records its name here when it runs. The list is returned to the caller in the
 * {@code X-Filter-Trace} response header, so students SEE the order in which filters executed for their request.
 * (Filters run in this order for the request, and in REVERSE order for the response.)
 */
public final class FilterTrace {

    public static final String ATTR = "lab.filterTrace";

    private FilterTrace() {
    }

    @SuppressWarnings("unchecked")
    public static void add(ServerWebExchange exchange, String filterName) {
        ((List<String>) exchange.getAttributes().computeIfAbsent(ATTR, k -> new CopyOnWriteArrayList<String>())).add(filterName);
    }

    @SuppressWarnings("unchecked")
    public static String render(ServerWebExchange exchange) {
        List<String> trace = (List<String>) exchange.getAttributes().get(ATTR);
        return trace == null ? "" : String.join(" > ", trace);
    }
}
