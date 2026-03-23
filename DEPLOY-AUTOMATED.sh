#!/bin/bash
# Project Dawn - Sentry Quinn Automated Deployment
# This script deploys sentry-quinn to Cloudflare Workers with all secrets

set -e

echo "🚀 Sentry Quinn Deployment Script"
echo "=================================="
echo ""

# Get Cloudflare API Token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN not set"
  echo ""
  echo "To deploy, set your Cloudflare API token:"
  echo "  export CLOUDFLARE_API_TOKEN='<your-token>'"
  echo "  ./DEPLOY-AUTOMATED.sh"
  echo ""
  echo "Get token: https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi

# Get ST Client Secret
if [ -z "$ST_CLIENT_SECRET" ]; then
  echo "❌ ST_CLIENT_SECRET not set"
  echo ""
  echo "Set ServiceTitan client secret:"
  echo "  export ST_CLIENT_SECRET='<your-secret>'"
  echo "  ./DEPLOY-AUTOMATED.sh"
  exit 1
fi

echo "✅ Credentials found"
echo ""

# Step 1: Deploy to Cloudflare
echo "📦 Deploying to Cloudflare Workers..."
npx wrangler deploy

echo ""
echo "✅ Deployment successful!"
echo ""

# Step 2: Configure secrets
echo "🔐 Configuring secrets..."
echo ""

echo "  • ST_CLIENT_ID: cid.eo3vcy5zs1ncsf2hczeyk1he8"
npx wrangler secret put ST_CLIENT_ID --secret "cid.eo3vcy5zs1ncsf2hczeyk1he8"

echo "  • ST_CLIENT_SECRET: (from .env)"
npx wrangler secret put ST_CLIENT_SECRET --secret "$ST_CLIENT_SECRET"

echo "  • MAKE_WEBHOOK_TRANSCRIPT"
npx wrangler secret put MAKE_WEBHOOK_TRANSCRIPT --secret "https://hook.us2.make.com/jww7ia2xa1ewqgwmcgqhbxcrlpacr2kn"

echo "  • MAKE_WEBHOOK_ESCALATE"
npx wrangler secret put MAKE_WEBHOOK_ESCALATE --secret "https://hook.us2.make.com/xg13i5sz4crwlvcyj5cbhsono1h8ryft"

echo ""
echo "✅ Secrets configured"
echo ""

# Step 3: Verify deployment
echo "🧪 Verifying deployment..."
curl https://sentry-quinn.lpeluso.workers.dev/health

echo ""
echo ""
echo "✅ Deployment Complete!"
echo ""
echo "Next steps:"
echo "  1. Update Retell agent tool URLs (manual in Retell dashboard)"
echo "  2. Activate Make.com scenarios (QSC-QUINN-TRANSCRIPT, QSC-QUINN-DIGEST)"
echo "  3. Assign phone number to Miss Dawn agent"
echo "  4. Test with real technician call"
