const { reviewDiff } = require("./gemini");
const axios = require("axios");

async function getFileContent(
  contentsUrl,
  token
) {

  const response = await axios.get(
    contentsUrl,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  const encodedContent =
    response.data.content;

  return Buffer
    .from(encodedContent, "base64")
    .toString("utf8");
}

async function main() {

  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const prNumber = process.env.PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;

  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

    const files = response.data;
    const ignoredFiles = [
        "scripts/gemini.js",
        "scripts/review-pr.js"
    ];

    const reviewableFiles = files.filter(
        file => !ignoredFiles.includes(file.filename)
    );

  for (const file of reviewableFiles) {

    console.log("\n=================================");
    console.log("FILE:", file.filename);
    console.log("=================================\n");

    if (!file.patch) {
      continue;
    }

    const fullFileContent =
      await getFileContent(
        file.contents_url,
        token
      );

    const review =
      await reviewDiff(
        file.filename,
        file.patch,
        fullFileContent
      );

    try {

      const cleaned = review
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const findings =
        JSON.parse(cleaned);

      console.log(
        JSON.stringify(
          findings,
          null,
          2
        )
      );

    } catch (err) {

      console.error(
        "Failed to parse Gemini response"
      );

      console.log(review);
    }
  }
}

main().catch(console.error);