import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { StorageService } from '@/infrastructure/storage/StorageService';

const SignRequestSchema = z.object({
  contentType: z.enum(['video/mp4', 'image/jpeg', 'image/png']),
  sessionId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contentType, sessionId } = SignRequestSchema.parse(body);

    const storageService = container.get<StorageService>(TYPES.StorageService);
    const filename = `sessions/${sessionId}/${Date.now()}.${contentType.split('/')[1]}`;

    const { uploadUrl, publicUrl } = await storageService.generateSignedUrl(filename, contentType);

    return NextResponse.json({
      uploadUrl,
      publicUrl
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Authorization Failed' }, { status: 403 });
  }
}
