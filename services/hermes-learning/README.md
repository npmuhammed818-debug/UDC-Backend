# AKIF Hermes Learning Service

AKIF uses Hermes Agent as an optional, isolated self-improvement layer.

The service is deliberately separate from the UDC API and AKIF intelligence worker. Hermes may learn procedures and stage skill/memory improvements, but it has no direct authority to approve companies, deals, compliance, banking, documents, payments or shipments.

## Runtime

The deployment uses the official Nous Research Hermes Agent Docker image pinned to the stable release `v2026.9.14`.

State is stored in the `akif-hermes-data` Docker volume. The API is exposed only on host loopback by default.

Required:

- `HERMES_AKIF_API_KEY`: strong random bearer token for UDC -> Hermes calls.
- A Hermes-supported model provider configured in the persistent Hermes profile before learning runs can execute.

## Learning controls

Both skill and memory writes are approval-gated.

Hermes stages proposed skill writes under its persistent data directory. Review through UDC's admin Hermes endpoints or directly through Hermes using:

- `/skills pending`
- `/skills diff <id>`
- `/skills approve <id>`
- `/skills reject <id>`

AKIF should learn durable research procedures and corrections, not transaction decisions.

## Start

```bash
export HERMES_AKIF_API_KEY="$(openssl rand -hex 32)"
docker compose -f docker-compose.hermes.yml up -d
```

Before production use, configure a model provider in Hermes and keep the API reachable only from the UDC backend or a trusted private network.
