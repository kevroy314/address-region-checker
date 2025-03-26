declare module 'shpjs' {
  function shp(buffer: ArrayBuffer): Promise<{
    fileName?: string;
    type: string;
    features: Array<{
      type: string;
      geometry: any;
      properties: Record<string, any>;
    }>;
  } | Array<{
    fileName?: string;
    type: string;
    features: Array<{
      type: string;
      geometry: any;
      properties: Record<string, any>;
    }>;
  }>>;
  
  export default shp;
}

declare module 'nominatim-browser' {
  interface GeocodingResult {
    lat: string;
    lon: string;
    [key: string]: any;
  }

  interface GeocodingOptions {
    q: string;
    addressdetails?: boolean;
    limit?: number;
    [key: string]: any;
  }

  function geocode(options: GeocodingOptions): Promise<GeocodingResult[]>;
  
  export default {
    geocode
  };
}

// Add turf types
declare module '@turf/turf' {
  export interface Geometry {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  }

  export interface Feature<G = Geometry> {
    type: 'Feature';
    geometry: G;
    properties?: Record<string, any>;
  }

  export function point(
    coordinates: number[],
    properties?: Record<string, any>
  ): Feature;

  export function booleanPointInPolygon(
    point: Feature | number[],
    polygon: Feature | Geometry,
    options?: { ignoreBoundary?: boolean }
  ): boolean;
}

// Add manifest type
interface ManifestFile {
  folder: string;
  name: string;
}

interface Manifest {
  shapefiles: ManifestFile[];
} 