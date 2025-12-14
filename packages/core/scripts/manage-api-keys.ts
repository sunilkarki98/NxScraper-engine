#!/usr/bin/env ts-node

import { validateEnvironment, apiKeyManager, dragonfly } from '@nx-scraper/shared';

async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
        // STEP 1: Validate environment
        validateEnvironment();

        // STEP 2: Ensure Dragonfly (Redis) is connected
        await dragonfly.getClient().ping();

        switch (command) {
            case 'create': {
                const name = args[0] || 'Unnamed Key';
                const tier = (args[1] || 'free') as 'free' | 'pro';
                const userId = args[2];

                if (!['free', 'pro'].includes(tier)) {
                    console.error('Invalid tier. Must be: free or pro');
                    process.exit(1);
                }

                const key = await apiKeyManager.generateKey({ name, tier, userId });
                console.log('\n✅ API Key Created!\n');
                console.log(`Key: ${key}`);
                console.log(`Name: ${name}`);
                console.log(`Tier: ${tier}`);
                console.log('\n⚠️  Save this key securely! You will not see it again.\n');
                break;
            }

            case 'list': {
                const userId = args[0];
                const keys = await apiKeyManager.listKeys(userId);

                if (!keys.length) {
                    console.log('No API keys found.');
                } else {
                    console.log('\n📋 API Keys:\n');
                    console.table(keys.map(k => ({
                        ID: k.id,
                        Name: k.name,
                        Tier: k.tier,
                        Active: k.isActive ? '✓' : '✗',
                        'Request Count': k.requestCount,
                        'Last Used': k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '-',
                        'Created': new Date(k.createdAt).toLocaleString()
                    })));
                }
                break;
            }

            case 'revoke': {
                const keyId = args[0];
                if (!keyId) {
                    console.error('Key ID required');
                    console.log('Usage: npm run keys:revoke <key-id>');
                    process.exit(1);
                }
                await apiKeyManager.revokeKey(keyId);
                console.log(`✅ API key ${keyId} revoked successfully`);
                break;
            }

            default:
                console.log(`
🔑 API Key Management Tool

Usage:
  npm run keys:create [name] [tier] [userId]    Create a new API key
  npm run keys:list [userId]                     List all API keys
  npm run keys:revoke <key-id>                   Revoke an API key

Tiers:
  free       - 100 requests/hour
  pro        - 1000 requests/hour
                `);
        }

        await dragonfly.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main();
