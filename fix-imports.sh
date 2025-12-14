#!/bin/bash
# Fix all deep imports from @nx-scraper/shared

find packages/core/src -name "*.ts" -type f -exec sed -i \
  -e "s|from '@nx-scraper/shared/utils/logger'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/browser/pool'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/services/proxy.service'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/queue/queue-worker'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/services/cache.service'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/auth/api-key-manager'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/auth/external-key-manager'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/queue/queue-manager'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/types/scraper.interface'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/types/api-schemas'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/types/api-response'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/types/errors'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/types/api-key.interface'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/services/rate-limiter'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/services/proxy-manager'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/modules/agent'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/modules/planner'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/modules/memory'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/worker/scraper-manager'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/ai-engine'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/types'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/rag/embedding-service'|from '@nx-scraper/shared'|g" \
  -e "s|from '@nx-scraper/shared/ai/rag/vector-store'|from '@nx-scraper/shared'|g" \
  {} \;

echo "Fixed all deep imports in packages/core/src"
