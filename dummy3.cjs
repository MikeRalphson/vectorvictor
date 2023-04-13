styled.div = function(s) { return s; };
styled.section = function(s) { return s; };
styled.hr = function(s) { return s; };

import * as jsdom from 'jsdom';
const dom = new jsdom.JSDOM(`<!DOCTYPE html><p>Hello world</p>`);

if (!document) global.document = dom.window.document;
