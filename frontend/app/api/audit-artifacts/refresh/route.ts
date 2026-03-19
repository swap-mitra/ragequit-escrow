import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

function resolveRepoRoot() {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "contracts")) && fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve repo root for artifact refresh.");
}

export async function POST() {
  try {
    const repoRoot = resolveRepoRoot();
    const network = process.env.AUDIT_ARTIFACT_NETWORK || "localhost";
    const npmCmd = process.platform === "win32" ? "C:\\Program Files\\nodejs\\npm.cmd" : "npm";

    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(npmCmd, ["run", `contracts:artifacts:${network}`], {
        cwd: repoRoot,
        shell: false,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });

    if (result.code !== 0) {
      return NextResponse.json(
        {
          ok: false,
          network,
          error: result.stderr || result.stdout || "Artifact refresh failed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      network,
      output: result.stdout.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artifact refresh failed.",
      },
      { status: 500 }
    );
  }
}
