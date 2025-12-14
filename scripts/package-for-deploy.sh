#!/bin/bash
# Package NxScraper for Deployment
# Creates a clean zip file excluding node_modules and other artifacts

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="nxscraper_deploy_${TIMESTAMP}.zip"

echo "📦 Packaging NxScraper Engine..."

# Check if zip is installed
if ! command -v zip &> /dev/null; then
    echo "❌ Error: 'zip' command not found. Please install it (sudo apt install zip)."
    exit 1
fi

# Create zip file excluding heavy directories
zip -r "$OUTPUT_FILE" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "dist/*" \
    -x ".env" \
    -x ".DS_Store" \
    -x "**/.DS_Store" \
    -x "coverage/*" \
    -x ".gemini/*"

echo ""
echo "✅ Successfully created: ${OUTPUT_FILE}"
echo "---------------------------------------------------"
echo "🚀 To deploy:"
echo "1. Upload this file to your GCP VM."
echo "2. Unzip it: unzip ${OUTPUT_FILE}"
echo "3. Run setup: ./scripts/gcp-vm-init.sh && ./scripts/setup.sh"
echo "---------------------------------------------------"
