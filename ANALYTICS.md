# Website traffic

Self-hosted Umami: https://stats.phosphene.cc. Website: Injective; ID `18d0e53c-df2b-4d12-ac02-eb05216735ec`.

Production hostname: `injective.ilyamoskovkin.com`. No analytics token is needed in application environment variables. Only pageviews are sent. Known static paths are retained; other paths become `/other`. Titles are fixed product names, referrers contain origins only, and URL queries/fragments are omitted. No identities, form values, wallet addresses, chat content, custom events, replay, or performance capture. DNT/GPC, recovery links, localhost and preview hosts prevent tracking.

PostHog client and server sending paths have been removed. Existing history in the Websites PostHog project (572099) is retained; unused ingestion tokens are not revoked because other clients may share them. Historical events are not imported into Umami. Contact delivery behavior is unchanged; former contact-form analytics are not collected.

Run privacy checks with `node --test tests/umami-traffic.check.mjs` and build before deployment. After deployment verify a tagged production browser pageview appears in Umami and no PostHog request is sent. Remove the traffic loader and redeploy to disable.
