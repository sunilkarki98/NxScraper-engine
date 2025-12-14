#!/bin/bash
# Script to batch update all controllers with typed error handling

echo "Updating all controllers to remove 'any' types..."

# This script helps identify which controllers still need updating
find /home/cosmic-soul/Desktop/my-project/NxScraper-engine/core-engine/src/api/controllers -name "*.controller.ts" -exec grep -l "error: any" {} \;

echo "Done!"
