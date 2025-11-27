import xarray as xr
import pandas as pd
import os
import regionmask
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

# Setup directories
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
GRIB_FILE = os.path.join(DATA_DIR, 'monthly_temp_data.grib') 

print("\n==== PROCESSING ERA5 TEMPERATURE (GRIB) ====")

if not os.path.exists(GRIB_FILE):
    print(f"ERROR: File not found at {GRIB_FILE}")
    exit()

try:
    print(f"Loading GRIB file: {GRIB_FILE}")
    ds = xr.open_dataset(GRIB_FILE, engine='cfgrib')

    # 1. RENAME COORDINATES IMMEDIATELY
    # Regionmask expects 'lat' and 'lon'. Renaming them here fixes the masking error.
    print("Renaming coordinates to lat/lon...")
    if 'latitude' in ds.coords:
        ds = ds.rename({'latitude': 'lat', 'longitude': 'lon'})

    # 2. FIND VARIABLE
    var_name = None
    for v in ['t2m', '2t', 'tas']:
        if v in ds.data_vars:
            var_name = v
            break
    
    if not var_name:
        print(f"Error: Temperature variable not found. vars: {list(ds.data_vars)}")
        exit()

    print(f"Found variable: '{var_name}'. Converting Kelvin to Celsius...")
    ds['temperature_celsius'] = ds[var_name] - 273.15

    # 3. CREATE MASK
    print("Loading country boundaries...")
    countries = regionmask.defined_regions.natural_earth_v5_0_0.countries_110
    
    print("Creating spatial mask...")
    mask = countries.mask(ds)

    # 4. AGGREGATE
    print("Aggregating monthly mean temperature per country...")
    # groupby(mask).mean() automatically averages over the spatial points (lat/lon)
    # belonging to each region, preserving the 'time' dimension.
    temp_by_country = ds['temperature_celsius'].groupby(mask).mean()

    print("Converting to DataFrame...")
    df = temp_by_country.to_dataframe().reset_index()

    # Rename grouping column to 'region'
    if 'mask' in df.columns:
        df = df.rename(columns={'mask': 'region'})
    elif df.columns[0] != 'region' and 'region' not in df.columns:
        df = df.rename(columns={df.columns[0]: 'region'})

    # 5. MERGE COUNTRY NAMES
    print("Mapping region IDs to Country Names...")
    regions_df = pd.DataFrame({
        'region': countries.numbers, 
        'country_name': countries.names,
        'abbrev': countries.abbrevs
    })
    
    final_df = pd.merge(df, regions_df, on='region', how='left')
    final_df = final_df.dropna(subset=['country_name'])

    # 6. CLEAN TIME COLUMN
    # GRIB usually uses 'valid_time' or 'time'
    time_col = 'valid_time' if 'valid_time' in final_df.columns else 'time'
    if 'step' in final_df.columns: # Drop 'step' if it exists (artifact of GRIB)
        final_df = final_df.drop(columns=['step'])

    final_df['year'] = final_df[time_col].dt.year
    final_df['month'] = final_df[time_col].dt.month

    # Filter Years
    final_df = final_df[(final_df['year'] >= 1950)]

    # Select clean columns
    cols_to_save = ['year', 'month', 'country_name', 'abbrev', 'temperature_celsius']
    
    output_path = os.path.join(DATA_DIR, 'temperature_by_country.csv.gz')
    print(f"Saving to {output_path}...")
    
    # Save as GZIP CSV
    final_df[cols_to_save].to_csv(output_path, index=False, compression='gzip')

    print("SUCCESS: Temperature processing complete.")

except Exception as e:
    print(f"\nCRITICAL ERROR: {e}")
    import traceback
    traceback.print_exc()
