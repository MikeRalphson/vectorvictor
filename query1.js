import { query, quit } from './query.js';

const arr = Array.from(process.argv);
arr.shift(0);
arr.shift(0);
const data = arr.join(' ');

console.log(await query(data));
await quit();
