const TAG_NAME = 'r-template';

/**
 * 渲染模板函数
 * @param {Element} template - <r-template> 元素
 * @param {Object} data - 渲染数据
 */
export function render(template, data) {
  // 获取父容器并清空除 <r-template> 外的所有子节点
  const parent = template.parentNode;
  if (!parent) return;

  const children = [...parent.childNodes];
  children.forEach((child) => {
    if (!child.tagName || child.tagName.toLowerCase() !== TAG_NAME) {
      parent.removeChild(child);
    }
  });

  // 获取模板内容（<r-template> 内部的子节点）
  const templateContent = [...template.childNodes];

  // 渲染所有模板内容，并插入到父容器中（template 之前）
  const fragment = document.createDocumentFragment();

  templateContent.forEach((content) => {
    const rendered = processNode(content, data);
    if (rendered.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      fragment.appendChild(rendered);
    } else {
      fragment.appendChild(rendered);
    }
  });

  parent.insertBefore(fragment, template);
}

// 根据路径（如 "user.name"）从对象中取值
function getValueByPath(obj, path) {
  if (!obj || !path) return '';

  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return ''; // 找不到返回空字符串
    }
  }
  return value;
}

// 表达式求值（支持变量、比较、逻辑运算）
function evaluateExpression(expr, context) {
  // 匹配变量名（允许字母、数字、下划线、点，且不能是数字）
  const varPattern = /[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;

  // 替换变量为 getValueByPath 调用
  const replaced = expr.replace(varPattern, (match) => {
    // 避免替换数字字面量
    if (/^\d+$/.test(match)) return match;
    return `getValueByPath(context, '${match}')`;
  });
  try {
    // 使用 Function 构造求值函数，避免 eval 的全局污染
    const fn = new Function('context', 'getValueByPath', `return ${replaced}`);
    return fn(context, getValueByPath);
  } catch (e) {
    console.warn('表达式求值错误:', expr, e);
    return false;
  }
}

// 替换文本节点中的 {{xxx}}
function replaceText(text, context) {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const trimmed = expr.trim();

    return getValueByPath(context, trimmed);
  });
}

// 处理属性中的 {{xxx}}
function processAttributes(element, context) {
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];

    if (attr.value.includes('{{')) {
      const newValue = replaceText(attr.value, context);

      element.setAttribute(attr.name, newValue);
    }
  }
}

// 递归处理节点，返回处理后的节点或节点数组
function processNode(node, context) {
  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    const newText = replaceText(node.textContent, context);

    if (newText !== node.textContent) {
      return document.createTextNode(newText);
    }
    return node.cloneNode(true);
  }

  // 元素节点
  if (node.nodeType === Node.ELEMENT_NODE) {
    // 处理 if（优先级最高）
    if (node.hasAttribute('if')) {
      const condition = node.getAttribute('if');

      const result = evaluateExpression(condition, context);
      if (!result) {
        // 条件为假，跳过该节点及其子树
        return document.createDocumentFragment();
      }
      // 条件为真，继续处理（已移除 if 属性，避免重复判断）
    }

    // 处理 html（完全替换子内容）
    if (node.hasAttribute('html')) {
      const htmlExpr = node.getAttribute('html');

      const htmlStr = replaceText(htmlExpr, context);
      // 将字符串转换为 HTML 节点（注意 XSS 风险，此处不转义，由调用者负责）
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlStr || '';

      // 克隆所有子节点
      const fragment = document.createDocumentFragment();
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }

      // 创建新节点，保留当前节点的属性（除 html 已移除）
      const cloned = node.cloneNode(false);
      cloned.removeAttribute('html');

      cloned.appendChild(fragment);

      return cloned;
    }

    // 处理 for 循环
    if (node.hasAttribute('for')) {
      const forAttr = node.getAttribute('for');

      const match = forAttr.match(/^(\w+)\s+in\s+([\w.]+)$/);
      if (!match) {
        console.warn('Invalid for syntax:', forAttr);
        return node.cloneNode(true);
      }

      const [, itemName, arrayPath] = match;
      const array = getValueByPath(context, arrayPath);
      if (!Array.isArray(array)) {
        console.warn(`for: "${arrayPath}" is not an array`);

        return document.createDocumentFragment(); // 返回空片段
      }

      const fragment = document.createDocumentFragment();
      array.forEach((item, index) => {
        // 创建新上下文，优先使用循环变量
        const newContext = { ...context, [itemName]: item, index };
        const cloned = node.cloneNode(true); // 深克隆
        // 移除属性，避免干扰后续处理
        cloned.removeAttribute('if');
        cloned.removeAttribute('for');

        // 递归处理克隆节点及其子节点（注意：子节点可能还有循环）
        const processed = processNode(cloned, newContext);

        if (processed.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          fragment.appendChild(processed);
        } else {
          fragment.appendChild(processed);
        }
      });
      return fragment;
    }

    // 普通元素：克隆节点，处理属性和子节点
    const cloned = node.cloneNode(false); // 浅克隆，稍后填充子节点
    cloned.removeAttribute('if');

    processAttributes(cloned, context);

    // 处理子节点
    const fragment = document.createDocumentFragment();
    node.childNodes.forEach((child) => {
      const processedChild = processNode(child, context);

      if (processedChild.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        fragment.appendChild(processedChild);
      } else {
        fragment.appendChild(processedChild);
      }
    });
    cloned.appendChild(fragment);

    return cloned;
  }

  // 其他节点（注释等）原样返回
  return node.cloneNode(true);
}
