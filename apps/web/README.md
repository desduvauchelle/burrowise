# Burrowise

Built with [Growth Engine](https://github.com/recursive-solutions-ai).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Set these in `.env.local` (never commit this file):

```
BRAIN_API_URL=http://localhost:3000
BRAIN_API_KEY=brain_live_...
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...
SYNC_DATABASE_URL=libsql://...
SYNC_DATABASE_AUTH_TOKEN=eyJ...
DESKTOP_APP_ORIGINS=tauri://localhost,http://tauri.localhost
```

| Variable | Purpose |
|----------|---------|
| `BRAIN_API_URL` | URL of the Brain instance (`http://localhost:3000` for dev, production URL for prod) |
| `BRAIN_API_KEY` | API key for authenticating with the Brain |
| `TURSO_DATABASE_URL` | Your Turso SQLite database URL |
| `TURSO_AUTH_TOKEN` | Auth token for your Turso database |
| `SYNC_DATABASE_URL` | Optional dedicated libSQL/Turso database for accounts and opaque encrypted objects. Defaults to `TURSO_DATABASE_URL`, then local `file:.data/second-brain-service.db`. |
| `SYNC_DATABASE_AUTH_TOKEN` | Auth token for the dedicated sync database. Defaults to `TURSO_AUTH_TOKEN`. |
| `DESKTOP_APP_ORIGINS` | Comma-separated additional trusted desktop origins. Tauri defaults are already allowed. |

These service credentials are server-only — do **not** prefix them with `NEXT_PUBLIC_`.

| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | _(optional)_ Google Analytics 4 Measurement ID (e.g. `G-XXXXXXXXXX`). No tracking if omitted |

## Project Structure

| Path | Purpose |
|------|---------|
| `src/app/api/rs/[...route]/route.ts` | SDK route handler — connects to Brain and Turso |
| `src/app/layout.tsx` | Root layout with `GrowthEngineProvider` |
| `src/app/page.tsx` | Landing page with latest blog posts |
| `src/app/blog/` | Blog listing and detail pages |
| `src/app/[locale]/contact/page.tsx` | Contact page using the pre-seeded `contact-form` |
| `src/app/[locale]/forms/[slug]/page.tsx` | Dynamic form page — renders any form by slug |
| `src/components/` | Reusable UI components |
| `next.config.ts` | Next.js config with `serverExternalPackages` |

## Encrypted sync

The web service authenticates accounts and stores opaque encrypted objects. Encryption and decryption run in the desktop app or browser vault through `packages/sync-protocol`. The encryption passphrase is deliberately separate from the account password and is never sent to the server.

For local development, the service creates `.data/second-brain-service.db`. Production should set `SYNC_DATABASE_URL` and `SYNC_DATABASE_AUTH_TOKEN` to durable libSQL/Turso storage. See the repository-level `SYNC_SECURITY.md` before deploying or changing the protocol.

The API is under `/api/auth/*` and `/api/sync/*`. Every sync route enforces account authentication itself; proxy origin checks are an additional browser boundary, not the authorization boundary.

## Forms

Every new tenant gets a **default "Contact Us" form** (slug: `contact-form`) seeded during onboarding. The template includes two pages that work out of the box:

- **`/contact`** — Dedicated contact page with business info sidebar
- **`/forms/[slug]`** — Dynamic page that renders any form by its slug

You can create additional forms in the Brain portal. To use SDK hooks in custom components:

```tsx
import { useForm, submitForm } from '@growth-engine/sdk-client'

const { form, schema, loading } = useForm('contact-form')
const result = await submitForm('contact-form', formData)
```

### Generated types (optional)

For compile-time TypeScript safety, pull form schemas locally:

```bash
pnpm pull-forms
```

This generates `src/generated/forms.ts` with Zod schemas, TypeScript types, and slug constants. Commit this file so other developers get the types immediately.

```bash
# Custom output path
npx growth-engine-pull-forms --output src/types/forms.ts
```

See [FORMS.md](../FORMS.md) for the full forms guide including email notifications, confirmation emails, and CRM integration.

## SDK Reference

| Hook / Function | What it does |
|---|---|
| `useContent('blog')` | Fetches blog posts from your Turso DB |
| `useBusinessConfig()` | Fetches business config from your Turso DB |
| `useForms()` | Fetches all active forms |
| `useForm(slug)` | Fetches a form definition with Zod schema |
| `submitForm(slug, data)` | Validates and submits form data |
| `triggerBlogGen({ topic })` | Triggers AI blog generation via the Brain |
| `triggerSocialSync()` | Triggers social media sync via the Brain |
| `useJobStatus(jobId)` | Polls job progress |
| `useSDKStatus()` | Checks SDK version compatibility |

## Animations (GSAP)

GSAP is pre-installed with scroll-triggered reveal animations on the landing page (Hero, Features, CTA). Two hooks are available in `src/hooks/useGsap.ts`:

### `useScrollReveal(options?)` — one-liner scroll animations

```tsx
import { useScrollReveal } from '@/hooks/useGsap'

// Fade + slide up on scroll
const ref = useScrollReveal<HTMLDivElement>()
<div ref={ref}>I animate in on scroll</div>

// Stagger children (e.g. a grid of cards)
const gridRef = useScrollReveal<HTMLDivElement>({ y: 40, stagger: 0.15 })
<div ref={gridRef}>
  <div>Card 1</div>  {/* each child staggers in */}
  <div>Card 2</div>
  <div>Card 3</div>
</div>
```

Options: `y`, `x`, `opacity`, `duration`, `delay`, `stagger`, `start`, `ease`

### `useGsap(callback, scope, deps)` — full GSAP control

```tsx
import { useRef } from 'react'
import { useGsap, gsap } from '@/hooks/useGsap'

const container = useRef<HTMLDivElement>(null)
useGsap(() => {
  gsap.from('.card', { opacity: 0, y: 40, stagger: 0.1, duration: 0.6 })
  gsap.to('.hero-bg', { scale: 1.05, scrollTrigger: { trigger: '.hero-bg', scrub: true } })
}, container, [])

<div ref={container}>...</div>
```

Cleanup is automatic — GSAP context reverts when the component unmounts.

## Google Analytics

Analytics is built in but only activates when you set a GA4 Measurement ID.

### Enable tracking

Add your Measurement ID to `.env.local`:

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

If this variable is not set, no analytics scripts are loaded — zero overhead.

### Built-in events

These events are tracked automatically:

| Event | Trigger | Description |
|-------|---------|-------------|
| `cta_click` | User clicks the CTA button | Measures call-to-action engagement |
| `contact_view` | User visits the contact page | Measures contact page interest |
| `contact_form_submit` | User submits the contact form | Measures contact form conversions |

### Custom event tracking

Use the `trackEvent` helper to track additional events in your components:

```tsx
import { trackEvent } from '@/components/analytics/GoogleAnalytics'

// Track a form submission
async function handleSubmit(data: FormData) {
  const result = await submitForm('contact', data)
  if (result.ok) {
    trackEvent('form_submit', { form_slug: 'contact' })
  }
}

// Track any custom event
trackEvent('newsletter_signup', { source: 'footer' })
```

`trackEvent` is safe to call even when GA is not configured — it does nothing if the GA script hasn't loaded.

### Viewing events in Google Analytics

1. Go to [Google Analytics](https://analytics.google.com)
2. Navigate to **Reports > Engagement > Events**
3. Your custom events (`cta_click`, `contact_view`, `form_submit`, etc.) will appear alongside standard GA4 events

## Deploying to Vercel

1. Push this repo to GitHub
2. Import in Vercel
3. Add the four environment variables in project settings (use your production Brain URL for `BRAIN_API_URL`)
4. Deploy

## Updating the SDK

```bash
npm install github:recursive-solutions-ai/growth-engine-sdk-client#sdk-vLATEST
npm install github:recursive-solutions-ai/growth-engine-sdk-server#sdk-vLATEST
```

Check `useSDKStatus()` or the Brain admin portal for the latest version.

## Creating a New Client Site

To scaffold another site like this one:

```bash
npx --package=github:recursive-solutions-ai/growth-engine-create-client-app -- create-client-app
```
