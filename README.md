# Spring Cloud Observability Lab

An interactive, Docker-based lab for learning **centralized logging, metrics, service discovery, load balancing,
API gateway, rate limiting and the BFF pattern** with Spring Boot 3.5 and Spring Cloud 2025.0.

You do not read slides about these topics. You press buttons, break things on purpose, and watch a live system react.
It runs on **Windows, macOS and Linux**. You only need **Git** and **Docker**: no Java, no Maven, no Node.

Repository: **https://github.com/saaheilKalyani/Spring-Cloud-Observability**

## Quick start (if Git and Docker are already installed)

```bash
git clone https://github.com/saaheilKalyani/Spring-Cloud-Observability.git
cd Spring-Cloud-Observability
docker compose up -d --build
```

Wait 1-2 minutes (5-15 minutes the very first time), then open **http://localhost:8800** and choose **alice** in the
"Signed in as" box of the left sidebar. If anything fails, see [Troubleshooting](#9-troubleshooting).

## Contents

1. [What you get](#1-what-you-get)
2. [What you need](#2-what-you-need)
3. [Set up on a new device, step by step](#3-set-up-on-a-new-device-step-by-step)
4. [Using the lab](#4-using-the-lab)
5. [Options you can change](#5-options-you-can-change)
6. [Stop, restart and clean up](#6-stop-restart-and-clean-up)
7. [Change the code and try again](#7-change-the-code-and-try-again)
8. [Working with Git (for students)](#8-working-with-git-for-students)
9. [Troubleshooting](#9-troubleshooting)
10. [Architecture, ports and repository layout](#10-architecture-ports-and-repository-layout)
11. [Deliberate teaching shortcuts](#11-deliberate-teaching-shortcuts)

---

## 1. What you get

After the setup you have **about 16 containers** running on your own computer and one web page with **12 lessons**.

| # | Lesson in the console | Topic |
|---|---|---|
| 1 | Centralized logging with ELK | Elasticsearch, Logstash, Kibana |
| 2 | Actuator and Micrometer | Spring Boot Actuator metrics with Micrometer |
| 3 | Prometheus and Grafana | scraping, PromQL, dashboards, alerts |
| 4 | Discovery patterns | client-side vs server-side service discovery |
| 5 | Eureka registry | Eureka Server, registration, heartbeat, self-preservation mode |
| 6 | Spring Cloud LoadBalancer | round-robin and random strategies; replacing Ribbon |
| 7 | Health checks and deregistration | health checks and automatic deregistration on failure |
| 8 | Gateway routes and predicates | route configuration in YAML and Java DSL, predicates |
| 9 | Gateway filters | global vs per-route filters: logging, auth header injection, response rewriting |
| 10 | Rate limiting with Redis | Redis-backed `RequestRateLimiter` |
| 11 | Load balancing at the gateway | gateway + Spring Cloud LoadBalancer, Retry |
| 12 | API Gateway vs BFF | when to use each |

Every lesson has four parts: **Idea** (plain explanation), **Try it** (experiments; many of them stop, freeze or kill
real containers), **Check yourself** (questions with hidden answers) and **Source** (the real files of this repository,
loaded live with the important lines highlighted).

A written companion for students is in this repository:
**[Spring Cloud Microservices Lab Student Guide (12 Topics).pdf](Spring%20Cloud%20Microservices%20Lab%20Student%20Guide%20%2812%20Topics%29.pdf)**
(48 pages: the problem, the idea, the tool, the alternatives and what to see in the lab, for each topic).

---

## 2. What you need

| Requirement | Details |
|---|---|
| **Git** | to download (clone) the project. https://git-scm.com/downloads |
| **Docker** | Docker Desktop (Windows, macOS) or Docker Engine with the Compose plugin (Linux). **Compose v2 or newer**: the command is `docker compose` with a space |
| **Memory for Docker** | **6 GB** for the full lab (it uses about 4.2 GB). **3 GB** is enough without ELK (see [low-memory mode](#51-low-memory-mode)) |
| **Computer** | 8 GB RAM or more in total, 4 CPU cores recommended |
| **Disk space** | about 10 GB free (images and build cache) |
| **Internet** | for the first start only (about 3 GB download) |
| **Free ports** | 8800, 8880, 8761, 5601, 3030, 9099, 9200, 6380, 8081-8086. You can change them in `.env` |

You do **not** need Java, Maven, Node.js or Python. The Java services are compiled inside Docker.

---

## 3. Set up on a new device, step by step

### Step 1 - Install Git

* **Windows:** download "Git for Windows" from https://git-scm.com/download/win and accept the defaults.
  It also installs **Git Bash**, a terminal that understands the Linux-style commands in this README.
* **macOS:** open Terminal and type `git --version`. If Git is missing, macOS offers to install it.
* **Linux (Debian/Ubuntu):** `sudo apt update && sudo apt install -y git`

### Step 2 - Install Docker

* **Windows 10/11:**
  1. Install **Docker Desktop** from https://www.docker.com/products/docker-desktop/ . Keep the option
     **"Use WSL 2"** selected. Restart the computer if the installer asks.
  2. Start **Docker Desktop** and wait until it says **"Engine running"** (a green icon at the bottom left).
* **macOS (Intel or Apple Silicon):** install **Docker Desktop**, start it, and wait until it says
  "Engine running". All images used by the lab also exist for Apple Silicon (arm64).
* **Linux:**
  1. Install Docker Engine and the Compose plugin: https://docs.docker.com/engine/install/ (choose your distribution).
  2. Allow your user to use Docker without `sudo`, then **log out and log in again**:
     ```bash
     sudo usermod -aG docker $USER
     ```

### Step 3 - Give Docker enough memory

The full lab needs about **4.2 GB** inside Docker, so give Docker **6 GB**.

* **Windows (WSL 2 backend, the default):** create (or edit) the text file `C:\Users\<your-name>\.wslconfig` with:
  ```
  [wsl2]
  memory=6GB
  processors=4
  ```
  Then open PowerShell, run `wsl --shutdown`, and start Docker Desktop again.
* **macOS:** Docker Desktop → **Settings → Resources → Memory** → set 6 GB → **Apply & restart**.
* **Linux:** Docker uses the real memory of the machine; nothing to configure.

If your computer has **only 8 GB in total**, skip this and use the [low-memory mode](#51-low-memory-mode).

### Step 4 - Check that the tools work

Open a terminal (**PowerShell**, **Git Bash**, macOS **Terminal** or a Linux shell) and run:

```bash
git --version
docker --version
docker compose version
docker run --rm hello-world
```

All four must print something without errors. The last command prints "Hello from Docker!".
If you see "Cannot connect to the Docker daemon", Docker Desktop is not running yet: start it and wait for "Engine running".

### Step 5 - Download (clone) the project

```bash
git clone https://github.com/saaheilKalyani/Spring-Cloud-Observability.git
cd Spring-Cloud-Observability
```

(No Git? On the GitHub page choose **Code → Download ZIP**, unzip it, and open a terminal in the unzipped folder. You
can use the lab that way, but not the Git features in section 8.)

> **Windows tip:** keep the folder in a normal location such as `C:\Users\<you>\projects`. The file
> `.gitattributes` makes sure shell scripts keep Linux line endings, so you do not have to configure anything.

### Step 6 - (Optional) Look at the settings

All settings are in the file **`.env`** in the project folder. The defaults work on most computers. Open it only if
you need to change a port, switch on the low-memory mode, or change the Eureka timings (see section 5).

### Step 7 - Start everything (one command)

```bash
docker compose up -d --build
```

What happens:

* **First time on this computer: 5-15 minutes.** Docker downloads about 3 GB of images (the Elastic images are the
  largest and can be slow on a weak connection) and compiles all the Java services inside a container.
  You will see a lot of text scroll by. This is normal.
* **Every later start takes about 1-2 minutes** (the images are already there).
* If the download stops because of a network problem, just run the same command again. It continues where it stopped.

### Step 8 - Check that it is running

```bash
docker compose ps
```

You are ready when every Java service says **`Up ... (healthy)`**. A healthy list looks like this:

| Container | Expected status |
|---|---|
| `eureka-server`, `api-gateway`, `product-service-1/2/3`, `order-service`, `web-bff`, `mobile-bff`, `redis`, `elasticsearch`, `kibana` | `Up ... (healthy)` |
| `lab-ui`, `lab-control`, `logstash`, `prometheus`, `grafana` | `Up ...` (no health text; that is correct) |
| `es-init`, `kibana-setup` | `Exited (0)`: these two helpers do one job and stop. **`Exited (0)` is correct** |

Notes: each Java service needs about **40 seconds** after its container starts. **Kibana** is the slowest
(2-3 minutes on the very first start). If a service says `(health: starting)`, wait and run `docker compose ps` again.

### Step 9 - Open the lab console

Open **http://localhost:8800** in your browser.

1. In the left sidebar find **"Signed in as"** and choose **alice** (several lessons need a logged-in user).
2. Look at the **live system map** on the right: all the dots should be **green**.
3. Open **"Welcome to the lab"**; its table "Is everything running?" shows the state of every component.

### Step 10 - Quick test from the terminal (optional)

```bash
curl http://localhost:8880/api/products/whoami
```

On Windows PowerShell use `curl.exe` instead of `curl`. You should get a small JSON answer containing an
`instanceId` such as `product-2`. Run it a few times: the answer rotates between `product-1`, `product-2` and `product-3`.
That is load balancing, the subject of lessons 4-6.

**You are done.** Continue with lesson 1 in the console.

---

## 4. Using the lab

Work through the lessons in the left sidebar from top to bottom. Each takes 15-30 minutes. The map on the right shows
the real state of the containers and animates your requests.

* **Heal button:** after any drill that stopped or froze containers, press **"Heal: restart anything that is down"** in the sidebar.
  The lab is safe to break; nothing is lost.
* **Light / dark theme:** the button at the bottom of the sidebar. Use the browser zoom (Ctrl and +) on a projector.
* **Demo users** (for the lessons that need a login):

| User | Token | Roles |
|---|---|---|
| `alice` | `token-alice-123` | USER |
| `bob` | `token-bob-456` | USER, ADMIN |
| `carol` | `token-carol-789` | GUEST (gets `403` on the orders API) |

### The 12 lessons in 30 seconds each, with the terminal equivalent

You can do everything in the console. If you also want to see the same thing with `curl`, use these commands
(macOS, Linux and Git Bash; see the PowerShell note below the table).

| # | In the console | Same thing in a terminal |
|---|---|---|
| 1 | Press **Place an order and trace it**: one request id shows lines from gateway, order-service and product-service. Open **Errors only** in Kibana | `docker compose logs -f logstash` · `curl "http://localhost:9200/_cat/indices/spring-logs-*?v"` · Kibana: http://localhost:5601 |
| 2 | **Actuator explorer**: choose a service, press `health`, `prometheus text` | `curl http://localhost:8081/actuator/health` · `curl http://localhost:8081/actuator/metrics/jvm.memory.used` · `curl http://localhost:8081/actuator/prometheus` |
| 3 | **Start traffic**, use the PromQL playground; **Freeze** product-service-2 and watch the `InstanceDown` alert | Prometheus http://localhost:9099 · Grafana http://localhost:3030 (no login) |
| 4 | **Send 9 calls** in the client-side and the server-side experiment | `curl "http://localhost:8084/api/orders/client-side-demo?n=9"` (client-side) · `curl http://localhost:8880/api/products/whoami` (server-side, repeat it) |
| 5 | **Stop (graceful)** vs **Kill (crash)** on product-service-3; read the timeline | Eureka dashboard: http://localhost:8761 |
| 6 | Switch **Round-robin / Random**, send 9 then 300 requests | `curl -X POST http://localhost:8880/lab/lb/random` ... `curl -X POST http://localhost:8880/lab/lb/round-robin` |
| 7 | **Start all three probes**, then **Health DOWN**, **Kill**, **Freeze** | `curl -X POST http://localhost:8082/admin/health/down` (and `/up`) · `docker compose pause product-service-2` / `unpause` · `docker compose kill product-service-2` then `docker compose up -d product-service-2` |
| 8 | Read the route table, press the presets | `curl "http://localhost:8880/api/products?preview=true"` · `curl -H "Cookie: lab-beta=true" http://localhost:8880/api/products/whoami` · `curl -i http://localhost:8880/dsl/whoami` · `curl http://localhost:8880/actuator/gateway/routes` |
| 9 | Call `/api/products/echo` as anonymous / alice, with and without the forged header; `/api/orders` as anonymous (401), carol (403), alice (200) | `curl -H "Authorization: Bearer token-alice-123" -H "X-User-Id: admin" http://localhost:8880/api/products/echo` · `curl -i http://localhost:8880/api/orders` · `curl http://localhost:8880/masked/products` |
| 10 | **Burst of 10** on the Standard and Premium plan, look at the Redis keys, stop redis | `docker exec -it redis redis-cli --scan --pattern 'request_rate_limiter*'` |
| 11 | **Send 30 requests**, kill an instance, **Compare retry vs no retry** | `curl http://localhost:8880/noretry/products/whoami` (the route without Retry) |
| 12 | **Load the home screen** at 100 ms and 300 ms latency | `curl -H "Authorization: Bearer token-alice-123" http://localhost:8880/bff/web/home` · `.../bff/mobile/home` · add `-H "X-Client-Type: mobile"` to `http://localhost:8880/bff/home` |

> **PowerShell:** use `curl.exe` instead of `curl`, and for a repeated call use
> `1..6 | ForEach-Object { curl.exe -s http://localhost:8880/api/products/whoami }`. In Git Bash the commands above work unchanged.

### For the teacher

* Before class: `docker compose up -d`, open the console, press **Heal**, sign in as **alice**.
* Suggested order (about 4 hours): lessons 1-3 observe (70 min), 4-7 discover (85 min), 8-11 gateway (85 min), 12 pattern (20 min).
* The **Check yourself** questions work well as cold-call questions. Every drill can be undone with **Heal**.

---

## 5. Options you can change

All settings live in the file **`.env`**. After editing and saving it, run `docker compose up -d` again;
Docker recreates only what changed. The console reads its port list at start-up, so its links update by themselves.

| Setting | Default | Meaning |
|---|---|---|
| `COMPOSE_PROFILES` | `elk,metrics` | which optional stacks start with the core: `elk` (Elasticsearch, Logstash, Kibana), `metrics` (Prometheus, Grafana). Empty = core only |
| `BIND_ADDR` | `127.0.0.1` | `127.0.0.1` = only this computer; `0.0.0.0` = reachable from other devices on the network |
| `UI_PORT` | 8800 | the lab console |
| `GATEWAY_PORT` | 8880 | the API gateway |
| `EUREKA_PORT` | 8761 | Eureka dashboard |
| `KIBANA_PORT` | 5601 | Kibana |
| `GRAFANA_PORT` | 3030 | Grafana |
| `PROMETHEUS_PORT` | 9099 | Prometheus |
| `ES_PORT` | 9200 | Elasticsearch |
| `REDIS_PORT` | 6380 | Redis |
| `EUREKA_LEASE_EXPIRATION` | 6 | seconds without a heartbeat before Eureka evicts an instance (`90` = real default) |
| `EUREKA_SELF_PRESERVATION` | true | Eureka's self-preservation switch |
| `EUREKA_RENEWAL_THRESHOLD` | 0.85 | fraction of expected heartbeats that must arrive |

The three product services, order-service and the two BFFs are also published on ports **8081-8086** (see `docker-compose.yml`).

### 5.1 Low-memory mode

For computers with 8 GB of RAM or less:

1. In `.env` set `COMPOSE_PROFILES=` (leave it empty).
2. Run `docker compose up -d`. You get the core system (lessons 4-12) in about **1.6 GB** of container memory.
   Lessons 1-3 then show a notice "ELK / metrics is not running".
3. Start the optional parts **one at a time, only when needed**:
   ```bash
   docker compose --profile metrics up -d      # Prometheus + Grafana   (about 0.4 GB)
   docker compose --profile elk up -d          # Elasticsearch, Logstash, Kibana (about 2.1 GB)
   ```
4. Stop them again when you are done with the lesson:
   ```bash
   docker compose stop elasticsearch logstash kibana
   docker compose stop prometheus grafana
   ```

This also spreads the large downloads over time if your internet is slow.

### 5.2 A port is already in use

Error: `Bind for 127.0.0.1:8880 failed: port is already allocated` (or "address already in use").
Open `.env`, change that port (`UI_PORT`, `GATEWAY_PORT`, `GRAFANA_PORT`, ...) to a free number, and run `docker compose up -d`.

You can also change a port for one run only, without editing any file:

```bash
GATEWAY_PORT=9000 docker compose up -d                  # macOS / Linux / Git Bash
$env:GATEWAY_PORT=9000; docker compose up -d            # PowerShell
```

### 5.3 Show the lab to other devices in the classroom

In `.env` set `BIND_ADDR=0.0.0.0` and run `docker compose up -d`. Students on the same network open
`http://<your-computer-ip>:8800`.

> **Warning:** the console can stop and kill containers. Do this only on a network you trust.

### 5.4 Eureka timing and the self-preservation drill (lesson 5)

The lab shortens Eureka's timers by about 10x so that a lesson takes seconds. To see **self-preservation** you need
Eureka's real 90-second lease. The whole drill takes about 6 minutes, so start it before a break:

1. In `.env` set `EUREKA_LEASE_EXPIRATION=90` and run `docker compose up -d`. All services restart; wait about a minute until
   the lesson says "slow-lease mode".
2. In lesson 5 press **Freeze** on **four** of the seven registered services (the three product instances and order-service).
3. Watch the meter. After about **2 minutes** the badge turns red: **SELF-PRESERVATION ACTIVE**. The frozen services stay
   listed as `UP` although they are dead.
4. Unfreeze them. When finished set `EUREKA_LEASE_EXPIRATION=6` again and run `docker compose up -d`.

Why four and not two? This Eureka version counts each heartbeat about twice, so more than half of the services must go quiet
before the count falls under the 85% threshold.

---

## 6. Stop, restart and clean up

| Command | What it does |
|---|---|
| `docker compose stop` | stops the containers, keeps them and the stored logs |
| `docker compose start` | starts them again (fast) |
| `docker compose down` | removes the containers (keeps the Elasticsearch volume) |
| `docker compose down -v` | removes the containers **and** the stored logs: a completely fresh start |
| `docker compose down -v --rmi local` | ... and also the images built by this project |
| `docker builder prune` | frees the Maven build cache (optional) |

If you used the [low-memory mode](#51-low-memory-mode) and started optional parts with `--profile`, add
`--profile "*"` so these commands also include them, for example `docker compose --profile "*" down`.

---

## 7. Change the code and try again

Everything the lessons show is real code you can edit. After a change in a Java file or an `application.yml`, rebuild only that service:

```bash
docker compose up -d --build api-gateway
docker compose up -d --build product-service-1 product-service-2 product-service-3
```

Files under `ui/html` are served live: edit, press F5, no rebuild needed.

Ideas for exercises:

* `api-gateway/src/main/resources/application.yml`: add a route, change `burstCapacity`, add a predicate (Query, Header, Method) and test it in lesson 8.
* `api-gateway/src/main/java/com/lab/gateway/filter/`: write a new `GlobalFilter` that adds a response header.
* `infra/elk/logstash/pipeline/logstash.conf`: tag slow requests or drop DEBUG events, then `docker compose restart logstash`.
* `infra/prometheus/alerts.yml`: add an alert, then `curl -X POST http://localhost:9099/-/reload`.
* Make the load balancer prefer the same instance and measure the difference in lesson 6.

---

## 8. Working with Git (for students)

You cloned the repository in step 5, so you already have a full copy with its history.

### Get the latest version of the lab

```bash
git pull
docker compose up -d --build
```

### Save your own experiments

```bash
git status                       # what did I change?
git diff                         # show the exact changes
git add .                        # choose everything for the next commit
git commit -m "Describe what you changed"
```

### Share a change (Pull Request)

The `main` branch belongs to the course. To suggest a change (if the teacher has added you as a **collaborator** you can
skip the fork: clone the course repository directly, create your branch, and push it with `git push origin my-first-change`):

1. On GitHub open the repository page and click **Fork** (this makes your own copy).
2. Clone **your fork** instead of the course repository:
   ```bash
   git clone https://github.com/<your-github-name>/Spring-Cloud-Observability.git
   cd Spring-Cloud-Observability
   ```
3. Make a branch for your change:
   ```bash
   git checkout -b my-first-change
   ```
4. Edit files, test with `docker compose up -d --build <service>`, then:
   ```bash
   git add .
   git commit -m "Add a route for /api/catalog"
   git push origin my-first-change
   ```
5. On GitHub click **Compare & pull request** and describe your change.

To keep your fork up to date with the course repository:

```bash
git remote add upstream https://github.com/saaheilKalyani/Spring-Cloud-Observability.git
git fetch upstream
git merge upstream/main
```

### What not to commit

* **Local port changes.** If you changed `.env` only to fit your computer, do not commit it. Better: copy it to `.env.local`
  (already ignored by Git), edit the copy, and start with `docker compose --env-file .env.local up -d`.
* Build output and editor folders (`target/`, `.idea/`, `.vscode/`): they are in `.gitignore`.
* Personal Docker settings: put them in `docker-compose.override.yml` (also ignored).

---

## 9. Troubleshooting

| Problem | Likely reason | What to do |
|---|---|---|
| `docker: unknown command: docker compose` | old Docker without Compose v2 | install Docker Desktop, or the Compose plugin on Linux (docs.docker.com/compose/install) |
| `Cannot connect to the Docker daemon` | Docker is not running | start Docker Desktop and wait for "Engine running" |
| Linux: `permission denied ... /var/run/docker.sock` | your user is not in the `docker` group | `sudo usermod -aG docker $USER`, then log out and in |
| `Bind for 127.0.0.1:XXXX failed: port is already allocated` | another program uses that port | see [5.2](#52-a-port-is-already-in-use) |
| The first start is very slow or stops during a download | slow or interrupted network | run `docker compose up -d --build` again; it continues. Or use [low-memory mode](#51-low-memory-mode) to download in parts |
| Containers keep restarting, everything is very slow, `Exited (137)` | not enough memory | give Docker 6 GB (step 3) or use [low-memory mode](#51-low-memory-mode) |
| Linux: Elasticsearch exits with "max virtual memory areas ... too low" | kernel setting | `sudo sysctl -w vm.max_map_count=262144` |
| Windows (Hyper-V backend): `invalid mount config` / drive not shared | the project drive is not shared with Docker | Docker Desktop → Settings → Resources → File sharing → add the drive (not needed with WSL 2) |
| The console says "Eureka is not reachable" or shows no services | services need about 40 s to start and register | wait, then check `docker compose ps` and `docker compose logs eureka-server` |
| A dot on the map is **red** after a drill | the container was stopped on purpose | press **Heal** in the sidebar, or `docker compose up -d` |
| Lesson 1 or 3 says "ELK / metrics is not running" | the optional profile is off | `docker compose --profile elk up -d` or `docker compose --profile metrics up -d`; Kibana needs 2-3 minutes |
| No log lines in the lesson 1 viewer | logs need 1-3 s to travel through Logstash | press a button in experiment 1 first; check `docker compose logs logstash` |
| A Grafana panel is empty | no traffic yet | start traffic in lesson 3 and wait 15 s (Prometheus scrapes every 5 s) |
| A shell script fails with `^M` or "bad interpreter" | Windows line endings in a `.sh` file | re-clone with Git for Windows defaults; `.gitattributes` normally prevents this |

Useful commands:

```bash
docker compose ps                          # containers and health
docker compose logs -f api-gateway         # follow one service's log
docker compose logs --tail 50 eureka-server
docker compose restart product-service-1
docker stats --no-stream                   # memory use per container
```

---

## 10. Architecture, ports and repository layout

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

### Ports (host side, all changeable in `.env`)

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

### Repository layout

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
Spring Cloud Microservices Lab Student Guide (12 Topics).pdf    the written student guide
```

### Technology versions

Java 21 - Spring Boot 3.5.16 - Spring Cloud 2025.0.3 (Gateway 4.3.5, Netflix Eureka 4.3.3, LoadBalancer 4.3.3) -
Elasticsearch / Logstash / Kibana 8.15.5 - Prometheus 2.51 - Grafana 10.4 - Redis 7 - nginx 1.27 - Python 3.12.

---

## 11. Deliberate teaching shortcuts

These make the lab easy to use. **Do not copy them into production.**

* Eureka lease, heartbeat and cache timers are about 10x faster than the defaults so lessons take seconds
  (each service's `application.yml` lists the production defaults in `[brackets]`).
* Elasticsearch security is off, Grafana allows anonymous admin, Redis has no password.
* `lab-control` mounts `/var/run/docker.sock`. That is full control of Docker. Published ports bind to `127.0.0.1`
  by default (`BIND_ADDR` in `.env`); keep it that way unless you are on a trusted classroom network.
* Authentication is a fixed table of demo tokens (`token-alice-123` ...), not a real identity provider.
* The `X-Plan` and `X-Client-Id` headers are controlled by the client: fine for a lab, never for real rate-limit decisions.
