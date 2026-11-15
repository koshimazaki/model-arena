/**
 * Reads width, height, duration and frame rate from an MP4's `moov` box, so a
 * lane can be checked against a model's published limits before any money is
 * spent. Works on a Uint8Array in Node and the browser; no decoding.
 */

export interface Mp4Info {
  width: number;
  height: number;
  seconds: number;
  fps: number | null;
  hasAudio: boolean;
}

interface Box {
  type: string;
  start: number; // payload start
  end: number;
}

function boxes(view: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    const type = String.fromCharCode(
      view.getUint8(p + 4),
      view.getUint8(p + 5),
      view.getUint8(p + 6),
      view.getUint8(p + 7),
    );
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(p + 8));
      header = 16;
    } else if (size === 0) size = end - p;
    if (size < header || p + size > end) break;
    out.push({ type, start: p + header, end: p + size });
    p += size;
  }
  return out;
}

const child = (view: DataView, b: Box, type: string) =>
  boxes(view, b.start, b.end).find((c) => c.type === type);

function readHdlr(view: DataView, b: Box) {
  return String.fromCharCode(
    view.getUint8(b.start + 8),
    view.getUint8(b.start + 9),
    view.getUint8(b.start + 10),
    view.getUint8(b.start + 11),
  );
}

export function probeMp4(bytes: Uint8Array): Mp4Info {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = boxes(view, 0, bytes.byteLength).find((b) => b.type === "moov");
  if (!moov) throw new Error("Not an MP4 with a moov box.");
  let seconds = 0;
  const mvhd = child(view, moov, "mvhd");
  if (mvhd) {
    const v1 = view.getUint8(mvhd.start) === 1;
    const scale = view.getUint32(mvhd.start + (v1 ? 20 : 12));
    const dur = v1 ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16);
    seconds = scale ? dur / scale : 0;
  }
  let width = 0;
  let height = 0;
  let fps: number | null = null;
  let hasAudio = false;
  for (const trak of boxes(view, moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(view, trak, "mdia");
    const hdlr = mdia && child(view, mdia, "hdlr");
    const kind = hdlr ? readHdlr(view, hdlr) : "";
    if (kind === "soun") hasAudio = true;
    if (kind !== "vide" || width) continue;
    const tkhd = child(view, trak, "tkhd");
    if (tkhd) {
      const v1 = view.getUint8(tkhd.start) === 1;
      const off = tkhd.start + (v1 ? 88 : 76);
      width = Math.round(view.getUint32(off) / 65536);
      height = Math.round(view.getUint32(off + 4) / 65536);
    }
    const mdhd = mdia && child(view, mdia, "mdhd");
    const stbl = mdia && child(view, mdia, "minf");
    const stts = stbl && child(view, stbl, "stbl") && child(view, child(view, stbl, "stbl")!, "stts");
    if (mdhd && stts) {
      const v1 = view.getUint8(mdhd.start) === 1;
      const scale = view.getUint32(mdhd.start + (v1 ? 20 : 12));
      const entries = view.getUint32(stts.start + 4);
      let samples = 0;
      let ticks = 0;
      for (let i = 0; i < entries; i++) {
        const count = view.getUint32(stts.start + 8 + i * 8);
        const delta = view.getUint32(stts.start + 12 + i * 8);
        samples += count;
        ticks += count * delta;
      }
      if (ticks && scale) fps = Math.round(((samples * scale) / ticks) * 1000) / 1000;
    }
  }
  if (!width || !height) throw new Error("No video track found in this MP4.");
  return { width, height, seconds, fps, hasAudio };
}
