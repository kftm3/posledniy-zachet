import { test, expect } from '@playwright/test';
import { openTicket, monitor } from './helpers';

for (const device of [
  {name:'desktop',width:1280,height:800,dpr:1,phone:false,cover:128},
  {name:'desktop Retina',width:1920,height:1080,dpr:3,phone:false,cover:256},
  {name:'phone Retina',width:874,height:353,dpr:3,phone:true,cover:128},
]) {
  test.describe(device.name,()=>{
    test.use({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.dpr,isMobile:device.phone,hasTouch:device.phone});
    test('the card reuses its prepared tiny cover without requesting an original',async({page})=>{
      const requests: string[]=[], errors=monitor(page);
      page.on('request',request=>{if(request.url().includes('/music-covers/'))requests.push(request.url());});
      await page.addInitScript(()=>{
        const decode=HTMLImageElement.prototype.decode;
        HTMLImageElement.prototype.decode=function(){
          if(this.src.includes('/music-covers/'))(window as any).__cover=this;
          return decode.call(this);
        };
      });
      await openTicket(page);
      await expect.poll(()=>page.evaluate(()=>(window as any).__cover?.complete && (window as any).__cover?.naturalWidth>0)).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatch(new RegExp(`vivaldi-${device.cover}[.]webp$`));
      await page.locator('#ticket-start').click(); await page.locator('#intro-video-skip').click();
      await expect(page.locator('#corridor-screen')).toBeVisible();
      const cover=page.locator('.np-cover-image');
      await expect(page.locator('.np-cover')).toHaveClass(/has-cover/);
      expect(await cover.evaluate(img=>img===(window as any).__cover)).toBe(true);
      expect(await cover.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
      expect(requests).toHaveLength(1);
      expect(await cover.getAttribute('srcset')).toBeNull();
      expect(errors).toEqual([]);
    });
  });
}

test('a delayed cover gets its full display time and cannot replace the next track',async({page})=>{
  await page.addInitScript(()=>{
    const decode=HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode=function(){
      const ready=decode.call(this);
      if(this.src.includes('vivaldi-128.webp'))void ready.then(()=>(window as any).__oldCoverReady=true);
      return ready;
    };
  });
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/music-covers/vivaldi-128.webp',async route=>{await pending;await route.continue();});
  await openTicket(page);
  await page.locator('#ticket-start').click();await page.locator('#intro-video-skip').click();
  const card=page.locator('#now-playing-card');
  await expect(card).toHaveClass(/is-visible/);
  await page.waitForTimeout(3200);
  await expect(card).toHaveClass(/is-visible/);
  // Enter the classroom while the previous album artwork is still delayed.
  for(let n=0;n<5;n++)await page.locator('#corridor-next').click();
  await page.locator('#corridor-choices button').first().click();
  await page.locator('#corridor-exit').click();
  await expect(page.locator('.np-title')).toHaveText('Aria Math');
  release();
  await expect.poll(()=>page.evaluate(()=>(window as any).__oldCoverReady)).toBe(true);
  await expect(page.locator('.np-cover-image')).toHaveCount(0);
  await expect(page.locator('.np-cover')).not.toHaveClass(/has-cover/);
});
