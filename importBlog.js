import * as fs from 'node:fs';
import { doit, connect, disconnect } from './lib/import.js';

const input = fs.readFileSync('./blog/content.txt', 'utf-8').split('\r').join('').split('\n');

await connect();
for (let entry of input) {
  const [url, content] = entry.split('\t');
  if (content) await doit(content, url);
}
await disconnect();
