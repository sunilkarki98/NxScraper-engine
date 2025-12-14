#!/bin/bash
# Adding .js extensions to relative imports in scraper packages

echo "🔄 Adding .js extensions to relative imports in scraper packages..."

find packages/scrapers -name "*.ts" -type f -exec sed -i -E \
  "s|from '(\\.[^']+)'|from '\1.js'|g; s|\\.js\\.js|.js|g" {} \;

echo "✅ Added .js extensions to scraper packages"
