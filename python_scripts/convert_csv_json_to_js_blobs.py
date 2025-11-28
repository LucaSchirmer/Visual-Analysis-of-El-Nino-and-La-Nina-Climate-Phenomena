#!/usr/bin/env python3
"""
Scan a directory for .csv and .json files, optionally round numeric values (for CSV),
gzip-compress each file's text representation, Base64-encode the compressed bytes,
and write a JS file containing a `const <varname> = '<base64>';` for each input file.

Example:
  python convert_csv_json_to_js_blobs.py -i python_scripts/data -o scripts

Outputs will be written as `scripts/data_<stem>.js` with sanitized JS variable names.
"""
import argparse
import base64
import gzip
import json
import re
from pathlib import Path
from typing import Optional

try:
    import pandas as pd
except Exception:
    pd = None


def make_js_varname(name: str, prefix: str) -> str:
    cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    if re.match(r"^[0-9]", cleaned):
        cleaned = "_" + cleaned
    return f"{prefix}{cleaned}"


def process_csv(path: Path, round_decimals: Optional[int]) -> bytes:
    if pd is None:
        raise RuntimeError("pandas is required to process CSV files. Install it or run without CSVs.")
    df = pd.read_csv(path)
    if round_decimals is not None:
        # Round all float columns
        float_cols = df.select_dtypes(include=['float', 'float64', 'float32']).columns
        if len(float_cols) > 0:
            df[float_cols] = df[float_cols].round(round_decimals)
    data_str = df.to_csv(index=False)
    return data_str.encode('utf-8')


def process_json(path: Path) -> bytes:
    with path.open('r', encoding='utf-8') as f:
        data = json.load(f)
    # minify
    data_str = json.dumps(data, separators=(',', ':'))
    return data_str.encode('utf-8')


def compress_and_b64(data_bytes: bytes) -> str:
    compressed = gzip.compress(data_bytes)
    return base64.b64encode(compressed).decode('ascii')


def write_js(out_dir: Path, varname: str, b64_str: str, export_default: bool) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{varname}.js"
    # variable name may include prefix already; ensure JS identifier for var
    js_var = varname
    content_lines = [f"const {js_var} = '{b64_str}';"]
    if export_default:
        content_lines.append(f"export default {js_var};")
    content = '\n'.join(content_lines) + '\n'
    out_path.write_text(content, encoding='utf-8')
    return out_path


def find_files(input_dir: Path):
    for p in sorted(input_dir.rglob('*.csv')):
        yield p
    for p in sorted(input_dir.rglob('*.json')):
        yield p


def main():
    parser = argparse.ArgumentParser(description='Convert CSV/JSON files to gzip+base64 JS blobs')
    parser.add_argument('--input-dir', '-i', type=Path, default=Path('python_scripts/data'), help='Directory to scan')
    parser.add_argument('--out-dir', '-o', type=Path, default=Path('scripts'), help='Directory to write JS files')
    parser.add_argument('--prefix', '-p', default='data_', help='Prefix for JS variable names and output filenames')
    parser.add_argument('--round', '-r', type=int, default=2, help='Round floats in CSV to this many decimals (use -1 to disable)')
    parser.add_argument('--export-default', action='store_true', help='Add `export default <var>` to each file')
    parser.add_argument('--dry-run', action='store_true', help="Don't write files, just show what would be done")

    args = parser.parse_args()

    input_dir: Path = args.input_dir
    out_dir: Path = args.out_dir
    prefix = args.prefix
    export_default = args.export_default
    round_decimals = None if args.round < 0 else args.round

    if not input_dir.exists():
        print(f"Input directory not found: {input_dir}")
        return

    files = list(find_files(input_dir))
    if not files:
        print(f"No .csv or .json files found under {input_dir}")
        return

    print(f"Found {len(files)} files. Output dir: {out_dir}")

    for p in files:
        stem = p.with_suffix('').name
        # double-suffix like foo.csv -> stem is 'foo'
        if p.suffix.lower() == '.gz':
            stem = Path(stem).with_suffix('').name

        var_stem = f"{prefix}{stem}"
        # sanitize varname (but keep prefix)
        js_varname = make_js_varname(var_stem, '')
        js_varname = js_varname  # already includes prefix

        out_file_name = f"{js_varname}.js"
        out_path = out_dir / out_file_name

        if args.dry_run:
            print(f"Would process {p} -> {out_path} (var: {js_varname})")
            continue

        try:
            if p.suffix.lower() == '.csv':
                if pd is None:
                    raise RuntimeError('pandas not available; cannot process CSV files')
                data_bytes = process_csv(p, round_decimals)
            else:
                data_bytes = process_json(p)

            b64 = compress_and_b64(data_bytes)
            write_js(out_dir, js_varname, b64, export_default)
            print(f"Wrote {out_path} (orig: {p.stat().st_size/1024:.1f} KB)")
        except Exception as e:
            print(f"Error processing {p}: {e}")


if __name__ == '__main__':
    main()
