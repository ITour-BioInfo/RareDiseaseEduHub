# Publishing

Publication is intentionally manual.

1. Review and merge the approved pull request.
2. Wait for CI and the Publication bundle workflow.
3. Download and verify the named artifact and its `SHA256SUMS.txt`.
4. Confirm Bulgarian `/`, English `/en/`, compatibility route, resource detail, JSON, both CSV files, sitemap, canonical links, and 404 behaviour in a staging location.
5. Save a new version in the existing hosting project, review it, and deploy only after approval.
6. Verify the public URL and downloads; retain the previous version for rollback.

`SITE_URL` and `BASE_PATH` must describe the chosen host. Never hand-edit `dist` or generated exports.
