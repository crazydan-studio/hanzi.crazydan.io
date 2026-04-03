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
  const type = params.t;
  const value = params.v == 'true';
  const unicode = getUnicode(zi);

  const statusFile = path.join(GLYPH_DIR, unicode, 'status.json');
  const status = readJSONFromFile(statusFile, {});

  if (method != 'PUT') {
    return {
      glyph_not_matched: false,
      stroke_not_matched: false,
      has_tc_stroke: false,
      has_wrong_stroke: false,
      has_wrong_stroke_order: false,
      ...status
    };
  }

  switch (type) {
    case 'glyph-not-match':
      status.glyph_not_matched = value;
      break;
    case 'stroke-not-match':
      status.stroke_not_matched = value;
      break;
    case 'stroke-need-correct':
      status.stroke_need_tobe_correct = value;
      break;
    case 'stroke-for-tc':
      status.has_tc_stroke = value;
      break;
    case 'stroke-wrong':
      status.has_wrong_stroke = value;
      break;
    case 'stroke-order-wrong':
      status.has_wrong_stroke_order = value;
      break;
  }

  writeJSONToFile(statusFile, status);
}
