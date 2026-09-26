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

// STEP 1: Detect dependency changes from package.json patch
function getDependencyChangesFromPatch(patch) {
  const changes = {
    added: [],
    updated: []
  };

  if (!patch) {
    return changes;
  }

  const removed = [];
  const added = [];

  const lines = patch.split("\n");

  for (const line of lines) {
    // Ignore diff metadata
    if (
      line.startsWith("+++") ||
      line.startsWith("---")
    ) {
      continue;
    }

    // Removed dependency
    if (line.startsWith("-")) {
      const match = line.match(
        /^-\s*"([^"]+)"\s*:\s*"([^"]+)"/
      );

      if (match) {
        removed.push({
          name: match[1],
          version: match[2]
        });
      }
    }

    // Added dependency
    if (line.startsWith("+")) {
      const match = line.match(
        /^\+\s*"([^"]+)"\s*:\s*"([^"]+)"/
      );

      if (match) {
        added.push({
          name: match[1],
          version: match[2]
        });
      }
    }
  }

  // Match removed + added package names
  // to identify version updates
  for (const newDependency of added) {
    const oldDependency =
      removed.find(
        dependency =>
          dependency.name === newDependency.name
      );

    if (oldDependency) {
      changes.updated.push({
        name: newDependency.name,
        from: oldDependency.version,
        to: newDependency.version
      });
    } else {
      changes.added.push({
        name: newDependency.name,
        version: newDependency.version
      });
    }
  }

  return changes;
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
  console.log(
    "\n📁 Files returned by GitHub:"
  );
  files.forEach(file => {
    console.log(file.filename);
  });

  // STEP 1: Check whether package.json was changed
  const packageJsonFile =
    files.find(
      file => file.filename === "package.json"
    );

  if (packageJsonFile) {

    console.log(
      "\n📦 package.json changed"
    );

    console.log(
      packageJsonFile.patch
    );

    const dependencyChanges =
      getDependencyChangesFromPatch(
        packageJsonFile.patch
      );

    console.log(
      "\n📦 Dependency Changes:"
    );

    console.log(
      JSON.stringify(
        dependencyChanges,
        null,
        2
      )
    );
  }

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

  let commentBody =
    "<!-- AI_PR_REVIEW_COMMENT -->\n\n" +
    "## 🤖 AI Review Summary\n\n";

  let findingCount = 0;

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

    commentBody +=
      `### ${fileResult.fileName}\n`;

    for (const finding of filteredFindings) {

      findingCount++;

      commentBody +=
        `- Line ${finding.line} [${finding.severity.toUpperCase()}]\n` +
        `  ${finding.comment}\n`;
    }

    commentBody += "\n";
  }

  if (findingCount === 0) {

    console.log(
      "No actionable findings"
    );

    return;
  }

  console.log("\n========================");
  console.log("GENERATED COMMENT");
  console.log("========================\n");
  console.log(commentBody);

  const comments =
    await getPRComments({
      owner,
      repo,
      prNumber,
      token
    });

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