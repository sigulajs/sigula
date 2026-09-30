import {compute, html, on, patch, render, sig, text, type View} from 'sigula';

const Counter = (): View => {
  const count = sig(0);
  const s = compute(count, (c) => (c > 0 ? `${c} cmd` : '0 cmd'));
  console.log(s);
  return html`<div>
    <h1>Todo List abcd</h1>
    <div>
      <p>Count: ${text(s)}</p>
      <button ${patch(on('click', () => count.trans((v) => v + 1)))}>+1</button>
      <button ${patch(on('click', () => count.trans((v) => (v > 0 ? v - 1 : 0))))}>-1</button>
    </div>
  </div>`;
};

const appNode = document.querySelector('#app');
if (!appNode) throw new Error('#app not found');
render(Counter(), appNode);
