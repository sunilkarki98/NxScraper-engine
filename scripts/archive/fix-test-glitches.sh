#!/bin/bash
# Fix test import glitches

echo "🔧 Fixing test import glitches..."

# Fix double @@
find tests -name "*.ts" -type f -exec sed -i -E "s|@@shared|@shared|g" {} \;
find tests -name "*.ts" -type f -exec sed -i -E "s|@@core|@core|g" {} \;

# Fix remaining relative mocks in unit tests if they pointing to core/source
# Replace "../../plugins" (which was valid in old structure?? No, paths differ) 
# with "@core/plugins"
find tests -name "*.ts" -type f -exec sed -i -E "s|['\"]\.\./\.\./plugins|'@core/plugins|g" {} \;

echo "✅ Test imports fixed"
