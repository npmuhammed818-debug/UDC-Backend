// Free speech synthesis (owner direction, 10 Nov): no paid TTS worker and no
// API key. Uses the Edge neural voices over their public read-aloud endpoint
// via msedge-tts, then remuxes to OGG/Opus with the bundled ffmpeg binary so
// WhatsApp shows a real voice-note bubble. Cost is 0. Enabled only with
// AKIF_FREE_TTS=on; every voice send still goes through speakReply's gates.
import { spawn } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { VoiceLanguage } from "./voiceLanguage.ts";

export function freeTtsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AKIF_FREE_TTS === "on";
}

// One steady male voice per language, matching AKIF's person. Malayalam gets
// Midhun; the others are each locale's standard male neural voice.
const VOICE_BY_LANGUAGE: Record<VoiceLanguage, string> = {
  english: "en-IN-PrabhatNeural",
  malayalam: "ml-IN-MidhunNeural",
  hindi: "hi-IN-MadhurNeural",
  tamil: "ta-IN-ValluvarNeural",
  arabic: "ar-EG-ShakirNeural",
};

/** Remux WebM/Opus to OGG/Opus (stream copy, no re-encode) with the static
 *  ffmpeg binary. Returns null when ffmpeg is unavailable. */
async function webmToOgg(webm: Uint8Array): Promise<Uint8Array | null> {
  let ffmpegPath: string;
  try {
    const mod = (await import("ffmpeg-static")) as { default?: string | null };
    if (!mod.default) return null;
    ffmpegPath = mod.default;
  } catch {
    return null;
  }
  const input = join(tmpdir(), `tts-${randomUUID()}.webm`);
  const output = join(tmpdir(), `tts-${randomUUID()}.ogg`);
  try {
    await writeFile(input, webm);
    const code = await new Promise<number>((resolve) => {
      const child = spawn(ffmpegPath, ["-y", "-v", "error", "-i", input, "-c:a", "copy", output], { stdio: "ignore" });
      child.on("error", () => resolve(-1));
      child.on("close", (c) => resolve(c ?? -1));
    });
    if (code !== 0) return null;
    return new Uint8Array(await readFile(output));
  } catch {
    return null;
  } finally {
    await unlink(input).catch(() => {});
    await unlink(output).catch(() => {});
  }
}

/** Synthesize a short reply as OGG/Opus. Throws on provider failure so the
 *  caller can fall back to text. Caps input like the paid worker did. */
export async function synthesizeFreeTts(text: string, language: VoiceLanguage = "english"): Promise<{ bytes: Uint8Array; seconds: number | null }> {
  const input = text.trim().slice(0, 600);
  if (!input) throw new Error("free_tts_empty");
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE_BY_LANGUAGE[language] ?? VOICE_BY_LANGUAGE.english, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
  const stream = await tts.toStream(input);
  const chunks: Uint8Array[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.audioStream.on("data", (c: Uint8Array) => chunks.push(c));
    stream.audioStream.on("end", () => resolve());
    stream.audioStream.on("error", reject);
  });
  const webm = new Uint8Array(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  if (!webm.length || webm.length > 2 * 1024 * 1024) throw new Error("free_tts_size_invalid");
  const ogg = await webmToOgg(webm);
  if (!ogg || !ogg.length) throw new Error("free_tts_remux_failed");
  return { bytes: ogg, seconds: null };
}
