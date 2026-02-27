import { getCrons } from '@/lib/crons'
import { apiErrorResponse } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const crons = await getCrons()
    return NextResponse.json(crons)
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load cron jobs')
  }
}
