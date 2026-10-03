import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const serverFile = path.resolve(projectRoot, 'src/server.mjs');

if (fs.existsSync(serverFile)) {
    const matches = [
        ...fs.globSync('node_modules/.pnpm/**/patchright-core/browsers.json'),
        ...fs.globSync('node_modules/**/patchright-core/browsers.json'),
        ...fs.globSync('node_modules/.pnpm/**/playwright-core/browsers.json'),
        ...fs.globSync('node_modules/**/playwright-core/browsers.json'),
    ];

    const uniqueMatches = [...new Set(matches)];

    if (uniqueMatches.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[vercel-nft-fix] Adding ${uniqueMatches.length} browser asset(s) to ${path.relative(projectRoot, serverFile)}`);
        const content = fs.readFileSync(serverFile, 'utf8');
        const injection = `import fs from 'node:fs';
import path from 'node:path';
if (false) {
${uniqueMatches.map((m) => `    fs.readFileSync(path.join(process.cwd(), '${m}'));`).join('\n')}
}
`;
        fs.writeFileSync(serverFile, injection + content);
    }
}
