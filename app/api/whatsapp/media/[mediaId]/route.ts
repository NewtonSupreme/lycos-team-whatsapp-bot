import { NextRequest, NextResponse } from 'next/server';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;

  if (!WHATSAPP_TOKEN) {
    return new NextResponse('Configuration Error', { status: 500 });
  }

  try {
    // 1. Get media URL from Meta
    const metaResp = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!metaResp.ok) {
      console.error('❌ Error fetching media metadata from Meta:', await metaResp.text());
      return new NextResponse('Media Metadata Error', { status: metaResp.status });
    }

    const metadata = await metaResp.json();
    const mediaUrl = metadata.url;

    if (!mediaUrl) {
      return new NextResponse('Media URL not found', { status: 404 });
    }

    // 2. Fetch the actual binary data
    const mediaFileResp = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    if (!mediaFileResp.ok) {
      console.error('❌ Error fetching binary media from Meta:', await mediaFileResp.text());
      return new NextResponse('Media Binary Error', { status: mediaFileResp.status });
    }

    const contentType = mediaFileResp.headers.get('content-type') || 'application/octet-stream';
    const blob = await mediaFileResp.blob();

    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error) {
    console.error('❌ Proxy Media Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
