# Test harness

Fakes every later phase builds on. Everything reads time from one `FakeClock`.

- `FakeTelegram`: a Bot API server; grammY takes `apiRoot`.
- `FakeModelServer`: answers Ollama (`POST /api/chat`, `/api/generate`, `GET /api/tags`) and frontier
  (`POST /v1/messages`) calls from a scenario. Reply timestamps come from the injected clock.
- `buildFixtureVault`: lays Time Garden (a zip or a directory) under `1-Roots/`.
- `expectGolden`: golden-file helper.

**Jev has no lane yet.** The documents name Jev's endpoint, model and key but not its wire format,
so the harness does not guess one. It is added once Jev's published API shape is known.

## Scenario file

A JSON file `{ "rules": [...] }`. The harness's own format; the documents define none. Each rule:

| Key        | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `lane`     | `ollama` or `frontier`                                                 |
| `contains` | optional string or list; every string must appear in the request body  |
| `reply`    | a string, or a JSON value serialised into the reply text               |
| `status`   | optional HTTP status, default 200                                      |
| `times`    | optional; the rule answers this many calls, then the next rule is used |
| `tokens`   | optional `{ input, output }` counts reported in the reply              |

The first matching rule answers. A call no rule matches gets a 500 and is listed in `unmatched`.
