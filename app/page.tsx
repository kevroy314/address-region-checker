'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import type { Feature } from '@turf/turf';
import shp from 'shpjs';

// Define types
type Step = 0 | 1 | 2 | 3;
type StepStatus = 'waiting' | 'ready' | 'processing' | 'complete' | 'error';

interface StepState {
  status: StepStatus;
  message: string;
}

interface AddressResult {
  address: string;
  inRegion: boolean;
  regions: Record<string, any>;
}

interface ShapefileData {
  name: string;
  features: any[];
  properties: string[];
}

interface ShapefileCache {
  [key: string]: ShapefileData;
}

interface ProcessedResults {
  total: number;
  found: number;
  notFound: number;
  data: AddressResult[];
}

// Add this type for shapefile info
interface ShapefileInfo {
  folder: string;
  name: string;
}

// Add manifest types
interface ManifestFile {
  folder: string;
  name: string;
}

interface Manifest {
  shapefiles: ManifestFile[];
}

// First, add a type for the original row data
interface CsvRow {
  [key: string]: string;
}

export default function Home() {
  // State management
  const [currentStep, setCurrentStep] = useState<Step>(0);
  const [stepStates, setStepStates] = useState<Record<Step, StepState>>({
    0: { status: 'waiting', message: '⏳ Waiting for shapefile upload' },
    1: { status: 'waiting', message: '⏳ Waiting for address file upload' },
    2: { status: 'waiting', message: '⏳ Waiting for file upload' },
    3: { status: 'waiting', message: '⏳ Waiting for processing' }
  });
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ProcessedResults | null>(null);
  const [shapefiles, setShapefiles] = useState<ShapefileCache>({});
  const [loadingShapefiles, setLoadingShapefiles] = useState(false);
  const [shapefileError, setShapefileError] = useState<string | null>(null);

  // Remove the hardcoded SHAPEFILE_LIST and add loading state for discovery
  const [shapefileList, setShapefileList] = useState<ShapefileInfo[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Add to the existing state declarations
  const [loadingProgress, setLoadingProgress] = useState({
    filesLoaded: 0,
    totalFiles: 0,
    currentFile: '',
    currentOperation: ''
  });

  // Add this with the other state declarations at the top of the component
  const [processingProgress, setProcessingProgress] = useState({
    processed: 0,
    total: 0,
    currentAddress: ''
  });

  // Add this helper function at the top level of the component
  const parseFeaturesBatched = async (source: any) => {
    let count = 0;

    try {
      console.log('Starting feature counting...');
      
      // Count features without storing them
      let feature = await source.read();
      while (feature !== null) {
        count++;
        if (count % 10 === 0) {
          console.log(`Counted ${count} features...`);
        }
        feature = await source.read();
      }

      console.log(`Total features in shapefile: ${count}`);
      return []; // Return empty array since we're just counting for now

    } catch (error) {
      console.error('Error during feature counting:', error);
      throw error;
    } finally {
      try {
        if (source && typeof source.close === 'function') {
          await source.close();
          console.log('Source closed successfully');
        }
      } catch (e) {
        console.error('Error closing source:', e);
      }
    }
  };

  // Add function to discover shapefiles
  const discoverShapefiles = async () => {
    try {
      console.log('Attempting to fetch manifest...');
      const response = await fetch('/shapefiles/manifest.json');
      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status} ${response.statusText}`);
      }
      const manifest = (await response.json()) as Manifest;
      console.log('Full manifest contents:', JSON.stringify(manifest, null, 2));
      
      // Now file is properly typed
      manifest.shapefiles.forEach((file: ManifestFile) => {
        console.log(`Will load file from:
          - /shapefiles/${file.folder}/${file.name}.zip`);
      });
      
      return manifest.shapefiles;
    } catch (error) {
      console.error('Error discovering shapefiles:', error);
      setDiscoveryError(`Failed to discover shapefiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  };

  // Add this helper function near the top of the component
  const scrollToBottom = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth'
    });
  };

  // Add a handler for shapefile upload
  const handleShapefileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoadingShapefiles(true);
    setShapefileError(null);
    
    try {
      console.log('Reading zip file...');
      const zipBuffer = await file.arrayBuffer();

      setLoadingProgress(prev => ({
        ...prev,
        totalFiles: 1,
        currentFile: file.name,
        currentOperation: 'Parsing shapefiles...'
      }));

      // Parse using shpjs
      console.log('Parsing zip file...');
      const allGeojson = await shp(zipBuffer);
      console.log('Parsed data:', allGeojson);
      
      // allGeojson will be either a single GeoJSON object or an array of them
      const geojsonArray = Array.isArray(allGeojson) ? allGeojson : [allGeojson];
      
      const loadedFiles: ShapefileCache = {};
      
      geojsonArray.forEach((geojson, index) => {
        // The filename property will include the folder path
        const name = geojson.fileName || `shapefile_${index}`;
        console.log(`Processing shapefile: ${name}`);
        
        loadedFiles[name] = {
          name,
          features: geojson.features,
          properties: geojson.features[0] ? Object.keys(geojson.features[0].properties || {}) : []
        };
      });

      console.log(`Loaded ${Object.keys(loadedFiles).length} shapefiles`);
      setShapefiles(loadedFiles);
      setLoadingShapefiles(false);
      
      // Update step status
      setStepStates(prev => ({
        ...prev,
        0: { status: 'complete', message: '✅ Shapefiles loaded successfully!' },
        1: { status: 'ready', message: '⏳ Ready for address file' }
      }));
      setCurrentStep(1);
      
      // Update the step completion handlers to include scrolling
      setTimeout(scrollToBottom, 100);
      
    } catch (error) {
      console.error('Error loading shapefiles:', error);
      setShapefileError(`Failed to load shapefiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoadingShapefiles(false);
      setStepStates(prev => ({
        ...prev,
        0: { status: 'error', message: '❌ Error loading shapefiles' }
      }));
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      Papa.parse(text, {
        complete: (results) => {
          // Store the full row data instead of just addresses
          const rows = results.data as CsvRow[];
          
          // Validate that we have an address column and data
          if (rows.length === 0 || !rows[0].hasOwnProperty('address')) {
            throw new Error('No addresses found in CSV or missing "address" column');
          }

          setCsvData(rows);
          setStepStates(prev => ({
            ...prev,
            1: { status: 'complete', message: '✅ File uploaded successfully!' },
            2: { status: 'ready', message: '⏳ Ready to process' }
          }));
          setCurrentStep(2);
          
          setTimeout(scrollToBottom, 100);
        },
        header: true
      });
    } catch (error) {
      setStepStates(prev => ({
        ...prev,
        1: { status: 'error', message: '❌ Error uploading file' }
      }));
    }
  };

  // Geocode address
  const geocodeAddress = async (address: string) => {
    try {
      // Encode the address for URL
      const encodedAddress = encodeURIComponent(address);
      
      // Call Nominatim API directly
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'AddressRegionChecker/1.0', // Required by Nominatim's terms
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
      }

      const results = await response.json();
      
      if (results && results[0]) {
        return {
          lat: parseFloat(results[0].lat),
          lon: parseFloat(results[0].lon)
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  };

  // Update the check region function to include all metadata
  const checkRegions = (point: turf.Feature) => {
    const results: Record<string, any> = {};
    let foundAny = false;

    Object.entries(shapefiles).forEach(([shapefileName, shapefile]) => {
      // Track if this point is in any feature of this shapefile
      let inThisShapefile = false;
      
      shapefile.features.forEach(feature => {
        if (turf.booleanPointInPolygon(point, feature.geometry)) {
          foundAny = true;
          inThisShapefile = true;
          
          // Add all properties from this feature with shapefile name prefix
          if (feature.properties) {
            Object.entries(feature.properties).forEach(([key, value]) => {
              results[`${shapefileName}_${key}`] = value;
            });
          }
        }
      });

      // If point wasn't in any feature of this shapefile, add null values for all possible properties
      if (!inThisShapefile) {
        shapefile.properties.forEach(propName => {
          results[`${shapefileName}_${propName}`] = null;
        });
      }
    });

    return { inRegion: foundAny, regions: results };
  };

  // Handle processing
  const handleProcess = async () => {
    if (csvData.length === 0 || loadingShapefiles) return;

    try {
      setStepStates(prev => ({
        ...prev,
        2: { status: 'processing', message: '⏳ Processing addresses...' }
      }));

      // Initialize progress and scroll immediately
      setProcessingProgress({
        processed: 0,
        total: csvData.length,
        currentAddress: ''
      });
      setTimeout(scrollToBottom, 100);

      const processedResults: AddressResult[] = [];
      
      // Process each row
      for (const row of csvData) {
        setProcessingProgress(prev => ({
          ...prev,
          currentAddress: row.address
        }));

        const coords = await geocodeAddress(row.address);
        let result: AddressResult;
        
        if (coords) {
          const point = turf.point([coords.lon, coords.lat]);
          const regionCheck = checkRegions(point);
          
          result = {
            address: row.address,
            inRegion: regionCheck.inRegion,
            regions: regionCheck.regions,
          };
        } else {
          // For failed geocoding, still include all possible region fields as null
          const emptyRegions: Record<string, any> = {};
          Object.values(shapefiles).forEach(shapefile => {
            shapefile.properties.forEach(propName => {
              emptyRegions[`${shapefile.name}_${propName}`] = null;
            });
          });
          
          result = {
            address: row.address,
            inRegion: false,
            regions: emptyRegions
          };
        }
        
        processedResults.push(result);
        
        // Update progress counter
        setProcessingProgress(prev => ({
          ...prev,
          processed: prev.processed + 1
        }));
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const results: ProcessedResults = {
        total: processedResults.length,
        found: processedResults.filter(r => r.inRegion).length,
        notFound: processedResults.filter(r => !r.inRegion).length,
        data: processedResults
      };

      setResults(results);
      setStepStates(prev => ({
        ...prev,
        2: { status: 'complete', message: '✅ Processing complete!' },
        3: { status: 'complete', message: '✅ Ready to download' }
      }));
      setCurrentStep(3);
      
      // Update the step completion handlers to include scrolling
      setTimeout(scrollToBottom, 100);
      
    } catch (error) {
      console.error('Processing error:', error);
      setStepStates(prev => ({
        ...prev,
        2: { status: 'error', message: '❌ Processing failed' }
      }));
    }
  };

  // Handle download
  const handleDownload = () => {
    if (!results) return;
    
    // Flatten the data structure and include original columns
    const flattenedData = results.data.map((result, index) => {
      // Start with all columns from the original CSV row
      const flatRow: Record<string, any> = {
        ...csvData[index],
        // Add our computed columns
        inRegion: result.inRegion,
      };
      
      // Add each region property as its own column
      Object.entries(result.regions).forEach(([key, value]) => {
        flatRow[key] = value;
      });
      
      return flatRow;
    });
    
    // Use Papa.unparse with the flattened data
    const csv = Papa.unparse(flattenedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'address_results.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Update the loading status display in the render
  const renderLoadingStatus = () => {
    if (discoveryError) {
      return (
        <div className="text-red-400 mb-8">
          ❌ {discoveryError}
        </div>
      );
    }

    if (loadingShapefiles) {
      const progress = loadingProgress.totalFiles > 0 
        ? (loadingProgress.filesLoaded / loadingProgress.totalFiles) * 100 
        : 0;
      
      return (
        <div className="mb-8">
          <div className="text-yellow-400">
            <div>⏳ Loading region data...</div>
            <div className="text-sm mt-2">
              {loadingProgress.totalFiles > 0 && (
                <>
                  <div>Loading file {loadingProgress.filesLoaded + 1} of {loadingProgress.totalFiles}:</div>
                  <div className="text-gray-400 mt-1 font-mono text-xs">
                    /shapefiles/{loadingProgress.currentFile}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {loadingProgress.currentOperation}
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 w-full bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          {/* Percentage */}
          <div className="text-sm text-gray-400 mt-2 text-center">
            {Math.round(progress)}% complete
          </div>
        </div>
      );
    }

    if (shapefileError) {
      return (
        <div className="text-red-400 mb-8">
          ❌ {shapefileError}
        </div>
      );
    }

    return (
      <div>
        <div className="text-green-400 mb-2">
          ✅ Region data discovered
        </div>
        <div className="text-sm text-gray-400">
          Found {Object.keys(shapefiles).length} shapefiles:
          <ul className="list-disc list-inside mt-1">
            {Object.entries(shapefiles).map(([name, data]) => (
              <li key={name}>
                {name}
                <ul className="list-none ml-4 text-xs text-gray-500">
                  {data.properties.map((size, i) => (
                    <li key={i}>{size}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  // Add useEffect near the top of your component
  useEffect(() => {
    document.title = 'Address Region Checker';
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-900 text-white">
      {/* Sidebar - make it fixed */}
      <div className="fixed top-0 left-0 w-64 h-screen bg-gray-800 p-4 flex flex-col gap-4 overflow-y-auto">
        <h2 className="text-xl font-bold">Progress</h2>
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((step) => (
            <div key={step} className="flex flex-col gap-1">
              <div className="text-sm font-medium">
                Step {step}: {
                  step === 0 ? 'Upload Shapefiles' :
                  step === 1 ? 'Upload Addresses' :
                  step === 2 ? 'Process Addresses' :
                  'Download Results'
                }
              </div>
              <div className={`text-sm ${
                stepStates[step as Step].status === 'error' ? 'text-red-400' :
                stepStates[step as Step].status === 'complete' ? 'text-green-400' :
                'text-gray-400'
              }`}>
                {stepStates[step as Step].message}
              </div>
              <div className="border-t border-gray-700 mt-2"></div>
            </div>
          ))}
          <button 
            onClick={() => window.location.reload()}
            className="mt-auto w-full bg-gray-700 hover:bg-gray-600 py-2 px-4 rounded"
          >
            🔄 Start Over
          </button>
        </div>
      </div>

      {/* Main content - update the order of elements */}
      <div className="flex-1 p-8 ml-64">
        <h1 className="text-2xl font-bold mb-8">Address Region Checker</h1>

        {/* Instructions Section */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-bold mb-4">Instructions</h2>
          <div className="text-gray-300 space-y-4">
            <p>
              To use this tool, you'll need:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>A zip file containing shapefiles (can be downloaded from <span className="text-blue-400">https://maps.massgis.digital.mass.gov/MassMapper/MassMapper.html</span>)</li>
              <li>A CSV file containing addresses to check (must have an "address" column)</li>
            </ol>
            <p className="text-sm text-gray-400 mt-4">
              The shapefile zip should be from <span className="font-semibold">MassMapper or a Similar GIS Tool</span>
            </p>
          </div>
        </div>

        {/* Step 0: Upload Shapefiles */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Step 0: Upload Shapefiles</h2>
          <input
            type="file"
            accept=".zip"
            onChange={handleShapefileUpload}
            disabled={stepStates[0].status === 'complete'}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 disabled:opacity-50"
          />
          
          {/* Shapefile loading status and results moved here */}
          {(loadingShapefiles || shapefileError || Object.keys(shapefiles).length > 0) && (
            <div className="mt-4">
              {renderLoadingStatus()}
            </div>
          )}
        </div>

        {/* Step 1: Upload Addresses */}
        {currentStep >= 1 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Step 1: Upload Addresses</h2>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
            />
          </div>
        )}

        {/* Step 2: Process */}
        {currentStep >= 2 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Step 2: Process Addresses</h2>
            
            {/* Warning message */}
            <div className="bg-yellow-900/50 border border-yellow-700 rounded p-4 mb-4 text-yellow-200 text-sm">
              <p>⚠️ Please note:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Each address requires a 1-second pause to comply with geocoding limits</li>
                <li>Expected processing time: ~{Math.ceil(csvData.length / 60)} minutes</li>
                <li>Total addresses to process: {csvData.length}</li>
              </ul>
            </div>
            
            {/* Processing progress */}
            {stepStates[2].status === 'processing' && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Processing: {processingProgress.processed} of {processingProgress.total}</span>
                  <span>{Math.round((processingProgress.processed / processingProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 truncate">
                  Current: {processingProgress.currentAddress}
                </div>
              </div>
            )}
            
            <button
              onClick={handleProcess}
              disabled={stepStates[2].status === 'processing'}
              className="bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {stepStates[2].status === 'processing' ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Processing...
                </>
              ) : (
                'Process Addresses'
              )}
            </button>
          </div>
        )}

        {/* Step 3: Results */}
        {currentStep === 3 && results && (
          <div>
            <h2 className="text-xl font-bold mb-4">Step 3: Download Results</h2>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-800 p-4 rounded shadow">
                <div className="text-sm text-gray-400">Total Addresses</div>
                <div className="text-2xl font-bold">{results.total}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded shadow">
                <div className="text-sm text-gray-400">Found in Regions</div>
                <div className="text-2xl font-bold">{results.found}</div>
              </div>
              <div className="bg-gray-800 p-4 rounded shadow">
                <div className="text-sm text-gray-400">Not Found</div>
                <div className="text-2xl font-bold">{results.notFound}</div>
              </div>
            </div>
            <button 
              onClick={handleDownload}
              className="bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded"
            >
              📥 Download Results CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
