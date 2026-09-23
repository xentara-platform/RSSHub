/* eslint-disable no-console */
import path from 'node:path';

import dotenv from 'dotenv';
import { ofetch } from 'ofetch';

// Load environment variables from .env.db and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.db') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!serviceRoleKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not defined in .env.db or .env');
    process.exit(1);
}

// Extract project ref from DATABASE_URL or fallback to default
let projectRef = 'nnmqmwuwndkatzxjbkmm';
if (databaseUrl) {
    const match = databaseUrl.match(/db\.(.*?)\.supabase\.co/);
    if (match && match[1]) {
        projectRef = match[1];
    }
}

const args = process.argv.slice(2);
const commandOrId = args[0];
const rest = args.slice(1);

if (!commandOrId || commandOrId === '--help' || commandOrId === '-h') {
    console.log(`
Usage:
  npx tsx scripts/update-route-request.ts <request-id> <namespace> <route_path> <example_url> [resolution_notes]
  npx tsx scripts/update-route-request.ts --defer <request-id> [reason]

Examples:
  npx tsx scripts/update-route-request.ts 26ef2858-e9a7-4778-ae9f-47e98e21fb97 automotivelogistics /:category? /automotivelogistics/news "Custom route implemented"
  npx tsx scripts/update-route-request.ts --defer 26ef2858-e9a7-4778-ae9f-47e98e21fb97 "Requires login credentials"
`);
    process.exit(0);
}

let id: string;
let payload: Record<string, any>;

if (commandOrId === '--defer') {
    id = rest[0];
    const reason = rest.slice(1).join(' ') || 'Deferred due to scraping/access limitations';
    if (!id) {
        console.error('Error: Missing request ID for --defer');
        process.exit(1);
    }
    payload = {
        status: 'deferred',
        resolved_at: new Date().toISOString(),
        resolved_by: 'antigravity-agent',
        resolution_notes: reason,
    };
} else {
    id = commandOrId;
    const [ns, routePath, exampleUrl, ...notesArr] = rest;
    if (!id || !ns || !routePath || !exampleUrl) {
        console.error('Error: Missing required arguments: <id> <namespace> <route_path> <example_url>');
        process.exit(1);
    }
    const notes = notesArr.join(' ') || 'Custom route implemented and verified';
    payload = {
        status: 'completed',
        rsshub_namespace: ns,
        rsshub_route_path: routePath,
        rsshub_example_url: exampleUrl,
        resolved_at: new Date().toISOString(),
        resolved_by: 'antigravity-agent',
        resolution_notes: notes,
    };
}

const url = `https://${projectRef}.supabase.co/rest/v1/route_requests?id=eq.${id}`;

console.log(`Updating request ${id} on project ${projectRef}...`);

try {
    await ofetch(url, {
        method: 'PATCH',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: payload,
    });
    console.log(`Successfully updated request ${id} to status: ${payload.status}`);
} catch (error) {
    console.error('Failed to update request:', error);
    process.exit(1);
}
