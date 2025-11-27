import os
import xarray as xr
import pandas as pd
import json

def fetch_global_sst(downsample=10):
    """
    Download the full monthly OISST v2 SST dataset starting from 1981,
    include ALL longitudes and latitudes,
    downsample the resolution (lat and lon by `downsample`),
    return a list of {month, values} objects in the same strict JSON format
    used for the Pacific JSON file.
    """

    url = "https://psl.noaa.gov/thredds/dodsC/Datasets/noaa.oisst.v2/sst.mnmean.nc"
    print("Opening dataset...")
    ds = xr.open_dataset(url)

    # keep from December 1981 onwards
    ds = ds.sel(time=slice("1981-12-01", None))

    # downsample latitude and longitude by the given factor
    print(f"Downsampling latitude & longitude by factor {downsample}...")
    ds_small = ds.isel(
        lat=slice(None, None, downsample),
        lon=slice(None, None, downsample)
    )

    print(f"Final grid: lat={ds_small.lat.size}, lon={ds_small.lon.size}")
    total_values = ds_small.lat.size * ds_small.lon.size
    print(f"{total_values} values per month")

    json_data = []

    for t in ds_small.time:
        month_str = pd.to_datetime(str(t.values)).strftime("%Y-%m")

        # extract & flatten
        sst = ds_small["sst"].sel(time=t).values.flatten()

        # round to reduce size
        sst = sst.round(2).tolist()

        json_data.append({
            "month": month_str,
            "values": sst
        })

        print(f"Processed {month_str} — {len(sst)} values")

    return json_data


def save_json(data, output_file="./python_scripts/data/global_sst.json"):
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w") as f:
        json.dump(data, f)
    print(f"JSON saved to {output_file}, total months: {len(data)}")


if __name__ == "__main__":
    sst = fetch_global_sst(downsample=10)
    save_json(sst)
