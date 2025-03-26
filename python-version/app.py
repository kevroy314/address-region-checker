import streamlit as st
import geopandas as gpd
from geopy.geocoders import Nominatim
from shapely.geometry import Point
import pandas as pd
import time
import os
import pathlib

# Add title and description
st.title('Address Region Checker')
st.write('Upload a CSV file with addresses to check which regions they fall into.')

def get_coordinates(address):
    """Convert address to coordinates using Nominatim geocoder"""
    try:
        geolocator = Nominatim(user_agent="my_geocoder")
        location = geolocator.geocode(address)
        if location:
            return Point(location.longitude, location.latitude)
        return None
    except Exception as e:
        st.error(f"Error geocoding address: {e}")
        return None

def check_address_in_region(address, regions_list):
    """
    Check if an address falls within any region in any of the shapefiles
    
    Parameters:
    address (str): The address to check
    regions_list (list): List of tuples (file_name, GeoDataFrame) containing all region data
    
    Returns:
    dict: Combined region attributes if found, None if not found
    """
    point = get_coordinates(address)
    if point is None:
        return None
    
    point_gdf = gpd.GeoDataFrame(geometry=[point], crs="EPSG:4326")
    combined_data = {}
    
    for file_path, regions in regions_list:
        if regions.crs != point_gdf.crs:
            regions = regions.to_crs(point_gdf.crs)
        
        # Get parent folder and file name for prefix
        parts = pathlib.Path(file_path).parts
        shape_files_idx = parts.index('shape_files')
        prefix = '_'.join(parts[shape_files_idx + 1:]).replace('.shp', '')
        
        for idx, region in regions.iterrows():
            if point.within(region.geometry):
                region_dict = region.to_dict()
                for key, value in region_dict.items():
                    if key != 'geometry':
                        combined_data[f"{prefix}_{key}"] = value
    
    return combined_data if combined_data else None

def process_addresses(df, regions_list):
    """Modified to work with multiple shapefiles"""
    # Create empty columns for each attribute from all shapefiles
    all_columns = []
    for file_path, regions in regions_list:
        # Get parent folder and file name for prefix
        parts = pathlib.Path(file_path).parts
        shape_files_idx = parts.index('shape_files')
        prefix = '_'.join(parts[shape_files_idx + 1:]).replace('.shp', '')
        
        region_columns = [col for col in regions.columns if col != 'geometry']
        for col in region_columns:
            column_name = f"{prefix}_{col}"
            df[column_name] = None
            all_columns.append(column_name)
    
    df['in_region'] = False
    
    # Create a progress bar and status elements
    progress_bar = st.progress(0)
    status_text = st.empty()
    time_text = st.empty()
    
    # Process each address
    total_rows = len(df)
    start_time = time.time()
    
    for idx, row in enumerate(df.iterrows()):
        # Calculate time estimates
        elapsed_time = time.time() - start_time
        if idx > 0:
            avg_time_per_row = elapsed_time / idx
            estimated_remaining = avg_time_per_row * (total_rows - idx)
            
            elapsed_str = time.strftime('%M:%S', time.gmtime(elapsed_time))
            remaining_str = time.strftime('%M:%S', time.gmtime(estimated_remaining))
            
            time_text.text(f"Elapsed: {elapsed_str} | Estimated remaining: {remaining_str}")
        
        status_text.text(f"Processing address {idx + 1} of {total_rows}")
        progress_bar.progress(idx / total_rows)
        
        region_data = check_address_in_region(row[1]['address'], regions_list)
        
        if region_data:
            df.at[idx, 'in_region'] = True
            for col, value in region_data.items():
                df.at[idx, col] = value
        
        time.sleep(1)
    
    # Final progress update
    progress_bar.progress(1.0)
    final_time = time.strftime('%M:%S', time.gmtime(time.time() - start_time))
    status_text.text("Processing complete!")
    time_text.text(f"Total processing time: {final_time}")
    
    return df

def find_shapefiles(directory="shape_files"):
    """Recursively find all .shp files in the given directory"""
    shapefile_paths = []
    try:
        directory = os.path.abspath(directory)
        
        if not os.path.exists(directory):
            st.error(f"Directory not found: {directory}")
            return []
        
        for path in pathlib.Path(directory).rglob("*.shp"):
            shapefile_paths.append(str(path))
        
        if not shapefile_paths:
            st.warning(f"No shapefiles found in {directory}")
        else:
            st.success(f"Found {len(shapefile_paths)} shapefiles")
            
        return sorted(shapefile_paths)
        
    except Exception as e:
        st.error(f"Error searching for shapefiles: {str(e)}")
        return []

# Create a container for the steps sidebar
with st.sidebar:
    st.header("Progress")
    step1_status = st.empty()
    st.write("Step 1: Upload Data")
    step2_status = st.empty()
    st.write("Step 2: Process Addresses")
    step3_status = st.empty()
    st.write("Step 3: Download Results")
    st.write("---")
    
    # Add Start Over button to sidebar
    if st.button("🔄 Start Over", use_container_width=True):
        st.session_state.clear()
        st.rerun()
    
    # Initialize session state if needed
    if 'current_step' not in st.session_state:
        st.session_state.current_step = 1
    if 'result_df' not in st.session_state:
        st.session_state.result_df = None
    if 'processing_complete' not in st.session_state:
        st.session_state.processing_complete = False

# Get shapefile paths
SHAPEFILE_PATHS = find_shapefiles()

# Display found shapefiles in expandable section
if SHAPEFILE_PATHS:
    with st.expander("View Available Shapefiles"):
        for path in SHAPEFILE_PATHS:
            relative_path = str(pathlib.Path(path)).split('shape_files/')[-1]
            # Load the shapefile and get feature count
            gdf = gpd.read_file(path)
            feature_count = len(gdf)
            st.text(f"{relative_path} ({feature_count:,} features)")

# Step 1: File Upload
st.header("Step 1: Upload Your Data")
step1_status.info("⏳ Waiting for file upload")

uploaded_csv = st.file_uploader(
    "Upload CSV file with addresses", 
    type=['csv'],
    help="Your CSV file must contain an 'address' column"
)

if uploaded_csv is not None:
    try:
        # Read the CSV file
        df = pd.read_csv(uploaded_csv)
        
        if 'address' not in df.columns:
            step1_status.error("❌ CSV file must contain an 'address' column")
            step2_status.info("⏳ Waiting for valid file")
            step3_status.info("⏳ Waiting for processing")
        else:
            step1_status.success("✅ File uploaded successfully!")
            st.session_state.current_step = 2
            
            # Step 2: Process Addresses
            st.header("Step 2: Process Addresses")
            
            if st.session_state.current_step == 1:
                step2_status.info("⏳ Waiting for file upload")
            else:
                step2_status.info("⏳ Ready to process")
            
            # Read all shapefiles
            try:
                regions_list = []
                for shapefile_path in SHAPEFILE_PATHS:
                    regions = gpd.read_file(shapefile_path)
                    regions_list.append((shapefile_path, regions))
                
                # Make the process button more prominent
                col1, col2, col3 = st.columns([1, 2, 1])
                with col2:
                    process_button = st.button(
                        'Process Addresses',
                        use_container_width=True,
                        type="primary"  # Makes the button more prominent
                    )
                
                if process_button or st.session_state.processing_complete:
                    if not st.session_state.processing_complete:
                        step2_status.success("✅ Processing in progress")
                        step3_status.info("⏳ Waiting for processing")
                        
                        # Process the addresses
                        result_df = process_addresses(df, regions_list)
                        
                        # Store results and state
                        st.session_state.result_df = result_df
                        st.session_state.processing_complete = True
                    else:
                        # Use stored results
                        result_df = st.session_state.result_df
                    
                    # Step 3: Download Results
                    st.header("Step 3: Download Results")
                    
                    # Show summary in a nice format
                    st.subheader("Processing Results")
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric("Total Addresses", len(result_df))
                    with col2:
                        st.metric("Found in Regions", int(result_df['in_region'].sum()))
                    with col3:
                        st.metric("Not Found", int(len(result_df) - result_df['in_region'].sum()))
                    
                    # Add some spacing
                    st.write("")
                    st.write("")
                    
                    # Center the download button
                    col1, col2, col3 = st.columns([1, 2, 1])
                    with col2:
                        # Provide download link for results
                        st.download_button(
                            label="📥 Download Results CSV",
                            data=result_df.to_csv(index=False).encode('utf-8'),
                            file_name='addresses_with_regions.csv',
                            mime='text/csv',
                            use_container_width=True,
                            type="primary"
                        )
                    
                    step2_status.success("✅ Processing complete!")
                    step3_status.success("✅ Ready to download")
                    st.session_state.current_step = 3
                
            except Exception as e:
                step2_status.error(f"❌ Error loading shapefiles: {str(e)}")
                step3_status.error("❌ Processing failed")
                
    except Exception as e:
        step1_status.error(f"❌ Error: {str(e)}")
        step2_status.info("⏳ Waiting for valid file")
        step3_status.info("⏳ Waiting for processing") 