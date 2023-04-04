'use strict';

const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function main() {
  const prompt = "According to Douglas Adams, what is the answer to the meaning of life, the universe, and everything?";
  const temperature = 0.5;
  const top_p = 1.0;
  const n = 3;

  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    prompt,
  });
  console.log(`${prompt}:> ${completion.data.choices[0].text}`);
}

main();
