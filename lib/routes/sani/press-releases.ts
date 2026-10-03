import * as cheerio from 'cheerio';

import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import { getPlaywrightPage } from '@/utils/playwright';

export const route: Route = {
    path: '/press-releases',
    categories: ['travel'],
    example: '/sani/press-releases',
    parameters: {},
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
    },
    name: 'Press Releases',
    maintainers: ['your-github-username'],
    handler,
};

async function handler() {
    const url = 'https://sani.co.za/press-releases/';

    const { page, destroy } = await getPlaywrightPage(url, {
        gotoConfig: { waitUntil: 'domcontentloaded' },
    });

    const html = await page.content();
    await destroy();

    const $ = cheerio.load(html);

    const items = $('.elementor-post')
        .toArray()
        .map((elem) => {
            const item = $(elem);
            const titleElem = item.find('.elementor-post__title, h3, h2').first();
            const linkElem = item.find('a.elementor-post__read-more').first();
            const pubDateText = item.find('.elementor-post-date, .elementor-post__meta-data .elementor-icon-list-text').first().text().trim();

            return {
                title: titleElem.text().trim(),
                link: linkElem.attr('href') ? new URL(linkElem.attr('href') as string, url).href : '',
                pubDate: pubDateText ? parseDate(pubDateText) : undefined,
                description: item.find('.elementor-post__excerpt').html() || '',
            };
        })
        .filter((item) => item.title && item.link);

    return {
        title: 'Sani Car Rental - Press Releases',
        link: url,
        item: items,
    };
}
