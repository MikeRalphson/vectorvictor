import * as fs from 'node:fs';
import vm from 'node:vm';

import { doit, connect, disconnect } from './lib/import.js';

import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';
import { transform } from 'buble';
import { render } from 'preact-render-to-string';

let now = new Date();
let react, jsx; // virtual modules for (p)react/JSX rendering

const html2md = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', preformattedCode: true });
html2md.keep(['del', 'ins']);
const gfm = turndownPluginGfm.gfm
const tables = turndownPluginGfm.tables
const strikethrough = turndownPluginGfm.strikethrough

// Use the gfm plugin
html2md.use(gfm);

// Use the table and strikethrough plugins only
html2md.use([tables, strikethrough]);

const table = process.env.PGTABLE;

const myObj = { html: 'Failed to render (initial)' };
vm.createContext(myObj);

try {
  let stats = fs.statSync(process.argv[2]);
  if (stats && stats.mtime) now = new Date(stats.mtime);
}
catch (ex) {
  console.warn(ex.message);
}

async function linker(specifier, referencingModule) {
  if (specifier === 'react') {
    console.log('Using',specifier,'from',referencingModule.identifier);
    return react;
  }
  if (specifier === 'jsx') {
    console.log('Using',specifier,'from',referencingModule.identifier);
    return jsx;
  }
  if (specifier.indexOf('styled')>=0) {
    console.log('Synthesisng',specifier,'from',referencingModule.identifier);
    const styled = new vm.SyntheticModule(['default'],function() {
      console.log('In styled shim...');
      styled.setExport('default', { div: () => {}, section: () => {}, hr: () => {}, componentStyle: {} });
    }, { identifier: 'styled', context: myObj });
    await styled.link(linker);
    return styled;
  }
  console.log('Shimming',specifier,'from',referencingModule.identifier);
  const shim = new vm.SyntheticModule(['default','Configure','ContextualStyles','DocWrapper','RightColumnWrapper','CallOut','Feature','OrderedListStyles','UnorderedListStyles','Paragraph','TextSection','SideXSide','Snippet','Highlight','InstantSearch','useInstantSearch','Divider','Hits','Pagination','SearchBox','history','theme','v4','BaseButton','BaseLink','BaseLinkStyles','SectionStyles','VideoComponent','LandingCard','OutboundLink','leftNavItems','algoliasearch','navigate','graphql','withPrefix'],function(a) { const c = function(b){return b;}; }, { context: myObj }); // we leave identifier unset as it varies
  await shim.link(linker);
  return shim;
}

async function main(filename) {
  let reactSrc = fs.readFileSync('./preact.mjs','utf8');
  react = new vm.SourceTextModule(reactSrc,
    { identifier: 'react', context: myObj });
  await react.link(linker);

  await connect();
  console.log(`Importing ${filename}`);
  let input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');
  if (process.argv[2].endsWith('.jsx')) {
    if (process.argv[2].indexOf('404.jsx') >= 0 || process.argv[2].indexOf('search.jsx') >= 0) {
      console.info('Skipping page rendering due to 404.jsx or search.jsx');
      input = '';
    }
    else {
      console.log('Converting jsx input...');
      let jsxc = transform(input, { transforms: { moduleImport: false, moduleExport: false, dangerousTaggedTemplateString: true } }).code;
      jsxc = 'const process={env:{NODE_ENV:"production"}};'+jsxc;
      jsxc = jsxc.split('export var query = graphql(templateObject);').join('');
      jsxc = jsxc.split('.componentStyle.rules').join('');
      jsxc = jsxc.replace("import React from 'react';", 'import * as React from "react";');
      fs.writeFileSync('./jsx.mjs',jsxc,'utf8');
      jsxc = jsxc.split('\n          ').join(' '); // fix broken string literals
      jsx = new vm.SourceTextModule(jsxc, {identifier: 'jsx', context: myObj, });
      await jsx.link(linker);
      const runner = new vm.SourceTextModule('import comp from "jsx";const component = new comp({data:{}}); html = component.render ? component.render(): comp({data:{}});',{
        identifier: 'runner', context: myObj
      });
      await runner.link(linker);
      try {
        await runner.evaluate();
      }
      catch (ex) {
        console.warn(ex);
      }
      console.log('Converting jsx output...');
      const html = render(myObj.html);
      fs.writeFileSync('./component.html',html,'utf8');
      input = html2md.turndown(html||'Failed to render (secondary)');
      fs.writeFileSync('./markdown.md',input,'utf8');
    }
  }
  await doit(input, filename);
  await disconnect();
}

main(process.argv[2]);
