import * as cheerio from 'cheerio';

import type { Route } from '@/types';
import { parseDate } from '@/utils/parse-date';
import { getPlaywrightPage } from '@/utils/playwright';

export const route: Route = {
    path: '/monthly-mobility',
    categories: ['travel'],
    example: '/sani/monthly-mobility',
    parameters: {},
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
    },
    name: 'Monthly Mobility',
    maintainers: ['your-github-username'],
    handler,
};

async function handler() {
    const url = 'https://sani.co.za/monthly-mobility/';

    const { page, destroy } = await getPlaywrightPage(url, {
        gotoConfig: { waitUntil: 'networkidle' },
    });

    const html = await page.content();
    await destroy();

    const $ = cheerio.load(html);

    const items = $('.post-item, article, .mobility-post')
        .toArray()
        .map((elem) => {
            const item = $(elem);
            const titleElem = item.find('h2, h3, .post-title, .entry-title').first();
            const linkElem = item.find('a').first();
            const pubDateText = item.find('.date, .published, time').first().text().trim();

            return {
                title: titleElem.text().trim(),
                link: linkElem.attr('href') ? new URL(linkElem.attr('href') as string, url).href : '',
                pubDate: pubDateText ? parseDate(pubDateText) : undefined,
                description: item.find('.excerpt, .entry-content, .post-excerpt').html() || '',
            };
        });

    return {
        title: 'Sani Car Rental - Monthly Mobility',
        link: url,
        item: items.filter((item) => item.title && item.link),
    };
}
