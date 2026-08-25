# Publishing

Publication is intentionally manual.

1. Review and merge the approved pull request.
2. Wait for CI and the Publication bundle workflow.
3. Download and verify the named artifact and its `SHA256SUMS.txt`.
4. Run `pnpm sites:build` and confirm Bulgarian `/`, English `/en/`, the compatibility route, a resource detail page, JSON, both CSV files, the sitemap, canonical links, and 404 behaviour.
5. Preserve the project ID in `.openai/hosting.json`, push the exact source state, and save a new version in the existing Sites project.
6. Review and deploy the approved version, then verify the public URL and downloads. Retain the previous version for rollback.

The Sites worker replaces the portable build origin with the deployment origin at request time. `BASE_PATH` must still describe the chosen host. Never hand-edit `dist` or generated exports.
