import xarray as xr
import pandas as pd
import os
import glob
import regionmask
import warnings

# Suppress warnings
warnings.filterwarnings("ignore")

print("\n==== PROCESSING TEMPERATURE DATA (FROM NETCDF) ====")

# --- 1. SETUP ---
DATA_DIR = 'data'
# Look for the specific file shown in your screenshot
# It seems to be in 'python_scripts/data/'
# We use a wildcard pattern to find it easily
search_pattern = os.path.join(DATA_DIR, 'timeseries-tas-annual-mean*.nc')
nc_files = glob.glob(search_pattern)

if not nc_files:
    print(f"ERROR: No temperature NetCDF files found in '{DATA_DIR}'.")
    print("Please make sure the .nc file is inside the 'data' folder.")
    exit()

print(f"Found file: {nc_files[0]}")

try:
    # --- 2. LOAD DATA ---
    print("Loading temperature dataset...")
    # Open the dataset
    temp_ds = xr.open_dataset(nc_files[0])
    
    # Check the variable name (usually 'tas' for temperature)
    var_name = list(temp_ds.data_vars)[0]
    print(f"Variable found: {var_name}")

    # --- 3. APPLY COUNTRY MASK ---
    # If the data is global gridded data (lat/lon), we mask it by country.
    # If the data is already by country (ISO3), we just convert it.
    
    if 'lat' in temp_ds.coords or 'latitude' in temp_ds.coords:
        print("Loading country boundaries...")
        countries = regionmask.defined_regions.natural_earth_v5_0_0.countries_110
        
        print("Creating country mask...")
        mask = countries.mask(temp_ds)

        print("Calculating average temperature per country...")
        temp_by_country = temp_ds.groupby(mask).mean()
        
        print("Converting to CSV...")
        df = temp_by_country.to_dataframe().reset_index()
        
        # Rename region column
        first_col = df.columns[0]
        if first_col != 'region':
            df = df.rename(columns={first_col: 'region'})
            
        # Map Region IDs to Country Names
        regions_df = pd.DataFrame({
            'region': countries.numbers, 
            'country_name': countries.names,
            'abbrev': countries.abbrevs
        })
        
        final_df = pd.merge(df, regions_df, on='region', how='left')
        
    else:
        # If the file is NOT gridded (maybe it's already timeseries by country?)
        # We assume it might just be a flat structure, so we dump it to CSV directly
        print("Dataset does not appear to be gridded (lat/lon). Converting directly...")
        final_df = temp_ds.to_dataframe().reset_index()
        final_df['country_name'] = 'Global' # Placeholder if no country info

    # --- 4. CLEAN AND SAVE ---
    # Rename variable to 'temperature_celsius'
    final_df = final_df.rename(columns={var_name: 'temperature_celsius'})
    
    # Drop rows without data
    final_df = final_df.dropna(subset=['temperature_celsius'])
    
    # Save
    OUTPUT_FILE = os.path.join(DATA_DIR, 'temperature_by_country.csv')
    final_df.to_csv(OUTPUT_FILE, index=False)
    
    print(f"SUCCESS: Saved {len(final_df)} records to {OUTPUT_FILE}")

except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
