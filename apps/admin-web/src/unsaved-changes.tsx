import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router';
import { Modal } from 'antd';
import { ActionButton as Button } from './control-common';

const UnsavedChangesContext = createContext<(() => () => void) | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyForms, setDirtyForms] = useState(0);
  const register = useCallback(() => {
    setDirtyForms((count) => count + 1);
    return () => setDirtyForms((count) => count - 1);
  }, []);
  const dirty = dirtyForms > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    // A completed save or expired session must not leave an obsolete blocker behind.
    if (!dirty && blocker.state === 'blocked') blocker.proceed();
  }, [dirty, blocker]);
  return (
    <UnsavedChangesContext.Provider value={register}>
      {children}
      <Modal
        className="unsaved-changes-modal"
        open={blocker.state === 'blocked'}
        title="确认离开当前页面？"
        getContainer={false}
        onCancel={() => blocker.reset?.()}
        footer={
          <div className="control-actions modal-actions">
            <Button autoFocus onClick={() => blocker.reset?.()}>
              继续编辑
            </Button>
            <Button danger onClick={() => blocker.proceed?.()}>
              确认离开
            </Button>
          </div>
        }
      >
        <p>当前有未保存或未发布的改动。离开后，未保存的输入将丢失。</p>
        <p>已保存的草稿可在“发布记录”中继续处理。</p>
      </Modal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(dirty: boolean) {
  const register = useContext(UnsavedChangesContext);
  if (!register) throw new Error('UnsavedChangesProvider is required');
  useLayoutEffect(() => {
    if (dirty) return register();
  }, [dirty, register]);
}
