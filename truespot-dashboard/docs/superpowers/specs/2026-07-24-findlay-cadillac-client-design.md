# Findlay Cadillac Client — Location History Dashboard

## Goal
Add "Findlay Cadillac" as a new automotive client with a Location History dashboard, matching the existing CarVision client exactly, pointed at the "Findlay Cadillac" semantic model in the "Auto - Location History" Fabric workspace.

## Changes

### 1. `src/config/clients/findlaycadillac.json` (new)
Follows the CarVision client config structure:
- `client_id`: `findlaycadillac`
- `product`: `automotive`
- `display_name`: `Findlay Cadillac`
- `locations`: `[]`
- `dashboards.locationhistory`:
  - `label`: `Location History`
  - `workspace_name`: `Auto - Location History`
  - `dataset_name`: `Findlay Cadillac` (must exactly match the semantic model name in Fabric)
  - `icon`: `history`
  - `description`: `Track vehicle movement across your lot`
  - `category`: `Operations & Workflow`
  - `panels`: identical to CarVision — `last-refresh` KPI card (`[Last Refresh]` measure) and `location-history-data` data table with filter_columns: geofence, subGeoZone, floorLevel, beaconId, vin, stockNumber, assetType (same DAX column references as CarVision, since both are automotive Location History datasets built on the same schema).

### 2. `src/config/products/automotive.json`
Add `"findlaycadillac"` to the `clients` array so the client appears in the automotive product's client hub.

### 3. `.env.local`
Add a new random hex token entry for `findlaycadillac` to the `EMBED_TOKENS` JSON map, following the same format as the other four clients.

## Out of scope
No other code changes — dataset ID resolution, routing, and rendering are all fully config-driven off `client_id` per existing architecture (`services/powerbi/datasetResolver.ts` resolves dataset name → ID dynamically; no hardcoded client lists elsewhere in the app).

## Verification
- `npm run dev`, navigate to `/dashboard/automotive/findlaycadillac/locationhistory`, confirm the dashboard loads and the KPI + table panels return data from the Findlay Cadillac dataset without errors.
