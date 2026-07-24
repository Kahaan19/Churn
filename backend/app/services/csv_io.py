import csv
from pathlib import Path

import pandas as pd
from fastapi import UploadFile

from app.core.exceptions import DatasetInvalid, DatasetTooLarge

_ENCODING_CANDIDATES = ("utf-8-sig", "utf-8", "latin-1")
_SNIFF_SAMPLE_BYTES = 65536
_CHUNK_BYTES = 1024 * 1024


async def stream_upload_to_disk(upload: UploadFile, dest: Path, max_bytes: int) -> None:
    """Write an UploadFile to disk in chunks, aborting past max_bytes.

    Streaming (rather than reading the whole body first) keeps memory flat and lets us
    reject an oversized upload before it's fully buffered.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with dest.open("wb") as f:
        while chunk := await upload.read(_CHUNK_BYTES):
            size += len(chunk)
            if size > max_bytes:
                dest.unlink(missing_ok=True)
                raise DatasetTooLarge(
                    f"File exceeds the {max_bytes // (1024 * 1024)}MB upload limit."
                )
            f.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise DatasetInvalid("Uploaded file is empty.")


def copy_source_to_disk(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(source.read_bytes())


def _detect_encoding(sample: bytes) -> str:
    for encoding in _ENCODING_CANDIDATES:
        try:
            sample.decode(encoding)
            return encoding
        except UnicodeDecodeError:
            continue
    return "latin-1"  # never raises; last resort


def _detect_delimiter(sample_text: str) -> str:
    try:
        return csv.Sniffer().sniff(sample_text, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def read_csv(path: Path) -> pd.DataFrame:
    """Sniff encoding/delimiter and parse a CSV, rejecting non-tabular input explicitly."""
    sample = path.read_bytes()[:_SNIFF_SAMPLE_BYTES]
    if not sample.strip():
        raise DatasetInvalid("File is empty.")

    encoding = _detect_encoding(sample)
    delimiter = _detect_delimiter(sample.decode(encoding, errors="replace"))

    try:
        df = pd.read_csv(path, sep=delimiter, encoding=encoding)
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError) as exc:
        raise DatasetInvalid(f"Could not parse file as CSV: {exc}") from exc

    if df.shape[1] < 2:
        raise DatasetInvalid(
            "File does not look like tabular data — fewer than two columns were detected."
        )
    if df.shape[0] < 1:
        raise DatasetInvalid("File has no data rows.")

    return df
