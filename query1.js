const fs = require('node:fs');
const util = require('node:util');

const { Client } = require('pg');
const env = require('dotenv');

env.config();
const client = new Client();
const database = process.env.PGDATABASE;
const table = process.env.PGTABLE;

const now = new Date();

const arr = Array.from(process.argv);
arr.shift(0);
arr.shift(0);
const data = arr.join(' ').toLowerCase();

async function getEmbeddings(text) {
  if (text === "") return [];
  const res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": "${text}" }` });
  let result, msg;
  try {
    result = await res.json();
    if (result && result.data && result.data.length) return result.data[0].embedding;
  }
  catch (ex) {
    if (result) console.log(result.status,msg);
    console.log(`\n\n${ex.message}`);
    return [];
  }
}

async function poke(text, embeddings, source, page, prompt, hidden) {
  if (!embeddings.length) return false;
  text = text.trim();
  let res = await client.query(`SELECT COUNT(1) from "${database}"."${table}" WHERE NOT prompt AND text = $1;`, [ text ]);
  if (res && res.rows && res.rows[0]) console.log(`Count: ${res.rows[0].count}`);
  let count = 0;
  if (res && res.rows && res.rows[0].count) count = res.rows[0].count;
  if (count <= 0) {
    res = await client.query(`INSERT INTO "${database}"."${table}" (text, embedding, source, page, prompt, hidden, date) VALUES ($1, $2, $3, $4, $5, $6, $7);`, [ text, `${JSON.stringify(embeddings)}`, source, page, prompt, hidden, now ]);
    if (res && res.rows && res.rows[0]) console.log(res.rows[0].message);
  }
  res = await client.query(`SELECT text,source,page FROM ${table} WHERE prompt ORDER BY embedding <-> $1 LIMIT 10;`, [ `${JSON.stringify(embeddings)}` ]);
  if (res && res.rows) console.log(util.inspect(res.rows, { depth: null }));

  return true;
}

async function main() {
  await client.connect()
  // const res = await client.query('SET search_path TO mike,public;');
  const embeddings = await getEmbeddings(data);
  await poke(data, embeddings, 'user', 1, false, false);
  console.log(`Saved query: ${data}`);
  await client.end()
}

main();
