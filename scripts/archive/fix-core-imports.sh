#!/bin/bash
# Adding .js extensions to relative imports in core package

echo "🔄 Adding .js extensions to relative imports in core package..."

find packages/core/src -name "*.ts" -type f -exec sed -i -E \
  "s|from '(\\.[^']+)'|from '\1.js'|g; s|\\.js\\.js|.js|g" {} \;

echo "✅ Added .js extensions to core package"
