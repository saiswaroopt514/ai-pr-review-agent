const axios = require("axios");

async function createPRComment({
  owner,
  repo,
  prNumber,
  token,
  body
}) {

  await axios.post(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      body
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );
}

module.exports = {
  createPRComment
};