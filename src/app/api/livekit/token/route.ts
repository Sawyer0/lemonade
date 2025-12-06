import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const room = req.nextUrl.searchParams.get('room');
    const username = req.nextUrl.searchParams.get('username') || 'user-' + Math.floor(Math.random() * 10000);

    const allowedHeaders = 'Content-Type, Authorization' +
        (process.env.NODE_ENV === 'development' ? ', ngrok-skip-browser-warning' : '');

    const commonHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': allowedHeaders,
    };

    if (!room) {
        return NextResponse.json({ error: 'Missing room query parameter' }, { status: 400, headers: commonHeaders });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500, headers: commonHeaders });
    }

    const at = new AccessToken(apiKey, apiSecret, {
        identity: username,
    });

    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();

    return NextResponse.json({ token }, { headers: commonHeaders });
}

export async function OPTIONS() {
    const allowedHeaders = 'Content-Type, Authorization' +
        (process.env.NODE_ENV === 'development' ? ', ngrok-skip-browser-warning' : '');

    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': allowedHeaders,
        },
    });
}
