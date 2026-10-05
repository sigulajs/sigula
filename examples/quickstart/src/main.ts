import {compute, html, on, patch, raw, render, sig, style, text} from 'sigula';

const name = sig('Alice');

const appNode = document.getElementById('app')!;

render(html`<h1>Hello ${name}</h1>`, appNode);

name.update('Bob');

const sigItem = sig('signal item');
const strItem = 'string data';
const numItem = 2026;
const htmlItem = html`<span>Html Span Element</span> ...`;
const textItem = text('text data');
const textSigItem = text(sigItem);
const rawItem = raw('<strong>Not</strong> escaped raw html');
const rawSigItem = raw(sigItem);

render(
  html`<p>Insert as text nodes: <br>
	- ${sigItem} same as ${text(sigItem)} <br>
	- ${strItem} same as ${text(strItem)} <br>
	- ${numItem} same as ${text(numItem)} <br>
	- ${textItem} <br>
	- ${textSigItem} <br>
</p>
<div>Any validate html: ${htmlItem}</div>
<div>
	Raw html: ${rawItem} <br/>
	Raw Sig html: ${rawSigItem}
</div>
`,
  appNode,
);

sigItem.update('string with <strong>Html Strong Element</strong>');

const counter = sig(0);
const color = compute(counter, (v): string => {
  if (v <= 0) return 'red';
  if (v > 0 && v < 3) return 'orange';
  if (v >= 3 && v < 6) return 'yellow';
  if (v >= 6 && v < 9) return 'green';
  else return 'blue';
});

render(
  html`<p ${patch({style: {color}})}>${counter}</p>
       <button ${patch(on('click', () => counter.trans((v) => v + 1)))}>+1</button>
       <button ${patch(on('click', () => counter.trans((v) => v - 1)))}>-1</button>`,
  appNode,
);
