import { useState } from 'preact/hooks';
import { dialogs, resolveDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import type { DialogState } from '../../kernel/types';

function DialogCard({ dialog }: { dialog: DialogState }) {
  const [input, setInput] = useState(dialog.input?.value ?? '');
  const buttons = dialog.buttons ?? [{ id: 'ok', label: 'OK', default: true }];

  function choose(id: string) {
    playSound(id === 'cancel' ? 'click' : 'ding');
    resolveDialog(dialog.id, id === 'ok' && dialog.input ? input : id);
  }

  return (
    <div
      class="win98-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={dialog.title}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          choose(buttons.find((b) => b.default)?.id ?? buttons[0].id);
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          choose('cancel');
        }
      }}
    >
      <div class="title-bar">
        <span class="title-bar-text">{dialog.title}</span>
        <span class="title-bar-controls">
          <button data-action="close" aria-label="Close" onClick={() => choose('cancel')} />
        </span>
      </div>
      <div class="dialog-body">
        <img src={dialog.icon ?? '/icons/help.svg'} alt="" width="32" height="32" />
        <div class="dialog-message">
          {dialog.message}
          {dialog.input ? (
            <div style={{ marginTop: '8px' }}>
              {dialog.input.label ? <label style={{ display: 'block', marginBottom: '3px' }}>{dialog.input.label}</label> : null}
              <input
                class="dialog-input"
                autoFocus
                value={input}
                placeholder={dialog.input.placeholder}
                onInput={(event) => setInput((event.target as HTMLInputElement).value)}
              />
            </div>
          ) : null}
          {dialog.detail ? <div class="dialog-detail">{dialog.detail}</div> : null}
        </div>
      </div>
      <div class="dialog-buttons">
        {buttons.map((button) => (
          <button
            key={button.id}
            class={button.default ? 'default' : ''}
            onClick={() => choose(button.id)}
            autoFocus={button.default && !dialog.input}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DialogHost() {
  if (!dialogs.value.length) return null;
  return (
    <div class="dialog-backdrop">
      {dialogs.value.map((dialog, index) => (
        <div style={{ zIndex: 9700 + index }} key={dialog.id}>
          <DialogCard dialog={dialog} />
        </div>
      ))}
    </div>
  );
}
