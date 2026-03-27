// 统一将模型的数组数据转换为对象结构
const pinyinSchemaMapping = {"audio":0};
const simpleCharSchemaMapping = {"value":0,"spell":1};
const charMetaSchemaMapping = {"value":0,"spells":1,"radical":2,"stroke_count":3,"struct":4,"stroke_svg":5,"glyph_svg":6};
const wordStructNames = ["上下","独体","上中下","左右","左下包围","左上包围","上包围","右上包围","左包围","全包围","左中右","半包围","品字","下包围","右包围"];

export function convertSimpleCharData(data) {
  return convertDataByMapping(data, simpleCharSchemaMapping);
}

export function convertCharMetaData(data) {
  const meta = convertDataByMapping(data, charMetaSchemaMapping);

  meta.struct = wordStructNames[meta.struct] || '未知';

  return meta;
}

export function convertPinyinData(data) {
  return convertDataByMapping(data, pinyinSchemaMapping);
}

function convertDataByMapping(data, mapping) {
  const obj = {};

  if (data && data.length > 0) {
    Object.keys(mapping).forEach((prop) => {
      const index = mapping[prop];
      obj[prop] = data[index];
    });
  }
  return obj;
}
