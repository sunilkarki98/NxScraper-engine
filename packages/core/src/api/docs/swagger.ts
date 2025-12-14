import swaggerJsdoc from 'swagger-jsdoc';

const PORT = 3000;

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'NxScraper Engine API',
            version: '2.0.0',
            description: 'Clean, scalable web scraping orchestrator with plugin architecture',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: `http://localhost:${PORT}/api/v1`,
                description: 'Local server (API V1)',
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                },
            },
        },
        security: [
            {
                ApiKeyAuth: [],
            },
        ],
    },
    // Paths to files containing OpenAPI definitions
    apis: [
        './src/api/routes/*.ts',
        './packages/core/src/api/routes/*.ts' // For Docker context
    ],
};

export const swaggerSpec = swaggerJsdoc(options);
