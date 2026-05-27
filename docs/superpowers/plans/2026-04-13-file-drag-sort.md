# File Drag Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop custom ordering for the right-side file list inside the current group, and persist that order in the existing config data.

**Architecture:** Keep the storage model unchanged by continuing to use `config.groups[activeGroupIndex].files` as the source of truth. Extract the reorder and drop-position math into a small standalone utility that works both in the browser and under Node tests, then wire drag events into the existing renderer and finish with focused drag-state styles plus manual verification.

**Tech Stack:** Electron renderer, vanilla JavaScript, `node:test`, existing `renderer/app.js` + `renderer/styles.css`

---

## File Map

- Create: `E:\AI-Project\Excel\renderer\file-drag-sort.js`
- Create: `E:\AI-Project\Excel\tests\file-drag-sort.test.js`
- Modify: `E:\AI-Project\Excel\package.json`
- Modify: `E:\AI-Project\Excel\renderer\index.html:225`
- Modify: `E:\AI-Project\Excel\renderer\app.js:394-493`
- Modify: `E:\AI-Project\Excel\renderer\styles.css:364-493`

### Task 1: Extract and test reorder utilities

**Files:**
- Create: `E:\AI-Project\Excel\renderer\file-drag-sort.js`
- Create: `E:\AI-Project\Excel\tests\file-drag-sort.test.js`
- Modify: `E:\AI-Project\Excel\package.json`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  moveArrayItem,
  getDropPlacement,
} = require('../renderer/file-drag-sort.js');

test('moveArrayItem moves a middle file to the front without mutating input', () => {
  const input = [
    { relativePath: 'design/demo_table/npc.xlsx' },
    { relativePath: 'design/demo_table/skill_stone.xlsx' },
    { relativePath: 'design/demo_table/skill_damage.xlsx' },
  ];

  const output = moveArrayItem(input, 1, 0);

  assert.deepEqual(output.map(item => item.relativePath), [
    'design/demo_table/skill_stone.xlsx',
    'design/demo_table/npc.xlsx',
    'design/demo_table/skill_damage.xlsx',
  ]);
  assert.deepEqual(input.map(item => item.relativePath), [
    'design/demo_table/npc.xlsx',
    'design/demo_table/skill_stone.xlsx',
    'design/demo_table/skill_damage.xlsx',
  ]);
});

test('moveArrayItem returns the original items when indices are invalid', () => {
  const input = [
    { relativePath: 'a.xlsx' },
    { relativePath: 'b.xlsx' },
  ];

  assert.deepEqual(moveArrayItem(input, -1, 1), input);
  assert.deepEqual(moveArrayItem(input, 0, 3), input);
  assert.deepEqual(moveArrayItem(input, 1, 1), input);
});

test('getDropPlacement returns before for the upper half of a card', () => {
  assert.equal(getDropPlacement(110, 100, 40), 'before');
});

test('getDropPlacement returns after for the lower half of a card', () => {
  assert.equal(getDropPlacement(135, 100, 40), 'after');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test .\tests\file-drag-sort.test.js
```

Expected: `FAIL` with `Cannot find module '../renderer/file-drag-sort.js'` or missing export errors.

- [ ] **Step 3: Add the test script and minimal implementation**

`E:\AI-Project\Excel\package.json`

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder --win",
    "build:portable": "electron-builder --win portable",
    "build:dir": "electron-builder --win dir"
  }
}
```

`E:\AI-Project\Excel\renderer\file-drag-sort.js`

```js
(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.fileDragSort = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function moveArrayItem(items, fromIndex, toIndex) {
    if (!Array.isArray(items)) return [];
    if (fromIndex === toIndex) return items.slice();
    if (fromIndex < 0 || toIndex < 0) return items.slice();
    if (fromIndex >= items.length || toIndex >= items.length) return items.slice();

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function getDropPlacement(pointerY, rectTop, rectHeight) {
    const middle = rectTop + rectHeight / 2;
    return pointerY < middle ? 'before' : 'after';
  }

  return {
    moveArrayItem,
    getDropPlacement,
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test
```

Expected: `PASS` for all four tests in `tests/file-drag-sort.test.js`.

- [ ] **Step 5: Checkpoint**

If `git rev-parse --show-toplevel` succeeds, run:

```powershell
git add package.json renderer/file-drag-sort.js tests/file-drag-sort.test.js
git commit -m "test: add file drag sort utilities"
```

If the command reports `not a git repository`, record that the workspace has no git metadata and continue without committing.

### Task 2: Wire drag-and-drop into the renderer

**Files:**
- Modify: `E:\AI-Project\Excel\renderer\index.html:225`
- Modify: `E:\AI-Project\Excel\renderer\app.js:394-493`
- Test: `E:\AI-Project\Excel\tests\file-drag-sort.test.js`

- [ ] **Step 1: Extend the failing test for insertion index behavior**

Append this test to `E:\AI-Project\Excel\tests\file-drag-sort.test.js`:

```js
test('moveArrayItem supports moving the first file to the end index', () => {
  const input = [
    { relativePath: 'npc.xlsx' },
    { relativePath: 'skill_stone.xlsx' },
    { relativePath: 'skill_damage.xlsx' },
  ];

  const output = moveArrayItem(input, 0, 2);

  assert.deepEqual(output.map(item => item.relativePath), [
    'skill_stone.xlsx',
    'skill_damage.xlsx',
    'npc.xlsx',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails if utility behavior is incomplete**

Run:

```powershell
node --test .\tests\file-drag-sort.test.js
```

Expected: `FAIL` only if the helper does not correctly handle move-to-end behavior. If it already passes, keep the test and continue because the new renderer work will consume an already-proven helper.

- [ ] **Step 3: Load the helper before `app.js`**

Update `E:\AI-Project\Excel\renderer\index.html` near the closing `body` tag:

```html
  <script src="file-drag-sort.js"></script>
  <script src="app.js"></script>
```

- [ ] **Step 4: Add drag state and reorder logic in `app.js`**

Insert drag state near the existing top-level renderer state in `E:\AI-Project\Excel\renderer\app.js`:

```js
  let dragFileIndex = -1;
  let dropFileIndex = -1;
  let dropPlacement = null;
```

Add these helpers before `renderFiles()`:

```js
  function clearFileDragState() {
    dragFileIndex = -1;
    dropFileIndex = -1;
    dropPlacement = null;
  }

  function updateDropIndicator(card, placement) {
    card.classList.toggle('drop-before', placement === 'before');
    card.classList.toggle('drop-after', placement === 'after');
  }

  function clearDropIndicators() {
    $fileList.querySelectorAll('.file-card').forEach(card => {
      card.classList.remove('dragging', 'drop-before', 'drop-after');
    });
  }

  function getReorderedFiles(files, fromIndex, targetIndex, placement) {
    const insertionIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
    const normalizedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    return window.fileDragSort.moveArrayItem(files, fromIndex, normalizedIndex);
  }
```

Update `renderFiles()` so each card is draggable and owns its drag listeners:

```js
      card.draggable = group.files.length > 1;
      card.dataset.fileIndex = String(fileIndex);

      card.addEventListener('dragstart', (event) => {
        dragFileIndex = fileIndex;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(fileIndex));
      });

      card.addEventListener('dragover', (event) => {
        if (dragFileIndex < 0 || dragFileIndex === fileIndex) return;
        event.preventDefault();

        const rect = card.getBoundingClientRect();
        dropFileIndex = fileIndex;
        dropPlacement = window.fileDragSort.getDropPlacement(event.clientY, rect.top, rect.height);

        clearDropIndicators();
        const draggingCard = $fileList.querySelector(`[data-file-index="${dragFileIndex}"]`);
        if (draggingCard) draggingCard.classList.add('dragging');
        updateDropIndicator(card, dropPlacement);
      });

      card.addEventListener('drop', async (event) => {
        event.preventDefault();
        const currentGroup = config.groups[activeGroupIndex];
        if (!currentGroup || dragFileIndex < 0 || dropFileIndex < 0 || !dropPlacement) return;

        const reordered = getReorderedFiles(currentGroup.files, dragFileIndex, dropFileIndex, dropPlacement);
        const unchanged = reordered.every((item, index) => item === currentGroup.files[index]);
        clearFileDragState();
        clearDropIndicators();
        if (unchanged) return;

        currentGroup.files = reordered;
        await window.configApi.save(config);
        renderFiles();
        renderGroups();
      });

      card.addEventListener('dragend', () => {
        clearFileDragState();
        clearDropIndicators();
      });
```

Keep the existing `.btn-open` and `.btn-remove` click listeners unchanged after the drag listeners are attached.

- [ ] **Step 5: Run the tests and a focused smoke check**

Run:

```powershell
npm test
```

Expected: all tests still `PASS`.

Then run:

```powershell
npm start
```

Expected: the app opens, file cards render normally, and no console/runtime error appears before any drag attempt.

- [ ] **Step 6: Checkpoint**

If git is available, run:

```powershell
git add renderer/index.html renderer/app.js tests/file-drag-sort.test.js
git commit -m "feat: wire file drag sorting"
```

If git is unavailable, note that this checkpoint is intentionally uncommitted in the non-repository workspace.

### Task 3: Add drag feedback styles and complete manual verification

**Files:**
- Modify: `E:\AI-Project\Excel\renderer\styles.css:364-493`
- Modify: `E:\AI-Project\Excel\renderer\app.js:394-493`

- [ ] **Step 1: Add the minimal visual states**

Update `E:\AI-Project\Excel\renderer\styles.css` around the existing file-card rules:

```css
.file-card {
  position: relative;
}

.file-card[draggable="true"] {
  cursor: grab;
}

.file-card.dragging {
  opacity: 0.45;
  border-color: var(--accent);
}

.file-card.drop-before::before,
.file-card.drop-after::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}

.file-card.drop-before::before {
  top: -5px;
}

.file-card.drop-after::after {
  bottom: -5px;
}
```

- [ ] **Step 2: Add a safety no-op in the renderer before saving**

In `E:\AI-Project\Excel\renderer\app.js`, tighten the `drop` handler so save only happens for real moves:

```js
        if (dragFileIndex === dropFileIndex && dropPlacement === 'before') {
          clearFileDragState();
          clearDropIndicators();
          return;
        }
```

If the actual insertion math already makes this redundant, keep whichever no-op guard produces the clearest code and still skips useless saves.

- [ ] **Step 3: Run automated verification**

Run:

```powershell
npm test
```

Expected: `PASS`.

- [ ] **Step 4: Run manual verification**

Run:

```powershell
npm start
```

Verify all of the following in the running app:

- Drag a middle file to the top of the current group.
- Drag the top file to the bottom of the current group.
- Drag a file onto its original slot and confirm there is no visible reorder flicker.
- Click `Checkout 并打开`, `仅查看`, and the remove button after using drag once, and confirm they still work.
- Close and reopen the app and confirm the last drag order persists.
- Confirm empty groups and single-file groups still render without drag errors.

- [ ] **Step 5: Final checkpoint**

If git is available, run:

```powershell
git add renderer/styles.css renderer/app.js
git commit -m "style: add file drag sort feedback"
```

If git is unavailable, capture the verification results in the task handoff message instead of committing.

## Self-Review

- Spec coverage: the plan covers list-only drag sorting, persistence via existing config, no schema changes, no cross-group movement, and manual checks for button safety and reopen persistence.
- Placeholder scan: removed placeholder wording and replaced it with concrete file paths, code snippets, commands, and expected outcomes.
- Type consistency: the same utility names are used throughout the plan: `moveArrayItem`, `getDropPlacement`, `clearFileDragState`, `clearDropIndicators`, and `getReorderedFiles`.
