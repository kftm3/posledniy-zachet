import './farewell.css';
import { PenSound } from './pen-sound';

const lines = [
  { text:'Спасибо, что прошли «Последний зачёт»!', y:95, size:54 },
  { text:'С днём рождения, КИУ!', y:185, size:66, className:'farewell-greeting' },
  { text:'Пусть впереди будет больше открытий,', y:270, size:54 },
  { text:'тёплых встреч и счастливых историй.', y:335, size:54 },
  { text:'До встречи!', y:415, size:54 },
  { text:'dev by kftm3', y:490, size:46, className:'farewell-signature', signature:true },
];
let fontReady: Promise<unknown> | null = null;
export function prepareFarewell(): void {
  fontReady ??= document.fonts.load('54px "Farewell Hand"').catch(() => {});
}

/** HTML overflow reveals avoid Safari's cached animated SVG clip paths/text bounds. */
export function showFarewell(onContinue: () => Promise<void>): void {
  document.getElementById('farewell-scene')?.remove();
  const scene = document.createElement('section');
  scene.id = 'farewell-scene'; scene.className = 'farewell-scene';
  scene.setAttribute('role','dialog'); scene.setAttribute('aria-label','Спасибо за прохождение');
  scene.setAttribute('aria-modal','true'); scene.tabIndex = -1;
  const writing = document.createElement('div'); writing.className = 'farewell-writing';
  writing.setAttribute('role','img'); writing.setAttribute('aria-label',lines.map(line=>line.text).join(' '));
  const paper = document.createElement('div'); paper.className = 'farewell-paper'; writing.append(paper);
  const ink = lines.map((line,index)=>{
    const row = document.createElement('div'); row.className = `farewell-line ${line.className || ''}`;
    row.style.top = `${line.y-line.size}px`; row.style.fontSize = `${line.size}px`;
    const reveal = document.createElement('div'); reveal.id = `farewell-ink-${index}`; reveal.className = 'farewell-ink';
    const text = document.createElement('span'); text.className = 'farewell-text'; text.textContent = line.text;
    reveal.append(text); row.append(reveal); paper.append(row);
    return {row,reveal,text,line,left:0,width:0,start:0,duration:0};
  });
  const heart = document.createElementNS('http://www.w3.org/2000/svg','svg');
  heart.setAttribute('viewBox','1050 425 80 70'); heart.setAttribute('aria-hidden','true'); heart.classList.add('farewell-heart-frame');
  heart.innerHTML = '<path class="farewell-heart" pathLength="1" d="M1090 486 C1063 466 1050 453 1057 442 C1067 428 1083 436 1090 446 C1097 436 1113 428 1123 442 C1130 453 1117 466 1090 486"/>';
  const heartPath = heart.querySelector('path')!;
  const pen = document.createElement('span'); pen.className = 'farewell-pen'; pen.setAttribute('aria-hidden','true');
  paper.append(heart,pen);
  const button = document.createElement('button');
  button.id = 'farewell-continue'; button.className = 'farewell-continue'; button.type = 'button';
  button.textContent = 'Продолжить'; button.disabled = true;
  scene.append(writing,button); document.body.append(scene); scene.focus({preventScroll:true});
  scene.addEventListener('keydown',event=>{
    if (event.key !== 'Tab') return;
    event.preventDefault(); if (!button.disabled) button.focus();
  });
  const ending = document.getElementById('excellent-ending'); ending?.setAttribute('inert','');
  const main = document.querySelector('main'), mainWasInert = main?.inert || false;
  if (main) main.inert = true;
  const sound = new PenSound();
  let animation = 0, stopped = false, written = false, continuing = false;
  let elapsed = 0, previousFrame: number | null = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
  const resize = () => paper.style.setProperty('--farewell-scale',String(Math.min(writing.clientWidth/1200,writing.clientHeight/530)));
  const observer = new ResizeObserver(resize); observer.observe(writing); resize();
  const measure = () => {
    for (const item of ink) {
      item.width = item.text.offsetWidth;
      item.left = item.line.signature ? 1045-item.width : (1200-item.width)/2;
      item.row.style.left = `${item.left}px`;
      if (written) item.reveal.style.width = `${item.width}px`;
    }
  };
  const complete = () => {
    written = true; cancelAnimationFrame(animation); sound.stop();
    for (const row of ink) row.reveal.style.width = `${row.width}px`;
    heartPath.style.strokeDashoffset = '0'; pen.style.opacity = '0';
    button.disabled = continuing; scene.classList.add('is-written');
  };
  const motionChanged = () => { if (reducedMotion.matches) { measure(); complete(); } };
  const visibilityChanged = () => { previousFrame = null; sound.setWriting(false); };
  reducedMotion.addEventListener('change',motionChanged);
  document.addEventListener('visibilitychange',visibilityChanged);
  button.addEventListener('click',async()=>{
    if (button.disabled || continuing) return;
    continuing = true; button.disabled = true;
    button.textContent = 'Готовим зачётку…'; button.setAttribute('aria-busy','true');
    try {
      await onContinue();
      stopped = true; cancelAnimationFrame(animation); sound.stop(); observer.disconnect();
      reducedMotion.removeEventListener('change',motionChanged);
      document.removeEventListener('visibilitychange',visibilityChanged);
      if (main) main.inert = mainWasInert || (document.documentElement.classList.contains('phone-layout') && matchMedia('(orientation:portrait)').matches);
      ending?.removeAttribute('inert'); scene.remove();
    } catch {
      continuing = false; button.disabled = false;
      button.textContent = 'Продолжить'; button.removeAttribute('aria-busy');
    }
  });
  prepareFarewell();
  // Re-measure if a slow font replaces the fallback after writing has begun.
  void fontReady?.then(()=>{ if (scene.isConnected) measure(); });
  void Promise.race([fontReady,new Promise(resolve=>setTimeout(resolve,1200))]).then(()=>{
    if (stopped || !scene.isConnected) return;
    measure();
    let cursor = 250;
    for (const row of ink) {
      row.start = cursor; row.duration = Math.max(600,row.line.text.length*29);
      cursor += row.duration+150;
    }
    const heartStart = cursor, total = heartStart+700;
    if (written || reducedMotion.matches) { complete(); return; }
    const draw = (now: number) => {
      if (stopped || !scene.isConnected) { sound.stop(); observer.disconnect(); return; }
      if (!document.hidden) {
        if (previousFrame !== null) elapsed += Math.max(0,Math.min(100,now-previousFrame));
        previousFrame = now;
        pen.style.opacity = '0';
        let touchingPaper = false, pressure = 1;
        for (const row of ink) {
          const progress = Math.max(0,Math.min(1,(elapsed-row.start)/row.duration));
          row.reveal.style.width = `${row.width*progress}px`;
          if (progress>0 && progress<1) {
            touchingPaper = true;
            const stroke = progress*row.line.text.length;
            pressure = stroke%1>.83 ? .15 : .65+.3*Math.sin(stroke*5)**2;
            pen.style.opacity = '1';
            pen.style.left = `${row.left+row.width*progress}px`;
            pen.style.top = `${row.line.y-9+Math.sin(stroke*5)*8}px`;
          }
        }
        const heartProgress = Math.max(0,Math.min(1,(elapsed-heartStart)/650));
        heartPath.style.strokeDashoffset = String(1-heartProgress);
        sound.setWriting(touchingPaper || (heartProgress>0 && heartProgress<1),pressure);
        if (elapsed>=total) { complete(); return; }
      } else { previousFrame = null; sound.setWriting(false); }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
  }).catch(()=>{ measure(); complete(); });
}
