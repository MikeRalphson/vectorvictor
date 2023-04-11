'use strict';

const fs = require('node:fs');
const TurndownService = require('turndown');
const turndownService = new TurndownService();

const s = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');

const markdown = turndownService.turndown(s);
fs.writeFileSync(process.argv[2].replace('.html','.htm').replace('.htm','.md'),markdown,'utf8');

