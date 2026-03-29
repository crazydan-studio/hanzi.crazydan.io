import { message } from '#utils/message/index.js';

window.$copyText = function (value) {
  navigator.clipboard
    .writeText(value)
    .then(() => {
      message.show({ type: 'success', message: `「${value}」已复制` });
    })
    .catch((e) => {
      message.show({ type: 'error', message: '复制发生异常：' + e.message });
    });
};

let currentAudio = null;
window.$playAudio = function (url) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  const audio = new Audio(url);
  audio.play().catch((e) => {
    message.show({ type: 'error', message: '音频播放发生异常：' + e.message });
  });
  currentAudio = audio;
};
