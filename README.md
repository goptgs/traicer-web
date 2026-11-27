# TrAIcer

Marketing site for [traicer.golf](https://traicer.golf), plus the early-access list for the TrAIcer AI Skill. Published by PTGS LLC.

This is milestone 1 only: the site, the draft pricing, and the waitlist. The clip uploader, accounts, and checkout are not in this repo yet.

## Pages

| Path | What it is |
|---|---|
| `/` | Home. Tagline, one tracer, Try it Free!, and an examples window. |
| `/try` | Static preview of the editor. Nothing is uploaded. |
| `/pricing` | Early pricing. No checkout. |
| `/help` | Short answers. |
| `/skill` | AI Skill early access. The only form. |
| `/privacy` | Draft privacy note. Not indexed. |
| `/terms` | Draft terms. Not indexed. |

Canonical URLs use `https://traicer.golf`.

## Setup

Node 20 or newer. This project is tested on Node 22 (see `.node-version`).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Leave the env vars blank, or leave the example values, and the waitlist form stays up and explains that it is not connected. It does not crash. Fill in a real Supabase URL and anon key, restart `npm run dev`, and the form will insert a row.

### Environment variables

| Name | Where | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, and the host’s build env | Project URL, `https://….supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | The anon public key. Safe to expose. |

The site is a static export, so these values are read **at build time** and written into the pages. Set them before `npm run build`, not only at runtime.

Do not put the Supabase service-role key in either variable, and do not commit `.env.local`. The anon key is public by design. Row Level Security is what keeps the list private.

## Supabase migration

Create a project (the free plan is enough for this waitlist). Then apply:

`supabase/migrations/20261127000100_create_skill_waitlist.sql`

In the dashboard: SQL Editor → New query → paste the file → Run.

With the [Supabase CLI](https://supabase.com/docs/guides/cli), after `supabase link`:

```bash
supabase db push
```

What that file does:

- Table `public.skill_waitlist`: email, assistant (`grok`, `claude`, `chatgpt`, `other`), optional other-name, computer (`mac` or `pc`), created time.
- Anonymous and signed-in users can **insert** a row and nothing else. They cannot read, update, or delete the list.
- A trigger rejects a filled honeypot (`fax_number`), lower-cases the email, and stops the insert when 40 rows have landed in the last 10 minutes.
- The same email cannot join twice.
- Read the rows from the Supabase dashboard (the service role bypasses RLS). There is no public read API.

Raise the `40` in the trigger if a real launch needs a higher burst cap. It is not per-IP, because the browser talks to Supabase directly.

## Scripts

```bash
npm test        # form validation, missing-env behaviour, draft prices
npm run build   # static site in out/
```

Preview the production build:

```bash
npm run build
npx --yes serve out
```

## Deploy to Cloudflare Pages

Do not point `traicer.golf` at this until you have looked at a preview and approved it. This repo has no Cloudflare credentials, and it does not change DNS.

1. Create a Pages project from this Git repository.
2. Override the framework preset. Choose **None**. Do not use the Next.js server preset — this app is a static export (`output: 'export'`).
3. Build command: `npm run build`
4. Build output directory: `out`
5. Environment variable `NODE_VERSION` = `22` (or rely on `.node-version`).
6. Build-time variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
7. Apply the Supabase migration before you expect the form to store rows.
8. Custom domains, and the redirects from `tracer.golf` and `shottraicer.com`, wait until the preview looks right.

`public/_headers` is copied into `out/` and sets basic security headers plus a Content-Security-Policy that allows the browser to call `https://*.supabase.co`.

## Changing copy and art

- **Prices.** `src/config/pricing.ts` is the only place the draft tiers are written. The home strip and `/pricing` both read it. The AI Skill page does not.
- **Real Physics badge.** Shelved. The component is `src/components/RealPhysicsBadge.tsx` and the art is `public/brand/real-physics-badge.svg`. It is not on any page.
- **Demo clips.** `src/config/demo-clips.ts`. Put the still and the mp4 in `public/media/`, point `poster` at the still, and set `videoSrc`. Until `videoSrc` is set, the slot shows the poster inside a `<video>`.
- **Wordmark and icon.** `public/brand/logos/`. Use the files as they are. Don’t recolour the wordmark.
- **Tokens.** `src/styles/tokens.css` and `src/styles/tokens.json` are the Ice Current tokens from the brand kit.

Fonts are Rajdhani (headlines) and Inter (body), self-hosted from `src/fonts/`. Both are SIL Open Font License; the licence texts are in that folder.
