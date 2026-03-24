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
        cloned.removeAttribute('for'); // 移除属性，避免干扰后续处理

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
