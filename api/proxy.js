export const config = {
  runtime: 'edge',
};

function isPrivateHost(hostname) {
  const host = (hostname || '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  );
}

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

    // Split targetPath if query parameters were attached directly to path
    const [cleanPath, pathQuery] = targetPath.split('?');

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
    let targetHost = '';
    try {
      const parsed = new URL(cleanBase.startsWith('http') ? cleanBase : `http://${cleanBase}`);
      targetHost = parsed.hostname;
    } catch {
      targetHost = cleanBase;
    }

    // Check for private / LAN IP addresses
    if (isPrivateHost(targetHost)) {
      return new Response(
        JSON.stringify({
          error: 'Local network IP not reachable from cloud',
          details: `The address "${cleanBase}" is on your private home network (${targetHost}). Cloud deployments (like Vercel) run in a remote datacenter and cannot access devices on your home router. To connect: expose your server with Cloudflare Tunnel (cloudflared tunnel --url ${cleanBase}), or run Folio locally via "npm run dev".`
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

    // Build target query parameters without target and path
    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete('target');
    cleanParams.delete('path');

    // If path contained embedded query params, merge them cleanly
    if (pathQuery) {
      const extraParams = new URLSearchParams(pathQuery);
      extraParams.forEach((val, key) => {
        if (!cleanParams.has(key)) {
          cleanParams.set(key, val);
        }
      });
    }

    const queryString = cleanParams.toString();
    const fullUrl = `${cleanBase}${cleanPath}${queryString ? '?' + queryString : ''}`;

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
        error: 'Proxy connection failed', 
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
