# Blue/Green Deployment Runbook

1. Pull latest commit on production host.
2. Build/start GREEN stack on alternate port.
3. Run health checks against GREEN.
4. Run smoke flow: create event -> scan -> dashboard.
5. Switch Nginx upstream from BLUE to GREEN.
6. Keep BLUE for quick rollback until GREEN is stable.
7. If failure, switch traffic back to BLUE.
