const axios = require("axios");

async function main() {

  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const prNumber = process.env.PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;

  console.log(`Reviewing PR #${prNumber}`);

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

  console.log("\nChanged Files:\n");

  files.forEach(file => {
    console.log(file.filename);
  });

}

main().catch(console.error);