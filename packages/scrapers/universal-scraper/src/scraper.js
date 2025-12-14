"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UniversalScraper = void 0;
var playwright_1 = require("playwright");
var proxy_manager_js_1 = require("@nx-scraper/shared/services/proxy-manager.js");
var logger_js_1 = require("@nx-scraper/shared/utils/logger.js");
/**
 * Universal Scraper
 * Playwright-based scraper for general-purpose web scraping
 */
var UniversalScraper = /** @class */ (function () {
    function UniversalScraper() {
        this.name = 'universal-scraper';
        this.version = '1.0.0';
        this.browser = null;
    }
    /**
     * Determines if this scraper can handle the URL
     * Returns high confidence for all URLs (fallback scraper)
     */
    UniversalScraper.prototype.canHandle = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Universal scraper can handle any URL
                // Return 0.5 so specialized scrapers can take priority
                return [2 /*return*/, 0.5];
            });
        });
    };
    /**
     * Performs web scraping using Playwright
     */
    UniversalScraper.prototype.scrape = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, page, usedProxyId, proxyUrl, proxyConfig, _a, html, title, url, screenshot, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        startTime = Date.now();
                        page = null;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 17, , 22]);
                        proxyUrl = options.proxy;
                        if (!!proxyUrl) return [3 /*break*/, 3];
                        return [4 /*yield*/, proxy_manager_js_1.proxyManager.getNextProxy()];
                    case 2:
                        proxyConfig = _b.sent();
                        if (proxyConfig) {
                            proxyUrl = proxyConfig.url;
                            usedProxyId = proxyConfig.id;
                            logger_js_1.default.debug({ proxyId: usedProxyId }, 'Using rotated proxy');
                        }
                        _b.label = 3;
                    case 3:
                        if (!!this.browser) return [3 /*break*/, 5];
                        _a = this;
                        return [4 /*yield*/, playwright_1.chromium.launch({
                                headless: true,
                                args: __spreadArray([
                                    '--no-sandbox',
                                    '--disable-setuid-sandbox'
                                ], (proxyUrl ? ["--proxy-server=".concat(proxyUrl)] : []), true)
                            })];
                    case 4:
                        _a.browser = _b.sent();
                        _b.label = 5;
                    case 5: return [4 /*yield*/, this.browser.newPage({
                            userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        })];
                    case 6:
                        // Create new page
                        page = _b.sent();
                        // Set timeout
                        page.setDefaultTimeout(options.timeout || 30000);
                        // Navigate to URL
                        return [4 /*yield*/, page.goto(options.url, { waitUntil: 'domcontentloaded' })];
                    case 7:
                        // Navigate to URL
                        _b.sent();
                        if (!options.waitForSelector) return [3 /*break*/, 9];
                        return [4 /*yield*/, page.waitForSelector(options.waitForSelector, { timeout: 5000 })];
                    case 8:
                        _b.sent();
                        _b.label = 9;
                    case 9: return [4 /*yield*/, page.content()];
                    case 10:
                        html = _b.sent();
                        return [4 /*yield*/, page.title()];
                    case 11:
                        title = _b.sent();
                        url = page.url();
                        screenshot = void 0;
                        if (!options.screenshot) return [3 /*break*/, 13];
                        return [4 /*yield*/, page.screenshot({ fullPage: true })];
                    case 12:
                        screenshot = _b.sent();
                        _b.label = 13;
                    case 13: return [4 /*yield*/, page.close()];
                    case 14:
                        _b.sent();
                        if (!usedProxyId) return [3 /*break*/, 16];
                        return [4 /*yield*/, proxy_manager_js_1.proxyManager.reportSuccess(usedProxyId)];
                    case 15:
                        _b.sent();
                        _b.label = 16;
                    case 16: return [2 /*return*/, {
                            success: true,
                            data: {
                                html: html,
                                title: title,
                                url: url,
                                screenshot: screenshot ? screenshot.toString('base64') : undefined
                            },
                            metadata: {
                                url: options.url,
                                timestamp: new Date().toISOString(),
                                executionTimeMs: Date.now() - startTime,
                                engine: this.name,
                                proxyUsed: proxyUrl
                            }
                        }];
                    case 17:
                        error_1 = _b.sent();
                        logger_js_1.default.error("Universal scraper error for ".concat(options.url, ":"), error_1);
                        if (!usedProxyId) return [3 /*break*/, 19];
                        return [4 /*yield*/, proxy_manager_js_1.proxyManager.reportFailure(usedProxyId, error_1.message)];
                    case 18:
                        _b.sent();
                        _b.label = 19;
                    case 19:
                        if (!page) return [3 /*break*/, 21];
                        return [4 /*yield*/, page.close().catch(function () { })];
                    case 20:
                        _b.sent();
                        _b.label = 21;
                    case 21: return [2 /*return*/, {
                            success: false,
                            error: error_1.message || 'Unknown error',
                            metadata: {
                                url: options.url,
                                timestamp: new Date().toISOString(),
                                executionTimeMs: Date.now() - startTime,
                                engine: this.name
                            }
                        }];
                    case 22: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Health check
     * Returns true as browser is launched on-demand
     */
    UniversalScraper.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Browser is launched on-demand during scraping
                // No need to pre-launch for health check
                return [2 /*return*/, true];
            });
        });
    };
    /**
     * Cleanup
     */
    UniversalScraper.prototype.cleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.browser) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.browser.close()];
                    case 1:
                        _a.sent();
                        this.browser = null;
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return UniversalScraper;
}());
exports.UniversalScraper = UniversalScraper;
