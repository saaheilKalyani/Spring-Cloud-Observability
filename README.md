# Spring Cloud Observability Lab

An interactive, Docker-based proof of concept for teaching **centralized logging, metrics, service discovery,
load balancing, API gateway, rate limiting and the BFF pattern** with Spring Boot 3.5 and Spring Cloud 2025.0.

Students do not read slides about these topics - they press buttons, break things, and watch a live system react.

```
git clone <this-repository>
cd Spring-Cloud-Observability
docker compose up -d --build        # first run: 5-10 minutes (downloads + compiles); later runs: seconds
```

Then open **http://localhost:8800** (the lab console). Step-by-step instructions for every operating system,
including troubleshooting, are in **[RUN-STEP-BY-STEP.txt](RUN-STEP-BY-STEP.txt)**.

You need only Docker. **No Java, no Maven, no Node** - the jars are compiled inside Docker.

## Which topic is taught where

| # | Lesson in the console | Topic from the syllabus |
|---|---|---|
| 1 | Centralized logging with ELK | ELK stack: Elasticsearch, Logstash, Kibana |
| 2 | Actuator and Micrometer | Spring Boot Actuator metrics with Micrometer |
| 3 | Prometheus and Grafana | Prometheus scraping, PromQL, Grafana dashboards, alerts |
| 4 | Discovery patterns | Client-side vs server-side service discovery |
| 5 | Eureka registry | Eureka Server, registration, heartbeat, self-preservation mode |
| 6 | Spring Cloud LoadBalancer | Round-robin and random strategies; replacing Ribbon |
| 7 | Health checks and deregistration | Health checks and automatic deregistration on failure |
| 8 | Gateway routes and predicates | Route configuration in YAML and Java DSL, predicates |
| 9 | Gateway filters | Global vs per-route filters: logging, auth header injection, response rewriting |
| 10 | Rate limiting with Redis | Redis-backed `RequestRateLimiter` |
| 11 | Load balancing at the gateway | Gateway + Spring Cloud LoadBalancer integration, Retry |
| 12 | API Gateway vs BFF | When to use each |

Each lesson has: **Idea** (plain-language explanation), **Try it** (interactive experiments, many of which
stop, freeze or kill real containers), **Check yourself** (questions with hidden answers) and **Source**
(the real files of this repository, loaded live with the relevant lines highlighted).

## Architecture

```
                         +-----------------------------+
   Browser  --------->   |  lab UI  (nginx, port 8800) |  static HTML/JS + reverse proxy
                         +--------------+--------------+
                                        |
                         +--------------v--------------+        +----------+
                         |   api-gateway (Spring Cloud |<------>|  Redis   |  token buckets
                         |   Gateway, Eureka client)   |        +----------+
                         +---+-----------+---------+---+
        lb://product-service |           | lb://order-service | lb://web-bff, lb://mobile-bff
                    +--------v--+   +----v------+       +-----v-----+  +-----------+
                    | product-  |   | order-    |       |  web-bff  |  | mobile-bff|
                    | service x3|<--| service   |<------+           |  |           |
                    +-----+-----+   +-----+-----+       +-----+-----+  +-----+-----+
                          \_______________|___ register / heartbeat / fetch ___/
                                  +-------v--------+
                                  | eureka-server  |
                                  +----------------+

   every service --JSON logs (TCP)--> Logstash --> Elasticsearch --> Kibana
   every service <--scrape /actuator/prometheus-- Prometheus --> Grafana
   lab-control (Docker socket) lets the UI stop / freeze / kill containers for the failure drills
```

## Ports (host side, all changeable in `.env`)

| URL | What |
|---|---|
| http://localhost:8800 | **Lab console (start here)** |
| http://localhost:8880 | API gateway (what a real client would call) |
| http://localhost:8761 | Eureka dashboard |
| http://localhost:5601 | Kibana |
| http://localhost:3030 | Grafana (no login) |
| http://localhost:9099 | Prometheus |
| http://localhost:9200 | Elasticsearch |
| 8081-8083, 8084, 8085, 8086 | product-service x3, order-service, web-bff, mobile-bff (direct access for `curl`) |

## Repository layout

```
pom.xml                   parent POM: Spring Boot 3.5.16, Spring Cloud 2025.0.3, Java 21
Dockerfile                one multi-stage file builds every Java service
docker-compose.yml        the whole lab; ELK and metrics are optional "profiles"
.env                      ports, profiles, Eureka timing switches
lab-common/               shared: logback JSON config, switchable load balancer, request-id filter, health toggle
eureka-server/            @EnableEurekaServer + a stats endpoint for self-preservation
api-gateway/              routes (YAML + Java DSL), global + per-route filters, Redis rate limiter
product-service/          the load-balanced provider (3 instances from one image)
order-service/            consumer using client-side discovery (@LoadBalanced RestClient)
bff-service/              one code base, two deployables: web-bff and mobile-bff
lab-control/              tiny Python service that lets the UI control containers
ui/                       nginx config + the interactive console (plain HTML, CSS, JavaScript)
infra/                    Logstash pipeline, Kibana setup, Prometheus config + alerts, Grafana dashboards
RUN-STEP-BY-STEP.txt      the run book
```

## Deliberate teaching shortcuts (do not copy into production)

* Eureka lease/heartbeat/cache timers are about 10x faster than the defaults so lessons take seconds
  (each service's `application.yml` lists the production defaults in `[brackets]`).
* Elasticsearch security is off, Grafana allows anonymous admin, Redis has no password.
* `lab-control` mounts `/var/run/docker.sock`. That is full control of Docker: published ports bind to `127.0.0.1`
  by default (`BIND_ADDR` in `.env`) - keep it that way unless you are on a trusted classroom network.
* Authentication is a fixed table of demo tokens (`token-alice-123` ...), not a real identity provider.
* The `X-Plan` and `X-Client-Id` headers are client-controlled: fine for a lab, never for real rate-limit decisions.

## Technology versions

Java 21 - Spring Boot 3.5.16 - Spring Cloud 2025.0.3 (Gateway 4.3.5, Netflix Eureka 4.3.3, LoadBalancer 4.3.3) -
Elasticsearch / Logstash / Kibana 8.15.5 - Prometheus 2.51 - Grafana 10.4 - Redis 7 - nginx 1.27 - Python 3.12.
