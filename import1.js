import * as fs from 'node:fs';
import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';

const now = new Date();
const MAX_CHUNK_SIZE = 250;
const WORD_OVERLAP = 2;

env.config();
const client = new Client();

const table = process.env.PGTABLE;

const input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');

const data = input.split('\n');
if (input.indexOf('---\n') >= 0) { // skip YAML front-matter
  console.log('Skipping YAML front-matter');
  let line = 0;
  let skip = 0;
  while (!data[line].startsWith('---')) {
    line++;
    skip++;
  }
  if (skip) data.shift(skip);
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

async function main(filename) {
  console.log(`Importing ${filename}`);
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
    if (!inCodeBlock && !inComment) {
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
        stream = prefix ? prefix.join(' ') : '';
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
