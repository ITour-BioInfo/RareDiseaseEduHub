# Catalogue automation

GitHub Actions scans configured official provider listings every morning for new course, webinar, workshop, programme, and training links. It compares normalized URLs with the canonical catalogue, writes new-link proposals, and opens or updates one draft pull request for human review. It does not perform unrestricted web search and never calls OpenAI.

The evening priority run revisits known resources with a confirmed date in the next 60 days. It compares each normalized official page with the previous successful snapshot and creates a human-review proposal when structured titles or dates—or the page content itself—change. A manual run can check one known record. Scheduled checks never add, merge, publish, or remove a factual record automatically.

The fetcher allows only HTTP(S), resolves destinations before each request, blocks private and metadata addresses, revalidates redirects, limits response size and redirects, applies timeouts and bounded retry, identifies itself, and supports conditional request metadata. Source HTML remains untrusted plain input.

New links and changed content produce short, field-level evidence proposals. Ambiguous years, conflicting official sources, substantial title/provider changes, archive-only evidence, edition ambiguity, and changes affecting more than ten percent of records require manual review. One failed request cannot archive a record.

Operational state belongs only on the orphan `automation-state` branch. Each scheduled run restores that snapshot before checking sources, merges the selected results into it, and then persists the complete state with safe force-with-lease replacement. Reviewable changes use `automation/catalog-updates` and one draft pull request. No workflow approves, merges, or deploys.
