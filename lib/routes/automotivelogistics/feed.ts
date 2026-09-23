import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://www.automotivelogistics.media';

export const route: Route = {
    path: '/:category?',
    categories: ['traditional-media'],
    example: '/automotivelogistics/news',
    parameters: {
        category: {
            description: 'Category section slug',
            options: [
                { value: 'news', label: 'News' },
                { value: 'features', label: 'Features' },
                { value: 'interviews', label: 'Interviews' },
                { value: 'analysis', label: 'Analysis' },
                { value: 'digitalisation', label: 'Digitalisation' },
                { value: 'nearshoring', label: 'Nearshoring' },
                { value: 'lean-logistics', label: 'Lean Logistics' },
                { value: 'ev-and-battery', label: 'EV and Battery' },
                { value: 'sustainability', label: 'Sustainability' },
                { value: 'supply-chain', label: 'Supply Chain' },
                { value: 'inbound-logistics', label: 'Inbound Logistics' },
                { value: 'vehicle-logistics', label: 'Vehicle Logistics' },
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
        { source: ['www.automotivelogistics.media/:category'], target: '/:category' },
        { source: ['www.automotivelogistics.media/'], target: '/' },
    ],
    name: 'News and Articles',
    maintainers: ['FrancoBenedetti'],
    handler: async (ctx) => {
        const category = ctx.req.param('category');
        const targetUrl = category ? `${BASE_URL}/${category}` : BASE_URL;

        const responseText: string = await ofetch(targetUrl);
        const $ = load(responseText);

        const articleLinks = new Set<string>();
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (
                href &&
                (href.match(/\/\d+\.article$/) || href.match(/\/\d+$/)) &&
                !href.includes('/events') &&
                !href.includes('/magazines') &&
                !href.includes('/reports') &&
                !href.includes('/whitepapers') &&
                !href.includes('/video')
            ) {
                const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
                articleLinks.add(fullUrl);
            }
        });

        const linksArray = [...articleLinks].slice(0, 20);

        const items = await Promise.all(
            linksArray.map((link) =>
                cache.tryGet(`${link}:v1`, async () => {
                    const html: string = await ofetch(link);
                    const $art = load(html);

                    $art('script, style, iframe, .share-buttons, .related-articles, .ad-container, .sponsored-content').remove();

                    const rawTitle = $art('h1').first().text().trim() || $art('meta[property="og:title"]').attr('content') || '';
                    const metaAuthor = $art('meta[name="author"]').attr('content')?.trim();
                    const elAuthor = $art('.article-author, .byline, .author').first().text().trim();
                    const rawAuthor = metaAuthor || elAuthor || 'Automotive Logistics';
                    const author = rawAuthor.replaceAll(/\s+/g, ' ').trim();

                    const dateStr = $art('meta[property="article:published_time"]').attr('content') || $art('time').attr('datetime') || $art('.published-date, .date').first().text().trim();
                    const pubDate = dateStr ? parseDate(dateStr) : undefined;

                    const imageUrl = $art('meta[property="og:image"]').attr('content');

                    const $contentContainer = $art('.bodytext, .article-body, .main-article, .main.article, .page-content').first();

                    let description = $contentContainer.length > 0 ? $contentContainer.html()?.trim() || '' : '';

                    if (imageUrl && !description.includes(imageUrl)) {
                        description = `<img src="${imageUrl}" alt="${rawTitle}">${description}`;
                    }

                    return {
                        title: rawTitle,
                        link,
                        description,
                        pubDate,
                        author,
                        guid: link,
                        image: imageUrl,
                        media: imageUrl ? { content: { url: imageUrl, medium: 'image' } } : undefined,
                    };
                })
            )
        );

        return {
            title: category ? `Automotive Logistics - ${category}` : 'Automotive Logistics',
            link: targetUrl,
            description: 'Automotive supply chain and logistics intelligence, news, and analysis.',
            language: 'en',
            image: 'https://image.automotivelogistics.media/logo.png',
            item: items.filter((item): item is NonNullable<typeof item> => item !== null),
        };
    },
};
