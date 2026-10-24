package com.lab.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Demo "identity provider": bearer token -> user. In production this would be a JWT validated against an
 * identity server (Keycloak, Auth0 ...). The gateway pattern is identical: validate once at the edge,
 * then pass TRUSTED identity headers to the services behind it.
 */
@ConfigurationProperties(prefix = "lab.auth")
public class AuthProperties {

    private Map<String, User> users = new LinkedHashMap<>();

    public Map<String, User> getUsers() {
        return users;
    }

    public void setUsers(Map<String, User> users) {
        this.users = users;
    }

    public static class User {
        private String id;
        private List<String> roles = new ArrayList<>();
        private String tier = "standard";

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public List<String> getRoles() {
            return roles;
        }

        public void setRoles(List<String> roles) {
            this.roles = roles;
        }

        public String getTier() {
            return tier;
        }

        public void setTier(String tier) {
            this.tier = tier;
        }
    }
}
