# Fix Build Error and Portfolio Deletion Logic

The user is experiencing a Gradle build failure and logic errors in the portfolio deletion functionality ("apagar b3" and "apagar manuais").

## Proposed Changes

### Build Configuration
#### [MODIFY] [android/build.gradle](file:///C:/fii-guard-work/android/build.gradle)
- Rewrite the `buildscript` block to fix syntax errors reported by Gradle. The error suggests a corrupted or misplaced `dependencies` block.

### Portfolio Logic
#### [MODIFY] [lib/portfolio.ts](file:///C:/fii-guard-work/lib/portfolio.ts)
- Fix `clearManualOperations` and `clearB3Operations` to:
    - Return the correct count by calculating it before the asynchronous state update.
    - Clear both `operations` and `dividends`.
    - Be more robust regarding the `source` property.
- Update `prepareDividend` to default to `source: "manual"` for manual entries instead of `"render"`, ensuring they are correctly identified for deletion.
- Update `clearManualDividends` (or merge it into the main clear functions) to ensure consistency.

#### [MODIFY] [app/settings.tsx](file:///C:/fii-guard-work/app/settings.tsx)
- Ensure the alerts show the combined count of cleared operations and dividends if appropriate, or at least reflect the fixed count return from the hook.

## Verification Plan
### Automated Tests
- N/A (Build fix will be verified by the next build attempt).

### Manual Verification
1.  **Build Check:** Run the build process again to confirm `android/build.gradle` is fixed.
2.  **Logic Check:**
    - Import B3 data and add manual data.
    - Test "Remover Manuais" -> verify only manual data is gone.
    - Test "Remover B3" -> verify only B3 data is gone.
    - Verify that the alerts show the correct number of items removed.
