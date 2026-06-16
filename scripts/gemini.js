const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash"
});

async function reviewDiff(
  fileName,
  patch,
  fullFileContent
) {

  const prompt = `
You are a Principal Software Engineer reviewing a pull request.

Review the changed code.

File:
${fileName}

Diff:
${patch}

Full File Content:
${fullFileContent}

Return ONLY valid JSON.

{
  "summary": {
    "overall_assessment": "good|needs_attention|critical"
  },
  "findings": [
    {
      "line": 0,
      "severity": "high|medium|low",
      "category": "bug|security|performance|maintainability|architecture",
      "comment": "",
      "confidence": 0.0
    }
  ]
}

Rules:

- Maximum 3 findings.
- Focus on correctness.
- Focus on maintainability.
- Focus on performance.
- Focus on architecture.
- Ignore formatting issues.
- Ignore prettier issues.
- Ignore eslint issues.
- Ignore import ordering.
- Ignore subjective style preferences.
- Ignore trivial variable naming suggestions.
- Ignore micro optimizations.
- Only report issues a senior engineer would actually mention.
- It is perfectly acceptable to return zero findings.
- Return JSON only.
- No markdown.
- No explanation.
`;

  const result =
    await model.generateContent(prompt);

  return result.response.text();
}

module.exports = {
  reviewDiff
};