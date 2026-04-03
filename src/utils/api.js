import { message } from '#utils/message/index.js';

/** 调用数据获取 API（实际发送 GET/POST 请求） */
export async function callGetApi(url, params) {
  return await handleApi(
    fetch(
      url,
      params
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
          }
        : { method: 'GET' }
    )
  );
}

/** 调用数据修改 API（实际发送 PUT 请求） */
export async function callPutApi(url, params) {
  return await handleApi(
    fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params || {})
    })
  );
}

function handleApi(api) {
  return api
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`${url} - ${resp.status}`);
      }
      return resp.json();
    })
    .then((result) => {
      if (!result.success) {
        throw new Error(result.msg);
      }
      return result.data;
    })
    .catch((e) => {
      message.show({
        type: 'error',
        message: 'API 请求异常：' + e.message
      });
    });
}
