// Turns the FDA Orange Book data files into published/orangebook.json (brand drugs: patent, expiry, drug, ingredient, applicant).
// Run by .github/workflows/orangebook.yml after it downloads and unzips the FDA file, or by hand:
//   npx --yes tsx@4.19.2 scripts/orangebook-build.ts path/to/unzipped/folder
// Free public data, no key. Facts from the FDA list only; nothing here is advice and nothing can trade.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseOrangeBook } from '../shared/orangeBook.js';

const dir = process.argv[2] || 'ob';
const read = (n: string) => readFileSync(`${dir}/${n}`, 'latin1');
const f = parseOrangeBook(read('patent.txt'), read('products.txt'), new Date().toISOString().slice(0, 10));
if (f.rows.length < 1000) { console.error(`Only ${f.rows.length} rows: the FDA file format may have changed. Not writing.`); process.exit(1); }
mkdirSync('published', { recursive: true });
writeFileSync('published/orangebook.json', JSON.stringify(f));
console.log(`orangebook.json: ${f.rows.length} rows`);
