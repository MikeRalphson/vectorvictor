import * as fs from 'node:fs';
import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';

const now = new Date();
const MAX_CHUNK_SIZE = 250;
const WORD_OVERLAP = 2;

env.config();
const client = new Client();

const database = process.env.PGDATABASE;
const table = process.env.PGTABLE;

const input = fs.readFileSync(process.argv[2],'utf8').split('\r').join('');
const data = input.split('\n');
if (indexOf(input, '---\n') >= 0) { // skip YAML front-matter
  let line = 1;
  while (data[line-1] !== '---\n') {
    data.shift();
    line++;
  }
}

async function getEmbeddings(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": "${text.trim()}" }` });
  let result, msg;
  try {
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
  if (!embeddings.length) return false;
  const res = await client.query(`INSERT INTO "${database}"."${table}" (text, embedding, source, page, prompt, hidden, date) VALUES ($1, $2, $3, $4, $5, $6, $7);`, [ text, `${JSON.stringify(embeddings)}`, source, page, prompt, hidden, now ]);
  return true;
}

async function main() {
  await client.connect()
  let stream = '';
  let streams = 0;
  let lineNo = 1;
  let page = 1;
  let inCodeBlock = false;
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
        await poke(stream, embeddings, process.argv[2], page, true, false);
        streams++;
        const words = stream.split(' ');
        stream = words.slice(words.length-WORD_OVERLAP,words.length).join(' ');
      }
    }
    lineNo++;
  }
  const embeddings = await getEmbeddings(stream);
  await poke(stream, embeddings, process.argv[2], page, true, false);
  console.log(`\n\nImported ${streams} lines`);
  console.log(`Last line: ${stream}`);
  await client.end()
}

main();
