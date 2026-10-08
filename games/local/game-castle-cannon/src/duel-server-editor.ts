export function editServer(root: HTMLElement, current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const form = document.createElement('form');
    form.className = 'castle-server-editor';
    const label = document.createElement('label');
    label.textContent = '对战服务地址';
    const input = document.createElement('input');
    input.type = 'url';
    input.required = true;
    input.value = current || location.origin;
    input.placeholder = 'https://你的对战服务';
    input.setAttribute('aria-label', '对战服务地址');
    input.autocomplete = 'off';
    label.append(input);
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = '保存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const finish = (value: string | null) => {
      form.remove();
      resolve(value);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(input.value);
    });
    cancel.addEventListener('click', () => finish(null));
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(null);
      }
    });
    form.append(label, save, cancel);
    root.append(form);
    input.focus();
  });
}
