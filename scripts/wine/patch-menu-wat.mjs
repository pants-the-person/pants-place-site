import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { wineRoot } from './config.mjs';

const menuPath = path.join(wineRoot, 'src/09c5-menu.wat');
const marker = ';; PANTS_EMBED_MENU_EXPORTS';

const labelExports = `  ${marker}
  ;; Top-level bar labels. The bar item layout is { textPtr, textLen,
  ;; childOffset, commandId } at blob + 4 + index * 16.
  (func (export "menu_bar_label_ptr")
        (param $hwnd i32) (param $idx i32) (result i32)
    (local $blob i32) (local $base i32) (local $count i32)
    (local.set $blob (call $menu_blob_w (local.get $hwnd)))
    (if (i32.eqz (local.get $blob)) (then (return (i32.const 0))))
    (local.set $count (i32.load (local.get $blob)))
    (if (i32.ge_u (local.get $idx) (local.get $count)) (then (return (i32.const 0))))
    (local.set $base (i32.add (local.get $blob)
      (i32.add (i32.const 4) (i32.mul (local.get $idx) (i32.const 16)))))
    (i32.add (local.get $blob) (i32.load (local.get $base))))

  (func (export "menu_bar_label_len")
        (param $hwnd i32) (param $idx i32) (result i32)
    (local $blob i32) (local $base i32) (local $count i32)
    (local.set $blob (call $menu_blob_w (local.get $hwnd)))
    (if (i32.eqz (local.get $blob)) (then (return (i32.const 0))))
    (local.set $count (i32.load (local.get $blob)))
    (if (i32.ge_u (local.get $idx) (local.get $count)) (then (return (i32.const 0))))
    (local.set $base (i32.add (local.get $blob)
      (i32.add (i32.const 4) (i32.mul (local.get $idx) (i32.const 16)))))
    (i32.load offset=4 (local.get $base)))

`;

const subHoverExport = `  (func (export "menu_set_sub_hover") (param $cidx i32)
    (call $menu_open_sub_hover_set (local.get $cidx)))
`;

function pristineSource() {
  try {
    return execFileSync('git', ['show', 'HEAD:src/09c5-menu.wat'], {
      cwd: wineRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return fs.readFileSync(menuPath, 'utf8');
  }
}

export function withEmbedMenuExports() {
  const original = pristineSource();
  let patched = original;

  const childMarker = '  ;; ----- child group (dropdown) helpers -----';
  const childAt = patched.indexOf(childMarker);
  if (childAt < 0) throw new Error('Wine menu patch: child group marker not found');
  patched = patched.slice(0, childAt) + labelExports + patched.slice(childAt);

  const setHover = `  (func (export "menu_set_hover") (param $cidx i32)
    (call $menu_open_hover_set (local.get $cidx))
    (call $menu_open_sub_hover_set (i32.const -1)))`;
  const hoverAt = patched.indexOf(setHover);
  if (hoverAt < 0) throw new Error('Wine menu patch: menu_set_hover anchor not found');
  patched = patched.slice(0, hoverAt + setHover.length) +
    `\n\n${subHoverExport}` + patched.slice(hoverAt + setHover.length);

  fs.writeFileSync(menuPath, patched);
  return () => fs.writeFileSync(menuPath, original);
}
