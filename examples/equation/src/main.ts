import {compute, html, on, patch, render, sig, text, type View} from 'sigula';

const Equation = (): View => {
  const x = sig(0);
  const y = sig(1);

  const s = {x, y};
  const sum = compute(s, (v) => v.x + v.y);
  const product = compute(s, (v) => v.x * v.y);
  const diff = compute(s, (v) => v.x - v.y);
  const quotient = compute(s, (v) => v.x / v.y);

  const xSquare = compute(x, (v) => v * v);
  const ySquare = compute(y, (v) => v * v);

  const sumDiffProduct = compute({sum, diff}, (v) => v.sum * v.diff);
  const squareDiff = compute({xSquare, ySquare}, (v) => v.xSquare - v.ySquare);

  return html`<div>
    <h1>Equation</h1>
    <div>
      <p>x: ${text(x)} - 
        <button ${patch(on('click', () => x.trans((v) => v + 1)))}>+1</button>
        <button ${patch(on('click', () => x.trans((v) => v - 1)))}>-1</button>
      </p>
      <p>y: ${text(y)} - 
        <button ${patch(on('click', () => y.trans((v) => v + 1)))}>+1</button>
        <button ${patch(on('click', () => y.trans((v) => v - 1)))}>-1</button>
      </p>
      <p>sum: x + y = ${text(x)} + ${text(y)} = ${text(sum)}</p>
      <p>difference: x - y = ${text(x)} - ${text(y)} = ${text(diff)}</p>
      <p>product: x * y = ${text(x)} * ${text(y)} = ${text(product)}</p>
      <p>quotient: x / y = ${text(x)} / ${text(y)} = ${text(quotient)}</p>
      <p>
        (x + y)(x - y) 
          = (${text(x)} + ${text(y)})(${text(x)} - ${text(y)}) 
          = ${text(sum)}*${text(diff)} = ${text(sumDiffProduct)}
        <br />
        = x^2 - y^2 = ${text(xSquare)} - ${text(ySquare)} = ${text(squareDiff)}
      </p>
    </div>
  </div>`;
};

const appNode = document.querySelector('#app');
if (!appNode) throw new Error('#app not found');
render(Equation(), appNode);
