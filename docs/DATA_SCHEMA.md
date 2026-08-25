# Data schema

Each file under `data/records/<id>.json` is a canonical source-fact record validated by Zod and documented by `data/schema/record.schema.json`.

Dates distinguish event, arrival, application, registration, availability, recurrence, retirement, and archive concepts. Unknown values are `null`; missing years are never inferred. Source timezone is retained and `Europe/Sofia` is only the operational timezone.

Resource translations live under `data/locales/<locale>/records/<id>.json`. States are `missing`, `draft`, `reviewed`, and `official`. Original titles and provider names remain canonical. Generated exports are derived and disposable.

Proposals contain a stable ID, record, check time, official URL, source kind, field, old and proposed values, short plain-text evidence, confidence, and mandatory review marker.
