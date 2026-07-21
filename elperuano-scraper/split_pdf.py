from pathlib import Path
from PyPDF2 import PdfReader, PdfWriter
from typing import List

OUT_DIR = Path("downloads/chunks")
PAGES_PER_CHUNK = 25


def split_pdf(pdf_path: Path) -> List[Path]:
    reader = PdfReader(str(pdf_path))
    total = len(reader.pages)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    created_files: List[Path] = []
    base = pdf_path.stem

    for start in range(0, total, PAGES_PER_CHUNK):
        writer = PdfWriter()
        end = min(start + PAGES_PER_CHUNK, total)

        for i in range(start, end):
            writer.add_page(reader.pages[i])

        out = OUT_DIR / f"{base}_p{start+1:03d}-{end:03d}.pdf"
        with open(out, "wb") as f:
            writer.write(f)

        created_files.append(out)
        print(f"Created: {out}")

    return created_files
