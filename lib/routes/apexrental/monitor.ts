import { createHash } from 'node:crypto';

import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import ofetch from '@/utils/ofetch';

const BASE_URL = 'https://www.apexrental.co.za';

interface PageConfig {
    url: string;
    feedTitle: string;
    itemTitle: string;
    /** Cheerio selectors to try in order for the monitored content block */
    contentSelectors: string[];
    /** Selectors to remove before hashing/extracting (global chrome) */
    noiseSelectors: string[];
}

const PAGE_CONFIGS: Record<string, PageConfig> = {
    'why-apex': {
        url: `${BASE_URL}/`,
        feedTitle: 'Apex Vehicle Rental — Why Apex? Section',
        itemTitle: 'Why Apex? — Page Update',
        contentSelectors: [
            // The "Get to know us / Why Apex?" Elementor section
            '.e-con-inner',
            '.elementor-section:has(h2)',
            '.elementor-section:has(h3)',
            'main',
        ],
        noiseSelectors: [
            'nav',
            'header',
            'footer',
            '.elementor-location-header',
            '.elementor-location-footer',
            '.elementor-nav-menu',
            // Client reviews carousel and vehicle category lists
            '[class*="review"]',
            '[class*="testimonial"]',
            '[class*="vehicle-cat"]',
            '[class*="fleet-cat"]',
            'script',
            'style',
        ],
    },
    about: {
        url: `${BASE_URL}/about-us/`,
        feedTitle: 'Apex Vehicle Rental — About Us Page',
        itemTitle: 'About Us — Page Update',
        contentSelectors: ['.elementor-section', 'main', 'article', '.entry-content'],
        noiseSelectors: [
            'nav',
            'header',
            'footer',
            '.elementor-location-header',
            '.elementor-location-footer',
            '.elementor-nav-menu',
            '[class*="review"]',
            '[class*="testimonial"]',
            '[class*="vehicle-cat"]',
            '[class*="fleet-cat"]',
            'script',
            'style',
        ],
    },
};

function extractAndHash(html: string, cfg: PageConfig): { text: string; html: string; hash: string } {
    const $ = load(html);

    // Strip global chrome first
    for (const sel of cfg.noiseSelectors) {
        $(sel).remove();
    }

    // Try each content selector in order
    let $content = $();
    for (const sel of cfg.contentSelectors) {
        try {
            $content = $(sel).first();
            if ($content.length && $content.text().trim().length > 100) {
                break;
            }
        } catch {
            // Some :has() selectors may not be supported; skip
        }
    }

    // Fallback: entire body
    if (!$content.length || $content.text().trim().length < 100) {
        $content = $('body');
    }

    const text = $content.text().trim().replaceAll(/\s+/g, ' ');
    const contentHtml = $content.html()?.trim() ?? text;
    const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);

    return { text, html: contentHtml, hash };
}

const handler = async (ctx: { req: { param: (k: string) => string | undefined } }) => {
    const page = ctx.req.param('page') ?? 'why-apex';
    const cfg = PAGE_CONFIGS[page];

    if (!cfg) {
        throw new Error(`Unknown page "${page}". Valid values: ${Object.keys(PAGE_CONFIGS).join(', ')}`);
    }

    const pageHtml: string = await ofetch(cfg.url, {
        headers: { 'user-agent': config.trueUA },
    });

    const { text, html: contentHtml, hash } = extractAndHash(pageHtml, cfg);

    // guid is deterministic: changes only when content changes
    const guid = `${cfg.url}#content-${hash}`;

    const item: DataItem = {
        title: cfg.itemTitle,
        link: cfg.url,
        description: `<pre style="white-space:pre-wrap;font-family:inherit">${text.slice(0, 500)}…</pre>\n\n<hr/>\n${contentHtml}`,
        pubDate: new Date(),
        guid,
    };

    return {
        title: cfg.feedTitle,
        link: cfg.url,
        description: `Content change monitor for ${cfg.url}. A new item appears only when the monitored section changes.`,
        item: [item],
    };
};

export const route: Route = {
    path: '/:page?',
    categories: ['traditional-media'],
    example: '/apexrental/why-apex',
    parameters: {
        page: {
            description: 'Page section to monitor',
            options: [
                { value: 'why-apex', label: 'Why Apex? (homepage value proposition section)' },
                { value: 'about', label: 'About Us page' },
            ],
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
        { source: ['apexrental.co.za/'], target: '/why-apex' },
        { source: ['www.apexrental.co.za/'], target: '/why-apex' },
        { source: ['apexrental.co.za/about-us/'], target: '/about' },
        { source: ['www.apexrental.co.za/about-us/'], target: '/about' },
    ],
    name: 'Page Change Monitor',
    maintainers: ['FrancoBenedetti'],
    description: 'Monitors specific sections of Apex Vehicle Rental pages for content changes. Emits a new feed item only when the monitored section text changes (detected via SHA-256 hash of the content).',
    handler,
};
