"""
Carves the embedded screenshots out of a legacy .xls workbook.

The USER INTERFACE sheet of INTERNAL.xls is not a table — it is a column of
labels ("SALES DEPARTMENT", "SALES AGENT") with a design mockup pasted under
each one. ACE.OLEDB returns the labels and nothing else, because a picture is
not a cell value; it lives in the drawing layer.

Getting at those bytes means undoing two separate layers of fragmentation, and
skipping either one is why a plain signature scan of the file finds nothing:

 1. OLE2 containers.  A .xls cuts its streams into 512-byte sectors chained
    through a FAT, and the sectors of one stream need not be adjacent on disk.
    `olefile` follows the chain and returns the Workbook stream whole.

 2. BIFF8 records.  Inside that stream, no record may carry more than 8224
    bytes of payload, so a 300 KB screenshot is split across an MSODRAWINGGROUP
    record and a run of CONTINUE records — each one interrupting the image with
    a 4-byte header. A PNG signature that happens to straddle such a boundary
    is unfindable, and every image longer than 8 KB is interrupted at least
    once regardless.

Concatenating the record payloads in stream order undoes (2) and puts each
picture back in one piece. From there the Escher BLIP payload is the ORIGINAL
file bytes, so carving by signature is enough — a page of code instead of an
Escher tree walk, and it cannot be thrown off by a record type this particular
workbook happens to use.

Usage:  python scripts/extract-xls-images.py <workbook.xls> <out-dir>
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import olefile

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

# Anything smaller is an icon, a bullet, or a fragment of a false positive —
# never one of the full-screen mockups this exists to recover.
MIN_BYTES = 8 * 1024


def debiff(stream: bytes) -> bytes:
    """Strip BIFF8 record headers, returning the payloads back to back.

    Every record is [type:u16][length:u16][payload], so this needs no table of
    record types — which is the point. A picture's MSODRAWINGGROUP and its
    CONTINUE records are consecutive, so dropping all the headers puts the
    image bytes back in contact without having to know which records held them.
    """
    out = bytearray()
    pos = 0
    end = len(stream)
    while pos + 4 <= end:
        _rec_type, rec_len = struct.unpack("<HH", stream[pos : pos + 4])
        pos += 4
        if pos + rec_len > end:
            break  # truncated tail — keep what parsed cleanly
        out += stream[pos : pos + rec_len]
        pos += rec_len
    return bytes(out)


def png_length(blob: bytes, start: int) -> int | None:
    """Walk the chunk table so the size comes from the format, not a search.

    Scanning for IEND would stop at the first one, which is wrong the moment a
    PNG is embedded inside another image's metadata.
    """
    pos = start + len(PNG_MAGIC)
    while pos + 8 <= len(blob):
        (chunk_len,) = struct.unpack(">I", blob[pos : pos + 4])
        chunk_type = blob[pos + 4 : pos + 8]
        pos += 8 + chunk_len + 4  # length + type + data + CRC
        if chunk_type == b"IEND":
            return pos - start
        if chunk_len > len(blob):
            return None
    return None


def jpeg_length(blob: bytes, start: int) -> int | None:
    """Walk JPEG segment markers to the EOI."""
    pos = start + 2
    while pos + 4 <= len(blob):
        if blob[pos] != 0xFF:
            pos += 1
            continue
        marker = blob[pos + 1]
        if marker == 0xD9:  # EOI
            return pos + 2 - start
        if marker == 0xDA:  # start of scan — entropy-coded data follows
            pos += 2
            while pos + 1 < len(blob):
                if blob[pos] == 0xFF and blob[pos + 1] not in (0x00, 0xFF) and not (
                    0xD0 <= blob[pos + 1] <= 0xD7
                ):
                    break
                pos += 1
            continue
        if marker in (0x01, 0xFF) or 0xD0 <= marker <= 0xD8:
            pos += 2
            continue
        (seg_len,) = struct.unpack(">H", blob[pos + 2 : pos + 4])
        pos += 2 + seg_len
    return None


def carve(blob: bytes) -> list[tuple[int, int, str]]:
    found: list[tuple[int, int, str]] = []
    pos = 0
    while True:
        png_at = blob.find(PNG_MAGIC, pos)
        jpg_at = blob.find(JPEG_MAGIC, pos)
        if png_at < 0 and jpg_at < 0:
            return found
        if jpg_at < 0 or (0 <= png_at < jpg_at):
            length = png_length(blob, png_at)
            if length:
                found.append((png_at, length, "png"))
                pos = png_at + length
            else:
                pos = png_at + len(PNG_MAGIC)
        else:
            length = jpeg_length(blob, jpg_at)
            if length:
                found.append((jpg_at, length, "jpg"))
                pos = jpg_at + length
            else:
                pos = jpg_at + len(JPEG_MAGIC)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    source = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    ole = olefile.OleFileIO(str(source))
    kept = 0

    for entry in ole.listdir(streams=True, storages=False):
        if entry[-1] not in ("Workbook", "Book"):
            continue

        stream = ole.openstream(entry).read()
        blob = debiff(stream)
        print(f"{'/'.join(entry)}: {len(stream):,} bytes -> {len(blob):,} after de-BIFF")

        found = carve(blob)
        big = [f for f in found if f[1] >= MIN_BYTES]
        print(f"  {len(found)} image(s) found, {len(big)} at or above {MIN_BYTES // 1024} KB")

        for offset, length, kind in big:
            kept += 1
            out = out_dir / f"{kept:02d}.{kind}"
            out.write_bytes(blob[offset : offset + length])
            print(f"    {out.name}  {length:,} bytes")

    ole.close()
    print(f"\n{kept} image(s) written to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
