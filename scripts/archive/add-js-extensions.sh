#!/bin/bash
# Script to add .js extensions to all relative TypeScript imports for ES module compatibility

# Find all .ts files and update relative imports to include .js extension
find /home/cosmic-soul/Desktop/my-project/NxScraper-engine -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -type f -exec sed -i -E "s/(from ['\"]\.\.?\/.*)(['\"])/\1.js\2/g; s/\.ts\.js/.js/g" {} \;

echo "✅ Added .js extensions to all relative imports"
