#!/bin/bash
# Migrate relative shared imports to workspace imports

echo "🔄 Migrating import paths to workspace packages..."

# Update imports in core package
find packages/core/src -name "*.ts" -type f -exec sed -i -E \
  "s|from ['\"](\\.\\./)+shared/([^'\"]+)['\"]|from '@nx-scraper/shared/\2'|g" {} \;

echo "✅ Updated core package imports"

# Update imports in shared package (relative imports within shared are fine, but fix any cross-references)
find packages/shared -name "*.ts" -type f -exec sed -i -E \
  "s|from ['\"](\\.\\./)+shared/([^'\"]+)['\"]|from '@nx-scraper/shared/\2'|g" {} \;

echo "✅ Updated shared package imports"

# Update test config paths (vitest configs reference shared)
sed -i -E "s|'\\./shared'|'./packages/shared'|g" vitest.config.ts 2>/dev/null || true
sed -i -E "s|'\\./shared'|'./packages/shared'|g" vitest.integration.config.ts 2>/dev/null || true
sed -i -E "s|'\\./core-engine/src'|'./packages/core/src'|g" vitest.config.ts 2>/dev/null || true
sed -i -E "s|'\\./core-engine/src'|'./packages/core/src'|g" vitest.integration.config.ts 2>/dev/null || true

echo "✅ Updated test configurations"

echo "🎉 Import migration complete!"
