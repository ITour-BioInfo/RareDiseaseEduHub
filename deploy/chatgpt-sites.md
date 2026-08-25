# Current ChatGPT Site publication

The existing ChatGPT Sites project is identified by `.openai/hosting.json`. Preserve that project ID for every release so the production URL remains stable.

Run `pnpm sites:build` to create and validate the Sites package in `dist`. Push the exact source state, save a new Sites version from that commit, review it, and deploy the approved version. GitHub Actions validates the package but does not deploy it.

The production site is public at <https://rare-disease-edu-hub.itourtourikov.chatgpt.site/>. After each deployment, verify the Bulgarian and English home pages, representative resource pages, downloads, sitemap, canonical URLs, and 404 behaviour.
