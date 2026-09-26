const { reviewDiff } = require("./gemini");
const axios = require("axios");
const {
  createPRComment,
  getPRComments,
  updateComment
} = require("./github");

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
    "scripts/review-pr.js",
    "scripts/github.js",
    ".github/workflows/ai-pr-review.yml"
  ];

  const reviewableFiles = files.filter(
    file => !ignoredFiles.includes(file.filename)
  );

  const allFindings = [];

  console.log(
    `Reviewing ${reviewableFiles.length} files`
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

      allFindings.push({
        fileName: file.filename,
        findings
      });

    } catch (err) {

      console.error(
        "Failed to parse Gemini response"
      );

      console.log(review);
    }
  }

  if (allFindings.length === 0) {

    console.log(
      "No findings detected"
    );

    return;
  }

  /*
   * Build formatted PR comment
   */

  let commentBody =
    "<!-- AI_PR_REVIEW_COMMENT -->\n\n" +
    "## 🤖 AI Review Summary\n\n" +
    "> AI-generated review focused on high-confidence, actionable findings.\n\n";

  let findingCount = 0;
  let highCount = 0;
  let mediumCount = 0;

  for (const fileResult of allFindings) {

    const findings =
      fileResult.findings.findings || [];

    const filteredFindings =
      findings.filter(
        finding =>
          (
            finding.severity === "high" ||
            finding.severity === "medium"
          ) &&
          (finding.confidence || 0) >= 0.85
      );

    if (!filteredFindings.length) {
      continue;
    }

    /*
     * File heading
     */

    commentBody +=
      `### 📄 \`${fileResult.fileName}\`\n\n`;

    for (const finding of filteredFindings) {

      findingCount++;

      const severity =
        finding.severity.toLowerCase();

      if (severity === "high") {
        highCount++;
      }

      if (severity === "medium") {
        mediumCount++;
      }

      const severityLabel =
        severity === "high"
          ? "🔴 HIGH"
          : "🟠 MEDIUM";

      /*
       * Finding heading
       */

      commentBody +=
        `#### ${severityLabel} · Line ${finding.line}\n\n`;

      /*
       * Issue description
       */

      commentBody +=
        `**⚠️ Issue**\n\n` +
        `${finding.comment}\n\n`;

      /*
       * Confidence
       */

      const confidence =
        Math.round(
          (finding.confidence || 0) * 100
        );

      commentBody +=
        `> **Confidence:** ${confidence}%\n\n`;

      /*
       * Separator
       */

      commentBody +=
        `---\n\n`;
    }
  }

  if (findingCount === 0) {

    console.log(
      "No actionable findings"
    );

    return;
  }

  /*
   * Add finding statistics
   */

  const summary =
    `**Findings:** ${findingCount} ` +
    `· 🔴 ${highCount} High ` +
    `· 🟠 ${mediumCount} Medium\n\n`;

  commentBody =
    commentBody.replace(
      "> AI-generated review focused on high-confidence, actionable findings.\n\n",
      "> AI-generated review focused on high-confidence, actionable findings.\n\n" +
      summary
    );

  /*
   * Print generated comment
   */

  console.log("\n========================");
  console.log("GENERATED COMMENT");
  console.log("========================\n");

  console.log(commentBody);

  /*
   * Get existing PR comments
   */

  const comments =
    await getPRComments({
      owner,
      repo,
      prNumber,
      token
    });

  /*
   * Find existing AI review comment
   */

  const existingComment =
    comments.find(
      comment =>
        comment.body &&
        (
          comment.body.includes(
            "AI_PR_REVIEW_COMMENT"
          ) ||
          comment.body.includes(
            "🤖 AI Review Summary"
          )
        )
    );

  /*
   * Update existing comment
   */

  if (existingComment) {

    await updateComment({
      owner,
      repo,
      commentId: existingComment.id,
      token,
      body: commentBody
    });

    console.log(
      "Updated existing AI review comment"
    );

  } else {

    /*
     * Create new comment
     */

    await createPRComment({
      owner,
      repo,
      prNumber,
      token,
      body: commentBody
    });

    console.log(
      "Created new AI review comment"
    );
  }
}

main().catch(console.error);