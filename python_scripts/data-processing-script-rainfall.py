import xarray as xr
import pandas as pd
import os
import glob
import regionmask
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

# Directory setups
DATA_DIR = 'data'
os.makedirs(DATA_DIR, exist_ok=True)

print("\n==== PROCESSING RAINFALL DATA (PER COUNTRY) ====")

# 1. Find files recursively & filter out folders
search_pattern = os.path.join(DATA_DIR, '**', 'full_data_monthly_*.nc')
candidates = glob.glob(search_pattern, recursive=True)
nc_files = [f for f in candidates if os.path.isfile(f)]

print(f"Found {len(nc_files)} valid rainfall files.")

if nc_files:
    try:
        print("Loading global rainfall datasets...")
        rainfall_ds = xr.open_mfdataset(nc_files, combine='by_coords')

        print("Loading country boundaries...")
        countries = regionmask.defined_regions.natural_earth_v5_0_0.countries_110
        
        print("Creating country mask...")
        mask = countries.mask(rainfall_ds)

        print("Calculating average rainfall per country...")
        rainfall_by_country = rainfall_ds.groupby(mask).mean()

        print("Converting to CSV...")
        df = rainfall_by_country.to_dataframe().reset_index()

        # === FIX STARTS HERE ===
        # Rename the first column (the grouping index) to 'region'
        # This prevents KeyError if it's named 'mask' or something else
        first_col = df.columns[0]
        if first_col != 'region':
            print(f"Renaming index column '{first_col}' to 'region'...")
            df = df.rename(columns={first_col: 'region'})
        # === FIX ENDS HERE ===

        # Create lookup table
        regions_df = pd.DataFrame({
            'region': countries.numbers, 
            'country_name': countries.names,
            'abbrev': countries.abbrevs
        })
        
        print("Merging data...")
        final_df = pd.merge(df, regions_df, on='region', how='left')

        # Rename variable to 'rainfall_mm'
        # We exclude 'time' and 'region' from the search for data columns
        data_cols = [c for c in df.columns if c not in ['time', 'region']]
        if data_cols:
            final_df = final_df.rename(columns={data_cols[0]: 'rainfall_mm'})
        
        # Remove oceans/NaN regions
        final_df = final_df.dropna(subset=['country_name'])

        # Save to CSV
        output_path = os.path.join(DATA_DIR, 'rainfall_by_country.csv')
        cols_to_save = ['time', 'country_name', 'abbrev', 'rainfall_mm']
        final_df[cols_to_save].to_csv(output_path, index=False)
        
        print(f"SUCCESS: Saved rainfall data for {final_df['country_name'].nunique()} countries.")
        print(f"File saved to: {output_path}")
        
    except Exception as e:
        print(f"ERROR processing rainfall: {e}")
        import traceback
        traceback.print_exc()
else:
    print("ERROR: No valid .nc files found.")
