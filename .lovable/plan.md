# Correct “Top Active Ads”

## Fix
- Treat only Binance ads that are online and public as active; exclude private ads from the online count and list.
- Sort active ads by Binance’s available quantity (`surplusAmount`) before showing the first three, instead of displaying the first three records returned by the API.
- Show each ad number and available quantity so the ranking can be checked against Ad Manager, while keeping its side, asset, and current price.

## Verification
- Compare the dashboard ranking and online count with the same live Binance records used by Ad Manager.
- Check the mobile layout shown in the screenshot and confirm the project builds cleanly.

## Technical detail
The existing widget labels the list “Top Active Ads” and comments that it ranks by surplus, but it calls `slice(0, 3)` without sorting. Binance’s list order is not a ranking, so the displayed three are arbitrary. The existing API enrichment remains the authority for online-versus-private visibility.
