#!/bin/sh
# One-shot job: make Kibana usable the moment it opens.
#   - a DATA VIEW ("index pattern") called spring-logs-*  (id: spring-logs) with @timestamp as the time field
#   - three SAVED SEARCHES students can open from Discover
# Check what happened with:  docker compose logs kibana-setup
set -e
KB=http://kibana:5601
H1="kbn-xsrf: true"
H2="Content-Type: application/json"

echo "[kibana-setup] waiting for Kibana ..."
until curl -sf "$KB/api/status" | grep -q '"level":"available"'; do sleep 3; done

# post <label> <path> <json>   -> prints the HTTP status, and the body when it is not 200
post() {
  code=$(curl -s -o /tmp/resp.json -w '%{http_code}' -X POST "$KB$2" -H "$H1" -H "$H2" -d "$3")
  echo "[kibana-setup] $1: HTTP $code"
  if [ "$code" != "200" ]; then cat /tmp/resp.json; echo; fi
}

post "data view spring-logs-*" "/api/data_views/data_view" '{
  "override": true,
  "data_view": { "id": "spring-logs", "title": "spring-logs-*", "name": "Spring logs", "timeFieldName": "@timestamp" }
}'

post "default data view" "/api/data_views/default" '{ "data_view_id": "spring-logs", "force": true }'

save_search() {  # id, title, KQL, columns-json
  post "saved search $2" "/api/saved_objects/search/$1?overwrite=true" "{
    \"attributes\": {
      \"title\": \"$2\",
      \"columns\": $4,
      \"sort\": [[\"@timestamp\", \"desc\"]],
      \"kibanaSavedObjectMeta\": {
        \"searchSourceJSON\": \"{\\\"query\\\":{\\\"query\\\":\\\"$3\\\",\\\"language\\\":\\\"kuery\\\"},\\\"filter\\\":[],\\\"indexRefName\\\":\\\"kibanaSavedObjectMeta.searchSourceJSON.index\\\"}\"
      }
    },
    \"references\": [{ \"id\": \"spring-logs\", \"name\": \"kibanaSavedObjectMeta.searchSourceJSON.index\", \"type\": \"index-pattern\" }]
  }"
}

save_search lab-all-logs       "Lab - all service logs"    "*"                                    '["service","level","message","requestId"]'
save_search lab-errors-only    "Lab - ERRORS only"         "level : ERROR"                        '["service","instance","message","requestId"]'
save_search lab-gateway-access "Lab - gateway access log"  "service : api-gateway and status >= 0" '["level","message","status","durationMs","route"]'

echo "[kibana-setup] done."
