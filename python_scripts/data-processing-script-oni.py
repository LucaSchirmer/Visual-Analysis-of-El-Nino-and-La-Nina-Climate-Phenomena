#!/usr/bin/env python3
"""
download_oni_to_csv.py

Download the ONI data file from NOAA and convert it to a monthly CSV.
Saves raw file to `python_scripts/data/oni.data` and processed CSV to
`python_scripts/data/oni_monthly.csv`.

Run:
    python download_oni_to_csv.py

This script uses only the Python standard library so it should work
without installing extra packages.
"""
import os
import sys
import csv
import urllib.request

URL = 'https://psl.noaa.gov/data/correlation/oni.data'
HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, 'data')
RAW_PATH = os.path.join(DATA_DIR, 'oni.data')
CSV_PATH = os.path.join(DATA_DIR, 'oni_monthly.csv')

months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

def phase_from_value(v):
    if v >= 0.5:
        return 'El Niño'
    if v <= -0.5:
        return 'La Niña'
    return 'Neutral'

def intensity_from_value(v):
    a = abs(v)
    if a >= 2.0:
        return 'Very Strong'
    if a >= 1.5:
        return 'Strong'
    if a >= 1.0:
        return 'Moderate'
    if a >= 0.5:
        return 'Weak'
    return 'Neutral'

def parse_oni_text(text):
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        # Expect: year followed by up to 12 values
        try:
            year = int(parts[0])
        except Exception:
            continue
        if year < 0:
            continue
        for i in range(1, min(len(parts), 13)):
            try:
                val = float(parts[i])
            except Exception:
                continue
            # NOAA uses -99.99 for missing
            if val == -99.99:
                continue
            month_idx = i - 1
            month = month_idx + 1
            date = f"{year:04d}-{month:02d}-01"
            phase = phase_from_value(val)
            intensity = intensity_from_value(val)
            rows.append({
                'date': date,
                'year': year,
                'month': month,
                'oni': val,
                'phase': phase,
                'intensity': intensity
            })
    return rows

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)

def download_raw(url=URL, dest=RAW_PATH):
    print(f'Downloading {url} ...')
    try:
        with urllib.request.urlopen(url) as r:
            data = r.read().decode('utf-8')
    except Exception as e:
        print(f'Error downloading remote ONI data: {e}', file=sys.stderr)
        raise
    with open(dest, 'w', encoding='utf-8', newline='') as f:
        f.write(data)
    print(f'Saved raw ONI to {dest}')
    return data

def load_local_raw(path=RAW_PATH):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_csv(rows, path=CSV_PATH):
    if not rows:
        print('No rows to write to CSV.')
        return
    fieldnames = ['date','year','month','oni','phase','intensity']
    with open(path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    print(f'Wrote processed CSV to {path}')

def main():
    ensure_data_dir()
    text = None
    # Try remote download first; on failure fall back to local raw if present
    try:
        text = download_raw()
    except Exception:
        print('Remote download failed; attempting to read local raw file if present...')
        if os.path.exists(RAW_PATH):
            print(f'Loading local raw file {RAW_PATH}')
            text = load_local_raw()
        else:
            print('No local raw file available. Please download manually or check network.', file=sys.stderr)
            sys.exit(1)

    rows = parse_oni_text(text)
    print(f'Parsed {len(rows)} monthly ONI records')
    write_csv(rows)

if __name__ == '__main__':
    main()
