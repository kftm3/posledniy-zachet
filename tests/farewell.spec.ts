import { test, expect, type Page } from '@playwright/test';
import { selectCharacter, continueAfterCredits, monitor } from './helpers';

async function openCredits(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('game:exam-scene-finished', {
    detail: { correct: 6, isExcellentEnding: true, archetype: 'ОТЛИЧНИК' },
  })));
  for (let n=0; n<25 && !await page.locator('#ending-credits-video').count(); n++) {
    await page.locator('#excellent-ending-next').click();
  }
  await expect(page.locator('#ending-credits-video')).toBeVisible();
}

async function checkWritingFits(page: Page) {
  for (const line of await page.locator('.farewell-text,.farewell-heart,#farewell-continue').all()) {
    const box = (await line.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
}

async function checkEveryLineIsPainted(page: Page) {
  const bounds = await page.locator('.farewell-text').evaluateAll(elements => elements.map(el=>{
    const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  const screenshot = (await page.screenshot()).toString('base64');
  const counts = await page.evaluate(async({screenshot,bounds})=>{
    const image = new Image(); image.src=`data:image/png;base64,${screenshot}`; await image.decode();
    const canvas=document.createElement('canvas'); canvas.width=innerWidth;canvas.height=innerHeight;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,innerWidth,innerHeight);
    return bounds.map(r=>{
      const pixels=ctx.getImageData(Math.ceil(r.x),Math.ceil(r.y),Math.floor(r.width),Math.floor(r.height)).data;
      let ink=0;for(let n=0;n<pixels.length;n+=4)if(pixels[n]>100 && pixels[n+1]>100)ink++;
      return ink;
    });
  },{screenshot,bounds});
  for(const count of counts)expect(count).toBeGreaterThan(20);
}

for (const phone of [false,true]) {
  test.describe(phone ? 'phone farewell' : 'desktop farewell', () => {
    test.use({viewport:phone?{width:812,height:320}:{width:1920,height:1080},isMobile:phone,hasTouch:phone,reducedMotion:'no-preference'});
    test('handwriting precedes the signature, heart and Continue, then opens ready results',async({page})=>{
      const errors = monitor(page), requests: string[] = [];
      page.on('request',request=>requests.push(request.url()));
      await page.addInitScript(()=>{
        (window as any).__penSound={starts:0,stops:0,targets:[]};
        const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop,target=AudioParam.prototype.setTargetAtTime;
        AudioBufferSourceNode.prototype.start=function(...args: [number?,number?,number?]){
          if(this.loop && this.buffer?.duration===2) { (window as any).__penSound.starts++;(this as any).__pen=true; }
          return start.apply(this,args);
        };
        AudioBufferSourceNode.prototype.stop=function(...args: [number?]){
          if((this as any).__pen)(window as any).__penSound.stops++;
          return stop.apply(this,args);
        };
        AudioParam.prototype.setTargetAtTime=function(...args:[number,number,number]){
          if(document.getElementById('farewell-scene'))(window as any).__penSound.targets.push(args[0]);
          return target.apply(this,args);
        };
        const decode = HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode = function() {
          if (this.classList.contains('final-result-portrait')) (window as any).__resultPhoto = this;
          return decode.call(this);
        };
      });
      await selectCharacter(page);
      expect(requests.some(url=>url.includes('CampusFarewell'))).toBe(false);
      if(phone)await page.evaluate(()=>{
        SVGGraphicsElement.prototype.getBBox=()=>{throw new Error('SVG text measurement unavailable');};
        SVGGeometryElement.prototype.getTotalLength=()=>{throw new Error('SVG geometry unavailable');};
        let hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
        (window as any).__setHidden=(value:boolean)=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
      });
      await openCredits(page);
      await expect.poll(()=>page.evaluate(()=>(window as any).__resultPhoto?.complete && (window as any).__resultPhoto?.naturalWidth>0)).toBe(true);
      await page.locator('#ending-credits-video').evaluate(video=>video.dispatchEvent(new Event('ended')));
      const scene = page.locator('#farewell-scene'), next = page.locator('#farewell-continue');
      await expect(scene).toHaveCSS('background-color','rgb(0, 0, 0)');
      await expect(scene).not.toHaveClass(/is-written/);
      await expect(next).toBeHidden();
      await expect(scene).toContainText('С днём рождения, КИУ!');
      await expect.poll(()=>page.locator('#farewell-ink-0').evaluate(el=>el.clientWidth)).toBeGreaterThan(0);
      expect(await page.locator('#farewell-ink-5').evaluate(el=>el.clientWidth)).toBe(0);
      await expect.poll(()=>page.evaluate(()=>(window as any).__penSound.starts)).toBe(1);
      if(phone){
        const progress=()=>page.locator('.farewell-ink').evaluateAll(elements=>elements.reduce((sum,el)=>sum+el.clientWidth,0));
        await page.evaluate(()=>(window as any).__setHidden(true));const paused=await progress();
        await page.waitForTimeout(350);expect(await progress()).toBe(paused);
        await page.evaluate(()=>(window as any).__setHidden(false));
        await expect.poll(progress).toBeGreaterThan(paused);
      }
      await page.keyboard.press('Tab');
      expect(await page.evaluate(()=>document.activeElement?.id)).toBe('farewell-scene');
      await expect(scene).toHaveClass(/is-written/,{timeout:12_000});
      await expect(page.locator('.farewell-heart')).toHaveCSS('stroke-dashoffset','0px');
      const penSound=await page.evaluate(()=>(window as any).__penSound);
      expect(penSound.stops).toBe(1);expect(Math.max(...penSound.targets)).toBeGreaterThan(0);
      expect(penSound.targets.at(-1)).toBe(0);
      await expect(page.locator('.farewell-signature')).toHaveText('dev by kftm3');
      await expect(page.locator('#final-result-screen')).toHaveCount(0);
      await checkWritingFits(page);
      await checkEveryLineIsPainted(page);
      await page.keyboard.press('Tab'); await expect(next).toBeFocused();
      const before = requests.filter(url=>/\/characters\/.*\/card-/.test(url)).length;
      await next.click();
      await expect(page.locator('#final-result-screen')).toBeVisible();
      const portrait = page.locator('.final-result-portrait');
      expect(await portrait.evaluate(img=>img===(window as any).__resultPhoto)).toBe(true);
      expect(await portrait.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
      expect(await portrait.evaluate((img:HTMLImageElement)=>img.currentSrc)).toMatch(/card-(256|512)\.webp$/);
      expect(requests.filter(url=>/\/characters\/.*\/card-/.test(url))).toHaveLength(before);
      expect(requests.some(url=>/\/characters\/[^/]+\/card\.webp$/.test(url))).toBe(false);
      expect(errors).toEqual([]);
    });
  });
}

test('a slow result portrait loads during the ending and farewell, without delaying the thank-you scene',async({page})=>{
  let release!: () => void;
  const ready = new Promise<void>(resolve=>release=resolve);
  await page.route('**/characters/student_girl5/card-*.webp',async route=>{await ready;await route.continue();});
  await selectCharacter(page);
  await page.locator('.female-panel .portrait-slot[data-index="4"]').click();
  await openCredits(page);
  await page.locator('#ending-credits-video').evaluate(video=>video.dispatchEvent(new Event('ended')));
  await expect(page.locator('#farewell-scene')).toHaveClass(/is-written/);
  const button = page.locator('#farewell-continue');
  await button.click();
  await expect(button).toBeDisabled();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(button).toBeDisabled();
  await expect(page.locator('#final-result-screen')).toHaveCount(0);
  release();
  await expect(page.locator('#final-result-screen')).toBeVisible();
  expect(await page.locator('.final-result-portrait').evaluate((img:HTMLImageElement)=>img.complete && img.currentSrc.includes('student_girl5/card-'))).toBe(true);
});

test('handwriting can finish and open the results when audio is blocked',async({page})=>{
  await page.addInitScript(()=>{
    const resume=AudioContext.prototype.resume;
    AudioContext.prototype.resume=function(){(window as any).__audioContext=this;return resume.call(this);};
  });
  await selectCharacter(page);
  await openCredits(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(async()=>{
    await (window as any).__audioContext.suspend();
    (window as any).__blockedResumes=0;
    AudioContext.prototype.resume=()=>{(window as any).__blockedResumes++;return Promise.reject(new DOMException('Blocked','NotAllowedError'));};
  });
  await page.locator('#ending-credits-video').evaluate(video=>video.dispatchEvent(new Event('ended')));
  await expect(page.locator('#farewell-scene')).toHaveClass(/is-written/,{timeout:12_000});
  await checkEveryLineIsPainted(page);
  expect(await page.evaluate(()=>(window as any).__blockedResumes)).toBe(1);
  await continueAfterCredits(page);
  await expect(page.locator('#final-result-screen')).toBeVisible();
});

for (const outcome of ['skip','error']) {
  test(`credits ${outcome} still leads to farewell, with reduced motion and a failed handwriting font`,async({page})=>{
    await page.route('**/fonts/CampusFarewell-Regular.woff2',route=>route.abort());
    await selectCharacter(page);
    await openCredits(page);
    if (outcome==='error') await page.locator('#ending-credits-video').evaluate(video=>video.dispatchEvent(new Event('error')));
    else {
      await page.clock.install();
      await page.clock.fastForward(20_001);
      await page.getByRole('button',{name:'Пропустить титры',exact:true}).click();
      await page.clock.resume();
    }
    await expect(page.locator('#farewell-scene')).toHaveClass(/is-written/);
    await checkWritingFits(page);
    const unlocked = await page.evaluate(()=>JSON.parse(localStorage.getItem('last-exam-achievements-v1') || '[]'));
    expect(unlocked).not.toContain('credits-respect');
    await continueAfterCredits(page);
    await expect(page.locator('#final-result-screen')).toBeVisible();
  });
}
