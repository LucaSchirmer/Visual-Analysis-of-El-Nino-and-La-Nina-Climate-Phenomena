#!/usr/bin/env python3
"""
Preprocess FAO Capture_Quantity.csv into a tidy CSV of total tonnes per country per year.

Output: python_scripts/data/fishing_by_country_year.csv
Columns: year,country_un_code,country_iso3,country_name,total_tonnes

This script uses only the Python stdlib csv module to avoid external deps.
"""
import csv
import os
from collections import defaultdict


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# data files live under python_scripts/data in this repo
DATA_DIR = os.path.join(ROOT, "python_scripts", "data")
FAO_DIR = os.path.join(DATA_DIR, "fishing_data")

CAPTURE_FILE = os.path.join(FAO_DIR, "Capture_Quantity.csv")
COUNTRY_FILE = os.path.join(FAO_DIR, "CL_FI_COUNTRY_GROUPS.csv")
UNIT_FILE = os.path.join(FAO_DIR, "FSJ_UNIT.csv")
OUTPUT_DIR = DATA_DIR
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "fishing_by_country_year.csv")


def read_tonne_unit_codes(unit_path):
    codes = set()
    try:
        with open(unit_path, newline='', encoding='utf-8') as fh:
            # detect delimiter from first line
            first = fh.readline()
            if ';' in first and ',' not in first:
                delim = ';'
            elif ',' in first and ';' not in first:
                delim = ','
            else:
                # default to semicolon for FAO files
                delim = ';'
            fh.seek(0)
            reader = csv.reader(fh, delimiter=delim)
            header = next(reader)
            # find indices
            try:
                code_i = header.index('"Code"')
                unit_i = header.index('"Unit"')
            except ValueError:
                # fallback: unquoted header
                code_i = header.index('Code')
                unit_i = header.index('Unit')
            for row in reader:
                if len(row) <= max(code_i, unit_i):
                    continue
                code = row[code_i].strip().strip('"')
                unit = row[unit_i].strip().strip('"')
                if unit.lower() == 't' or unit.lower() == 'tonnes' or 'ton' in unit.lower():
                    codes.add(code)
    except FileNotFoundError:
        print(f"Warning: unit file not found: {unit_path}")
    return codes


def read_country_map(country_path):
    # map UN_Code (with leading zeros) -> (ISO3, Name_En)
    m = {}
    try:
        with open(country_path, newline='', encoding='utf-8') as fh:
            # detect delimiter
            first = fh.readline()
            if ';' in first and ',' not in first:
                delim = ';'
            elif ',' in first and ';' not in first:
                delim = ','
            else:
                delim = ';'
            fh.seek(0)
            reader = csv.reader(fh, delimiter=delim)
            header = next(reader)
            # find columns
            def find(name):
                if f'"{name}"' in header:
                    return header.index(f'"{name}"')
                return header.index(name)
            un_i = find('UN_Code')
            iso3_i = find('ISO3_Code')
            name_i = find('Name_En')
            for row in reader:
                if len(row) <= max(un_i, iso3_i, name_i):
                    continue
                un = row[un_i].strip().strip('"')
                iso3 = row[iso3_i].strip().strip('"')
                name = row[name_i].strip().strip('"')
                if un:
                    m[un] = (iso3, name)
    except FileNotFoundError:
        print(f"Warning: country mapping file not found: {country_path}")
    return m


def parse_capture_and_aggregate(capture_path, tonne_codes, country_map):
    # aggregate[(year, country_un)] = sum tonnes
    agg = defaultdict(float)
    total_rows = 0
    kept_rows = 0
    try:
        with open(capture_path, newline='', encoding='utf-8') as fh:
            # detect delimiter from first line
            first = fh.readline()
            if ';' in first and ',' not in first:
                delim = ';'
            elif ',' in first and ';' not in first:
                delim = ','
            else:
                delim = ';'
            fh.seek(0)
            reader = csv.reader(fh, delimiter=delim)
            header = next(reader)
            # find indices robustly
            def find_possible(names):
                for nm in names:
                    if f'"{nm}"' in header:
                        return header.index(f'"{nm}"')
                    if nm in header:
                        return header.index(nm)
                raise ValueError('header not found')
            country_i = find_possible(['COUNTRY.UN_CODE', 'UN_CODE', 'Country'])
            measure_i = find_possible(['MEASURE', 'Measure'])
            period_i = find_possible(['PERIOD', 'Period', 'YEAR'])
            value_i = find_possible(['VALUE', 'Value'])
            status_i = None
            for opt in ['STATUS', 'Status']:
                if f'"{opt}"' in header:
                    status_i = header.index(f'"{opt}"')
                    break
                if opt in header:
                    status_i = header.index(opt)
                    break

            for row in reader:
                total_rows += 1
                # skip short rows
                if len(row) <= max(country_i, measure_i, period_i, value_i):
                    continue
                try:
                    country_un = row[country_i].strip().strip('"')
                    measure = row[measure_i].strip().strip('"')
                    year = row[period_i].strip().strip('"')
                    value_raw = row[value_i].strip().strip('"')
                except Exception:
                    continue
                status = ''
                if status_i is not None and len(row) > status_i:
                    status = row[status_i].strip().strip('"')

                # filter by status (keep only 'A' or empty)
                if status and status.upper() != 'A':
                    continue

                if measure not in tonne_codes:
                    continue

                if not year:
                    continue

                # parse value
                try:
                    # replace comma thousands separators if present
                    if ',' in value_raw and '.' in value_raw:
                        # ambiguous: remove commas
                        v = float(value_raw.replace(',', ''))
                    else:
                        v = float(value_raw.replace(',', '.'))
                except Exception:
                    continue

                try:
                    y = int(year)
                except Exception:
                    continue

                key = (y, country_un)
                agg[key] += v
                kept_rows += 1
    except FileNotFoundError:
        print(f"Error: capture file not found: {capture_path}")
        return None, 0, 0

    return agg, total_rows, kept_rows


def write_output(agg, country_map, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.writer(fh)
        writer.writerow(['year', 'country_un_code', 'country_iso3', 'country_name', 'total_tonnes'])
        # sort by year asc then country
        for (year, country_un), total in sorted(agg.items()):
            iso3, name = country_map.get(country_un, ('', ''))
            writer.writerow([year, country_un, iso3, name, f"{total:.6f}"])


def main():
    print("Reading unit codes to detect tonne measures...")
    tonne_codes = read_tonne_unit_codes(UNIT_FILE)
    if not tonne_codes:
        print("No tonne measure codes found in FSJ_UNIT.csv; defaulting to common codes [Q_tlw,Q_t_1,Q_tpw]")
        tonne_codes = {'Q_tlw', 'Q_t_1', 'Q_tpw'}
    else:
        print(f"Found {len(tonne_codes)} tonne measure codes.")

    print("Reading country mapping...")
    country_map = read_country_map(COUNTRY_FILE)

    print("Aggregating Capture_Quantity.csv ... this may take a little while")
    agg, total_rows, kept_rows = parse_capture_and_aggregate(CAPTURE_FILE, tonne_codes, country_map)
    if agg is None:
        print("Aborting due to missing input file.")
        return

    print(f"Read {total_rows} rows; kept {kept_rows} rows matching tonne measures and STATUS 'A'.")
    print(f"Writing aggregated output to {OUTPUT_FILE} ...")
    write_output(agg, country_map, OUTPUT_FILE)
    print("Done.")


if __name__ == '__main__':
    main()
