'use strict';

const fs = require('fs');
const TurndownService = require('turndown');
const turndownService = new TurndownService();

const s = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');
const a = s.split('<');
const x = a.shift(1);
const s2 = '<'+a.join('<').replace('HTML','html');

const markdown = turndownService.turndown(s2);
fs.writeFileSync(process.argv[2].replace('.htm','.md'),markdown,'utf8');

