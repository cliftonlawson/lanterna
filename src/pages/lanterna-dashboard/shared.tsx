import { useState } from 'react';

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

export function Toggle({ checked, onChange, title }: { checked?: boolean; onChange?: (checked: boolean) => void; title: string }) {
  const [internalOn, setInternalOn] = useState(true);
  const on = checked ?? internalOn;
  const update = () => {
    if (onChange) {
      onChange(!on);
      return;
    }
    setInternalOn(!on);
  };

  return <button aria-pressed={on} className="toggle-row" onClick={update}><span>{title}</span><i className={on ? 'on' : ''}><b /></i></button>;
}
