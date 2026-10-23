export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const url = new URL(request.url);
    const targetServer = request.headers.get('x-abs-target') || url.searchParams.get('target');
    
    // Extract target sub-path
    let targetPath = url.searchParams.get('path') || '';
    if (!targetPath) {
      targetPath = url.pathname.replace(/^\/abs-proxy/, '').replace(/^\/api\/proxy/, '') || '/';
    }
    if (!targetPath.startsWith('/')) {
      targetPath = '/' + targetPath;
    }

    if (!targetServer) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing target', 
          details: 'Please provide x-abs-target header or target query parameter with the Audiobookshelf server address' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    const cleanBase = targetServer.trim().replace(/\/+$/, '');

    // Check for localhost / loopback on cloud edge
    const isLocalhost = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1') || cleanBase.includes('0.0.0.0');
    if (isLocalhost) {
      return new Response(
        JSON.stringify({
          error: 'Localhost not reachable from cloud proxy',
          details: 'Your Folio app is deployed on Vercel (cloud), which cannot connect to "localhost" on your personal machine. To use a local server: expose it using Cloudflare Tunnel / ngrok, uncheck "Use built-in proxy", or run Folio locally with "npm run dev".',
        }),
        { 
          status: 502, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Build target query parameters
    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete('target');
    cleanParams.delete('path');

    const fullUrl = `${cleanBase}${targetPath}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;

    // Filter headers to forward
    const forwardHeaders = new Headers();
    request.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (!['host', 'connection', 'x-abs-target', 'origin', 'referer', 'content-length', 'transfer-encoding'].includes(lower)) {
        forwardHeaders.set(key, val);
      }
    });

    const init = {
      method: request.method,
      headers: forwardHeaders,
      redirect: 'follow',
    };

    // Buffer body for non-GET/HEAD to avoid duplex stream issues in Edge/Node runtime
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const bodyBuffer = await request.arrayBuffer();
      if (bodyBuffer && bodyBuffer.byteLength > 0) {
        init.body = bodyBuffer;
      }
    }

    const response = await fetch(fullUrl, init);

    // Build response headers with permissive CORS
    const responseHeaders = new Headers();
    response.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding'].includes(lower)) {
        responseHeaders.set(key, val);
      }
    });

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ 
        error: 'Proxy request failed', 
        details: err?.message || String(err) 
      }),
      { 
        status: 502, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
}
