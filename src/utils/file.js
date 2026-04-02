import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// https://codingbeautydev.com/blog/javascript-dirname-is-not-defined-in-es-module-scope/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 当前 node 项目的根目录 */
export function fromRootPath(...paths) {
  return path.join(__dirname, '../..', ...paths);
}

export function existFile(filepath) {
  return fs.existsSync(filepath);
}

export function copyFile(source, target, override) {
  if (existFile(target) && override !== true) {
    return;
  }

  assureParentDirCreated(target);

  fs.copyFileSync(source, target);
}

export function readJSONFromFile(filepath, defaultValue = {}) {
  if (!existFile(filepath)) {
    return defaultValue;
  }

  return JSON.parse(readFile(filepath));
}

export function readFile(filepath, defaultValue = null) {
  if (!existFile(filepath)) {
    return defaultValue;
  }

  return fs.readFileSync(filepath, 'utf8');
}

/** @param {String|Buffer} content  */
export function writeFile(filepath, content) {
  assureParentDirCreated(filepath);

  fs.writeFileSync(filepath, content);
}

export function writeJSONToFile(filepath, value) {
  writeFile(filepath, JSON.stringify(value));
}

export function readAllFiles(dir) {
  return getAllFiles(dir).map((file) => readFile(file));
}

/** 递归获取指定目录内的全部文件，返回文件绝对路径 */
export function getAllFiles(dir) {
  if (Array.isArray(dir)) {
    return dir.map(getAllFiles).reduce((acc, files) => acc.concat(files), []);
  }

  if (fs.lstatSync(dir).isFile()) {
    return [dir];
  }

  let files = [];
  fs.readdirSync(dir).forEach((file) => {
    const filepath = path.join(dir, file);

    if (fs.lstatSync(filepath).isDirectory()) {
      files = files.concat(getAllFiles(filepath));
    } else {
      files.push(filepath);
    }
  });

  return files;
}

export function assureParentDirCreated(filepath) {
  const dirpath = path.dirname(filepath);

  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }
}
