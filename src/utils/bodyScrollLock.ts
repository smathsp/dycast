const activeLocks = new Set<symbol>();
let originalOverflow = '';

/**
 * 多个全屏层可以同时存在，最后一个关闭前不能提前恢复页面滚动。
 * 返回的释放函数可重复调用，便于动画中断和组件卸载共用。
 */
export function lockBodyScroll(): () => void {
  const token = Symbol('body-scroll-lock');
  if (activeLocks.size === 0) {
    originalOverflow = document.body.style.overflow;
  }
  activeLocks.add(token);
  document.body.style.overflow = 'hidden';

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks.delete(token);
    if (activeLocks.size === 0) {
      document.body.style.overflow = originalOverflow;
      originalOverflow = '';
    }
  };
}
