# Test harness

Fakes every later phase builds on. Everything reads time from one `FakeClock`.

- `FakeTelegram`: a Bot API server; grammY takes `apiRoot`.
- `FakeModelServer`: answers Jev (`POST <endpoint>/decisions`, TypeSafe's decision format, per
  `decisions.md` 2026-11-18; the call needs a bearer key, a model, a state and at least one question,
  else 401/400), Ollama (`POST /api/chat`, `/api/generate`, `GET /api/tags`) and frontier
  (`POST /v1/messages`) calls from a scenario. Reply timestamps come from the injected clock.
- `buildFixtureVault`: lays Time Garden (a zip or a directory) under `1-Roots/`.
- `expectGolden`: golden-file helper.

## Scenario file

A JSON file `{ "rules": [...] }`. The harness's own format; the documents define none. Each rule:

| Key        | Meaning                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `lane`     | `jev`, `ollama` or `frontier`                                                                                    |
| `contains` | optional string or list; every string must appear in the request body                                            |
| `reply`    | a string, or a JSON value serialised into the reply text; for `jev`, the `answers` object keyed by question name |
| `status`   | optional HTTP status, default 200                                                                                |
| `times`    | optional; the rule answers this many calls, then the next rule is used                                           |
| `tokens`   | optional `{ input, output }` counts reported in the reply (`usage` for Jev)                                      |

The first matching rule answers. A call no rule matches gets a 500 and is listed in `unmatched`.
