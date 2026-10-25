// Browser only. MediaRecorder gives webm/opus; the boss fight server wants WAV, 16 kHz, mono, 16-bit PCM.
//   const blob = await toWav16k(mediaRecorderBlob);
//   await fetch(`/api/sessions/${code}/boss/attempt?playerId=${playerId}`,
//     { method: "POST", headers: { "Content-Type": "audio/wav" }, body: blob });
// Cap recordings at ~90 s on the client.
const RATE = 16000;

export async function toWav16k(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void ctx.close();
  }
  // Resample + downmix to mono by rendering through a 1-channel 16 kHz offline context.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);       // fmt chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true); // byte rate
  view.setUint16(32, 2, true);        // block align
  view.setUint16(34, 16, true);       // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([view], { type: "audio/wav" });
}
