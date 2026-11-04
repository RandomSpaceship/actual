import { useRef } from 'react';

import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';

import { useTheme } from '#style/theme';

type AqlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  // Ctrl+Enter (Cmd+Enter on a Mac) calls it
  onRun?: () => void;
};

// A plain text editor for the JSON of an AQL query. The repo has no JSON
// language for CodeMirror, so the text has no colours.
export function AqlEditor({ value, onChange, onRun }: AqlEditorProps) {
  const [activeTheme] = useTheme();
  const isDarkTheme =
    activeTheme === 'dark' ||
    activeTheme === 'midnight' ||
    (activeTheme === 'auto' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  // A ref, so that a new onRun does not make new extensions
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  return (
    <CodeMirror
      value={value}
      theme={isDarkTheme ? 'dark' : 'light'}
      extensions={[
        EditorView.lineWrapping,
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                if (!onRunRef.current) return false;
                onRunRef.current();
                return true;
              },
            },
          ]),
        ),
      ]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: false,
        autocompletion: false,
      }}
      style={{ fontSize: '14px', border: 'none' }}
    />
  );
}
