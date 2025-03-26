import geopandas as gpd
from geopy.geocoders import Nominatim
from shapely.geometry import Point
import pandas as pd
import time
from tqdm import tqdm

def get_coordinates(address):
    """Convert address to coordinates using Nominatim geocoder"""
    try:
        geolocator = Nominatim(user_agent="my_geocoder")
        location = geolocator.geocode(address)
        if location:
            return Point(location.longitude, location.latitude)
        return None
    except Exception as e:
        print(f"Error geocoding address: {e}")
        return None

def check_address_in_region(address, regions):
    """
    Check if an address falls within any region in the shapefile
    
    Parameters:
    address (str): The address to check
    regions (GeoDataFrame): The loaded regions from shapefile
    
    Returns:
    dict: Region attributes if found, None if not found
    """
    # Get coordinates for the address
    point = get_coordinates(address)
    if point is None:
        return None
    
    # Create a GeoDataFrame for the point
    point_gdf = gpd.GeoDataFrame(geometry=[point], crs="EPSG:4326")
    
    # Ensure both geometries are using the same coordinate system
    if regions.crs != point_gdf.crs:
        regions = regions.to_crs(point_gdf.crs)
    
    # Check if point is within any region
    for idx, region in regions.iterrows():
        if point.within(region.geometry):
            return region.to_dict()
    
    return None

def process_addresses(csv_path, shapefile_path):
    """
    Process all addresses in the CSV file and add shapefile metadata
    
    Parameters:
    csv_path (str): Path to the CSV file with addresses
    shapefile_path (str): Path to the shapefile
    """
    # Read the CSV file
    df = pd.read_csv(csv_path)
    
    if 'address' not in df.columns:
        raise ValueError("CSV file must contain an 'address' column")
    
    # Read the shapefile
    regions = gpd.read_file(shapefile_path)
    print("Available attributes:", list(regions.columns))
    
    # Create empty columns for each attribute in the shapefile
    region_columns = [col for col in regions.columns if col != 'geometry']
    for col in region_columns:
        df[f'region_{col}'] = None
    
    # Add a column to track if address was found in any region
    df['in_region'] = False
    
    # Process each address with tqdm progress bar
    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Processing addresses"):
        region_data = check_address_in_region(row['address'], regions)
        
        if region_data:
            df.at[idx, 'in_region'] = True
            for col in region_columns:
                df.at[idx, f'region_{col}'] = region_data[col]
        
        # Add a small delay to avoid overwhelming the geocoding service
        time.sleep(1)
    
    # Save the results to a new CSV file
    output_path = csv_path.rsplit('.', 1)[0] + '_with_regions.csv'
    df.to_csv(output_path, index=False)
    print(f"\nResults saved to: {output_path}")
    
    # Print summary
    print(f"\nProcessing complete:")
    print(f"Total addresses: {len(df)}")
    print(f"Addresses found in regions: {df['in_region'].sum()}")
    print(f"Addresses not found in regions: {len(df) - df['in_region'].sum()}")

def main():
    csv_path = "data.csv"
    shapefile_path = "GISDATA_HOUSE2021_POLYPolygon.shp"
    
    process_addresses(csv_path, shapefile_path)

if __name__ == "__main__":
    main() 