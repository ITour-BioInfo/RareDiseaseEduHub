# GitHub setup — browser steps

## Connect and allow workflows

1. In Codex Cloud, choose GitHub, open repository access, and add `ITour-BioInfo/RareDiseaseEduHub`.
2. In the repository, open **Settings → Actions → General** and enable Actions.
3. Under **Workflow permissions**, select **Read and write permissions** and enable **Allow GitHub Actions to create and approve pull requests**. The monitor still creates drafts and never approves them.
4. Keep Pages disabled. No `OPENAI_API_KEY` or external API secret is needed.

## Repository variables

Open **Settings → Secrets and variables → Actions → Variables** and add:

```text
CATALOG_TIMEZONE=Europe/Sofia
CATALOG_USER_AGENT=RareDiseaseEducationCatalogueBot/1.0
CATALOG_CONTACT=<public correction email or contact-page URL>
SITE_URL=<production base URL only when creating a release>
BASE_PATH=/
```

Variables are public configuration, not a place for confidential data.

## Run and review

1. Open **Actions → CI → Run workflow** and confirm all checks pass.
2. Open **Actions → Catalogue monitor → Run workflow** with `mode: dry-run` and `open_pr: false`; inspect the summary and report artifact.
3. Run again with `mode: morning` and `open_pr: true` only after variables are ready.
4. Open the draft pull request. If GitHub shows **Approval required**, use the pull-request checks panel to approve the workflow run.
5. Read every field-level source, excerpt, confidence, conflict, validation result, build result, and accessibility result. Merge only after editorial approval.
6. After merge, open the **Publication bundle** run and download `rare-disease-education-hub-publication-bundle`.

## Notifications, usage, and cost

Open **Settings → Notifications** for Actions notifications. Open account **Settings → Billing and licensing → Usage** to inspect Actions minutes. Create an Actions additional-spend budget of `0`, enable **Stop usage when the budget is reached**, and enable usage alerts.

The design uses one standard Ubuntu job, conditional requests, bounded 25-minute runs, and short artifacts. Two daily 25-minute maximum schedules would cap near 25 hours/month, but normal conditional runs should be materially lower. Browser installation/build dominates CI use; publication occurs only after merges.

## Disable, re-enable, and recover

To disable the monitor, open **Actions → Catalogue monitor → … → Disable workflow**. Re-enable from the same menu. GitHub may disable schedules after prolonged repository inactivity; open the workflow and choose **Enable workflow**, then run a dry run.

To recover `automation-state`, first download the latest monitor artifact. Delete or rename only that branch in **Branches**, run the monitor in dry-run mode, inspect the new compact state, and then run a live mode. Canonical data remains on `main`; loss of state must never archive records.
