import { getMemoryFiles } from '@/lib/memory'
import { apiErrorResponse } from '@/lib/api-error'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const files = await getMemoryFiles()
    return NextResponse.json(files)
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load memory files')
  }
}
