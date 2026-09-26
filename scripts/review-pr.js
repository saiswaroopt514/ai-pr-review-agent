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

// Detect dependency changes from package.json patch
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

// Check dependency against OSV vulnerability database
async function checkDependencyVulnerability(
  packageName,
  version
) {
  try {

    const response = await axios.post(
      "https://api.osv.dev/v1/query",
      {
        package: {
          name: packageName,
          ecosystem: "npm"
        },
        version
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.vulns || [];

  } catch (error) {

    console.error(
      `Failed to check vulnerability for ${packageName}@${version}`
    );

    if (error.response) {

      console.error(
        "OSV response:",
        error.response.status,
        error.response.data
      );
    }

    return [];
  }
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

  // Dependency changes detected in this PR
  let dependencyChanges = {
    added: [],
    updated: []
  };

  // Security vulnerability results
  const securityFindings = [];

  // Check whether package.json was changed
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

    dependencyChanges =
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

    // Check newly added dependencies
    for (
      const dependency
      of dependencyChanges.added
    ) {

      console.log(
        `\n🔐 Checking ${dependency.name}@${dependency.version}`
      );

      const vulnerabilities =
        await checkDependencyVulnerability(
          dependency.name,
          dependency.version
        );

      securityFindings.push({
        name: dependency.name,
        version: dependency.version,
        vulnerabilities
      });
    }

    // Check updated dependencies
    for (
      const dependency
      of dependencyChanges.updated
    ) {

      console.log(
        `\n🔐 Checking ${dependency.name}@${dependency.to}`
      );

      const vulnerabilities =
        await checkDependencyVulnerability(
          dependency.name,
          dependency.to
        );

      securityFindings.push({
        name: dependency.name,
        from: dependency.from,
        version: dependency.to,
        vulnerabilities
      });
    }

    console.log(
      "\n🔐 Security Vulnerability Results:"
    );

    console.log(
      JSON.stringify(
        securityFindings,
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

  /*
   * Build AI review comment
   */
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

  /*
   * Security Vulnerability Review
   */
  const vulnerabilitiesFound =
    securityFindings.some(
      dependency =>
        dependency.vulnerabilities &&
        dependency.vulnerabilities.length > 0
    );

  if (securityFindings.length > 0) {

    commentBody +=
      "---\n\n" +
      "## 🔐 Security Vulnerability Review\n\n";

    for (const dependency of securityFindings) {

      const vulnerabilities =
        dependency.vulnerabilities || [];

      commentBody +=
        `### ${dependency.name}@${dependency.version}\n\n`;

      if (vulnerabilities.length === 0) {

        commentBody +=
          "✅ No known vulnerabilities detected.\n\n";

        continue;
      }

      commentBody +=
        `🚨 **${vulnerabilities.length} known vulnerability` +
        `${vulnerabilities.length > 1 ? "ies" : ""} detected.**\n\n`;

      for (const vulnerability of vulnerabilities) {

        const severity =
          vulnerability.database_specific?.severity ||
          vulnerability.severity?.[0]?.score ||
          "Unknown";

        const summary =
          vulnerability.summary ||
          "No vulnerability summary available.";

        const fixedVersions =
          vulnerability.database_specific
            ?.last_affected ||
          vulnerability.affected
            ?.flatMap(
              affected =>
                affected.ranges
                  ?.flatMap(
                    range =>
                      range.events
                        ?.filter(
                          event =>
                            event.fixed
                        )
                        .map(
                          event =>
                            event.fixed
                        ) || []
                  ) || []
            ) ||
          [];

        commentBody +=
          `- **${vulnerability.id || "Unknown ID"}**\n` +
          `  - Severity: **${severity}**\n` +
          `  - ${summary}\n`;

        if (fixedVersions.length > 0) {

          commentBody +=
            `  - Fixed version: **${fixedVersions[0]}**\n`;
        }

        commentBody += "\n";
      }
    }
  }

  /*
   * Nothing to report
   */
  if (
    findingCount === 0 &&
    securityFindings.length === 0
  ) {

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