#!/bin/sh
# One-shot job: create the Elasticsearch INDEX TEMPLATE before the first log line arrives.
# Why a template? Without it Elasticsearch guesses field types from the first document; one wrong guess
# (e.g. "status" first seen as text) breaks every later document. A template makes the mapping explicit.
set -e
ES=http://elasticsearch:9200

echo "[es-init] waiting for Elasticsearch ..."
until curl -sf "$ES/_cluster/health" >/dev/null; do sleep 2; done

echo "[es-init] creating index template spring-logs ..."
curl -sf -X PUT "$ES/_index_template/spring-logs" -H 'Content-Type: application/json' -d '{
  "index_patterns": ["spring-logs-*"],
  "priority": 200,
  "template": {
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": {
      "dynamic_templates": [
        { "strings_as_keywords": {
            "match_mapping_type": "string",
            "mapping": { "type": "keyword", "ignore_above": 2048 } } }
      ],
      "properties": {
        "@timestamp":  { "type": "date" },
        "message":     { "type": "text" },
        "stack_trace": { "type": "text" },
        "status":      { "type": "integer" },
        "durationMs":  { "type": "long" }
      }
    }
  }
}'
echo
echo "[es-init] done."
