import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// Only static imports: these are downloaded before a route can paint.
const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'public/build');
const manifest = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json'), 'utf8'));
const files = new Set();
const visited = new Set();
function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item) return;
    files.add(item.file);
    for (const css of item.css ?? []) files.add(css);
    for (const dependency of item.imports ?? []) visit(dependency);
}
for (const [key, item] of Object.entries(manifest)) if (item.isEntry) visit(key);
const assets = [...files].map((file) => {
    const data = fs.readFileSync(path.join(build, file));
    return { file, bytes: data.length, gzipBytes: gzipSync(data).length };
});
const report = {
    measuredAt: new Date().toISOString(),
    description: 'Static dependencies of Vite entry points; excludes route downloads and images.',
    bytes: assets.reduce((sum, item) => sum + item.bytes, 0),
    gzipBytes: assets.reduce((sum, item) => sum + item.gzipBytes, 0),
    assets,
};
if (process.argv[2]) {
    const output = path.resolve(root, process.argv[2]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
