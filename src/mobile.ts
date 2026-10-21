/** One mode flag drives CSS, audio activation and phone-only controls. */
const narrowQuery = window.matchMedia('(max-width: 1100px)');
const coarseQuery = window.matchMedia('(pointer: coarse)');
const noHoverQuery = window.matchMedia('(hover: none)');
// Safari's desktop-site mode or an attached pointer can change pointer queries.
const nativePhone = /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
export const isPhoneLayout = () => nativePhone || (narrowQuery.matches && (
  coarseQuery.matches || (navigator.maxTouchPoints > 0 && noHoverQuery.matches)
));

export function setupPhoneOrientation(): void {
  const portrait = window.matchMedia('(orientation: portrait)');
  const update = () => {
    const phone = isPhoneLayout();
    document.documentElement.classList.toggle('phone-layout', phone);
    const blocked = phone && portrait.matches;
    const overlay = document.getElementById('orientation-overlay');
    overlay?.setAttribute('aria-hidden', String(!blocked));
    if (phone) overlay?.setAttribute('role', 'status');
    document.querySelector('main')?.toggleAttribute('inert', blocked);
  };
  for (const query of [portrait, narrowQuery, coarseQuery, noHoverQuery]) query.addEventListener('change', update);
  update();
}
