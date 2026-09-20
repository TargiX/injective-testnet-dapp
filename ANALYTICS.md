# Website traffic

Uses the shared Websites PostHog project (572099). Set `NUXT_PUBLIC_POSTHOG_KEY` to its public ingestion token in the Vercel production environment.

Only `injective.ilyamoskovkin.com` collects pageviews and page leaves. Preview/local hosts and Do Not Track visitors are excluded. Events carry `app_id=injective-testnet-dapp` and `environment=production`; anonymous IDs and persistence are site-specific. No session replay, autocapture, form values, wallet IDs, or chat content are collected. URL queries and fragments are removed; standard campaign attribution remains available.

To disable, remove the production token and redeploy. Existing PostHog history is unaffected.
