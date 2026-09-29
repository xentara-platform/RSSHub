import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://www.absa.africa';
const FEED_URL = `${BASE_URL}/feed/`;
const MEDIA_CENTRE_URL = `${BASE_URL}/media-centre/`;

export const route: Route = {
    path: '/media-centre',
    categories: ['traditional-media'],
    example: '/absa/media-centre',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['absa.africa/media-centre/'], target: '/media-centre' },
        { source: ['www.absa.africa/media-centre/'], target: '/media-centre' },
    ],
    name: 'Media Centre',
    maintainers: ['FrancoBenedetti'],
    description: 'Latest press releases, media statements, and thought-leadership articles from Absa Group.',
    handler: async () => {
        // The native WordPress feed at /feed/ returns full article content (content:encoded)
        // covering both media statements and our-voices articles — exactly what the Media Centre page shows.
        // No per-item requests are needed, complying with the "Cache Exemption for Full-Content APIs" rule.
        const xmlText: string = await ofetch(FEED_URL, {
            headers: { 'user-agent': config.trueUA },
            parseResponse: (txt) => txt,
        });

        const $feed = load(xmlText, { xmlMode: true });

        const items: DataItem[] = $feed('item')
            .toArray()
            .map((el) => {
                const $el = $feed(el);

                const title = $el.find('title').text();
                const link = $el.find('link').text().trim();
                const pubDateStr = $el.find('pubDate').text().trim();
                const pubDate = pubDateStr ? parseDate(pubDateStr) : undefined;

                const categories = $el
                    .find('category')
                    .toArray()
                    .map((c) => $feed(c).text().trim())
                    .filter(Boolean);

                // content:encoded carries the full article HTML
                const encodedContent = $el.find(String.raw`content\:encoded`).text();
                const descriptionFallback = $el.find('description').text();
                let description = encodedContent || descriptionFallback;

                // Prepend featured image if present in enclosure or media:content
                const imageUrl = $el.find('enclosure[type^="image"]').attr('url') ?? $el.find(String.raw`media\:content[medium="image"]`).attr('url') ?? $el.find(String.raw`media\:thumbnail`).attr('url');

                if (imageUrl && !description.includes(imageUrl)) {
                    description = `<img src="${imageUrl}" alt="${title}">\n${description}`;
                }

                // Derive featured image from og:image in the encoded content as fallback
                let ogImage: string | undefined;
                if (!imageUrl) {
                    const $desc = load(description);
                    const firstImg = $desc('img').first().attr('src');
                    ogImage = firstImg;
                }

                return {
                    title,
                    link,
                    description,
                    pubDate,
                    category: categories.length > 0 ? categories : undefined,
                    image: imageUrl ?? ogImage,
                    guid: link,
                } as DataItem;
            });

        return {
            title: 'Absa Group — Media Centre',
            link: MEDIA_CENTRE_URL,
            image: `${BASE_URL}/favicon.ico`,
            description: 'Latest press releases, media statements, and thought-leadership articles from Absa Group.',
            item: items,
        };
    },
};
