# sentry-quinn Deployment Guide

## Prerequisites
- Cloudflare account with Workers enabled
- `wrangler` CLI installed globally: `npm install -g wrangler`
- Authenticated to Cloudflare: `wrangler login`

## 1. Verify TypeScript Compiles
```bash
npx tsc --noEmit
```

## 2. Deploy to Cloudflare Workers
```bash
wrangler deploy
```

## 3. Configure Secrets (One-time Setup)
```bash
# ServiceTitan OAuth Credentials
wrangler secret put ST_CLIENT_ID
# Paste: cid.eo3vcy5zs1ncsf2hczeyk1he8

wrangler secret put ST_CLIENT_SECRET
# Paste: (from .env or secure storage)

# Make.com Webhooks
wrangler secret put MAKE_WEBHOOK_TRANSCRIPT
# Paste: https://hook.us2.make.com/jww7ia2xa1ewqgwmcgqhbxcrlpacr2kn

wrangler secret put MAKE_WEBHOOK_ESCALATE
# Paste: https://hook.us2.make.com/xg13i5sz4crwlvcyj5cbhsono1h8ryft
```

## 4. Verify Deployment
```bash
curl https://sentry-quinn.lpeluso.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "sentry-quinn",
  "version": "1.0.0",
  "timestamp": "2026-03-22T23:00:00.000Z"
}
```

## 5. Update Retell Agent Tool URLs
Go to Retell dashboard → Miss Dawn agent (agent_042204c3bac2eecc1fa37d2ffa):

Update each tool's POST URL to:
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/appointments`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/job`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/customer`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/location`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/pricebook`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/save-debrief`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/escalate`
- `https://sentry-quinn.lpeluso.workers.dev/api/quinn/webhook`

## 6. Activate Make.com Scenarios
- QSC-QUINN-TRANSCRIPT (4485997) → Enable
- QSC-QUINN-DIGEST (4485998) → Enable

## 7. Test with Real Tech Call
1. Assign phone number to Miss Dawn agent
2. Have technician call in
3. Go through full 8-question debrief
4. Verify D1 quinn_debriefs table has new record
5. Check OneDrive/Plumbing for transcript text file

## Troubleshooting

**502 Bad Gateway on /health:**
- Check wrangler.toml has correct account_id
- Verify D1 database binding is correct

**ST API 401 Unauthorized:**
- Secrets not set or incorrect
- Run `wrangler secret list` to verify

**D1 Insert Failed:**
- Verify quinn_debriefs table exists in taylor-ai D1
- Check SQL schema matches saveDebrief function

**Make.com Webhook Not Firing:**
- Verify webhook URLs are correct
- Check Make.com scenario is active
