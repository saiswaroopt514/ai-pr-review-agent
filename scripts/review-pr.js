const axios = require("axios");

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

  for (const file of files) {

    console.log("\n=================================");
    console.log("FILE:", file.filename);
    console.log("=================================\n");

    console.log(file.patch || "No patch available");
  }
}

main().catch(console.error);