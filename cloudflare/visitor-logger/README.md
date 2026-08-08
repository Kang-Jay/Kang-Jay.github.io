# Visitor logs

Read the latest visits from the repository root:

```powershell
npx wrangler d1 execute kangjay-visitor-logs --remote --config cloudflare/visitor-logger/wrangler.jsonc --command "SELECT visited_at, page, visitor_id, ip, country, region, city FROM visits ORDER BY id DESC LIMIT 100"
```

The scheduled Worker deletes records older than 30 days each day.
