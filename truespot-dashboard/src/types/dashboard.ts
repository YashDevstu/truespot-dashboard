import { z } from 'zod'
import { PanelType } from '@/constants/dashboard'

export const PanelConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.nativeEnum(PanelType),
  measure: z.string().optional(),
  // Maps filter key → DAX column reference (e.g. "geofence" → "AppendFinal[Geofence]")
  // Used by /api/v1/filter-options to run DISTINCT queries server-side.
  filter_columns: z.record(z.string(), z.string()).optional(),
})

export type PanelConfig = z.infer<typeof PanelConfigSchema>

export const FloorParSchema = z.object({
  default:   z.number().optional(),
  tight_pct: z.number().optional(),
  // Each floor entry can have:
  //   par      — floor-level default (used when no assetType filter or type not in by_type)
  //   by_type  — per-asset-type par overrides, e.g. { "IV Pump": 6, "IV Pole": 8 }
  floors: z.record(
    z.string(),
    z.object({
      par:     z.number().optional(),
      by_type: z.record(z.string(), z.number()).optional(),
    })
  ).optional(),
})

export type FloorParConfig = z.infer<typeof FloorParSchema>

export const DashboardConfigSchema = z.object({
  label: z.string(),
  dataset_name: z.string(),
  workspace_name: z.string().optional(),
  // Identifies which dashboard component to render. Omitting defaults to
  // the Automotive LocationHistoryDashboard for backward compatibility.
  dashboard_type: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  panels: z.array(PanelConfigSchema).optional(),
  // Insight Hub — floor readiness par levels (assets per floor per day)
  floor_par: FloorParSchema.optional(),
  // Insight Hub — 'geofence' = classify by Geofence column instead of SubGeo keywords
  classification: z.string().optional(),
  // Insight Hub — freeable value card
  spare_buffer: z.number().optional(),  // spare units to keep above peak demand
  unit_value:   z.number().optional(),  // per-unit replacement value in USD
})

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>

export const ClientConfigSchema = z.object({
  client_id: z.string(),
  product: z.string(),
  display_name: z.string(),
  locations: z.array(z.string()),
  dashboards: z.record(z.string(), DashboardConfigSchema),
})

export type ClientConfig = z.infer<typeof ClientConfigSchema>

export const ProductConfigSchema = z.object({
  product: z.string(),
  label: z.string(),
  clients: z.array(z.string()),
})

export type ProductConfig = z.infer<typeof ProductConfigSchema>
