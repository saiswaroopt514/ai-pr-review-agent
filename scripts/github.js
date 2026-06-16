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

async function getPRComments({
  owner,
  repo,
  prNumber,
  token
}) {
  const response = await axios.get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  return response.data;
}

async function updateComment({
  owner,
  repo,
  commentId,
  token,
  body
}) {
  await axios.patch(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
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
  createPRComment,
  getPRComments,
  updateComment
};