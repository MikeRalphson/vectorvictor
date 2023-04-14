import * as fs from 'node:fs';
import vm from 'node:vm';

import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';
import * as yaml from 'yaml';
import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';
import { transform } from 'buble';
import { render } from 'preact-render-to-string';

let now = new Date();
let react, jsx; // virtual modules for (p)react/JSX rendering
const MAX_CHUNK_SIZE = 350;
const WORD_OVERLAP = 4;

env.config();
const client = new Client();

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

async function getEmbeddings(text) {
  let res = await client.query(`SELECT embedding FROM ${table} WHERE text like $1;`, [ text ]);
  if (res && res.rows && res.rows[0] && res.rows[0].embedding) return false;
  res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": "${text.trim().split('\\').join('\\\\').split('"').join('\\\"')}" }` });
  let result, msg;
  try {
    if (!res.ok) {
      msg = await res.text();
      throw new Error(msg);
    }
    result = await res.json();
    if (result && result.data && result.data.length && result.data[0].embedding) return result.data[0].embedding;
    return [];
  }
  catch (ex) {
    console.log(`\n\n${ex.message}`);
    return [];
  }
}

async function poke(text, embeddings, source, page, prompt, hidden) {
  if (!embeddings) return true;
  if (!embeddings.length) {
    console.log(`\No embeddings found for '${text}'`);
    return false;
  }
  const res = await client.query(`INSERT INTO ${table} (text, embedding, source, page, prompt, hidden, date) VALUES ($1, $2, $3, $4, $5, $6, $7);`, [ text, `${JSON.stringify(embeddings)}`, source, page, prompt, hidden, now ]);
  return true;
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

  console.log(`Importing ${filename}`);
  let input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');
  if (process.argv[2].endsWith('.html')) {
    console.log('Converting html input...');
    input = html2md.turndown(input);
  }
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

  const data = input.split('\n');
  if (input.indexOf('---\n') >= 0) {
    let line = 1; // skip at least one line, i.e. is file starts with --- as well
    let skip = 1;
    while (!data[line].startsWith('---')) {
      line++;
      skip++;
    }
    if (skip) {
      console.log(`Skipping ${skip} lines of YAML front-matter`);
      const yfmText = data.splice(0,skip).join('\n');
      let yfm = {};
      try {
        yfm = yaml.parse(yfmText);
      }
      catch (ex) {
        console.warn(ex.message);
      }
      let newDate;
      if (yaml.updated) newDate = new Date(yaml.updated);
      if (newDate) console.log(`Setting date to ${newDate.toString()}`);
    }
  }
  await client.connect()
  let stream = '';
  let streams = 0;
  let lineNo = 1;
  let page = 1;
  let inCodeBlock = false;
  let inComment = false;
  for (let line of data) {
    if (lineNo % 63 === 0) {
      page++;
      lineNo = 1;
    }
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      process.stdout.write(inCodeBlock ? '[' : ']');
    }
    if (line.indexOf('<!--') >= 0) {
      inComment = true;
      process.stdout.write('(');
    }
    if (line.indexOf('-->') >= 0) {
      inComment = false;
      process.stdout.write(')');
    }
    if (!inCodeBlock && !inComment && !line.startsWith('#')) {
      if (line.length > MAX_CHUNK_SIZE) {
        process.stdout.write('*');
      }
      else {
        process.stdout.write('.');
      }
      if ((stream.length+line.length < MAX_CHUNK_SIZE) || (line === "")) {
        stream += line.trim()+' ';
      }
      else {
        const words = line.trim().split(' ');
        do {
          const word = words.shift();
          stream += word+' ';
        } while (stream.length <= MAX_CHUNK_SIZE);
      }
      if (stream.length >= MAX_CHUNK_SIZE) {
        const embeddings = await getEmbeddings(stream);
        if (embeddings) {
          await poke(stream, embeddings, process.argv[2], page, true, false);
        }
        streams++;
        const words = stream.split(' ');
        const prefix = words.slice(WORD_OVERLAP*-1,words.length);
        stream = prefix && prefix.length ? prefix.join(' ') : '';
      }
    }
    lineNo++;
  }
  const embeddings = await getEmbeddings(stream);
  await poke(stream, embeddings, process.argv[2], page, true, false);
  console.log(`\n\nImported ${streams} chunks`);
  console.log(`Last chunk: ${stream}`);
  await client.end()
}

main(process.argv[2]);
