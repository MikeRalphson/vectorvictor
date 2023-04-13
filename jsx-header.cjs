if (!styled) var styled = {};
styled.div = function(s) { return s; };
styled.section = function(s) { return s; };
styled.hr = function(s) { return s; };

// we don't get a real reference to JSDOM here but our dummy!
//import * as pkg from 'jsdom';
//const { JSDOM } = pkg;
//const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);

//if (!document) global.document = dom.window.document;
