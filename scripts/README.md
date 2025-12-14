# Utility Scripts

This directory contains various utility scripts for managing the NxScraper-engine project.

## Setup & Deployment

- **`setup.sh`** - Initial project setup and dependency installation
- **`start-engine.sh`** - Start the scraping engine
- **`stop-engine.sh`** - Stop the scraping engine  
- **`test-engine.sh`** - Run engine tests

## Development Tools

- **`check-controllers.sh`** - Validate API controllers

## Legacy/Migration Scripts (Deprecated)

The following scripts were used during the ES Module migration and are kept for reference:

- `add-js-extensions.sh` - Added .js extensions to imports
- `add-js-to-shared.sh` - Added .js extensions to shared package imports
- `fix-core-imports.sh` - Fixed import paths in core package
- `fix-scraper-imports.sh` - Fixed import paths in scraper packages
- `fix-shared-imports.sh` - Fixed import paths in shared package
- `fix-test-glitches.sh` - Fixed test-related import issues
- `migrate-imports.sh` - General import migration script
- `migrate-service-imports.sh` - Migrated service imports
- `migrate-test-imports.sh` - Migrated test imports
- `remove-js-extensions.sh` - Removed .js extensions from imports

> **Note**: These migration scripts should not be needed for normal development and can be removed once the project structure is stable.
