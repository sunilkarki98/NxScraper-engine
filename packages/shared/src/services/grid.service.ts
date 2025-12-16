import { container, Tokens } from '../di/container.js';
import logger from '../utils/logger.js';

export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface GeoBounds {
    ne: GeoPoint; // Northeast corner
    sw: GeoPoint; // Southwest corner
}

export interface GridTile {
    center: GeoPoint;
    zoom: number;
    id: string;
}

export class GridService {
    /**
     * Generates a grid of points covering the given bounds.
     * 
     * @param bounds unique bounding box
     * @param zoom Google Maps zoom level (affects density)
     * @param stepLat Degrees of latitude per tile (approx. 0.005 for zoom 15)
     * @param stepLng Degrees of longitude per tile (approx. 0.005 for zoom 15)
     */
    generateGrid(bounds: GeoBounds, zoom: number, stepLat: number = 0.02, stepLng: number = 0.02): GridTile[] {
        const tiles: GridTile[] = [];

        let lat = bounds.sw.lat;
        while (lat < bounds.ne.lat) {
            let lng = bounds.sw.lng;
            while (lng < bounds.ne.lng) {
                // Center of the tile
                const centerLat = lat + (stepLat / 2);
                const centerLng = lng + (stepLng / 2);

                tiles.push({
                    center: { lat: centerLat, lng: centerLng },
                    zoom,
                    id: `${centerLat.toFixed(4)},${centerLng.toFixed(4)}`
                });

                lng += stepLng;
            }
            lat += stepLat;
        }

        logger.info({ tiles: tiles.length, bounds }, '🗺️ GridService generated tiles');
        return tiles;
    }

    /**
     * Generates Google Maps Search URLs for a set of tiles
     */
    generateSearchUrls(query: string, tiles: GridTile[]): string[] {
        return tiles.map(tile => {
            // Format: https://www.google.com/maps/search/query/@lat,lng,zoomz
            const encodedQuery = encodeURIComponent(query);
            return `https://www.google.com/maps/search/${encodedQuery}/@${tile.center.lat},${tile.center.lng},${tile.zoom}z`;
        });
    }

    /**
     * Helper to get rough bounds for a city (Placeholder)
     * Real implementation would use Geocoding API
     */
    getCityBounds(city: string): GeoBounds {
        // Mock data for top cities
        const MOCK_BOUNDS: Record<string, GeoBounds> = {
            'new york': {
                ne: { lat: 40.9176, lng: -73.7003 },
                sw: { lat: 40.4774, lng: -74.2591 }
            },
            'london': {
                ne: { lat: 51.6723, lng: 0.1482 },
                sw: { lat: 51.3849, lng: -0.3515 }
            },
            'kathmandu': {
                ne: { lat: 27.75, lng: 85.37 },
                sw: { lat: 27.65, lng: 85.27 }
            }
        };

        const key = city.toLowerCase();
        if (MOCK_BOUNDS[key]) {
            return MOCK_BOUNDS[key];
        }

        // Default to a small box around 0,0 if unknown (User should provide bounds usually)
        throw new Error(`Unknown city '${city}'. Please provide explicit bounds.`);
    }
}

// Factory
export function createGridService(): GridService {
    return new GridService();
}

// Singleton
export const gridService = new GridService();

// Register
container.register(Tokens.GridService, gridService);
