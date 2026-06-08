import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("STUDIO_DATA_DIR", str(ROOT / ".testdata"))
os.environ.setdefault("STUDIO_DB_PATH", str(ROOT / ".testdata" / "test.sqlite"))
