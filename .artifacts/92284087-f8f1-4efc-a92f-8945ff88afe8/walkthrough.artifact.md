# Build and Portfolio Deletion Fixes

I have fixed the build error and corrected the logic for removing manual and B3 operations/dividends.

## Changes Made

### 1. Build Fix
Fixed a syntax error in [android/build.gradle](file:///C:/fii-guard-work/android/build.gradle) that was preventing the APK from being generated. The `buildscript` block was corrupted, and I restored a clean version.

### 2. Portfolio Deletion Logic
In [lib/portfolio.ts](file:///C:/fii-guard-work/lib/portfolio.ts), I fixed the `clearManualOperations` and `clearB3Operations` functions:
- **Accurate Count:** The functions now calculate the number of items being removed *before* the state update, so the alerts in the UI show the correct count instead of `0`.
- **Complete Cleanup:** Both functions now clear both **Operations** (trades) and **Dividends** (income), ensuring the entire portfolio is cleaned according to the chosen source.
- **Manual Data Tagging:** Updated manual dividends to be tagged as `source: "manual"` (previously was `"render"`), making them distinguishable from B3 and automatic sync data.

### 3. Settings UI
The alerts in [app/settings.tsx](file:///C:/fii-guard-work/app/settings.tsx) now correctly display the number of items removed because the underlying hook functions return the accurate count.

## Verification
- Checked `android/build.gradle` for proper structure.
- Verified logic in `lib/portfolio.ts` for filtering by source.
- Confirmed that "Remover Manuais" and "Remover B3" now target the correct datasets separately.
