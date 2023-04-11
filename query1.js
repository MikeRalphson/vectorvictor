import { query } from './query.js';

const arr = Array.from(process.argv);
arr.shift(0);
arr.shift(0);
const data = arr.join(' ').toLowerCase();

query(data);
