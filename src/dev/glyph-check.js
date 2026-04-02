import path from 'node:path';

import {
  fromRootPath,
  readJSONFromFile,
  writeJSONToFile
} from '#utils/file.js';

import { getUnicode } from '#utils/zi.js';

const GLYPH_DIR = fromRootPath('public/assets/glyph');

export default function (params, request, response) {
  const zi = params.z;
  const type = params.t;
  const value = params.v == 'true';
  const unicode = getUnicode(zi);

  const statusFile = path.join(GLYPH_DIR, unicode, 'status.json');
  const status = readJSONFromFile(statusFile, {});

  switch (type) {
    case 'get-data':
      return (
        status || {
          glyph_not_matched: false,
          stroke_not_matched: false,
          has_tc_stroke: false,
          has_wrong_stroke: false
        }
      );
    //
    case 'glyph-not-match':
      status.glyph_not_matched = value;
      break;
    case 'stroke-not-match':
      status.stroke_not_matched = value;
      break;
    case 'stroke-for-tc':
      status.has_tc_stroke = value;
      break;
    case 'stroke-wrong':
      status.has_wrong_stroke = value;
      break;
  }

  writeJSONToFile(statusFile, status);
}
