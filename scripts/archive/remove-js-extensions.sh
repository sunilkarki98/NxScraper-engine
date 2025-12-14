#!/bin/bash
# Script to remove .js extensions from TypeScript imports (reverting previous change)

# Remove .js extensions from relative imports in TypeScript files
find /home/cosmic-soul/Desktop/my-project/NxScraper-engine -name "*.ts" -not -path "*/node_modules/*" -not -path "*/dist/*" -type f -exec sed -i -E "s/(from ['\"]\.\.?\/.*)\.js(['\"])/\1\2/g" {} \;

echo "✅ Removed .js extensions from TypeScript imports"
