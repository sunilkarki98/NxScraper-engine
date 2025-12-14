// Unified Business Interface - Works for ANY business type
// Examples: restaurants, hotels, gyms, cafes, shops, salons, etc.
export interface Business {
    // Core identification
    id: string; // Unique identifier (place_id or generated)
    name: string;
    businessType?: string; // 'restaurant', 'hotel', 'gym', 'cafe', 'shop', etc.

    // Contact information
    address: string;
    phone: string | null;
    website: string | null;
    email?: string | null;

    // Location
    location: {
        lat: number;
        lng: number;
        city?: string;
        country?: string;
    };

    // Ratings & Reviews
    rating: number | null;
    reviewCount: number | null;

    // Business details
    priceLevel: number | null; // 1-4 ($-$$$$)
    hours?: {
        monday?: string;
        tuesday?: string;
        wednesday?: string;
        thursday?: string;
        friday?: string;
        saturday?: string;
        sunday?: string;
    } | null;
    categories?: string[]; // Generic categories (was cuisineTypes for restaurants)

    // Media
    photos?: string[];

    // Status
    verified: boolean; // Business verified/operational

    // Metadata
    source: 'google-places' | 'google-scraper' | 'hybrid';
    fetchedAt: string; // ISO timestamp
    dataCompleteness: number; // 0-100 score
}

export interface BusinessSearchResult {
    query: string;
    businessType?: string; // Filter by type if specified
    strategy: 'places-api' | 'scraper' | 'hybrid' | 'cached';
    totalResults: number;
    businesses: Business[];
    metadata: {
        executionTime: number;
        sources: {
            placesAPI?: number;
            scraper?: number;
            cached?: number;
        };
        fallbacksUsed: string[];
        costEstimate?: number; // USD
    };
}
