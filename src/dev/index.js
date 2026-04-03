import url from 'node:url';

import glyphCheck from './glyph-check';
import strokeGroup from './stroke-group';

// https://github.com/vbenjs/vite-plugin-mock/blob/main/packages/vite-plugin-mock/src/createMockServer.ts
export default function (request, response, next) {
  if (!request.url.startsWith('/dev/api/')) {
    return next();
  }

  const method = request.method.toUpperCase();

  const queryParams = url.parse(request.url, true);
  const pathname = queryParams.pathname;
  const params = queryParams.query || {};

  if (method === 'GET') {
    handle(pathname, method, params, request, response);
  } else {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      const data = { ...params, body: JSON.parse(body) };

      handle(pathname, method, data, request, response);
    });
  }
}

function handle(pathname, method, params, request, response) {
  let data;
  try {
    switch (pathname) {
      case '/dev/api/glyph-check':
        data = glyphCheck(method, params, request, response);
        break;
      case '/dev/api/stroke-group':
        data = strokeGroup(method, params, request, response);
        break;
      // -----------------------------------
      default:
        response.statusCode = 404;
        response.end('API not found');
        return;
    }

    sendJson(response, { success: true, data: data || {} });
  } catch (e) {
    sendJson(response, { success: false, msg: e.message });
  }
}

function sendJson(response, data) {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(data));
}
