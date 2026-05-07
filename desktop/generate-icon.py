"""Generates a minimal 1024x1024 PNG icon without external dependencies."""
import struct, zlib

def make_png(size, r, g, b):
    def chunk(name, data):
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    row = b"\x00" + bytes([r, g, b] * size)
    raw = row * size
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 1))
        + chunk(b"IEND", b"")
    )

with open("icon-source.png", "wb") as f:
    f.write(make_png(1024, 59, 130, 246))  # #3b82f6

print("Generated icon-source.png (1024x1024)")
