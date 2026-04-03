import '#utils/native.js';
import { render } from '#utils/render.js';
import { getParamFromLocation, setParamInLocation } from '#utils/url.js';
import { callGetApi, callPutApi } from '#utils/api.js';
import { convertZiGlyphData } from '#data/schema.js';
import { getUnicode } from '#utils/zi.js';

import { fetchZiGlyphAndStroke, genStrokeStepsByGroups } from '#zi/stroke.js';

import '#index.css';

const PAGE_SIZE = 100;
let pageData = { current: 0, total: 0 };

const page = getParamFromLocation('p') || 1;

fetch('/assets/zi/glyphs.json')
  .then((resp) => {
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} - 无法获取字形列表`);
    }
    return resp.json();
  })
  .then((zies) => {
    const pager = initPager(pageData, zies);
    pager(page);
  })
  .catch((e) => {
    render(document.getElementById('template_ziGridNetError'), {
      msg: e.message || '无法获取字形列表，请检查网络或稍后重试。'
    });
  });

function initPager(pageData, data) {
  let oldCurrent = pageData.current;

  pageData.total = Math.ceil(data.length / PAGE_SIZE);

  const doRender = (page) => {
    render(document.getElementById('template_ziGridPager'), { page });

    document.getElementById('page_gotoInput').onblur = (event) => {
      try {
        const current = parseInt(event.target.innerText);
        updatePageCurrent(current);
      } catch (e) {}

      event.target.innerText = pageData.current;
    };

    // -----------------------------------------
    if (oldCurrent != page.current) {
      const index = (page.current - 1) * PAGE_SIZE;

      renderGrid(data.slice(index, index + PAGE_SIZE));

      setParamInLocation('p', page.current);
    }
    oldCurrent = page.current;
  };

  const updatePageCurrent = (current) => {
    pageData.current = Math.min(pageData.total, Math.max(1, current));

    doRender(pageData);
  };

  document.getElementById('page_prevBtn').onclick = () => {
    updatePageCurrent(pageData.current - 1);
  };
  document.getElementById('page_nextBtn').onclick = () => {
    updatePageCurrent(pageData.current + 1);
  };

  return updatePageCurrent;
}

function renderGrid(data) {
  render(document.getElementById('template_ziGridCard'), {
    zies: data.map((d) => {
      const obj = convertZiGlyphData(d);

      obj.has_stroke_svg = obj.glyph_type == 'stroke';

      return obj;
    })
  });

  const $nodes = document.querySelectorAll(
    // Note: <r-template/> 中的节点必须被排除
    '.zi-glyph-card:not(r-template .zi-glyph-card)'
  );
  lazyLoadGlyphs($nodes);
}

function lazyLoadGlyphs($targets) {
  const loadingObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const $target = entry.target;
      loadingObserver.unobserve($target);

      const zi = $target.dataset.zi;
      const glyph_type = $target.dataset.glyphType;

      const unicode = getUnicode(zi);

      fetchZiGlyphAndStroke(unicode, glyph_type).then((data) => {
        renderGlyphAndStroke($target, { ...data, value: zi, unicode });
      });
    });
  });

  $targets.forEach(($target) => loadingObserver.observe($target));
}

function renderGlyphAndStroke($target, data) {
  loadGlyphStatus($target, data.value, data.has_stroke);

  renderGlyph($target, data);

  // --------------------------------------------
  const strokeSvg = data.stroke_svg;
  const levelGroups = [
    {
      level: 0,
      indexes: [],
      steps: (strokeSvg && genStrokeStepsByGroups(strokeSvg)) || []
    }
  ];

  callGetApi(`/dev/api/stroke-group?z=${data.value}`)
    .then((data) => {
      data.forEach((lg) => {
        levelGroups.push({
          ...lg,
          steps: genStrokeStepsByGroups(strokeSvg, lg.indexes)
        });
      });
    })
    .finally(() => {
      renderStroke($target, data.value, strokeSvg, levelGroups);
    });
}

function loadGlyphStatus($target, zi, hasStrokeSvg) {
  callGetApi(`/dev/api/glyph-check?z=${zi}`).then((data) => {
    data.value = zi;
    data.has_stroke_svg = hasStrokeSvg;

    render($target.querySelector('[name="template_ziGlyphStatus"]'), data);
  });
}

function renderGlyph($target, data) {
  const $tpl = $target.querySelector('[name="template_ziGlyph"]');
  render($tpl, data);
}

function renderStroke($target, zi, strokeSvg, levelGroups) {
  const $tpl = $target.querySelector('[name="template_ziStroke"]');
  render($tpl, { level_groups: levelGroups });

  // -----------------------------------------------------------
  const updateLevelGroup = (levelGroup, stepIndex, forAdd) => {
    const i = levelGroup.indexes.indexOf(stepIndex);
    if (i >= 0) {
      levelGroup.indexes.splice(i, 1);
    }

    if (forAdd) {
      levelGroup.indexes.push(stepIndex);
    }

    let uselessFrom = levelGroups.indexOf(levelGroup) + 1;
    if (levelGroup.indexes.length == 0) {
      uselessFrom -= 1;
    } else {
      levelGroup.steps = genStrokeStepsByGroups(strokeSvg, levelGroup.indexes);
    }

    // 前序分组已更新，则后续分组无效，需将其清空
    levelGroups.splice(uselessFrom, levelGroups.length - uselessFrom);

    callPutApi(
      `/dev/api/stroke-group?z=${zi}`,
      levelGroups.slice(1).map((lg, i) => ({
        level: i + 1,
        indexes: lg.indexes
      }))
    ).then(() => {
      renderStroke($target, zi, strokeSvg, levelGroups);
    });
  };

  // -----------------------------------------------------
  const $steps = $tpl.parentNode.querySelectorAll(
    // Note: <r-template/> 中的节点必须被排除
    '.stroke-step:not(r-template .stroke-step)'
  );
  $steps.forEach(($step) => {
    const currentGroupLevel = $step.dataset.groupLevel;

    const nextGroupLevel = parseInt(currentGroupLevel) + 1;
    const nextLevelGroup = (levelGroups[nextGroupLevel] ||= {
      startStep: undefined,
      level: nextGroupLevel,
      indexes: []
    });

    $step.querySelector('.tianzi-grid').onclick = () => {
      if (!nextLevelGroup.startStep) {
        nextLevelGroup.startStep = $step;
      } //
      else {
        // Note: 保持起止序号不变，以支持纠正笔顺
        const val = getStepIndexBetween(nextLevelGroup.startStep, $step);
        nextLevelGroup.startStep = undefined;

        updateLevelGroup(nextLevelGroup, val, true);
      }
    };

    if (nextGroupLevel > 1) {
      $step.querySelector('[role="btn-remove"]').onclick = () => {
        const index = $step.dataset.stepIndex;

        updateLevelGroup(levelGroups[currentGroupLevel], index, false);
      };
    }
  });

  // --------------------------------------
  const getStepIndexBetween = ($start, $end) => {
    if (!$start.dataset.stepIndex.includes('-')) {
      return `${$start.dataset.stepIndex}-${$end.dataset.stepIndex}`;
    }

    let $step = $start;
    let indexes = [$step.dataset.stepIndex];
    do {
      $step = $step.nextElementSibling;

      indexes.push($step.dataset.stepIndex);
    } while ($step && $step != $end);

    if (!$step) {
      $step = $start;
      indexes = [$step.dataset.stepIndex];
      do {
        $step = $step.previousElementSibling;

        indexes.push($step.dataset.stepIndex);
      } while ($step && $step != $end);
    }

    return indexes.join(',');
  };
}

// ---------------------------------------------------------
window.$updateGlyphStatus = function (event, zi, type) {
  const value = !!event.target.checked;

  callPutApi(`/dev/api/glyph-check?z=${zi}&t=${type}&v=${value}`);
};
