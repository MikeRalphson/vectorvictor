import * as fs from 'node:fs';
import * as util from 'node:util';
import vm from 'node:vm';

import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';
import * as yaml from 'yaml';
import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';
import { transform } from 'buble';

let now = new Date();
let dummy, react, dummy3, jsx; // virtual modules for React/JSX rendering
const MAX_CHUNK_SIZE = 350;
const WORD_OVERLAP = 4;

env.config();
const client = new Client();

const html2md = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', preformattedCode: true });
html2md.keep(['del', 'ins', 'h1']);
const gfm = turndownPluginGfm.gfm
const tables = turndownPluginGfm.tables
const strikethrough = turndownPluginGfm.strikethrough

// Use the gfm plugin
html2md.use(gfm);

// Use the table and strikethrough plugins only
html2md.use([tables, strikethrough]);

const table = process.env.PGTABLE;

const myObj = { html: '<h1>Hello, World</h1>' };
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
  console.log('Linking',specifier,'from',referencingModule.identifier);
  if (specifier === 'react') {
    return react;
  }
  if (specifier === 'jsx') {
    return jsx;
  }
  if (specifier.indexOf('styled')>=0) {
    const styled = new vm.SyntheticModule(['default'],function() {
      console.log('In styled shim...');
      styled.setExport('default', { div: () => {}, section: () => {}, hr: () => {} });
    }, { identifier: 'styled', context: myObj });
    await styled.link(linker);
    return styled;
  }
  const shim = new vm.SyntheticModule(['default','Configure ','Snippet','Highlight','InstantSearch','useInstantSearch','Divider','Hits','Pagination','SearchBox','history','theme','v4','BaseButton','BaseLink','BaseLinkStyles','SectionStyles','VideoComponent','LandingCard','OutboundLink'],function() { return {} }, { context: myObj }); // we leave identifier unset as it varies
  await shim.link(linker);
  return shim;
}

async function main(filename) {
  dummy = new vm.SourceTextModule(fs.readFileSync('./shim.mjs','utf8'),
    { identifier: 'shim', context: myObj });
  await dummy.link(linker);
  const reactSrc = fs.readFileSync('./react.js','utf8');
  //react = new vm.SourceTextModule(fs.readFileSync('./react.js','utf8'), { identifier: 'react', context: myObj });
  //await react.link(linker);

  console.log(`Importing ${filename}`);
  let input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');
  if (process.argv[2].endsWith('.html')) {
    console.log('Converting html input...');
    input = html2md.turndown(input);
  }
  if (process.argv[2].endsWith('.jsx')) {
    if (process.argv[2].indexOf('404x') >= 0) {
      console.info('Skipping 404 page');
      input = '';
    }
    else {
      console.log('Converting jsx input...');
      dummy3 = fs.readFileSync('./jsx-header.cjs','utf8');
      let jsxc = dummy3+transform(input).code;
      fs.writeFileSync('./temp.mjs',jsxc,'utf8');
      jsx = new vm.SourceTextModule(jsxc, {identifier: 'jsx', context: myObj, });
      await jsx.link(linker);
      const runner = new vm.SourceTextModule('import * as jsx from "jsx";console.log(jsx.render());',{
        identifier: 'runner', context: myObj
      });
      await runner.link(linker);
      const react = new vm.Script(react, { importModuleDynamically: function (spec, context, assert) {
        return true;
      }, filename: "react.js" });
      vm.createContext(context);
      react.runInContext(context);
      await runner.evaluate();
      console.log('modh',myObj);
      input = html2md.turndown(myObj.html);
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
