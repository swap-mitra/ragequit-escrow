import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRepoRoot() {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "contracts")) && fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve repo root for artifact refresh.");
}

function resolveArtifactScriptNetwork(network: string) {
  const normalized = String(network || "localhost").toLowerCase();
  return normalized === "localhost" ? "local" : normalized;
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }

    const constructorName = (error as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName) {
      return `Artifact refresh failed (${constructorName}).`;
    }
  }

  return "Artifact refresh failed.";
}

function createSpawnConfig(scriptNetwork: string) {
  if (process.platform === "win32") {
    const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    const npmCmd = "C:\\Program Files\\nodejs\\npm.cmd";
    return {
      command: powershell,
      args: ["-NoProfile", "-Command", `& '${npmCmd}' run contracts:artifacts:${scriptNetwork}`],
      shell: false,
    };
  }

  return {
    command: "npm",
    args: ["run", `contracts:artifacts:${scriptNetwork}`],
    shell: false,
  };
}

export async function POST() {
  try {
    const repoRoot = resolveRepoRoot();
    const requestedNetwork = process.env.AUDIT_ARTIFACT_NETWORK || "localhost";
    const scriptNetwork = resolveArtifactScriptNetwork(requestedNetwork);
    const spawnConfig = createSpawnConfig(scriptNetwork);

    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(spawnConfig.command, spawnConfig.args, {
        cwd: repoRoot,
        shell: spawnConfig.shell,
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
          network: requestedNetwork,
          scriptNetwork,
          error: result.stderr || result.stdout || "Artifact refresh failed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      network: requestedNetwork,
      scriptNetwork,
      output: result.stdout.trim(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: describeUnknownError(error),
      },
      { status: 500 }
    );
  }
}
