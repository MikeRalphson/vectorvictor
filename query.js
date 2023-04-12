import * as fs from 'node:fs';

import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';

env.config();
const client = new Client();
let table = process.env.PGTABLE;

const now = new Date();
const map = new Map();

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

async function peek(text, embeddings, source, page, prompt, hidden) {
  if (!embeddings || !embeddings.length) return [];
  text = text.trim();
  let res = await client.query(`SELECT COUNT(1) from ${table} WHERE NOT prompt AND text LIKE $1;`, [ text ]);
  if (res && res.rows && res.rows[0]) console.log(`Existing query count: ${res.rows[0].count}`);
  let count = 0;
  if (res && res.rows && res.rows[0].count) count = res.rows[0].count;
  if (count <= 0) {
    res = await client.query(`INSERT INTO ${table} (text, embedding, source, page, prompt, hidden, date) VALUES ($1, $2, $3, $4, $5, $6, $7);`, [ text.toLowerCase(), `${JSON.stringify(embeddings)}`, source, page, prompt, hidden, now ]);
    console.log(`Saved new query: ${text}`);
    if (res && res.rows && res.rows[0]) console.log(res.rows[0].message);
  }
  res = await client.query(`SELECT id,text,source,page,date FROM ${table} WHERE prompt ORDER BY embedding <-> $1 LIMIT 10;`, [ `${JSON.stringify(embeddings)}` ]);
  if (res && res.rows) console.log(`Returned row count: ${res.rows.length}`);

  return res && res.rows ? res.rows : [];
}

export async function query(data, tableName = 'hhg') {
  if (!data) return [];
  table = tableName;
  if (!map.size) map.set(table, await client.connect());
  const embeddings = await getEmbeddings(data);
  const results = await peek(data, embeddings, 'user', 1, false, false);
  return results;
}

export async function quit() {
  await client.end()
}
