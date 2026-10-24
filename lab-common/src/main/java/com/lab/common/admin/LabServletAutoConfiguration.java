package com.lab.common.admin;

import com.lab.common.web.LabRequestFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

/**
 * Wires the request-id filter + health toggle into every SERVLET app (product, order, bff).
 * Not applied to the reactive API gateway, which has its own global filters.
 */
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(prefix = "lab.admin", name = "enabled", havingValue = "true")
public class LabServletAutoConfiguration {

    @Bean
    FilterRegistrationBean<LabRequestFilter> labRequestFilter(
            @Value("${spring.application.name}") String serviceName,
            @Value("${lab.instance-id:${spring.application.name}}") String instanceId) {
        FilterRegistrationBean<LabRequestFilter> reg = new FilterRegistrationBean<>(new LabRequestFilter(serviceName, instanceId));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return reg;
    }

    /** Bean name becomes the health contributor name: "labToggle" in /actuator/health. */
    @Bean
    HealthToggle labToggle() {
        return new HealthToggle();
    }

    @Bean
    AdminController adminController(HealthToggle toggle,
                                    @Value("${spring.application.name}") String serviceName,
                                    @Value("${lab.instance-id:${spring.application.name}}") String instanceId,
                                    @Value("${server.port:8080}") int port) {
        return new AdminController(toggle, serviceName, instanceId, port);
    }
}
