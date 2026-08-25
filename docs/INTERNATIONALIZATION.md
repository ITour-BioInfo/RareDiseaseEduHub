# Internationalization

Bulgarian (`bg`) is the default locale at `/`; English (`en`) is under `/en/`. Interface strings are keys in `src/i18n/messages`. Translation validation compares every locale key, controlled vocabulary label, and resource locale record.

Resource translations are separate from factual records. Original official titles remain accessible with correct `lang` metadata. Missing Bulgarian content falls back to source text and is explicitly labelled; draft content is never presented as reviewed. Provider names change only when an official localized name is documented.

The language switcher is a normal link, preserves resource identity on detail pages, supplies `hreflang`, and never redirects from browser language. `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.ListFormat` format locale-sensitive values.

To add a locale, add its message dictionary, route map, translation directory and schema allowance; create a locale record for every canonical record; add localized pages, metadata, sitemap alternates and tests; then run translation coverage checks.
