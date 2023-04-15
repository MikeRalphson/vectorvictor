import * as fs from 'node:fs';

import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';
import * as yaml from 'yaml';
import TurndownService from 'turndown';
import turndownPluginGfm from 'turndown-plugin-gfm';

let now = new Date();
const MAX_CHUNK_SIZE = 350;
const WORD_OVERLAP = 4;

env.config();
const client = new Client();

const html2md = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', preformattedCode: true });
//html2md.keep(['del', 'ins']);
const gfm = turndownPluginGfm.gfm
const tables = turndownPluginGfm.tables
const strikethrough = turndownPluginGfm.strikethrough

// Use the gfm plugin
html2md.use(gfm);

// Use the table and strikethrough plugins only
html2md.use([tables, strikethrough]);

const table = process.env.PGTABLE;

function clean(s) {
  return s.split('\n').join(' ').trim();
}

function quote(s) {
  return JSON.stringify(JSON.stringify(s));
}

export async function getEmbeddings(text) {
  // check if we already have this text stored, if so, un-hide it, and skip it
  let res = await client.query(`SELECT embedding FROM ${table} WHERE text like $1;`, [ text ]);
  if (res && res.rows && res.rows[0] && res.rows[0].embedding) {
    res = await client.query(`UPDATE ${table} SET hidden = false WHERE text like $1;`, [ text ]);
    return false;
  }

  res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": ${quote(text)} }` });
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

export async function poke(text, embeddings, source, page, prompt, hidden) {
  if (!embeddings) return true;
  if (!embeddings.length) {
    console.log(`\nNo embeddings found for '${quote(text)}'`);
    return false;
  }
  const emb = JSON.stringify(embeddings);
  const res = await client.query(`INSERT INTO ${table} (text, embedding, source, page, prompt, hidden, date) VALUES ($1, $2, $3, $4, $5, $6, $7);`, [ text, emb, source, page, prompt, hidden, now ]);
  return true;
}

export async function connect() {
  client.connect();
}

export async function disconnect() {
  client.end();
}

export async function doit(input, source = 'anonymous.md') {
  console.log(`Importing source ${source}`);

  // hide all text chunks for this source if we have processed it before
  const res = await client.query(`UPDATE ${table} SET hidden = true WHERE source like $1;`, [ source ]);

  input = input.split('\r').join('');
  if (source.startsWith('http') || source.endsWith('.html')) {
    console.log('Converting html input...');
    input = html2md.turndown(input);
  }

  let data = input.split('\n');
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
  let chunk = '';
  let chunks = 0;
  let lineNo = 1;
  let page = 1;
  let inCodeBlock = false;
  let inComment = false;
  data = data.join('\n').split('\n\n');
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
    if (!inCodeBlock && !inComment) { //&& !line.startsWith('#')) {
      if (line.length > MAX_CHUNK_SIZE) {
        process.stdout.write('*');
      }
      else {
        process.stdout.write('.');
      }
      if ((chunk.length+line.length < MAX_CHUNK_SIZE) || (line === "")) {
        chunk += line.trim()+' ';
      }
      else {
        const words = line.trim().split(' ');
        do {
          const word = words.shift();
          chunk += word+' ';
        } while (chunk.length <= MAX_CHUNK_SIZE);
      }
      if (chunk.length >= MAX_CHUNK_SIZE) {
        chunk = clean(chunk);
        const embeddings = await getEmbeddings(chunk);
        if (embeddings) {
          await poke(chunk, embeddings, source, page, true, false);
        }
        chunks++;
        const words = chunk.split(' ');
        const prefix = words.slice(WORD_OVERLAP*-1,words.length);
        chunk = prefix && prefix.length ? prefix.join(' ') : '';
      }
    }
    lineNo++;
  }
  chunk = clean(chunk);
  const embeddings = await getEmbeddings(chunk);
  await poke(chunk, embeddings, source, page, true, false);
  console.log(`\n\nImported ${chunks} chunks`);
}

