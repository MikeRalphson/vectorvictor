import * as fs from 'node:fs';
import * as util from 'node:util';
import vm from 'node:vm';

import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';
import { transform } from 'buble';
import { render } from 'preact-render-to-string';
import { compile } from '@mdx-js/mdx'

import { doit, connect, disconnect } from './lib/import.js';

let now = new Date();
let react, jsx; // virtual modules for (p)react/JSX rendering
let mdx, rjr, inspect; // virtual modules for MDX rendering

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

const vmContext = { html: 'Failed to render (initial)' };
vm.createContext(vmContext);

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
  if (specifier === 'mdx') {
    console.log('Using',specifier,'from',referencingModule.identifier);
    return mdx;
  }
  if (specifier === 'react/jsx-runtime') {
    console.log('Using',specifier,'from',referencingModule.identifier);
    return rjr;
  }
  if (specifier.indexOf('styled')>=0) {
    console.log('Synthesisng',specifier,'from',referencingModule.identifier);
    const styled = new vm.SyntheticModule(['default'],function() {
      console.log('In styled shim...');
      styled.setExport('default', { div: () => {}, section: () => {}, hr: () => {}, componentStyle: {} });
    }, { identifier: 'styled', context: vmContext });
    await styled.link(linker);
    return styled;
  }
  console.log('Shimming',specifier,'from',referencingModule.identifier);
  const shim = new vm.SyntheticModule(['default','jsx','jsxs','Chart','Fragment','Configure','ContextualStyles','DocWrapper','RightColumnWrapper','CallOut','Feature','OrderedListStyles','UnorderedListStyles','Paragraph','TextSection','SideXSide','Snippet','Highlight','InstantSearch','useInstantSearch','Divider','Hits','Pagination','SearchBox','history','theme','v4','BaseButton','BaseLink','BaseLinkStyles','SectionStyles','VideoComponent','LandingCard','OutboundLink','leftNavItems','algoliasearch','navigate','graphql','withPrefix'],function(a) { return function(b){return b;}; }, { context: vmContext }); // we leave identifier unset as it varies
  await shim.link(linker);
  return shim;
}

async function main(filename) {

  console.log(`Pre-processing ${filename}`);
  let input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');

  if (process.argv[2].endsWith('.mdx')) {
    if (!rjr) {
      const rjrc = fs.readFileSync('./rjr.js','utf8');
      rjr = new vm.SourceTextModule(rjrc,
       { identifier: 'rjr', context: vmContext });
      await rjr.link(linker);
    }

    const compiled = await compile(input);
    const mdxc = String(compiled);
    fs.writeFileSync('./mdx.mjs',mdxc,'utf8');
    mdx = new vm.SourceTextModule(mdxc,
      { identifier: 'mdx', context: vmContext });
    await mdx.link(linker);
    const runner = new vm.SourceTextModule('import mdx from "mdx";html = mdx();',{
      identifier: 'runner', context: vmContext
    });
    await runner.link(linker);
    try {
      await runner.evaluate();
    }
    catch (ex) {
      console.warn(ex);
    }
    console.log('Converting mdx output...');
    fs.writeFileSync('./mdx.html',util.inspect(vmContext.html)||'Failed to render (mdx)','utf8');
    process.exit(1);
  }
  else if (process.argv[2].endsWith('.jsx')) {

    if (process.argv[2].indexOf('404.jsx') >= 0 || process.argv[2].indexOf('search.jsx') >= 0) {
      console.info('Skipping unncessary .jsx page');
      input = '';
    }
    else {
      if (!react) {
        let reactSrc = fs.readFileSync('./preact.mjs','utf8');
        react = new vm.SourceTextModule(reactSrc,
          { identifier: 'react', context: vmContext });
        await react.link(linker);
      }
      console.log('Converting jsx input...');
      let jsxc = transform(input, { transforms: { moduleImport: false, moduleExport: false, dangerousTaggedTemplateString: true } }).code;
      jsxc = 'const process={env:{NODE_ENV:"production"}};'+jsxc;
      jsxc = jsxc.split('export var query = graphql(templateObject);').join('');
      jsxc = jsxc.split('.componentStyle.rules').join('');
      jsxc = jsxc.replace("import React from 'react';", 'import * as React from "react";');
      fs.writeFileSync('./jsx.mjs',jsxc,'utf8');
      jsxc = jsxc.split('\n          ').join(' '); // fix broken string literals
      jsx = new vm.SourceTextModule(jsxc, {identifier: 'jsx', context: vmContext, });
      await jsx.link(linker);
      const runner = new vm.SourceTextModule('import comp from "jsx";const component = new comp({data:{}}); html = component.render ? component.render(): comp({data:{}});',{
        identifier: 'runner', context: vmContext
      });
      await runner.link(linker);
      try {
        await runner.evaluate();
      }
      catch (ex) {
        console.warn(ex);
      }
      console.log('Converting jsx output...');
      const html = render(vmContext.html);
      fs.writeFileSync('./component.html',html,'utf8');
      input = html2md.turndown(html||'Failed to render (secondary)');
      fs.writeFileSync('./markdown.md',input,'utf8');
    }
  }

  await doit(input, filename);
}

await connect();
for (let i=2;i<process.argv.length;i++) {
  await main(process.argv[i]);
}
await disconnect();
