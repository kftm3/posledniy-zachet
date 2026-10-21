import {test,expect} from '@playwright/test';
import {selectCharacter,recordCueStarts,monitor} from './helpers';

for(const phone of [false,true]) {
  test.describe(phone?'phone ringtone timing':'desktop ringtone timing',()=>{
    test.use({viewport:phone?{width:874,height:353}:{width:1280,height:800},isMobile:phone,hasTouch:phone});
    for(const archetype of ['ОТЛИЧНИК','УНИВЕРСАЛ']) {
      test(`mom's ringtone plays on the preceding line for ${archetype}`,async({page})=>{
        const errors=monitor(page);
        await recordCueStarts(page);
        await selectCharacter(page);
        await page.evaluate(archetype=>window.dispatchEvent(new CustomEvent('game:exam-scene-finished',{detail:{correct:6,archetype}})),archetype);
        await expect(page.locator('#excellent-ending')).not.toHaveClass(/is-blackout/);
        const progress=page.locator('#excellent-ending-progress'),next=page.locator('#excellent-ending-next');
        const total=Number((await progress.textContent())!.split('/')[1].trim());
        // Reach the penultimate line, then listen before accepting the call.
        for(let n=1;n<total-1;n++)await next.click();
        await expect(progress).toHaveText(new RegExp(`${total-1} / ${total}$`));
        await expect(page.locator('#excellent-ending-speaker')).not.toHaveText('МАМА · ТЕЛЕФОН');
        await expect.poll(()=>page.evaluate(()=>(window as any).__cueStarts.length)).toBe(1);
        expect(await page.evaluate(()=>(window as any).__cueStarts[0].speaker)).not.toBe('МАМА · ТЕЛЕФОН');
        await next.click();
        await expect(page.locator('#excellent-ending-speaker')).toHaveText('МАМА · ТЕЛЕФОН');
        await expect(next).toBeEnabled();
        expect(await page.evaluate(()=>(window as any).__cueStarts.length)).toBe(1);
        await next.click();
        await expect(page.locator('#ending-credits-video')).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  });
}
