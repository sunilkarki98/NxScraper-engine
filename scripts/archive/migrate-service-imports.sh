#!/bin/bash
# Update service imports to workspace packages

echo "🔄 Migrating service import paths..."

# Update imports in core package to reference scraper packages
find packages/core/src -name "*.ts" -type f -exec sed -i -E \
  "s|from ['\"](\\.\\./)+services/([^/]+)/src/([^'\"]+)['\"]|from '@nx-scraper/\2/\3'|g" {} \;

echo "✅ Updated core service imports"

# Update imports in shared package to reference scraper packages
find packages/shared -name "*.ts" -type f -exec sed -i -E \
  "s|from ['\"](\\.\\./)+services/([^/]+)/src/([^'\"]+)['\"]|from '@nx-scraper/\2/\3'|g" {} \;

echo "✅ Updated shared service imports"

echo "🎉 Service import migration complete!"
