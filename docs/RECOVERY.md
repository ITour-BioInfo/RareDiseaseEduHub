# Recovery

Canonical records and translations are recoverable from the reviewed default branch. Generated exports and `dist` are recreated with validation, export, and build commands. Publication bundles retain checksums and a checklist for seven days.

If automation fails, disable the schedule, preserve logs and the five-day report artifact, and run fixture mode. Do not change facts because of technical failures. If `automation-state` is corrupt, recreate it from a dry run as described in `docs/GITHUB_SETUP.md`; never copy state into canonical records.

For a bad publication, restore the last approved hosting version or prior verified bundle, verify routes and downloads, then document the rollback in the change log. DNS and repository visibility are never changed by automation.
