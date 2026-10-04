/* eslint-disable no-console */
/**
 * Static Route Index Builder
 *
 * Walks lib/routes/ and reads each .ts file as plain text (no dynamic import).
 * Extracts route metadata via regex and produces a lightweight JSON index
 * for route discovery and search.
 *
 * Usage: npx tsx scripts/build-route-index.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = path.join(import.meta.dirname, '../lib/routes');
const OUTPUT_PATH = path.join(import.meta.dirname, '../assets/build/route-index.json');

// --- Regex extractors ---

function extractString(text: string, field: string): string | undefined {
    // Match: field: 'value' or field: "value" or field: `value`
    const regex = new RegExp(`${field}:\\s*['"\`]([^'"\`]+)['"\`]`);
    const match = text.match(regex);
    return match?.[1];
}

function extractStringArray(text: string, field: string): string[] {
    // Match: field: ['a', 'b'] or field: ["a", "b"]
    const regex = new RegExp(`${field}:\\s*\\[([^\\]]*?)\\]`);
    const match = text.match(regex);
    if (!match?.[1]) {
        return [];
    }
    return match[1]
        .split(',')
        .map((s) => s.trim().replaceAll(/^['"`]|['"`]$/g, ''))
        .filter(Boolean);
}

// --- File classification ---

interface NamespaceData {
    name: string;
    url?: string;
    categories?: string[];
    description?: string;
}

interface RouteData {
    path: string;
    name: string;
    example?: string;
    parameters?: any;
    maintainers: string[];
    categories: string[];
    file: string;
    features?: {
        requirePuppeteer?: boolean;
        antiCrawler?: boolean;
    };
    executionEngine?: string;
}

interface ApiRouteData {
    path: string;
    name: string;
    example?: string;
    parameters?: any;
    file: string;
}

function extractParameters(text: string): any | undefined {
    const startIdx = text.indexOf('parameters:');
    if (startIdx === -1) {
        return undefined;
    }

    const openBraceIdx = text.indexOf('{', startIdx);
    if (openBraceIdx === -1) {
        return undefined;
    }

    let depth = 0;
    let endIdx = -1;
    for (let i = openBraceIdx; i < text.length; i++) {
        if (text[i] === '{') {
            depth++;
        } else if (text[i] === '}') {
            depth--;
        }

        if (depth === 0) {
            endIdx = i + 1;
            break;
        }
    }

    if (endIdx === -1) {
        return undefined;
    }

    const paramStr = text.slice(openBraceIdx, endIdx);

    try {
        // eslint-disable-next-line no-new-func
        return new Function(`return ${paramStr}`)();
    } catch {
        return undefined;
    }
}

function parseNamespaceFile(text: string): NamespaceData | null {
    if (!text.includes('export const namespace')) {
        return null;
    }
    const name = extractString(text, 'name');
    if (!name) {
        return null;
    }
    return {
        name,
        url: extractString(text, 'url'),
        categories: extractStringArray(text, 'categories'),
        description: extractString(text, 'description'),
    };
}

function parseRouteFile(text: string, fileName: string): RouteData | null {
    if (!text.includes('export const route')) {
        return null;
    }
    // Extract the metadata section (everything before `handler:`)
    const metaSection = text.split(/handler\s*:/, 1)[0];
    if (!metaSection) {
        return null;
    }

    const routePath = extractString(metaSection, 'path');
    const name = extractString(metaSection, 'name');
    if (!routePath || !name) {
        return null;
    }

    const requirePuppeteer = metaSection.includes('requirePuppeteer: true');
    const antiCrawler = metaSection.includes('antiCrawler: true');
    const executionEngine = requirePuppeteer ? 'residential_browser' : 'serverless';

    return {
        path: routePath,
        name,
        example: extractString(metaSection, 'example'),
        parameters: extractParameters(metaSection),
        maintainers: extractStringArray(metaSection, 'maintainers'),
        categories: extractStringArray(metaSection, 'categories'),
        file: fileName,
        features: {
            requirePuppeteer,
            antiCrawler,
        },
        executionEngine,
    };
}

function parseApiRouteFile(text: string, fileName: string): ApiRouteData | null {
    if (!text.includes('export const apiRoute')) {
        return null;
    }
    const metaSection = text.split(/handler\s*:/, 1)[0];
    if (!metaSection) {
        return null;
    }

    const routePath = extractString(metaSection, 'path');
    const name = extractString(metaSection, 'name');
    if (!routePath || !name) {
        return null;
    }

    return {
        path: routePath,
        name,
        example: extractString(metaSection, 'example'),
        parameters: extractParameters(metaSection),
        file: fileName,
    };
}

// --- Main ---

interface NamespaceEntry {
    name: string;
    url?: string;
    categories: string[];
    description?: string;
    routes: RouteData[];
    apiRoutes: ApiRouteData[];
}

interface RouteIndex {
    version: number;
    generatedAt: string;
    searchKeys: Array<{ key: string; name: string; url: string }>;
    namespaces: Record<string, NamespaceEntry>;
}

function buildIndex(): RouteIndex {
    const namespaces: Record<string, NamespaceEntry> = {};
    let fileCount = 0;
    let routeCount = 0;
    let nsCount = 0;

    const nsDirs = fs
        .readdirSync(ROUTES_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .toSorted((a, b) => a.localeCompare(b));

    for (const nsDir of nsDirs) {
        const nsPath = path.join(ROUTES_DIR, nsDir);

        // Collect all .ts/.tsx files recursively within this namespace
        const tsFiles = collectTsFiles(nsPath, nsPath);

        let nsData: NamespaceData | null = null;
        const routes: RouteData[] = [];
        const apiRoutes: ApiRouteData[] = [];

        for (const relFile of tsFiles) {
            const fullPath = path.join(nsPath, relFile);
            let text: string;
            try {
                text = fs.readFileSync(fullPath, 'utf-8');
            } catch {
                continue;
            }
            fileCount++;

            // Try namespace
            if (relFile.endsWith('namespace.ts')) {
                const parsed = parseNamespaceFile(text);
                if (parsed) {
                    nsData = parsed;
                    nsCount++;
                }
                continue;
            }

            // Try route
            const route = parseRouteFile(text, relFile);
            if (route) {
                routes.push(route);
                routeCount++;
                continue;
            }

            // Try API route
            const apiRoute = parseApiRouteFile(text, relFile);
            if (apiRoute) {
                apiRoutes.push(apiRoute);
            }

            // Otherwise: utility file, skip silently
        }

        // Only include namespaces that have actual content
        if (nsData || routes.length > 0 || apiRoutes.length > 0) {
            namespaces[nsDir] = {
                name: nsData?.name || nsDir,
                url: nsData?.url,
                categories: nsData?.categories || [],
                description: nsData?.description,
                routes,
                apiRoutes,
            };
        }
    }

    // Build search keys for fast partial matching
    const searchKeys = Object.entries(namespaces).map(([key, data]) => ({
        key,
        name: data.name,
        url: data.url || '',
    }));

    console.log(`Scanned ${fileCount} files across ${nsDirs.length} directories`);
    console.log(`Found ${nsCount} namespaces, ${routeCount} routes`);

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        searchKeys,
        namespaces,
    };
}

function collectTsFiles(basePath: string, rootPath: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(basePath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(basePath, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectTsFiles(fullPath, rootPath));
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            results.push(path.relative(rootPath, fullPath));
        }
    }

    return results;
}

// Run
const startTime = Date.now();
const index = buildIndex();

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2));

const elapsed = Date.now() - startTime;
const sizeKb = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
console.log(`Wrote ${OUTPUT_PATH} (${sizeKb} KB) in ${elapsed}ms`);
