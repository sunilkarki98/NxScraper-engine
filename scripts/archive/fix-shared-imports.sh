#!/bin/bash
# Re-run script to add .js extensions to relative imports in shared package
# Using a more robust regex to catch imports that might have been missed

echo "🔄 Adding .js extensions to relative imports in shared package..."

# Find all TS files in shared package
find packages/shared -name "*.ts" -type f -exec sed -i -E \
  "s|from '(\\.[^']+)'|from '\1.js'|g; s|\\.js\\.js|.js|g" {} \;

echo "✅ Added .js extensions to shared package imports"
