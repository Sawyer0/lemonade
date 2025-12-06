import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { StorageService } from '@/infrastructure/storage/StorageService';
import { SignRequestSchema, SignResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
  try {
    console.log('[Upload/Sign] Request received');
    const { contentType, sessionId } = await validateRequest(req, SignRequestSchema);
    console.log(`[Upload/Sign] Validated request for sessionId: ${sessionId}, type: ${contentType}`);

    const storageService = container.get<StorageService>(TYPES.StorageService);
    const filename = `sessions/${sessionId}/${Date.now()}.${contentType.split('/')[1]}`;

    console.log('[Upload/Sign] Generating signed URL...');
    const { uploadUrl, publicUrl } = await storageService.generateSignedUrl(filename, contentType);
    console.log('[Upload/Sign] Generated URL successfully');

    const responseData = {
      uploadUrl,
      publicUrl
    };

    const validatedResponse = validateResponse(responseData, SignResponseSchema);

    return NextResponse.json(validatedResponse);

  } catch (error) {
    console.error('[Upload/Sign] Error:', error);
    return createErrorResponse(error);
  }
}
