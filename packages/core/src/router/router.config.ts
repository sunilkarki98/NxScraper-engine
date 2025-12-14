export const ROUTER_CONFIG = {
    JS_HEAVY_DOMAINS: [
        'facebook.com',
        'twitter.com',
        'instagram.com',
        'linkedin.com',
        'youtube.com',
        'reddit.com',
        'pinterest.com',
        'medium.com',
        'quora.com',
        'stackoverflow.com',
        'tiktok.com' // Added TikTok
    ],
    ANTI_BOT_DOMAINS: [
        'amazon.com',
        'walmart.com',
        'target.com',
        'bestbuy.com',
        'ebay.com',
        'aliexpress.com',
        'alibaba.com',
        'booking.com', // Added Booking
        'airbnb.com'   // Added Airbnb
    ],
    SPA_INDICATORS: [
        '#!',
        '#/',
        '/app/',
        '/dashboard/',
        '/_next/', // Next.js
        '/static/js/' // React/Vue builds
    ]
};
