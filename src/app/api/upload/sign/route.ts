import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { StorageService } from '@/infrastructure/storage/StorageService';
import { SignRequestSchema, SignResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
  try {
    const { contentType, sessionId } = await validateRequest(req, SignRequestSchema);

    const storageService = container.get<StorageService>(TYPES.StorageService);
    const filename = `sessions/${sessionId}/${Date.now()}.${contentType.split('/')[1]}`;

    const { uploadUrl, publicUrl } = await storageService.generateSignedUrl(filename, contentType);

    const responseData = {
      uploadUrl,
      publicUrl
    };

    const validatedResponse = validateResponse(responseData, SignResponseSchema);

    return NextResponse.json(validatedResponse);

  } catch (error) {
    return createErrorResponse(error);
  }
}
