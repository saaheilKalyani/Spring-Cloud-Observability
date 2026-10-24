# syntax=docker/dockerfile:1.7
# ======================================================================================================
# ONE Dockerfile for ALL Java services.
#   - Stage "build"   : compiles the whole multi-module Maven project ONCE (students need no JDK / Maven).
#   - Stages per app  : tiny JRE image that just copies its own jar.   docker compose picks one via `target:`
# ======================================================================================================

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace

# 1) poms first -> Docker layer cache survives source-only changes
COPY pom.xml ./
COPY lab-common/pom.xml       lab-common/pom.xml
COPY eureka-server/pom.xml    eureka-server/pom.xml
COPY api-gateway/pom.xml      api-gateway/pom.xml
COPY product-service/pom.xml  product-service/pom.xml
COPY order-service/pom.xml    order-service/pom.xml
COPY bff-service/pom.xml      bff-service/pom.xml

# 2) sources
COPY lab-common/src       lab-common/src
COPY eureka-server/src    eureka-server/src
COPY api-gateway/src      api-gateway/src
COPY product-service/src  product-service/src
COPY order-service/src    order-service/src
COPY bff-service/src      bff-service/src

# The cache mount keeps ~/.m2 between builds => second build takes seconds, not minutes
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package

# ------------------------------------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
# Small heap + serial GC + C1-only JIT: eight JVMs must fit on a student laptop. Override with JAVA_OPTS in compose.
ENV JAVA_OPTS="-XX:+UseSerialGC -Xss512k -XX:TieredStopAtLevel=1 -Xms64m -Xmx192m"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]

FROM runtime AS eureka-server
COPY --from=build /workspace/eureka-server/target/eureka-server-1.0.0.jar app.jar
EXPOSE 8761

FROM runtime AS api-gateway
COPY --from=build /workspace/api-gateway/target/api-gateway-1.0.0.jar app.jar
EXPOSE 8080

FROM runtime AS product-service
COPY --from=build /workspace/product-service/target/product-service-1.0.0.jar app.jar
EXPOSE 8080

FROM runtime AS order-service
COPY --from=build /workspace/order-service/target/order-service-1.0.0.jar app.jar
EXPOSE 8080

FROM runtime AS bff-service
COPY --from=build /workspace/bff-service/target/bff-service-1.0.0.jar app.jar
EXPOSE 8080
