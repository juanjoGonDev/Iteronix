# Browser acceptance coverage

`pnpm test:e2e:coverage` is the required browser acceptance gate for changes to authenticated workflow and asset flows. Each scenario runs on desktop, tablet, and mobile Chromium profiles.

The minimum acceptance coverage is one successful authenticated workflow-canvas load and one successful asset-catalog load per viewport. The test fails on every `401` response from workflow or asset endpoints, so session transport regressions cannot pass as visual-only tests.

CI starts the production Docker API with an isolated PostgreSQL database and the built web UI before this gate. Failures retain Playwright traces, videos, screenshots, and the HTML report.
