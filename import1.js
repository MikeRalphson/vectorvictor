const fs = require('node:fs');
const pg = require('pg');
const env = require('dotenv');
const oa = require('openai');

env.config();

const data = fs.readFileSync(process.argv[2],'utf8').split('\r').join('').split('\n');

async function getEmbeddings(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings',{
    method: 'post',
    headers: { "content-type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    body: `{ "model": "text-embedding-ada-002", "input": "${text}" }` });
  try {
    const msg = await res.text();
    const result = JSON.parse(msg);
    return result.data[0].embedding;
  }
  catch (ex) {
    if (result) console.log(result.status,msg);
    console.log(`\n\n${ex.message}`);
    return {};
  }
}

async function poke(embeddings, prompt, hidden) {
  return true;
}

async function main() {
let stream = '';
let streams = 0;
for (let line of data) {
  if (line.length > 2000) {
    process.stdout.write('*');
  }
  else {
    process.stdout.write('.');
  }
  if ((stream.length+line.length < 2000) || (line === "")) {
    stream += ' '+line.trim();
  }
  else {
    process.stdout.write('W');
    const embeddings = await getEmbeddings(stream);
    console.log(`\n${embeddings}`);
    await poke(embeddings, true, false);
    streams++;
    stream = '';
    process.exit(1);
  }
}
const embeddings = await getEmbeddings(stream);
await poke(embeddings,true,false);
console.log(`\n\nImported ${streams} lines`);
console.log(`Last line: ${stream}`);
}

main();
