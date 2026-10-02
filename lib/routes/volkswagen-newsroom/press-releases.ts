import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://www.volkswagen-newsroom.com';
const LIST_URL = `${BASE_URL}/en/press-releases`;

export const route: Route = {
    path: '/press-releases',
    categories: ['traditional-media'],
    example: '/volkswagen-newsroom/press-releases',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['volkswagen-newsroom.com/en/press-releases'], target: '/press-releases' },
        { source: ['www.volkswagen-newsroom.com/en/press-releases'], target: '/press-releases' },
    ],
    name: 'Press Releases',
    maintainers: ['FrancoBenedetti'],
    description: 'Latest global press releases from the Volkswagen Newsroom.',
    handler: async () => {
        const listHtml: string = await ofetch(LIST_URL, {
            headers: { 'user-agent': config.trueUA },
        });
        const $ = load(listHtml);

        // Collect unique article paths from listing page
        const articlePaths: string[] = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') ?? '';
            if (href.match(/^\/en\/press-releases\/[^?#]+$/) && !articlePaths.includes(href)) {
                articlePaths.push(href);
            }
        });

        // Fetch each article detail page for full content
        const items: DataItem[] = await Promise.all(
            articlePaths.map((path) => {
                const link = `${BASE_URL}${path}`;
                return cache.tryGet(`${link}:v1`, async () => {
                    const artHtml: string = await ofetch(link, {
                        headers: { 'user-agent': config.trueUA },
                    });
                    const $a = load(artHtml);

                    const title = $a('meta[property="og:title"]').attr('content') ?? $a('title').text().trim();
                    const imageUrl = $a('meta[property="og:image"]').attr('content');

                    // Date: ISO pattern embedded in the page source
                    const dateMatch = artHtml.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
                    const pubDate = dateMatch ? parseDate(dateMatch[1]) : undefined;

                    // Content: intro paragraph + main text block
                    const intro = $a('.intro-text').html() ?? '';
                    const body = $a('.text-block').html() ?? $a('.content').html() ?? '';
                    const description = imageUrl ? `<img src="${imageUrl}" alt="${title}">\n${intro}\n${body}` : `${intro}\n${body}`;

                    return {
                        title,
                        link,
                        description,
                        pubDate,
                        image: imageUrl,
                        guid: link,
                    } as DataItem;
                }) as Promise<DataItem>;
            })
        );

        return {
            title: 'Volkswagen Newsroom — Press Releases',
            link: LIST_URL,
            description: 'Latest global press releases from the Volkswagen Newsroom.',
            item: items,
        };
    },
};
