import * as cheerio from 'cheerio';

import type { DataItem, Route } from '@/types';
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
    maintainers: ['FrancoBenedetti'],
    handler,
};

interface VehiclePlan {
    group: string;
    vehicle: string;
    isAutomatic: boolean;
    image: string;
    rates: Array<{ km: string; rate: string }>;
    liability: string;
    extraKm: string;
}

async function handler() {
    const url = 'https://sani.co.za/monthly-mobility/';

    const { page, destroy } = await getPlaywrightPage(url, {
        gotoConfig: { waitUntil: 'domcontentloaded' },
    });

    const html = await page.content();
    await destroy();

    const $ = cheerio.load(html);

    const vehiclePlans: VehiclePlan[] = [];

    // Monthly Mobility lists vehicles inside Elementor image-box widgets within dedicated card containers
    $('.elementor-widget-image-box').each((_, el) => {
        const titleEl = $(el).find('h3.elementor-image-box-title, .elementor-image-box-title');
        if (!titleEl.length) {
            return;
        }

        const vehicle = titleEl.text().trim();
        // Ignore footer/navigation image boxes if any
        if (!vehicle || vehicle === 'Branches' || vehicle === 'Airports' || vehicle === 'Useful Links') {
            return;
        }

        // Ascend to the enclosing card container that contains the liability and rate information
        let cardContainer = $(el).parent();
        while (cardContainer.length && !cardContainer.text().includes('Liability') && !cardContainer.is('body')) {
            cardContainer = cardContainer.parent();
        }

        if (!cardContainer.length || cardContainer.is('body')) {
            return;
        }

        const groupEl = cardContainer.find('.MonthlyMobilityVehicleGroup, .elementor-heading-title').first();
        const group = groupEl.text().trim() || 'Vehicle Plan';

        const imgEl = $(el).find('img').first();
        const image = imgEl.attr('src') || '';

        const cardText = cardContainer.text().replaceAll(/\s+/g, ' ');
        const isAutomatic = cardText.includes('AUTOMATIC') || vehicle.includes('(A/T)');

        // Extract mileage tiers and corresponding rates, e.g. "3,000 km R5,899 p/m"
        const rateRegex = /([\d,]+\s*km)\s*(R[\d,]+)\s*(?:p\/m|\/month)?/gi;
        let match: RegExpExecArray | null;
        const rates: Array<{ km: string; rate: string }> = [];
        while ((match = rateRegex.exec(cardText)) !== null) {
            rates.push({
                km: match[1].trim(),
                rate: match[2].trim(),
            });
        }

        const liabilityMatch = cardText.match(/Liability:\s*(R[\d,]+)/i);
        const extraKmMatch = cardText.match(/Extra\s*(?:\/\s*)?Km:\s*(R[\d.]+)/i);

        vehiclePlans.push({
            group,
            vehicle,
            isAutomatic,
            image,
            rates,
            liability: liabilityMatch ? liabilityMatch[1] : '',
            extraKm: extraKmMatch ? extraKmMatch[1] : '',
        });
    });

    // Deduplicate any overlapping card matches by group name
    const uniquePlans = vehiclePlans.filter((plan, index, self) => index === self.findIndex((p) => p.group === plan.group));

    const items: DataItem[] = [];

    // 1. Comprehensive Master Item covering all vehicle options and program terms
    const overviewHtml = `
        <div>
            <h2>Monthly Mobility Rental Solutions</h2>
            <p>
                SANI SIXT Rent A Car offers hassle-free monthly car rental solutions for business or personal travel.
                Monthly rentals eliminate maintenance worries with flexible, rolling 30-day rental terms.
            </p>
            <h3>Program Inclusions & Benefits</h3>
            <ul>
                <li><strong>Super Cover:</strong> Tyres and windscreen cover included for complete peace of mind.</li>
                <li><strong>Maintenance Included:</strong> Servicing and repairs covered, including a courtesy vehicle during scheduled maintenance.</li>
                <li><strong>Roadside Assistance:</strong> 24-hour nationwide emergency roadside assistance.</li>
                <li><strong>Additional Driver:</strong> Extra driver included at no additional charge.</li>
                <li><strong>Flexible Terms:</strong> Return anytime after the initial 30-day period with no long-term lease lock-in.</li>
                <li><strong>Included VAT:</strong> All monthly rental rates are inclusive of 15% VAT.</li>
            </ul>
            <h3>Rental Terms & Conditions</h3>
            <p>
                A once-off holding deposit and a R120 contract fee apply. Available exclusively to credit card holders.
                Rates are subject to fleet availability.
            </p>
            <h3>Vehicle Rates Catalog</h3>
            <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; text-align: left;">
                <thead>
                    <tr style="background: #f4f4f5;">
                        <th>Group</th>
                        <th>Vehicle Model</th>
                        <th>Transmission</th>
                        <th>3,000 km / mo</th>
                        <th>3,750 km / mo</th>
                        <th>4,500 km / mo</th>
                        <th>Liability</th>
                        <th>Extra / Km</th>
                    </tr>
                </thead>
                <tbody>
                    ${uniquePlans
                        .map(
                            (p) => `
                        <tr>
                            <td><strong>${p.group}</strong></td>
                            <td>${p.vehicle}</td>
                            <td>${p.isAutomatic ? 'Automatic' : 'Manual'}</td>
                            <td>${p.rates.find((r) => r.km.includes('3,000'))?.rate || '—'}</td>
                            <td>${p.rates.find((r) => r.km.includes('3,750'))?.rate || '—'}</td>
                            <td>${p.rates.find((r) => r.km.includes('4,500'))?.rate || '—'}</td>
                            <td>${p.liability || '—'}</td>
                            <td>${p.extraKm || '—'}</td>
                        </tr>
                    `
                        )
                        .join('')}
                </tbody>
            </table>
        </div>
    `;

    items.push({
        title: 'Sani Car Rental - Monthly Mobility Plans & Vehicle Options',
        link: url,
        guid: `${url}#overview`,
        description: overviewHtml,
    });

    // 2. Individual card entries for each vehicle plan
    for (const plan of uniquePlans) {
        const cardHtml = `
            <div>
                ${plan.image ? `<img src="${plan.image}" alt="${plan.vehicle}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 12px;" />` : ''}
                <h3>${plan.group}: ${plan.vehicle}</h3>
                <p><strong>Transmission:</strong> ${plan.isAutomatic ? 'Automatic (A/T)' : 'Manual (M/T)'}</p>
                <h4>Monthly Rental Pricing</h4>
                <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; max-width: 480px; margin: 12px 0;">
                    <thead>
                        <tr style="background: #f4f4f5;">
                            <th>Mileage Allowance</th>
                            <th style="text-align: right;">Monthly Rate (incl. 15% VAT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${plan.rates.map((r) => `<tr><td>${r.km}</td><td style="text-align: right; font-weight: bold;">${r.rate} p/m</td></tr>`).join('')}
                    </tbody>
                </table>
                <p>
                    <strong>Holding Liability / Deposit:</strong> ${plan.liability || 'Contact branch'}<br/>
                    <strong>Extra Mileage Charge:</strong> ${plan.extraKm ? `${plan.extraKm} per additional km` : 'Standard rate'}
                </p>
                <h4>Inclusions</h4>
                <ul>
                    <li>Super Cover, tyres, and windscreen cover included</li>
                    <li>Full maintenance & courtesy vehicle during servicing</li>
                    <li>24-hour roadside assistance</li>
                    <li>Additional driver included</li>
                    <li>Rolling 30-day flexible rental terms</li>
                </ul>
            </div>
        `;

        items.push({
            title: `${plan.group}: ${plan.vehicle} - Monthly Mobility`,
            link: `${url}#${encodeURIComponent(plan.group)}`,
            guid: `${url}#${encodeURIComponent(plan.group)}`,
            image: plan.image || undefined,
            description: cardHtml,
        });
    }

    return {
        title: 'Sani Car Rental - Monthly Mobility',
        link: url,
        item: items,
    };
}
