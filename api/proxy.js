export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
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
        JSON.stringify({ error: 'Missing x-abs-target header or target query parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Clean server URL and combine
    const cleanBase = targetServer.replace(/\/+$/, '');
    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete('target');
    cleanParams.delete('path');

    const fullUrl = `${cleanBase}${targetPath}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;

    // Forward request headers
    const forwardHeaders = new Headers();
    request.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (!['host', 'connection', 'x-abs-target', 'origin', 'referer'].includes(lower)) {
        forwardHeaders.set(key, val);
      }
    });

    const init = {
      method: request.method,
      headers: forwardHeaders,
      redirect: 'follow',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(fullUrl, init);

    // Build response headers with CORS
    const responseHeaders = new Headers(response.headers);
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
      JSON.stringify({ error: 'Proxy request failed', details: err?.message || String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
