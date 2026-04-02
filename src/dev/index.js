import url from 'node:url';

import glyphCheck from './glyph-check';

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
    let result;
    switch (pathname) {
      case '/dev/api/glyph-check':
        result = glyphCheck(params, request, response);
        break;
    }

    sendJson(response, result || { success: true });
  } //
  else if (method === 'POST') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });

    request.on('end', () => {
      const data = { ...params, ...JSON.parse(body) };

      let result;
      switch (pathname) {
        case '':
          break;
      }

      sendJson(response, result || { success: true });
    });
  } //
  else {
    response.statusCode = 404;
    response.end('API not found');
  }
}

function sendJson(response, data) {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(data));
}
