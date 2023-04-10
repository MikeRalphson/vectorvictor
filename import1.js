const fs = require('node:fs');
const { Client } = require('pg');
const env = require('dotenv');
const oa = require('openai');

env.config();
const client = new Client({ database: 'mike', password: process.env.PGPASSWORD });

const data = fs.readFileSync(process.argv[2],'utf8').split('\r').join('').split('\n');

async function getEmbeddings(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": "${text.trim()}" }` });
  let result, msg;
  try {
    result = await res.json();
    //result = JSON.parse(msg);
    return result.data[0].embedding;
  }
  catch (ex) {
    //if (result) console.log(result.status,msg);
    console.log(`\n\n${ex.message}`);
    return [];
  }
}

async function poke(text, embeddings, source, page, prompt, hidden) {
  if (!embeddings.length) return false;
  const res = await client.query(`INSERT INTO "mike"."hhg" (text, embedding, source, page, prompt, hidden) VALUES ($1, $2, $3, $4, $5, $6);`, [ text, `${JSON.stringify(embeddings)}`, source, page, prompt, hidden]);
  //if (res && res.rows && res.rows[0]) console.log(res.rows[0].message);
  return true;
}

async function main() {
await client.connect()
const res = await client.query('SET search_path TO mike,public;');
let stream = '';
let streams = 0;
let lineNo = 1;
let page = 1;
for (let line of data) {
  if (lineNo % 63 === 0) {
    page++;
    lineNo = 1;
  }
  if (line.length > 200) {
    process.stdout.write('*');
  }
  else {
    process.stdout.write('.');
  }
  if ((stream.length+line.length < 200) || (line === "")) {
    stream += ' '+line.trim();
  }
  else {
    const embeddings = await getEmbeddings(stream);
    await poke(stream, embeddings, process.argv[2], page, true, false);
    streams++;
    stream = '';
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
