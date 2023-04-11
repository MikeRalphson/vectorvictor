// accept a query id and a prompt id and reset the embeddings on the query to be the same as the prompt's

import pg from 'pg';
const { Client } = pg;
import env from 'dotenv';

env.config();
const client = new Client();
const database = process.env.PGDATABASE;
const table = process.env.PGTABLE;

const now = new Date();

async function main(queryId, promptId) {
  const res = await client.query(`SELECT embeddings FROM "${database}"."${table}" WHERE id = $1);`, [ promptId ]);
  res = await client.query(`UPDATE "${database}"."${table}" SET embeddings = $1, date = $2 WHERE id = $3);`, [ `${JSON.stringify(embeddings)}`, now, queryId ]);
}

if (process.argv.length >= 4) {
  main(process.argv[2], process.argv[3]);
}
else {
  console.warn(`Usage: node link1.js {queryId} {promptId}`);
}
