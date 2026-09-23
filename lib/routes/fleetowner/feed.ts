import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://www.fleetowner.com';

export const route: Route = {
    path: '/:section?',
    categories: ['traditional-media'],
    example: '/fleetowner/news',
    parameters: {
        section: {
            description: 'Section alias',
            options: [
                { value: 'home', label: 'Home / Latest' },
                { value: 'news', label: 'News' },
                { value: 'technology', label: 'Technology' },
                { value: 'equipment', label: 'Equipment' },
                { value: 'operations', label: 'Operations' },
                { value: 'perspectives', label: 'Perspectives' },
                { value: 'safety', label: 'Safety' },
                { value: 'emissions-efficiency', label: 'Emissions & Efficiency' },
                { value: 'product-spotlight', label: 'Product Spotlight' },
                { value: 'for-the-driver', label: 'For the Driver' },
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
        { source: ['www.fleetowner.com/:section'], target: '/:section' },
        { source: ['www.fleetowner.com/'], target: '/' },
    ],
    name: 'News and Operations',
    maintainers: ['FrancoBenedetti'],
    handler: async (ctx) => {
        const section = ctx.req.param('section') || 'home';
        const feedInput = JSON.stringify({ sectionAlias: section });
        const feedUrl = `${BASE_URL}/__rss/website-scheduled-content.xml?input=${encodeURIComponent(feedInput)}`;

        const xmlText: string = await ofetch(feedUrl, {
            parseResponse: (txt) => txt,
        });

        const $feed = load(xmlText, { xmlMode: true });

        const rawItems: Array<{
            title: string;
            link: string;
            guid: string;
            pubDateStr: string;
            summary: string;
            mediaUrl?: string;
        }> = [];

        $feed('item').each((_, el) => {
            const $item = $feed(el);
            const link = $item.find('link').text().trim();
            if (link) {
                rawItems.push({
                    title: $item.find('title').text().trim(),
                    link,
                    guid: $item.find('guid').text().trim() || link,
                    pubDateStr: $item.find('pubDate').text().trim(),
                    summary: $item.find('description').text().trim(),
                    mediaUrl: $item.find(String.raw`media\:content, content`).attr('url') || $item.find('enclosure').attr('url'),
                });
            }
        });

        const items = await Promise.all(
            rawItems.slice(0, 20).map((rawItem) =>
                cache.tryGet(`${rawItem.link}:v1`, async () => {
                    let author = 'FleetOwner';
                    let description = rawItem.summary;
                    let imageUrl = rawItem.mediaUrl;
                    let pubDate = rawItem.pubDateStr ? parseDate(rawItem.pubDateStr) : undefined;

                    try {
                        const artHtml: string = await ofetch(rawItem.link);
                        const $art = load(artHtml);

                        $art('script, style, iframe, .ad-container, .sponsored-content').remove();

                        const rawAuthor = $art('meta[name="author"]').attr('content') || $art('.byline, .author').first().text().trim();
                        if (rawAuthor) {
                            author = rawAuthor.replaceAll(/\s+/g, ' ').trim();
                        }

                        const metaDate = $art('meta[property="article:published_time"]').attr('content') || $art('time').attr('datetime');
                        if (metaDate) {
                            pubDate = parseDate(metaDate);
                        }

                        const metaImg = $art('meta[property="og:image"]').attr('content');
                        if (metaImg) {
                            imageUrl = metaImg;
                        }

                        const $body = $art('.page-contents__content-body, .body-content, .ebm-page__content').first();
                        if ($body.length > 0) {
                            const bodyHtml = $body.html()?.trim();
                            if (bodyHtml && bodyHtml.length > 50) {
                                description = bodyHtml;
                            }
                        }
                    } catch {
                        // Fallback to RSS feed summary if article page fetch fails
                    }

                    if (imageUrl && !description.includes(imageUrl)) {
                        description = `<img src="${imageUrl}" alt="${rawItem.title}">${description}`;
                    }

                    return {
                        title: rawItem.title,
                        link: rawItem.link,
                        description,
                        pubDate,
                        author,
                        guid: rawItem.guid,
                        image: imageUrl,
                        media: imageUrl ? { content: { url: imageUrl, medium: 'image' } } : undefined,
                    };
                })
            )
        );

        return {
            title: section === 'home' ? 'FleetOwner' : `FleetOwner - ${section}`,
            link: section === 'home' ? BASE_URL : `${BASE_URL}/${section}`,
            description: 'Fleet operations, technology, maintenance, safety, and equipment news.',
            language: 'en',
            image: 'https://img.fleetowner.com/files/base/ebm/fleetowner/image/site_logo.png',
            item: items.filter((item): item is NonNullable<typeof item> => item !== null),
        };
    },
};
