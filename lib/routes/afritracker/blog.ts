import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const BASE_URL = 'https://afritracker.co.za';

export const route: Route = {
    path: '/blog',
    categories: ['traditional-media'],
    example: '/afritracker/blog',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['afritracker.co.za/'], target: '/blog' },
        { source: ['afritracker.co.za/blog/'], target: '/blog' },
    ],
    name: 'Blog',
    maintainers: ['FrancoBenedetti'],
    description: 'Latest articles and news from the Afritracker blog.',
    handler: async () => {
        // WordPress REST API returns full content — no per-item requests needed
        const posts = await ofetch(`${BASE_URL}/wp-json/wp/v2/posts`, {
            query: { per_page: 20, _embed: 1 },
            headers: { 'user-agent': config.trueUA },
        });

        const items: DataItem[] = posts.map((post: any) => {
            const imageUrl: string | undefined = post.featured_image_src_large?.[0] ?? post._embedded?.['wp:featuredmedia']?.[0]?.source_url;

            const categories: string[] = (post._embedded?.['wp:term']?.[0] ?? []).map((t: any) => t.name as string);

            const description = imageUrl ? `<img src="${imageUrl}" alt="${post.title.rendered}">\n${post.content.rendered}` : post.content.rendered;

            return {
                title: post.title.rendered,
                link: post.link,
                description,
                pubDate: parseDate(post.date),
                author: post._embedded?.author?.[0]?.name,
                category: categories.length > 0 ? categories : undefined,
                image: imageUrl,
                guid: post.link,
            } as DataItem;
        });

        return {
            title: 'Afritracker Blog',
            link: `${BASE_URL}/blog/`,
            description: 'Latest articles and news from the Afritracker blog.',
            item: items,
        };
    },
};
