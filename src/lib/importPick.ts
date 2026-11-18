// "Import broker CSV" anywhere on the desk opens your computer's file picker straight away (it has to run inside the click),
// then hands the chosen files to the Journal's Import tab, which reads them as soon as it's on screen.
import { save } from './store';

let pending: File[] | null = null;
export const IMPORT_EVENT = 'td:import-files';

/** Open the file picker. Any file can be chosen; the Import tab explains anything it can't read. */
export function pickImportFiles(open: () => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.style.display = 'none';
  input.onchange = () => {
    const files = input.files ? [...input.files] : [];
    input.remove();
    if (!files.length) return;
    pending = files;
    save('journalTab', 'import');
    open();
    window.dispatchEvent(new Event(IMPORT_EVENT));
  };
  document.body.appendChild(input);
  input.click();
}

/** The Import tab takes the files once. */
export function takePendingFiles(): File[] | null { const f = pending; pending = null; return f; }
