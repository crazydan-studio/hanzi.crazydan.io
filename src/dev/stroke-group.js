import path from 'node:path';

import {
  fromRootPath,
  readJSONFromFile,
  writeJSONToFile
} from '#utils/file.js';

import { getUnicode } from '#utils/zi.js';

const GLYPH_DIR = fromRootPath('public/assets/glyph');

export default function (method, params, request, response) {
  const zi = params.z;
  const unicode = getUnicode(zi);

  const strokeFile = path.join(GLYPH_DIR, unicode, 'stroke.json');
  const stroke = readJSONFromFile(strokeFile, {});

  if (method != 'PUT') {
    return stroke.groups || [];
  }

  stroke.groups = params.body;

  writeJSONToFile(strokeFile, stroke);
}
