// 统一将模型的数组数据转换为对象结构
const pinyinSchemaMapping = {"audio":0};
const simpleCharSchemaMapping = {"value":0,"spell":1};
const charMetaSchemaMapping = {"value":0,"unicode":1,"spells":2,"radical":3,"stroke_count":4,"struct":5,"stroke_svg":6,"glyph_svg":7};

export function convertSimpleCharData(data) {
  return convertDataByMapping(data, simpleCharSchemaMapping);
}

export function convertCharMetaData(data) {
  return convertDataByMapping(data, charMetaSchemaMapping);
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
