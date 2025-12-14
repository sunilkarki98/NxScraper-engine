#!/usr/bin/env ts-node
async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);
    try {
        // STEP 1: Validate environment FIRST (direct import to avoid package index side effects)
        const { validateEnvironment } = await import('../../../shared/dist/utils/env-validator.js');
        validateEnvironment();
        // STEP 2: NOW safe to import from package
        const { apiKeyManager, dragonfly } = await import('@nx-scraper/shared');
        // Rest of your code...
        await dragonfly.getClient().ping();
        switch (command) {
            case 'create': {
                const name = args[0] || 'Unnamed Key';
                const tier = (args[1] || 'free');
                const userId = args[2];
                if (!['free', 'pro'].includes(tier)) {
                    console.error('Invalid tier. Must be: free or pro');
                    process.exit(1);
                }
                const key = await apiKeyManager.generateKey({ name, tier, userId });
                console.log('\n✅ API Key Created!\n');
                console.log(`Key: ${key}`);
                console.log('\n⚠️  Save this key securely!\n');
                break;
            }
            case 'list': {
                const keys = await apiKeyManager.listKeys(args[0]);
                console.log(keys.length ? keys : 'No keys found');
                break;
            }
            case 'revoke': {
                if (!args[0]) {
                    console.error('Key ID required');
                    process.exit(1);
                }
                await apiKeyManager.revokeKey(args[0]);
                console.log(`✅ Key ${args[0]} revoked`);
                break;
            }
            default:
                console.log('Usage: node manage-api-keys.js [create|list|revoke] [args]');
        }
        await dragonfly.disconnect();
        process.exit(0);
    }
    catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}
main();
export {};
//# sourceMappingURL=manage-api-keys.js.map