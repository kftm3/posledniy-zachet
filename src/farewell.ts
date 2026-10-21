import './farewell.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const lines = [
  { text:'Спасибо, что прошли «Последний зачёт»!', y:95 },
  { text:'С днём рождения, КИУ!', y:185, className:'farewell-greeting' },
  { text:'Пусть впереди будет больше открытий,', y:270 },
  { text:'тёплых встреч и счастливых историй.', y:335 },
  { text:'До встречи!', y:415 },
  { text:'dev by kftm3', y:490, className:'farewell-signature', signature:true },
];

let fontReady: Promise<unknown> | null = null;
export function prepareFarewell(): void {
  // Requested during the credits, never on the game's opening screen.
  fontReady ??= document.fonts.load('54px "Farewell Hand"').catch(() => {});
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string,string> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS,tag);
  for (const [name,value] of Object.entries(attributes)) element.setAttribute(name,value);
  return element;
}

/** A single cancellable timeline reveals ink, signature, heart, then the button. */
export function showFarewell(onContinue: () => Promise<void>): void {
  document.getElementById('farewell-scene')?.remove();
  const scene = document.createElement('section');
  scene.id = 'farewell-scene'; scene.className = 'farewell-scene';
  scene.setAttribute('role','dialog'); scene.setAttribute('aria-label','Спасибо за прохождение');
  scene.setAttribute('aria-modal','true'); scene.tabIndex = -1;
  const writing = svgElement('svg',{viewBox:'0 0 1200 530',class:'farewell-writing',role:'img','aria-labelledby':'farewell-title'});
  const title = svgElement('title',{id:'farewell-title'});
  title.textContent = `${lines.map(line=>line.text).join(' ')}. С любовью.`;
  const defs = svgElement('defs'); writing.append(title,defs);
  const ink = lines.map((line,index)=>{
    const clip = svgElement('clipPath',{id:`farewell-ink-${index}`,clipPathUnits:'userSpaceOnUse'});
    const mask = svgElement('rect',{x:'0',y:String(line.y-80),width:'0',height:'110'});
    clip.append(mask); defs.append(clip);
    const text = svgElement('text',{x:line.signature?'1040':'600',y:String(line.y),'text-anchor':line.signature?'end':'middle','clip-path':`url(#farewell-ink-${index})`,class:line.className||''});
    text.textContent = line.text; writing.append(text);
    return {text,mask,line,left:0,width:0,start:0,duration:0};
  });
  const heart = svgElement('path',{class:'farewell-heart',d:'M 1090 486 C 1063 466 1050 453 1057 442 C 1067 428 1083 436 1090 446 C 1097 436 1113 428 1123 442 C 1130 453 1117 466 1090 486'});
  const pen = svgElement('circle',{class:'farewell-pen',r:'2.8',opacity:'0','aria-hidden':'true'});
  writing.append(heart,pen);
  const button = document.createElement('button');
  button.id = 'farewell-continue'; button.className = 'farewell-continue'; button.type = 'button';
  button.textContent = 'Продолжить'; button.disabled = true;
  scene.append(writing,button); document.body.append(scene); scene.focus({preventScroll:true});
  scene.addEventListener('keydown',event=>{
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (!button.disabled) button.focus();
  });
  // The ending remains mounted for replay, but must not intercept keyboard focus.
  const ending = document.getElementById('excellent-ending');
  ending?.setAttribute('inert','');
  const main = document.querySelector('main');
  const mainWasInert = main?.inert || false;
  if (main) main.inert = true;
  let animation = 0, stopped = false, written = false, continuing = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
  const heartLength = heart.getTotalLength();
  heart.style.strokeDasharray = String(heartLength); heart.style.strokeDashoffset = String(heartLength);
  const complete = () => {
    written = true;
    cancelAnimationFrame(animation);
    for (const row of ink) {
      row.mask.setAttribute('x','0');
      row.mask.setAttribute('width','1200');
    }
    heart.style.strokeDashoffset = '0'; pen.setAttribute('opacity','0');
    button.disabled = continuing; scene.classList.add('is-written');
  };
  const motionChanged = () => { if (reducedMotion.matches) complete(); };
  reducedMotion.addEventListener('change',motionChanged);
  button.addEventListener('click',async()=>{
    if (button.disabled || continuing) return;
    continuing = true;
    button.disabled = true;
    button.textContent = 'Готовим зачётку…';
    button.setAttribute('aria-busy','true');
    try {
      await onContinue();
      stopped = true; cancelAnimationFrame(animation);
      reducedMotion.removeEventListener('change',motionChanged);
      if (main) main.inert = mainWasInert || (document.documentElement.classList.contains('phone-layout') && matchMedia('(orientation:portrait)').matches);
      ending?.removeAttribute('inert'); scene.remove();
    } catch {
      continuing = false;
      button.disabled = false;
      button.textContent = 'Продолжить';
      button.removeAttribute('aria-busy');
    }
  });
  prepareFarewell();
  // A font error or slow connection must never prevent continuing to the results.
  void Promise.race([fontReady,new Promise(resolve=>setTimeout(resolve,1200))]).then(()=>{
    if (stopped || !scene.isConnected) return;
    let cursor = 250;
    for (const row of ink) {
      const bounds = row.text.getBBox();
      row.left = bounds.x-4; row.width = bounds.width+8;
      row.mask.setAttribute('x',String(row.left));
      row.start = cursor; row.duration = Math.max(600,row.line.text.length*29);
      cursor += row.duration+150;
    }
    const heartStart = cursor;
    const total = heartStart+700;
    if (written || reducedMotion.matches) { complete(); return; }
    const started = performance.now();
    const draw = (now: number) => {
      if (stopped || !scene.isConnected) return;
      const elapsed = now-started;
      pen.setAttribute('opacity','0');
      for (const row of ink) {
        const progress = Math.max(0,Math.min(1,(elapsed-row.start)/row.duration));
        row.mask.setAttribute('width',String(row.width*progress));
        if (progress>0 && progress<1) {
          pen.setAttribute('opacity','1');
          pen.setAttribute('cx',String(row.left+row.width*progress));
          pen.setAttribute('cy',String(row.line.y-9+Math.sin(progress*row.line.text.length*5)*8));
        }
      }
      heart.style.strokeDashoffset = String(heartLength*(1-Math.max(0,Math.min(1,(elapsed-heartStart)/650))));
      if (elapsed>=total) { complete(); return; }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
  });
}
