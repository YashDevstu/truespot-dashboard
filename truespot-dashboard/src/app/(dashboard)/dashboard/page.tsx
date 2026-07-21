import { redirect, notFound } from 'next/navigation'

export default function DashboardIndexPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  redirect('/dashboard/automotive/carvision')
}
