#!/usr/bin/env bash

# NxScraper Engine - Comprehensive Test Suite
# Tests all functionality including Async Scraping, AI modules, and health checks

# set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
API_KEY="nx_pk_prod_IE0-eyZO1ursaEcXgREj618UOZBfv2VG"
TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   NxScraper Engine - Test Suite           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"

# Function to test endpoint
test_endpoint() {
    local test_name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_field=$5
    
    echo -e "${YELLOW}Testing:${NC} $test_name"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $API_KEY")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $API_KEY" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "202" ]; then
        if [ -n "$expected_field" ]; then
            if echo "$body" | jq -e "$expected_field" > /dev/null 2>&1; then
                echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)\n"
                ((TESTS_PASSED++))
                return 0
            else
                echo -e "${RED}✗ FAILED${NC} - Expected field '$expected_field' not found"
                echo -e "Response: $body\n"
                ((TESTS_FAILED++))
                return 1
            fi
        else
            echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)\n"
            ((TESTS_PASSED++))
            return 0
        fi
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        echo -e "Response: $body\n"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Check if services are running
echo -e "${BLUE}=== Pre-flight Checks ===${NC}\n"

if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Engine is not running!${NC}"
    echo -e "Start with: ${YELLOW}docker compose up -d${NC}\n"
    exit 1
fi

echo -e "${GREEN}✓ Engine is running${NC}\n"

# Test 1: Health Check
echo -e "${BLUE}=== Health & Status Tests ===${NC}\n"

test_endpoint "Health Check" "GET" "/health" "" ".status"
test_endpoint "Scraper Status" "GET" "/health" "" ".scrapers"

# Test 2: Async Scraping (Job Queue)
echo -e "${BLUE}=== Async Scraping Tests ===${NC}\n"

# Submit Job (Manual curl to capture ID reliably)
echo -e "${YELLOW}Submitting Scrape Job...${NC}"
JOB_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "url": "https://example.com",
    "scraperType": "universal-scraper",
    "options": {"returnHtml": true}
  }')

JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')

if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "null" ]; then
    echo -e "${GREEN}✓ Job Submitted${NC} (ID: $JOB_ID)\n"
    ((TESTS_PASSED++))
    
    # Poll Job Status
    echo -e "${YELLOW}Polling Job Status...${NC}"
    sleep 2
    test_endpoint "Get Job Status" "GET" "/api/v1/jobs/$JOB_ID" "" ".status"
else
    echo -e "${RED}✗ Failed to get Job ID${NC}"
    echo -e "Response: $JOB_RESPONSE\n"
    ((TESTS_FAILED++))
fi

# Test 3: AI Module Tests
echo -e "${BLUE}=== AI Module Tests ===${NC}\n"

# Use a simpler HTML string without double quotes to avoid escaping hell in bash
SIMPLE_HTML="<html><head><title>Test</title></head><body><h1>iPhone 15</h1></body></html>"

test_endpoint "Page Understanding" "POST" "/api/v1/ai/pipeline" \
"{
  \"url\": \"https://example.com/product\",
  \"html\": \"$SIMPLE_HTML\",
  \"features\": [\"understand\"],
  \"options\": {\"model\": \"mock\"}
}" ".success"

# Test 4: Cost Tracking
echo -e "${BLUE}=== Cost & Stats Tests ===${NC}\n"

test_endpoint "AI Engine Stats" "GET" "/stats" "" ".browserPool"

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Test Results Summary             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! 🎉${NC}\n"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}\n"
    echo -e "Check logs with: ${YELLOW}docker compose logs -f core-engine${NC}\n"
    exit 1
fi


