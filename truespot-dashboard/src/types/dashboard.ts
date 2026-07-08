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
  panels: z.array(PanelConfigSchema),
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
