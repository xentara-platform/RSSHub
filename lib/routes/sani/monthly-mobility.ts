import * as cheerio from 'cheerio';

import type { Route } from '@/types';
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
        gotoConfig: { waitUntil: 'domcontentloaded' },
    });

    const html = await page.content();
    await destroy();

    const $ = cheerio.load(html);

    // Monthly Mobility uses Elementor cards, often represented as columns or image boxes.
    const items = $('.elementor-element')
        .toArray()
        .map((elem) => {
            const item = $(elem);

            // Find the main image
            const img = item.find('img').first();
            const imgSrc = img.attr('src');
            if (!imgSrc) {
                return null;
            } // Must have an image

            // Find the title
            let titleText = item.find('h2, h3, h4, .elementor-heading-title, .elementor-image-box-title').first().text().trim();
            if (!titleText) {
                titleText = 'Mobility Plan'; // Fallback
            }

            // Ignore footer columns
            const ignoreList = new Set(['Branches', 'Secure online payments', 'Contact Number:', 'Call Centre Hours:', 'Log Reservation Request:', 'Support Centre (Portal):']);
            if (ignoreList.has(titleText)) {
                return null;
            }

            // Extract all text content representing the "set of data"
            const textData = item
                .find('.elementor-text-editor, .elementor-icon-list-text, p, li')
                .toArray()
                .map((el) => $(el).text().trim())
                .filter((t) => t.length > 0 && t !== titleText && !ignoreList.has(t));

            if (textData.length === 0) {
                return null;
            } // Must have some data

            // Format the extracted data as a clean summary list with the image
            const description = `
            <img src="${imgSrc}" alt="${img.attr('alt') || titleText}">
            <ul>
                ${textData.map((t) => `<li>${t}</li>`).join('')}
            </ul>
        `;

            return {
                title: titleText,
                link: url, // User requested the link to return to the original page
                guid: `${url}#${encodeURIComponent(titleText)}`, // Unique GUID required by RSSHub
                description,
            };
        })
        .filter(Boolean) as any[];

    // Ensure we don't have duplicate items if selectors overlap
    const uniqueItems = items.filter((item, index, self) => index === self.findIndex((t) => t.guid === item.guid));

    return {
        title: 'Sani Car Rental - Monthly Mobility',
        link: url,
        item: uniqueItems,
    };
}
