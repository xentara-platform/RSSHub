import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const FEED_URL = 'https://blog.eqstra.co.za/rss.xml';
const SITE_URL = 'https://blog.eqstra.co.za';

export const route: Route = {
    path: '/insights',
    categories: ['traditional-media'],
    example: '/eqstra/insights',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['blog.eqstra.co.za/'], target: '/insights' },
        { source: ['www.eqstra.co.za/insights-resources-and-news'], target: '/insights' },
        { source: ['eqstra.co.za/insights'], target: '/insights' },
    ],
    name: 'Fleet Intuition Insights',
    maintainers: ['FrancoBenedetti'],
    handler: async () => {
        const xmlText: string = await ofetch(FEED_URL, {
            headers: {
                'user-agent': config.trueUA,
            },
            parseResponse: (txt) => txt,
        });

        const $feed = load(xmlText, { xmlMode: true });

        const rawItems: Array<{
            title: string;
            link: string;
            guid: string;
            pubDateStr?: string;
            feedCategories: string[];
            feedFeaturedImg?: string;
        }> = [];

        $feed('item').each((_, el) => {
            const $item = $feed(el);
            const link = $item.find('link').text().trim();
            if (link) {
                const categories: string[] = [];
                $item.find('category').each((_, catEl) => {
                    const cat = $feed(catEl).text().trim();
                    if (cat) {
                        categories.push(cat);
                    }
                });

                const descHtml = $item.find('description').text() || $item.find(String.raw`content\:encoded`).text();
                let feedFeaturedImg: string | undefined;
                if (descHtml) {
                    const $desc = load(descHtml);
                    feedFeaturedImg = $desc('img.hs-featured-image').attr('src') || $desc('img').first().attr('src');
                }

                rawItems.push({
                    title: $item.find('title').text().trim(),
                    link,
                    guid: $item.find('guid').text().trim() || link,
                    pubDateStr: $item.find('pubDate').text().trim(),
                    feedCategories: categories,
                    feedFeaturedImg,
                });
            }
        });

        const items = await Promise.all(
            rawItems.map((rawItem) =>
                cache.tryGet(`${rawItem.link}:v1`, async (): Promise<DataItem> => {
                    let description = '';
                    let imageUrl = rawItem.feedFeaturedImg;
                    const pubDate = rawItem.pubDateStr ? parseDate(rawItem.pubDateStr) : undefined;
                    const author = 'Eqstra Fleet Management';

                    try {
                        const artHtml: string = await ofetch(rawItem.link, {
                            headers: {
                                'user-agent': config.trueUA,
                            },
                        });
                        const $art = load(artHtml);

                        const ogImage = $art('meta[property="og:image"]').attr('content');
                        if (ogImage) {
                            imageUrl = ogImage;
                        }

                        const $body = $art('#hs_cos_wrapper_post_body, .blog-post__body').first();
                        if ($body.length) {
                            $body.find('script, style, noscript, form, .hs-form, .hs-button, img[src*="track.hubspot.com"], img[src*="no-cache.hubspot.com"], .hs-cta-wrapper').remove();
                            description = $body.html()?.trim() || '';
                        }
                    } catch {
                        // Fallback to empty description if article request fails
                    }

                    if (imageUrl && !description.includes(imageUrl)) {
                        description = `<img src="${imageUrl}"><br>${description}`;
                    }

                    return {
                        title: rawItem.title,
                        link: rawItem.link,
                        guid: rawItem.guid,
                        pubDate,
                        author,
                        category: rawItem.feedCategories,
                        description,
                        image: imageUrl,
                    };
                })
            )
        );

        return {
            title: 'Eqstra Fleet Management – Fleet Intuition Insights',
            link: SITE_URL,
            description: 'Eqstra Fleet Management insights, fleet leasing, and expert operational guides.',
            item: items,
        };
    },
};
