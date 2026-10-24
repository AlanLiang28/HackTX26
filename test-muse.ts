import OpenAI from "openai";

process.loadEnvFile();

const muse = new OpenAI({
  baseURL: "https://api.meta.ai/v1",
  apiKey: process.env.MUSE_API,
});

// List the models your key can use
const models = await muse.models.list();
for await (const m of models) console.log("model:", m.id);

// Try a quick request
const reply = await muse.chat.completions.create({
  model: "muse-spark-1.1", // change to a name printed above if different
  messages: [{ role: "user", content: "Explain a cell nucleus using a football analogy in one sentence." }],
});
console.log(reply.choices[0].message.content);