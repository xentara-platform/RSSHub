import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const INSIGHTS_URL = 'https://afrirent.co.za/insights';
const BASE_URL = 'https://www.afrirentholdings.co.za';

export const route: Route = {
    path: '/insights',
    categories: ['traditional-media'],
    example: '/afrirent/insights',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['afrirent.co.za/insights'], target: '/insights' },
        { source: ['www.afrirentholdings.co.za/insights/'], target: '/insights' },
        { source: ['www.afrirentholdings.co.za/insights/:slug'], target: '/insights' },
    ],
    name: 'Insights & Blog',
    maintainers: ['FrancoBenedetti'],
    handler: async () => {
        const html: string = await ofetch(INSIGHTS_URL, {
            headers: { 'user-agent': config.trueUA },
        });
        const $ = load(html);

        // Collect unique article links from the Elementor post listing
        const links: string[] = [];
        $('h1.elementor-heading-title a, h2.elementor-heading-title a, .elementor-post__title a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('https://') && !href.includes('/insights') && !links.includes(href)) {
                links.push(href);
            }
        });

        const items: DataItem[] = await Promise.all(
            links.slice(0, 20).map(
                (link) =>
                    cache.tryGet(`${link}:v1`, async () => {
                        const artHtml: string = await ofetch(link, {
                            headers: { 'user-agent': config.trueUA },
                        });
                        const $art = load(artHtml);

                        $art('script, style, iframe, .elementor-widget-social-icons, .elementor-widget-posts, .ah-blog-sidebar').remove();

                        const title = $art('meta[property="og:title"]').attr('content') ?? $art('title').text().trim();
                        const pubDateStr = $art('meta[property="article:published_time"]').attr('content');
                        const pubDate = pubDateStr ? parseDate(pubDateStr) : undefined;
                        const imageUrl = $art('meta[property="og:image"]').attr('content');
                        const category = $art('meta[property="article:section"]').attr('content');

                        const $content = $art('.elementor-widget-theme-post-content');
                        let description = $content.html()?.trim() ?? '';

                        if (imageUrl) {
                            description = `<img src="${imageUrl}" alt="${title}">\n${description}`;
                        }

                        return {
                            title,
                            link,
                            description,
                            pubDate,
                            category: category ? [category] : undefined,
                            image: imageUrl,
                            guid: link,
                        } as DataItem;
                    }) as Promise<DataItem>
            )
        );

        return {
            title: 'Afrirent Holdings — Insights & Blog',
            link: INSIGHTS_URL,
            image: `${BASE_URL}/favicon.ico`,
            description: 'News, insights, and updates from Afrirent Holdings.',
            item: items,
        };
    },
};
