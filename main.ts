// world-news-in-one-image — make.fun entry point.
//
// The image this entry ships is entry.png, drawn by news-poster.mjs (a deterministic
// newspaper front page for Friday 20 November 2026). This program publishes that file:
// it copies it to <MAKEFUN_OUTPUT_DIR>/entry.png, then reads the bytes back and refuses
// to report success unless the result is a well-formed PNG inside the gate's limits
// (1 MiB, at most 1024x1024). Node 22, standard library only, no network.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** First eight bytes of every PNG: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Gate limits: the file may not exceed 1 MiB, and neither side may exceed 1024 px. */
const MAX_BYTES = 1_048_576;
const MAX_SIDE = 1024;

/** A failure that should be reported to the operator rather than as a stack trace. */
class EntryError extends Error {}

/**
 * Raised when a post-write check rejects the published file. Carries the check's
 * name and the offending value so the message can name both.
 */
class CheckFailed extends EntryError {
  readonly check: string;

  constructor(check: string, detail: string) {
    super(`${check} failed: ${detail}`);
    this.check = check;
  }
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const source = new URL('./entry.png', import.meta.url);
  const target = join(outDir, 'entry.png');

  // Publish. mkdirSync is idempotent, so an existing directory is fine.
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (cause) {
    throw new EntryError(`cannot create output directory ${outDir}: ${messageOf(cause)}`);
  }
  try {
    copyFileSync(source, target);
  } catch (cause) {
    throw new EntryError(`cannot copy ${source.pathname} to ${target}: ${messageOf(cause)}`);
  }

  // Verify the bytes that actually landed on disk, not the ones we meant to send.
  const bytes = readFileSync(target);
  const { width, height } = inspectPng(bytes);
  const size = bytes.length;

  process.stdout.write(`${target} — ${width}x${height} px, ${size} bytes\n`);
}

/**
 * Validate the published file and return its IHDR dimensions, or throw CheckFailed
 * naming the first check that did not hold.
 */
function inspectPng(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new CheckFailed('png signature', `file is only ${bytes.length} bytes, shorter than the 8-byte signature`);
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new CheckFailed('png signature', `first 8 bytes are ${hex(bytes.subarray(0, 8))}, expected 89504e470d0a1a0a`);
  }

  // IHDR must be the first chunk: 4-byte length at 8, type at 12, then width and
  // height as big-endian uint32 at 16 and 20.
  if (bytes.length < 24) {
    throw new CheckFailed('ihdr chunk', `file is only ${bytes.length} bytes, too short to hold the IHDR header (needs 24)`);
  }
  const chunkType = bytes.toString('latin1', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new CheckFailed('ihdr chunk', `first chunk type is ${JSON.stringify(chunkType)}, expected "IHDR"`);
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new CheckFailed('dimensions', `IHDR reports ${width}x${height}; both sides must be above zero`);
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new CheckFailed('dimensions', `IHDR reports ${width}x${height}; the limit is ${MAX_SIDE}x${MAX_SIDE}`);
  }

  if (bytes.length > MAX_BYTES) {
    throw new CheckFailed('file size', `${bytes.length} bytes; the limit is ${MAX_BYTES}`);
  }

  return { width, height };
}

function hex(bytes: Buffer): string {
  return bytes.toString('hex');
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

try {
  main();
} catch (cause) {
  const reason = cause instanceof EntryError ? cause.message : `unexpected error: ${messageOf(cause)}`;
  process.stderr.write(`entry.png not published — ${reason}\n`);
  process.exitCode = 1;
}
