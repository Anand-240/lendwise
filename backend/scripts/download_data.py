"""Download the public LendingClub accepted and rejected files into data/raw/.

    pip install -r requirements-train.txt
    python scripts/download_data.py

The files come from the public Kaggle dataset wordsforthewise/lending-club (about 650 MB
compressed). Public datasets download without a Kaggle account.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DATASET = "wordsforthewise/lending-club"
FILES = ["accepted_2007_to_2018Q4.csv.gz", "rejected_2007_to_2018Q4.csv.gz"]


def main() -> None:
    try:
        import kagglehub
    except ImportError:
        sys.exit("kagglehub is not installed. Run: pip install -r requirements-train.txt")
    RAW.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = RAW / name
        if target.exists():
            print(f"{name} already present")
            continue
        print(f"Downloading {name} ...")
        path = Path(kagglehub.dataset_download(DATASET, path=name))
        shutil.copyfile(path, target)
        print(f"Saved {target.relative_to(ROOT)} ({target.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
