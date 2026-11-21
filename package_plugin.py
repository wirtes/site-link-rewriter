from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "packaged bookmark" / "site-link.zip"
PACKAGE_FILES = (
    "README.md",
    "background.js",
    "defaults.json",
    "manifest.json",
    "rewrite.js",
    "settings.css",
    "settings.html",
    "settings.js",
)


def main():
    missing = [name for name in PACKAGE_FILES if not (ROOT / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing plugin files: {', '.join(missing)}")

    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED) as archive:
        for name in PACKAGE_FILES:
            archive.write(ROOT / name, arcname=name)

    print(f"Created {ARCHIVE}")


if __name__ == "__main__":
    main()
