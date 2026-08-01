# Burrowise Monorepo Deployment Guide

This repo now includes a ready-to-deploy Growth Engine landing app in:

- packages/burrowise-landing-page

Use this folder as your upload/deploy target.

## What Is Already Configured

The landing app already includes:

- Next.js app structure and routes
- Growth Engine SDK integration
- Blog and contact/form pages
- i18n routing
- Analytics integration hooks
- Vercel helper scripts and a vercel.json config

## Vercel Deploy (Recommended)

1. Push this repo to GitHub.
2. In Vercel, click Add New Project and import this repo.
3. Set Root Directory to:
   - packages/burrowise-landing-page
4. Framework should auto-detect as Next.js.
5. Add these Environment Variables in Vercel Project Settings:
   - BRAIN_API_URL
   - BRAIN_API_KEY
   - TURSO_DATABASE_URL
   - TURSO_AUTH_TOKEN
   - NEXT_PUBLIC_GA_MEASUREMENT_ID (optional)
6. Deploy.

## Local Validation Before Deploy

From repo root:

1. cd packages/burrowise-landing-page
2. npm install
3. npm run build
4. npm run dev

Open http://localhost:3000

## Optional: Deploy From CLI

From packages/burrowise-landing-page:

1. npm run vercel:link
2. npm run vercel:preview
3. npm run vercel:prod

## Notes

- The app can build without the server credentials, but SDK-backed content/features will fallback until env vars are set.
- Do not commit real secrets in .env.local.
- If your deploy tool asks for a folder path, point it to:
  - packages/burrowise-landing-page
