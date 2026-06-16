const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash"
});

async function reviewDiff(fileName, patch) {

  const prompt = `
You are a senior software engineer reviewing a pull request.

Review this code diff.

File:
${fileName}

Diff:
${patch}

Provide:
1. Potential bugs
2. Code quality issues
3. Performance concerns
4. Security concerns
5. Optimize the code if required

`;

  const result =
    await model.generateContent(prompt);

  return result.response.text();
}

module.exports = {
  reviewDiff
};