#!/bin/bash
# Migrate test imports to use aliases

echo "🔄 Migrating test imports..."

# Replace core-engine imports
find tests -name "*.ts" -type f -exec sed -i -E \
  "s|\.\./\.\./\.\./core-engine/src|@core|g" {} \;

# Replace shared imports
find tests -name "*.ts" -type f -exec sed -i -E \
  "s|\.\./\.\./\.\./shared|@shared|g" {} \;

# Also handle cases with different depth if any, or just matching likely patterns
# e.g. simply replace "core-engine/src" if paths were different
find tests -name "*.ts" -type f -exec sed -i -E \
  "s|core-engine/src|@core|g" {} \;
  
find tests -name "*.ts" -type f -exec sed -i -E \
  "s|shared/|@shared/|g" {} \;

# Fix double @ if overlap occurred (e.g. @nx-scraper/@shared) - unlikely but possible if I used package names before
# But wait, imports like '@nx-scraper/shared' are valid too via node_modules.
# However, the aliases in vitest.config.ts are `@shared`, not `@nx-scraper/shared`.
# My vitest config said:
# '@shared': resolve(__dirname, './packages/shared'),
# '@core': resolve(__dirname, './packages/core/src'),

# Remove explicit .js extensions if I added them to aliases? No, I haven't added extensions to tests yet.
# But verify that @core/foo resolves to foo.ts. Vitest handles this.

echo "✅ Test imports migrated"
