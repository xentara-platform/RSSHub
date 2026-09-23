# Agent Instructions: Xentara RSS Route Requests Workflow

This document provides complete instructions for an autonomous agent running on any machine to fetch, evaluate, build, compile, verify, and resolve RSS route requests for the **Xentara RSSHub** platform.

---

## Table of Contents

1. [Environment & Setup](#1-environment--setup)
2. [Database Schema & Architecture](#2-database-schema--architecture)
3. [Step-by-Step Agent Workflow](#3-step-by-step-agent-workflow)
    - [Step 1: Fetch Pending Route Requests](#step-1-fetch-pending-route-requests)
    - [Step 2: Assess and Categorize the Request](#step-2-assess-and-categorize-the-request)
    - [Step 3: Implement the Custom Route](#step-3-implement-the-custom-route)
    - [Step 4: Compile and Register the Route](#step-4-compile-and-register-the-route)
    - [Step 5: Test and Verify](#step-5-test-and-verify)
    - [Step 6: Update Database Status](#step-6-update-database-status)
    - [Step 7: Commit and Push to Repository](#step-7-commit-and-push-to-repository)
4. [Route Implementation Reference & Rules](#4-route-implementation-reference--rules)
5. [Helper Scripts Quick Reference](#5-helper-scripts-quick-reference)

---

## 1. Environment & Setup

### Prerequisites

- **Node.js**: `v22.x` or `v24.x` (or newer)
- **Package Manager**: `pnpm` (recommended: `10.x`)
- **Git** configured with access to `https://github.com/xentara-platform/RSSHub.git`

### Workspace Initialization

```bash
# 1. Clone the repository
git clone https://github.com/xentara-platform/RSSHub.git
cd RSSHub

# 2. Checkout the production branch
git checkout production

# 3. Install dependencies
pnpm install
```

### Database Credentials (`.env.db`)

Database credentials must be placed in `.env.db` at the repository root. Ensure the human user has transferred `.env.db` to the machine:

```env
# SUPABASE
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
SUPABASE_SERVICE_ROLE_KEY="[SERVICE_ROLE_JWT_KEY]"
```

Verify setup:

```bash
pnpm fetch-requests
```

If `.env.db` is correctly configured, this script will fetch pending requests and write them to `scratch/pending_requests.json`.

---

## 2. Database Schema & Architecture

The database is hosted on **Supabase** (PostgreSQL) and exposes a RESTful API via **PostgREST**.

### Table: `route_requests`

| Column                | Type          | Description                                                                   |
| :-------------------- | :------------ | :---------------------------------------------------------------------------- |
| `id`                  | `uuid`        | Unique identifier (Primary Key)                                               |
| `created_at`          | `timestamptz` | Submission timestamp                                                          |
| `updated_at`          | `timestamptz` | Last update timestamp                                                         |
| `requested_by`        | `uuid`        | User ID who requested the route                                               |
| `requested_by_hub_id` | `uuid`        | Target Hub ID                                                                 |
| `target_url`          | `text`        | Target website, blog, or feed URL requested                                   |
| `instructions`        | `text`        | User instructions or notes describing desired content                         |
| `access_notes`        | `text`        | Additional access hints                                                       |
| `status`              | `text`        | Status: `'pending'`, `'in_progress'`, `'completed'`, `'deferred'`, `'failed'` |
| `rsshub_namespace`    | `text`        | Assigned RSSHub namespace (e.g. `automotivelogistics`, `fleetowner`)          |
| `rsshub_route_path`   | `text`        | Route path pattern (e.g. `/:category?`, `/:section?`)                         |
| `rsshub_example_url`  | `text`        | Working RSSHub example route (e.g. `/automotivelogistics/news`)               |
| `resolution_notes`    | `text`        | Resolution summary or notes                                                   |
| `resolved_at`         | `timestamptz` | Resolution timestamp                                                          |
| `resolved_by`         | `text`        | Agent or user identifier (e.g. `antigravity-agent`)                           |
| `is_archived`         | `boolean`     | Archive flag (`false` by default)                                             |

---

## 3. Step-by-Step Agent Workflow

```mermaid
flowchart TD
    A[Run pnpm fetch-requests] --> B[Read scratch/pending_requests.json]
    B --> C{Assess Target}
    C -->|Already Exists / Native| D[Map to Existing Route]
    C -->|Blocked / Login Required| E[Mark Deferred]
    C -->|New Custom Route Needed| F[Develop Route in lib/routes/namespace/]
    F --> G[Compile: build:routes & build:index]
    G --> H[Run Typecheck & Lint]
    H --> I[Test Locally with pnpm dev]
    I --> J[Update Database via pnpm update-request]
    D --> J
    E --> J
    J --> K[Git Commit & Push production + master]
```

### Step 1: Fetch Pending Route Requests

Execute the built-in script:

```bash
pnpm fetch-requests
```

This queries Supabase PostgREST (`status=eq.pending`) and writes the output array to:
`scratch/pending_requests.json`.

Alternatively, inspect via raw curl:

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "https://[PROJECT_REF].supabase.co/rest/v1/route_requests?status=eq.pending"
```

---

### Step 2: Assess and Categorize the Request

For each entry in `scratch/pending_requests.json`, inspect `target_url`, `instructions`, and `access_notes`:

1. **Check if Already Implemented**:
   Search `lib/routes/` or check `assets/build/route-index.json`. If a route already exists, jump directly to [Step 6](#step-6-update-database-status).

2. **Check for Upstream Native Support**:
   If the target URL is on a service natively supported by RSSHub core (e.g. YouTube, Substack, Reddit, Telegram, GitHub), verify if the native route serves the request.

3. **Check for Native RSS or WordPress API**:
    - Test if the site has a native RSS feed (`/feed`, `/rss`, `/atom.xml`).
    - Test if the site is built on WordPress (`/wp-json/wp/v2/posts?_embed=1`). WordPress REST API is **strongly preferred** over scraping HTML.

4. **Evaluate for Deferral**:
   If the request requires private user authentication, is a closed Facebook group, has an impenetrable Cloudflare Turnstile/Captcha wall, or lacks extractable content, mark it as deferred:
    ```bash
    pnpm update-request --defer <request-id> "Reason for deferral"
    ```

---

### Step 3: Implement the Custom Route

Create a new directory: `lib/routes/<namespace>/`

#### 1. Create `namespace.ts`:

```typescript
import type { Namespace } from '@/types';

export const namespace: Namespace = {
    name: 'Human Readable Service Name',
    url: 'example.com', // DO NOT include https:// protocol prefix
    categories: ['traditional-media'], // Exactly ONE category
    description: 'Description of the publication or service.',
};
```

#### 2. Create `feed.ts`:

Follow the guidelines in [Section 4](#4-route-implementation-reference--rules). Example boilerplate:

```typescript
import { load } from 'cheerio';
import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://example.com';

export const route: Route = {
    path: '/:category?',
    categories: ['traditional-media'],
    example: '/example/news',
    parameters: {
        category: {
            description: 'Category slug',
            options: [{ value: 'news', label: 'News' }],
        },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['example.com/:category'], target: '/:category' },
        { source: ['example.com/'], target: '/' },
    ],
    name: 'Latest Articles', // Do NOT repeat namespace name
    maintainers: ['FrancoBenedetti'],
    handler: async (ctx) => {
        const category = ctx.req.param('category') ?? 'news';
        const targetUrl = `${BASE_URL}/${category}`;

        const html: string = await ofetch(targetUrl);
        const $ = load(html);

        const links = $('article a.title-link')
            .toArray()
            .map((el) => $(el).attr('href'))
            .filter((href): href is string => Boolean(href))
            .slice(0, 20);

        const items = await Promise.all(
            links.map((link) =>
                cache.tryGet(`${link}:v1`, async () => {
                    const artHtml: string = await ofetch(link);
                    const $art = load(artHtml);

                    $art('script, style, iframe, .ad, .social-share').remove();

                    const title = $art('h1').first().text().trim();
                    const pubDateStr = $art('meta[property="article:published_time"]').attr('content') || $art('time').attr('datetime');
                    const pubDate = pubDateStr ? parseDate(pubDateStr) : undefined;
                    const author = $art('meta[name="author"]').attr('content') || 'Publisher';
                    const imageUrl = $art('meta[property="og:image"]').attr('content');

                    const $content = $art('.article-content, .entry-content').first();
                    let description = $content.length > 0 ? $content.html()?.trim() || '' : '';

                    if (imageUrl && !description.includes(imageUrl)) {
                        description = `<img src="${imageUrl}" alt="${title}">${description}`;
                    }

                    return {
                        title: title || 'Untitled',
                        link,
                        description,
                        pubDate,
                        author,
                        guid: link,
                        image: imageUrl,
                    };
                })
            )
        );

        return {
            title: `Service Name - ${category}`,
            link: targetUrl,
            description: 'Description of feed',
            language: 'en',
            item: items.filter((item): item is NonNullable<typeof item> => item !== null),
        };
    },
};
```

---

### Step 4: Compile and Register the Route

After adding files under `lib/routes/<namespace>/`:

1. **Build route definitions**:
    ```bash
    pnpm run build:routes
    ```
2. **Build static route index**:
    ```bash
    pnpm run build:index
    ```
3. **Format & Lint**:
    ```bash
    ./node_modules/.bin/oxlint --type-aware lib/routes/<namespace>
    ./node_modules/.bin/oxfmt lib/routes/<namespace>
    ```
4. **TypeScript Typecheck**:
    ```bash
    ./node_modules/.bin/tsc --noEmit
    ```

---

### Step 5: Test and Verify

1. Start the dev server:
    ```bash
    pnpm dev
    ```
2. In another terminal, query the new route:
    ```bash
    curl -i http://localhost:1200/<namespace>/<category>
    ```
3. Ensure:
    - HTTP status is `200 OK`.
    - Content-Type is `application/xml` or `text/xml`.
    - XML contains valid `<item>` tags with `<title>`, `<link>`, `<pubDate>`, and `<description>`.

---

### Step 6: Update Database Status

Once verified, update the record in Supabase:

```bash
pnpm update-request <request-id> <namespace> <route_path> <example_url> "[resolution_notes]"
```

**Example**:

```bash
pnpm update-request 26ef2858-e9a7-4778-ae9f-47e98e21fb97 automotivelogistics /:category? /automotivelogistics/news "Custom route implemented and verified"
```

If the request is deferred:

```bash
pnpm update-request --defer 26ef2858-e9a7-4778-ae9f-47e98e21fb97 "Requires login credentials"
```

---

### Step 7: Commit and Push to Repository

1. **Check status**:

    ```bash
    git status
    ```

    _Ensure no scratch files, `.env.db`, or temporary tests are staged._

2. **Stage only the new route files**:

    ```bash
    git add lib/routes/<namespace>/
    ```

3. **Commit**:

    ```bash
    git commit -m "feat: add <namespace> custom route"
    ```

    _(Pre-commit hooks will automatically run `lint-staged` and `tsc --noEmit`)_.

4. **Sync master and push both branches**:
    ```bash
    git branch -f master production
    git push origin production master
    ```

---

## 4. Route Implementation Reference & Rules

Key rules from `AGENTS.md` to ensure code passes automated reviews and pre-commit hooks:

1. **Maintainer**: Set `maintainers: ['FrancoBenedetti']`.
2. **Namespace URL**: `url` in `namespace.ts` must **not** include `https://`.
3. **Route Name**: Do **not** repeat the namespace name in `name` (e.g. use `'Latest News'`, not `'Automotive Logistics News'`).
4. **Single Category**: Supply exactly one category string in `categories: [...]` (e.g. `['traditional-media']`).
5. **Radar Source**: No `https://` prefix in `radar[].source`. Use `['example.com/:category']`.
6. **Radar Target**: Target must match route parameters (e.g. `/:category` or `/`).
7. **Cache per-item detail**: Always wrap per-article HTTP requests in `cache.tryGet(`${link}:v1`, async () => ...)`.
8. **Clean description**: The `description` field must contain **only** article body content. Prepend thumbnail `<img src="...">` if available. Do **not** include duplicate titles or author lines in the description.
9. **No Fake Dates**: Never use `new Date()` as a fallback for `pubDate`. If date is unavailable or unparseable, leave it `undefined`.
10. **String Literals**: Do not use template literals `` `string` `` when plain strings `'string'` suffice.
11. **CSS Selectors with Backslashes**: When using cheerio selectors with escaped colons like `media\:content`, wrap in `String.raw` to satisfy linter: `String.raw`media\:content``.
12. **WordPress Sites**: Prefer WordPress REST API (`/wp-json/wp/v2/posts?_embed=1`). No `cache.tryGet` needed when the endpoint already embeds full content.

---

## 5. Helper Scripts Quick Reference

| Command                                                  | Script                              | Description                                                   |
| :------------------------------------------------------- | :---------------------------------- | :------------------------------------------------------------ |
| `pnpm fetch-requests`                                    | `scripts/fetch-pending-requests.ts` | Fetches pending requests into `scratch/pending_requests.json` |
| `pnpm update-request <id> <ns> <path> <example> [notes]` | `scripts/update-route-request.ts`   | Marks request as completed in Supabase                        |
| `pnpm update-request --defer <id> [reason]`              | `scripts/update-route-request.ts`   | Marks request as deferred in Supabase                         |
| `pnpm run build:routes`                                  | `scripts/workflow/build-routes.ts`  | Regenerates route definitions and imports                     |
| `pnpm run build:index`                                   | `scripts/build-route-index.ts`      | Builds route search index `assets/build/route-index.json`     |
| `pnpm dev`                                               | `lib/index.ts`                      | Runs RSSHub local dev server at `http://localhost:1200`       |
| `pnpm typecheck`                                         | `tsc --noEmit`                      | Runs project-wide TypeScript validation                       |
