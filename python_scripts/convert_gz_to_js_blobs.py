#!/usr/bin/env python3
"""
Scan a directory for .gz files and create JS files containing a Base64
representation of each compressed file as a JS string variable.

Example:
  python convert_gz_to_js_blobs.py --input-dir python_scripts/data --out-dir scripts

This will produce files like `scripts/data_oni_monthly.js` with contents:
  const data_oni_monthly = '<base64...>';

By default the output file name and JS variable will be prefixed with `data_`.
"""
import argparse
import base64
import os
import re
from pathlib import Path


def make_js_varname(name: str, prefix: str) -> str:
    # Replace non-alphanumeric characters with underscores
    cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    # Ensure it doesn't start with a digit
    if re.match(r"^[0-9]", cleaned):
        cleaned = "_" + cleaned
    return f"{prefix}{cleaned}"


def process_gz_file(path: Path, out_dir: Path, prefix: str, add_export: bool) -> Path:
    # Derive a stem for naming: handle files like foo.csv.gz -> foo
    name = path.name
    if name.endswith('.gz'):
        inner = name[:-3]
    else:
        inner = name
    stem = Path(inner).stem

    varname = make_js_varname(stem, prefix)
    out_filename = f"{prefix}{stem}.js"
    out_path = out_dir / out_filename

    data = path.read_bytes()
    b64 = base64.b64encode(data).decode('ascii')

    js_lines = []
    js_lines.append(f"const {varname} = '{b64}';")
    if add_export:
        js_lines.append(f"export default {varname};")
    js_content = '\n'.join(js_lines) + '\n'

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(js_content, encoding='utf-8')

    print(f"Wrote {out_path}  (orig: {path.stat().st_size/1024/1024:.2f} MB, js: {len(js_content)/1024/1024:.2f} MB)")
    return out_path


def find_gz_files(input_dir: Path):
    for p in sorted(input_dir.rglob('*.gz')):
        yield p


def main():
    parser = argparse.ArgumentParser(description='Convert .gz files to base64 JS blobs')
    parser.add_argument('--input-dir', '-i', type=Path, default=Path('python_scripts/data'), help='Directory to scan for .gz files')
    parser.add_argument('--out-dir', '-o', type=Path, default=Path('scripts'), help='Directory to write JS files')
    parser.add_argument('--prefix', '-p', default='data_', help='Prefix for JS variable names and output filenames')
    parser.add_argument('--export-default', action='store_true', help='Add `export default <var>` to each file')
    parser.add_argument('--dry-run', action='store_true', help="Don't write files, just list what would be done")

    args = parser.parse_args()

    input_dir: Path = args.input_dir
    out_dir: Path = args.out_dir
    prefix: str = args.prefix

    if not input_dir.exists():
        print(f"Input directory does not exist: {input_dir}")
        return

    gz_files = list(find_gz_files(input_dir))
    if not gz_files:
        print(f"No .gz files found under {input_dir}")
        return

    print(f"Found {len(gz_files)} .gz files. Writing JS files to {out_dir}")

    for gz in gz_files:
        name = gz.name
        inner = name[:-3] if name.endswith('.gz') else name
        stem = Path(inner).stem
        varname = make_js_varname(stem, prefix)
        out_filename = f"{prefix}{stem}.js"
        out_path = out_dir / out_filename

        if args.dry_run:
            print(f"Would process: {gz} -> {out_path}  (var: {varname})")
            continue

        process_gz_file(gz, out_dir, prefix, args.export_default)


if __name__ == '__main__':
    main()
