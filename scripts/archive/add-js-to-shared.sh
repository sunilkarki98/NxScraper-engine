#!/bin/bash
# Add .js extensions to relative imports in shared package for Node16

echo "🔄 Adding .js extensions to relative imports in shared package..."

find packages/shared -name "*.ts" -type f -exec sed -i -E \
  "s|from '(\\.\\./[^']+)'|from '\1.js'|g; s|\\.ts\\.js|.js|g" {} \;

echo "✅ Added .js extensions to shared package"
