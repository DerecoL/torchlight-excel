(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.fileDragSort = api;
  }
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

  function reorderFilesForDrop(files, fromIndex, targetIndex, placement) {
    const insertionIndex = placement === 'after' ? targetIndex + 1 : targetIndex;
    const normalizedIndex = fromIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    return moveArrayItem(files, fromIndex, normalizedIndex);
  }

  return {
    moveArrayItem,
    getDropPlacement,
    reorderFilesForDrop,
  };
});
